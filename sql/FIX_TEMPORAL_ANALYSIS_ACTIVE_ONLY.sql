-- ============================================
-- CORREÇÃO COMPLETA: LÓGICA V3 + FILTRO DE ATIVOS
-- ============================================
-- Este script unifica as correções de discrepância de cálculo e filtro de inativos.
--
-- 1. Atualiza record_health_score_history para usar lógica V3.
-- 2. Atualiza get_temporal_analysis_asof para usar lógica híbrida e filtrar ativos.
-- 3. Atualiza backfill_health_score_history para ignorar inativos.
-- 4. Recalcula histórico de hoje.

-- ============================================
-- 1. ATUALIZAR FUNÇÃO DE GRAVAÇÃO (LÓGICA V3)
-- ============================================
CREATE OR REPLACE FUNCTION record_health_score_history(client_row clients)
RETURNS VOID AS $$
DECLARE
  health_calc JSON;
  record_date DATE := CURRENT_DATE;
BEGIN
  -- CORREÇÃO: Usar calculate_health_score_v3 (mesma lógica do frontend)
  health_calc := calculate_health_score_v3(client_row.id);

  -- Inserir ou atualizar registro histórico (upsert)
  INSERT INTO health_score_history (
    client_id,
    recorded_date,
    client_name,
    planner,
    health_score,
    health_category,
    meeting_engagement,
    app_usage,
    payment_status,
    ecosystem_engagement,
    nps_score,
    last_meeting,
    has_scheduled_meeting,
    app_usage_status,
    payment_status_detail,
    has_referrals,
    nps_score_detail,
    ecosystem_usage,
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
    0, -- meeting_engagement
    0, -- app_usage
    (health_calc->>'payment_pillar')::INTEGER,
    (health_calc->>'cross_sell_pillar')::INTEGER,
    (health_calc->>'nps_score_v3_pillar')::INTEGER,
    client_row.last_meeting,
    client_row.has_scheduled_meeting,
    client_row.app_usage,
    client_row.payment_status,
    client_row.has_referrals,
    client_row.nps_score,
    client_row.ecosystem_usage,
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
    nps_score_v3_pillar = EXCLUDED.nps_score_v3_pillar,
    referral_pillar = EXCLUDED.referral_pillar,
    payment_pillar = EXCLUDED.payment_pillar,
    cross_sell_pillar = EXCLUDED.cross_sell_pillar,
    tenure_pillar = EXCLUDED.tenure_pillar,
    created_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 2. ATUALIZAR ANÁLISE TEMPORAL (FILTRO ATIVOS)
-- ============================================
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
  -- Normalização de inputs
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
      s.nps_score_v3_pillar as nps_score,
      s.payment_pillar as payment_status,
      s.cross_sell_pillar as ecosystem_engagement,
      0 as meeting_engagement,
      0 as app_usage
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
    WHERE d.day < CURRENT_DATE
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
      AND (c.is_active IS NOT FALSE) -- FILTRO DE ATIVOS
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
      AND s.planner <> '0'
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
      0::NUMERIC AS avg_meeting_engagement,
      0::NUMERIC AS avg_app_usage,
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

COMMENT ON FUNCTION get_temporal_analysis_asof(DATE, DATE, TEXT, TEXT[], TEXT[], TEXT[], BOOLEAN, BOOLEAN, BOOLEAN) IS 'Versão Híbrida com filtro de ativos (is_active=true)';

-- ============================================
-- 3. ATUALIZAR BACKFILL (IGNORAR INATIVOS)
-- ============================================
CREATE OR REPLACE FUNCTION backfill_health_score_history()
RETURNS INTEGER AS $$
DECLARE
  client_record clients%ROWTYPE;
  counter INTEGER := 0;
BEGIN
  -- Iterar sobre todos os clientes ATIVOS
  FOR client_record IN SELECT * FROM clients WHERE is_active IS NOT FALSE LOOP
    -- Registrar histórico para cada cliente
    PERFORM record_health_score_history(client_record);
    counter := counter + 1;
  END LOOP;
  
  RETURN counter;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION backfill_health_score_history() IS 'Backfill apenas para clientes ativos';

-- ============================================
-- 4. EXECUÇÃO
-- ============================================

-- Limpar histórico de hoje (que contém inativos do backfill anterior)
DELETE FROM health_score_history WHERE recorded_date = CURRENT_DATE;

-- Recalcular histórico de hoje (apenas ativos)
SELECT backfill_health_score_history();
