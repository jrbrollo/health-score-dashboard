-- ============================================
-- CORREÇÃO DE DISCREPÂNCIA: ANÁLISE TEMPORAL vs VISÃO GERAL
-- ============================================
-- Problema: O gráfico de análise temporal mostrava valores diferentes da visão geral.
-- Causa 1: O histórico estava sendo gravado com a função antiga (v1/v2) em vez da v3.
-- Causa 2: A função de leitura temporal olhava apenas para o histórico (snapshot estático),
--          enquanto a visão geral calcula em tempo real.
--
-- Solução:
-- 1. Atualizar record_health_score_history para usar calculate_health_score_v3.
-- 2. Atualizar get_temporal_analysis_asof para usar lógica híbrida (Histórico + Tempo Real).
-- 3. Recalcular histórico de hoje.

-- 1. Atualizar função de gravação de histórico para usar V3
CREATE OR REPLACE FUNCTION record_health_score_history(client_row clients)
RETURNS VOID AS $$
DECLARE
  health_calc JSON;
  record_date DATE := CURRENT_DATE;
BEGIN
  -- CORREÇÃO: Usar calculate_health_score_v3 (mesma lógica do frontend)
  -- em vez da função antiga calculate_health_score
  health_calc := calculate_health_score_v3(client_row.id);

  -- Inserir ou atualizar registro histórico (upsert)
  INSERT INTO health_score_history (
    client_id,
    recorded_date,
    client_name,
    planner,
    health_score,
    health_category,
    meeting_engagement, -- Mantido para compatibilidade, mas virá zerado ou adaptado
    app_usage,          -- Mantido para compatibilidade
    payment_status,     -- Mantido para compatibilidade
    ecosystem_engagement, -- Mantido para compatibilidade
    nps_score,
    last_meeting,
    has_scheduled_meeting,
    app_usage_status,
    payment_status_detail,
    has_referrals,
    nps_score_detail,
    ecosystem_usage,
    
    -- Novos campos V3 (se a tabela tiver, senão ignora ou adapta)
    -- Assumindo que a tabela health_score_history ainda tem a estrutura antiga,
    -- vamos mapear os valores v3 para os campos existentes da melhor forma possível
    -- ou apenas confiar no health_score total que é o mais importante.
    
    -- Mapeamento V3 -> Campos Antigos (aproximação para manter integridade)
    nps_score_v3_pillar,
    referral_pillar,
    payment_pillar,
    cross_sell_pillar,
    tenure_pillar
  ) VALUES (
    client_row.id,
    record_date,
    client_row.name,
    client_row.planner,
    (health_calc->>'health_score')::INTEGER,
    health_calc->>'health_category',
    0, -- meeting_engagement (não existe na v3)
    0, -- app_usage (não existe na v3)
    (health_calc->>'payment_pillar')::INTEGER, -- payment_status (adaptado)
    (health_calc->>'cross_sell_pillar')::INTEGER, -- ecosystem_engagement (adaptado como cross-sell)
    (health_calc->>'nps_score_v3_pillar')::INTEGER, -- nps_score
    client_row.last_meeting,
    client_row.has_scheduled_meeting,
    client_row.app_usage,
    client_row.payment_status,
    client_row.has_referrals,
    client_row.nps_score,
    client_row.ecosystem_usage,
    
    -- Campos V3 explícitos (se existirem na tabela, o que deveriam se o setup_v3 rodou)
    (health_calc->>'nps_score_v3_pillar')::INTEGER,
    (health_calc->>'referral_pillar')::INTEGER,
    (health_calc->>'payment_pillar')::INTEGER,
    (health_calc->>'cross_sell_pillar')::INTEGER,
    (health_calc->>'tenure_pillar')::INTEGER
  )
  ON CONFLICT (client_id, recorded_date) 
  DO UPDATE SET
    client_name = EXCLUDED.client_name,
    planner = EXCLUDED.planner,
    health_score = EXCLUDED.health_score,
    health_category = EXCLUDED.health_category,
    -- Atualizar campos V3
    nps_score_v3_pillar = EXCLUDED.nps_score_v3_pillar,
    referral_pillar = EXCLUDED.referral_pillar,
    payment_pillar = EXCLUDED.payment_pillar,
    cross_sell_pillar = EXCLUDED.cross_sell_pillar,
    tenure_pillar = EXCLUDED.tenure_pillar,
    created_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Atualizar get_temporal_analysis_asof para lógica Híbrida
-- Usa histórico para o passado e cálculo em tempo real para hoje (CURRENT_DATE)
CREATE OR REPLACE FUNCTION get_temporal_analysis_asof(
  start_date DATE,
  end_date DATE,
  planner_filter TEXT DEFAULT 'all',
  managers TEXT[] DEFAULT NULL,
  mediators TEXT[] DEFAULT NULL,
  leaders TEXT[] DEFAULT NULL,
  include_null_manager BOOLEAN DEFAULT FALSE,
  include_null_mediator BOOLEAN DEFAULT FALSE,
  include_null_leader BOOLEAN DEFAULT FALSE
) RETURNS TABLE (
  recorded_date DATE,
  planner TEXT,
  total_clients BIGINT,
  avg_health_score NUMERIC,
  excellent_count BIGINT,
  stable_count BIGINT,
  warning_count BIGINT,
  critical_count BIGINT,
  avg_meeting_engagement NUMERIC,
  avg_app_usage NUMERIC,
  avg_payment_status NUMERIC,
  avg_ecosystem_engagement NUMERIC,
  avg_nps_score NUMERIC
) AS $$
DECLARE
  normalized_planner_filter TEXT;
  normalized_managers_arr TEXT[];
  normalized_mediators_arr TEXT[];
  normalized_leaders_arr TEXT[];
  has_manager_filter BOOLEAN;
  has_mediator_filter BOOLEAN;
  has_leader_filter BOOLEAN;
BEGIN
  -- Normalização de inputs (mesma lógica anterior)
  normalized_planner_filter := CASE
    WHEN planner_filter = 'all' THEN 'all'
    ELSE normalize_text(planner_filter)
  END;

  IF managers IS NOT NULL AND ARRAY_LENGTH(managers, 1) > 0 THEN
    SELECT ARRAY_AGG(normalize_text(m)) INTO normalized_managers_arr
    FROM UNNEST(managers) AS m
    WHERE normalize_text(m) IS NOT NULL;
    has_manager_filter := (normalized_managers_arr IS NOT NULL AND ARRAY_LENGTH(normalized_managers_arr, 1) > 0);
  ELSE
    has_manager_filter := FALSE;
  END IF;

  IF mediators IS NOT NULL AND ARRAY_LENGTH(mediators, 1) > 0 THEN
    SELECT ARRAY_AGG(normalize_text(m)) INTO normalized_mediators_arr
    FROM UNNEST(mediators) AS m
    WHERE normalize_text(m) IS NOT NULL;
    has_mediator_filter := (normalized_mediators_arr IS NOT NULL AND ARRAY_LENGTH(normalized_mediators_arr, 1) > 0);
  ELSE
    has_mediator_filter := FALSE;
  END IF;

  IF leaders IS NOT NULL AND ARRAY_LENGTH(leaders, 1) > 0 THEN
    SELECT ARRAY_AGG(normalize_text(l)) INTO normalized_leaders_arr
    FROM UNNEST(leaders) AS l
    WHERE normalize_text(l) IS NOT NULL;
    has_leader_filter := (normalized_leaders_arr IS NOT NULL AND ARRAY_LENGTH(normalized_leaders_arr, 1) > 0);
  ELSE
    has_leader_filter := FALSE;
  END IF;

  RETURN QUERY
  WITH dates AS (
    SELECT generate_series(start_date, end_date, interval '1 day')::date AS day
  ),
  -- 1. Dados Históricos (até ontem)
  historical_snapshots AS (
    SELECT
      d.day AS snapshot_date,
      s.client_id,
      s.client_name,
      s.planner,
      s.manager,
      s.mediator,
      s.leader,
      s.health_score,
      s.health_category,
      s.nps_score_v3_pillar as nps_score, -- Usar campos V3
      s.payment_pillar as payment_status,
      s.cross_sell_pillar as ecosystem_engagement,
      0 as meeting_engagement, -- Não existe na v3
      0 as app_usage -- Não existe na v3
    FROM dates d
    JOIN LATERAL (
      SELECT DISTINCT ON (h.client_id)
        h.client_id,
        h.client_name,
        h.planner,
        h.manager,
        h.mediator,
        h.leader,
        h.health_score,
        h.health_category,
        h.nps_score_v3_pillar,
        h.payment_pillar,
        h.cross_sell_pillar,
        h.recorded_date
      FROM health_score_history h
      WHERE h.recorded_date <= d.day
        AND h.recorded_date < CURRENT_DATE -- Apenas histórico passado
      ORDER BY h.client_id, h.recorded_date DESC
    ) s ON true
    WHERE d.day < CURRENT_DATE -- Apenas datas passadas
  ),
  -- 2. Dados Atuais (Hoje) - Calculados em Tempo Real
  current_snapshots AS (
    SELECT
      CURRENT_DATE AS snapshot_date,
      c.id AS client_id,
      c.name AS client_name,
      c.planner,
      c.manager,
      c.mediator,
      c.leader,
      (score_json->>'health_score')::INTEGER AS health_score,
      (score_json->>'health_category')::TEXT AS health_category,
      (score_json->>'nps_score_v3_pillar')::INTEGER AS nps_score,
      (score_json->>'payment_pillar')::INTEGER AS payment_status,
      (score_json->>'cross_sell_pillar')::INTEGER AS ecosystem_engagement,
      0 AS meeting_engagement,
      0 AS app_usage
    FROM clients c
    CROSS JOIN LATERAL calculate_health_score_v3(c.id) AS score_json
    WHERE end_date >= CURRENT_DATE -- Só calcular se o range incluir hoje
  ),
  -- 3. Combinar Histórico e Atual
  all_snapshots AS (
    SELECT * FROM historical_snapshots
    UNION ALL
    SELECT * FROM current_snapshots
  ),
  -- 4. Aplicar Filtros
  filtered_snapshots AS (
    SELECT * FROM all_snapshots s
    WHERE (
        normalized_planner_filter = 'all'
        OR normalize_text(s.planner) = normalized_planner_filter
        OR normalize_text(s.planner) LIKE normalized_planner_filter || '%'
        OR normalized_planner_filter LIKE normalize_text(s.planner) || '%'
      )
      AND s.planner <> '0' -- Mantendo filtro de planner inválido
      AND (
        NOT has_manager_filter
        OR EXISTS (
          SELECT 1 FROM UNNEST(normalized_managers_arr) AS nm
          WHERE normalize_text(s.manager) = nm
             OR normalize_text(s.manager) LIKE nm || '%'
             OR nm LIKE normalize_text(s.manager) || '%'
        )
        OR (include_null_manager AND s.manager IS NULL)
      )
      AND (
        NOT has_mediator_filter
        OR EXISTS (
          SELECT 1 FROM UNNEST(normalized_mediators_arr) AS nm
          WHERE normalize_text(s.mediator) = nm
             OR normalize_text(s.mediator) LIKE nm || '%'
             OR nm LIKE normalize_text(s.mediator) || '%'
        )
        OR (include_null_mediator AND s.mediator IS NULL)
      )
      AND (
        NOT has_leader_filter
        OR EXISTS (
          SELECT 1 FROM UNNEST(normalized_leaders_arr) AS nl
          WHERE normalize_text(s.leader) = nl
             OR normalize_text(s.leader) LIKE nl || '%'
             OR nl LIKE normalize_text(s.leader) || '%'
        )
        OR (include_null_leader AND s.leader IS NULL)
      )
  ),
  -- 5. Agregação Final
  aggregated AS (
    SELECT
      fs.snapshot_date,
      CASE WHEN normalized_planner_filter = 'all' THEN 'all' ELSE fs.planner END AS planner_label,
      COUNT(*) AS total_clients,
      ROUND(AVG(fs.health_score), 2) AS avg_health_score,
      COUNT(CASE WHEN fs.health_category = 'Ótimo' THEN 1 END) AS excellent_count,
      COUNT(CASE WHEN fs.health_category = 'Estável' THEN 1 END) AS stable_count,
      COUNT(CASE WHEN fs.health_category = 'Atenção' THEN 1 END) AS warning_count,
      COUNT(CASE WHEN fs.health_category = 'Crítico' THEN 1 END) AS critical_count,
      0::NUMERIC AS avg_meeting_engagement, -- Deprecated
      0::NUMERIC AS avg_app_usage, -- Deprecated
      ROUND(AVG(fs.payment_status), 2) AS avg_payment_status,
      ROUND(AVG(fs.ecosystem_engagement), 2) AS avg_ecosystem_engagement,
      ROUND(AVG(fs.nps_score), 2) AS avg_nps_score
    FROM filtered_snapshots fs
    GROUP BY fs.snapshot_date, CASE WHEN normalized_planner_filter = 'all' THEN 'all' ELSE fs.planner END
    ORDER BY fs.snapshot_date
  )
  SELECT
    agg.snapshot_date AS recorded_date,
    agg.planner_label AS planner,
    agg.total_clients,
    agg.avg_health_score,
    agg.excellent_count,
    agg.stable_count,
    agg.warning_count,
    agg.critical_count,
    agg.avg_meeting_engagement,
    agg.avg_app_usage,
    agg.avg_payment_status,
    agg.avg_ecosystem_engagement,
    agg.avg_nps_score
  FROM aggregated agg
  ORDER BY agg.snapshot_date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_temporal_analysis_asof(DATE, DATE, TEXT, TEXT[], TEXT[], TEXT[], BOOLEAN, BOOLEAN, BOOLEAN) IS 'Versão Híbrida (Histórico + Tempo Real) para garantir consistência com Visão Geral';

-- 3. Limpar histórico de hoje (que pode estar errado) e recalcular
DELETE FROM health_score_history WHERE recorded_date = CURRENT_DATE;

-- 4. Recalcular histórico de hoje com a nova função record_health_score_history (que usa v3)
SELECT backfill_health_score_history();
