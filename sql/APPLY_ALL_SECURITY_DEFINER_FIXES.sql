-- ============================================
-- APLICAR SECURITY DEFINER EM TODAS AS FUNÇÕES RPC
-- ============================================
-- Este script consolida todas as correções de SECURITY DEFINER
-- para funções que acessam tabelas com RLS habilitado.
--
-- FUNÇÕES CORRIGIDAS:
-- 1. get_temporal_analysis_asof (análise temporal)
-- 2. get_sankey_snapshot (Movement Sankey)
-- 3. get_client_health_score_evolution (evolução individual)
-- 4. diff_snapshot_pairs (comparação de snapshots)
-- 5. get_hierarchy_cascade (hierarquia de filtros)
-- 6. bulk_insert_clients_v3 (importação em massa)
-- 7. backfill_health_score_history (preenchimento de histórico)
--
-- DATA: 2025-11-26
-- ============================================

-- 1. get_temporal_analysis_asof
-- ============================================
-- CORREÇÃO: Adicionar SECURITY DEFINER para função SQL ignorar RLS
-- ============================================
-- A função get_temporal_analysis_asof estava retornando 0 registros quando chamada
-- pelo frontend (através do Supabase client autenticado) porque o RLS estava bloqueando
-- o acesso aos dados de health_score_history.
--
-- SECURITY DEFINER faz a função rodar com permissões do criador (admin)
-- ao invés das permissões do usuário que chama, permitindo acesso total aos dados.
--
-- DATA: 2025-11-26

CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION normalize_text(input_text TEXT)
RETURNS TEXT AS $$
BEGIN
  IF input_text IS NULL OR TRIM(input_text) = '' THEN
    RETURN NULL;
  END IF;
  RETURN LOWER(TRIM(unaccent(input_text)));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

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
  last_snapshots_by_id AS (
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
      s.meeting_engagement,
      s.app_usage,
      s.payment_status,
      s.ecosystem_engagement,
      s.nps_score
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
        h.meeting_engagement,
        h.app_usage,
        h.payment_status,
        h.ecosystem_engagement,
        h.nps_score,
        h.recorded_date
      FROM health_score_history h
      WHERE h.recorded_date <= d.day
      ORDER BY h.client_id, h.recorded_date DESC
    ) s ON true
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
  deduplicated_snapshots AS (
    SELECT DISTINCT ON (lsbi.snapshot_date, lsbi.client_name)
      lsbi.snapshot_date,
      lsbi.client_name,
      lsbi.planner,
      lsbi.manager,
      lsbi.mediator,
      lsbi.leader,
      lsbi.health_score,
      lsbi.health_category,
      lsbi.meeting_engagement,
      lsbi.app_usage,
      lsbi.payment_status,
      lsbi.ecosystem_engagement,
      lsbi.nps_score
    FROM last_snapshots_by_id lsbi
    ORDER BY lsbi.snapshot_date, lsbi.client_name, lsbi.client_id DESC
  ),
  aggregated AS (
    SELECT
      ds.snapshot_date,
      CASE WHEN normalized_planner_filter = 'all' THEN 'all' ELSE ds.planner END AS planner_label,
      COUNT(*) AS total_clients,
      ROUND(AVG(ds.health_score), 2) AS avg_health_score,
      COUNT(CASE WHEN ds.health_category = 'Ótimo' THEN 1 END) AS excellent_count,
      COUNT(CASE WHEN ds.health_category = 'Estável' THEN 1 END) AS stable_count,
      COUNT(CASE WHEN ds.health_category = 'Atenção' THEN 1 END) AS warning_count,
      COUNT(CASE WHEN ds.health_category = 'Crítico' THEN 1 END) AS critical_count,
      ROUND(AVG(ds.meeting_engagement), 2) AS avg_meeting_engagement,
      ROUND(AVG(ds.app_usage), 2) AS avg_app_usage,
      ROUND(AVG(ds.payment_status), 2) AS avg_payment_status,
      ROUND(AVG(ds.ecosystem_engagement), 2) AS avg_ecosystem_engagement,
      ROUND(AVG(ds.nps_score), 2) AS avg_nps_score
    FROM deduplicated_snapshots ds
    GROUP BY ds.snapshot_date, CASE WHEN normalized_planner_filter = 'all' THEN 'all' ELSE ds.planner END
    ORDER BY ds.snapshot_date
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

COMMENT ON FUNCTION get_temporal_analysis_asof IS 'Versão v3 com SECURITY DEFINER para ignorar RLS e permitir acesso via RPC autenticado';

-- 2. get_sankey_snapshot
-- ============================================
-- FUNÇÃO: get_sankey_snapshot
-- ============================================
-- DESCRIÇÃO:
-- Retorna o snapshot de Health Score para uma data específica, usando a mesma lógica
-- corrigida da análise temporal. Para dias com dados exatos, calcula scores em tempo real
-- da tabela clients (aplicando filtro last_seen_at = max_last_seen_at).
-- Para dias sem dados exatos, usa lógica AS-OF do histórico.
--
-- PARÂMETROS:
--   p_snapshot_date: Data do snapshot desejado
--   p_client_ids: Array de IDs de clientes (opcional, se NULL retorna todos)
--   p_planner_filter: Filtro de planejador ('all' ou nome específico)
--   p_managers: Array de nomes de gerentes (opcional)
--   p_mediators: Array de nomes de mediadores (opcional)
--   p_leaders: Array de nomes de líderes (opcional)
--
-- RETORNO:
--   Tabela com client_id, health_score, health_category e outros campos relevantes
--
-- USO:
--   SELECT * FROM get_sankey_snapshot('2025-11-14'::DATE, NULL, 'all', NULL, NULL, NULL);
--   SELECT * FROM get_sankey_snapshot('2025-11-14'::DATE, ARRAY['uuid1', 'uuid2'], 'all', NULL, NULL, NULL);

CREATE OR REPLACE FUNCTION get_sankey_snapshot(
  p_snapshot_date DATE,
  p_client_ids UUID[] DEFAULT NULL,
  p_planner_filter TEXT DEFAULT 'all',
  p_managers TEXT[] DEFAULT NULL,
  p_mediators TEXT[] DEFAULT NULL,
  p_leaders TEXT[] DEFAULT NULL,
  include_null_manager BOOLEAN DEFAULT FALSE,
  include_null_mediator BOOLEAN DEFAULT FALSE,
  include_null_leader BOOLEAN DEFAULT FALSE
) RETURNS TABLE (
  client_id UUID,
  client_name TEXT,
  planner TEXT,
  manager TEXT,
  mediator TEXT,
  leader TEXT,
  health_score INTEGER,
  health_category TEXT,
  nps_score_v3_pillar INTEGER,
  referral_pillar INTEGER,
  payment_pillar INTEGER,
  cross_sell_pillar INTEGER,
  tenure_pillar INTEGER,
  recorded_date DATE,
  created_at TIMESTAMPTZ
) AS $$
DECLARE
  max_historical_date DATE;
BEGIN
  -- Validar que snapshot_date não é futura
  IF p_snapshot_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'snapshot_date não pode ser data futura: %. Use CURRENT_DATE ou uma data passada.', p_snapshot_date;
  END IF;

  -- Obter última data histórica disponível
  SELECT MAX(h.recorded_date) INTO max_historical_date
  FROM health_score_history h;
  
  IF max_historical_date IS NULL THEN
    RETURN;
  END IF;
  
  -- Se snapshot_date for depois da última data histórica, usar última data disponível
  IF p_snapshot_date > max_historical_date THEN
    p_snapshot_date := max_historical_date;
  END IF;
  
  RETURN QUERY
  WITH 
  -- Obter o last_seen_at mais recente (filtro usado pelo Dashboard)
  max_last_seen_at AS (
    SELECT MAX(last_seen_at) AS max_timestamp
    FROM clients
    WHERE last_seen_at IS NOT NULL
  ),
  -- CORREÇÃO CRÍTICA: Para dias com dados exatos, calcular scores em tempo real
  -- usando função centralizada calculate_health_score_v3() em vez de código duplicado
  -- FILTRO CRÍTICO: Apenas clientes com last_seen_at = max_last_seen_at
  -- CORREÇÃO: Eliminadas ~150 linhas de código duplicado
  exact_day_calculated AS (
    SELECT 
      c.id AS client_id,
      c.name AS client_name,
      c.planner,
      c.manager,
      c.mediator,
      c.leader,
      (score_json->>'health_score')::INTEGER AS health_score,
      (score_json->>'health_category')::TEXT AS health_category,
      (score_json->>'nps_score_v3_pillar')::INTEGER AS nps_score_v3_pillar,
      (score_json->>'referral_pillar')::INTEGER AS referral_pillar,
      (score_json->>'payment_pillar')::INTEGER AS payment_pillar,
      (score_json->>'cross_sell_pillar')::INTEGER AS cross_sell_pillar,
      (score_json->>'tenure_pillar')::INTEGER AS tenure_pillar,
      p_snapshot_date AS recorded_date,
      CURRENT_TIMESTAMP AS created_at
    FROM max_last_seen_at mlsa
    INNER JOIN clients c ON c.last_seen_at = mlsa.max_timestamp  -- ✅ FILTRO CRÍTICO: apenas última importação
    CROSS JOIN LATERAL calculate_health_score_v3(c.id) AS score_json
    WHERE DATE(c.last_seen_at) = p_snapshot_date  -- ✅ Filtrar apenas clientes importados neste dia
      AND c.planner IS NOT NULL
      AND c.planner <> '0'
      AND (p_client_ids IS NULL OR c.id = ANY(p_client_ids))
      AND (p_planner_filter = 'all' OR c.planner = p_planner_filter)
      AND (
        p_managers IS NULL 
        OR c.manager = ANY(p_managers)
        OR (include_null_manager AND c.manager IS NULL)
      )
      AND (
        p_mediators IS NULL 
        OR c.mediator = ANY(p_mediators)
        OR (include_null_mediator AND c.mediator IS NULL)
      )
      AND (
        p_leaders IS NULL 
        OR c.leader = ANY(p_leaders)
        OR (include_null_leader AND c.leader IS NULL)
      )
  ),
  -- Verificar se há dados exatos para este dia
  has_exact_data AS (
    SELECT COUNT(*) > 0 AS has_data FROM exact_day_calculated
  ),
  -- Para dias sem dados exatos, usar lógica AS-OF do histórico
  -- FILTRO CRÍTICO: Aplicar mesmo filtro de last_seen_at
  asof_data AS (
    SELECT 
      h.client_id,
      h.client_name,
      h.planner,
      h.manager,
      h.mediator,
      h.leader,
      h.health_score,
      h.health_category,
      h.nps_score_v3_pillar,
      h.referral_pillar,
      h.payment_pillar,
      h.cross_sell_pillar,
      h.tenure_pillar,
      p_snapshot_date AS recorded_date,
      h.created_at
    FROM health_score_history h
    INNER JOIN clients c ON c.id = h.client_id  -- ✅ Qualificado: c.id e h.client_id
    CROSS JOIN max_last_seen_at mlsa
    CROSS JOIN has_exact_data hed
    WHERE hed.has_data = FALSE  -- ✅ Apenas se não houver dados exatos
      AND h.recorded_date < p_snapshot_date
      AND c.last_seen_at = mlsa.max_timestamp  -- ✅ FILTRO CRÍTICO: apenas última importação
      AND h.planner IS NOT NULL
      AND h.planner <> '0'
      AND (p_client_ids IS NULL OR h.client_id = ANY(p_client_ids))
      AND (p_planner_filter = 'all' OR h.planner = p_planner_filter)
      AND (
        p_managers IS NULL 
        OR h.manager = ANY(p_managers)
        OR (include_null_manager AND h.manager IS NULL)
      )
      AND (
        p_mediators IS NULL 
        OR h.mediator = ANY(p_mediators)
        OR (include_null_mediator AND h.mediator IS NULL)
      )
      AND (
        p_leaders IS NULL 
        OR h.leader = ANY(p_leaders)
        OR (include_null_leader AND h.leader IS NULL)
      )
      AND h.recorded_date >= '2025-11-13'::DATE  -- ✅ Filtrar apenas a partir da data mínima confiável
  ),
  -- Para dados AS-OF, garantir que seja usado o registro mais recente quando há múltiplos
  asof_latest AS (
    SELECT DISTINCT ON (ad.client_id)
      ad.client_id,
      ad.client_name,
      ad.planner,
      ad.manager,
      ad.mediator,
      ad.leader,
      ad.health_score,
      ad.health_category,
      ad.nps_score_v3_pillar,
      ad.referral_pillar,
      ad.payment_pillar,
      ad.cross_sell_pillar,
      ad.tenure_pillar,
      ad.recorded_date,
      ad.created_at
    FROM asof_data ad
    ORDER BY ad.client_id, ad.recorded_date DESC, ad.created_at DESC
  ),
  -- Combinar dados exatos (calculados) e AS-OF (histórico), priorizando dados exatos
  combined_data AS (
    SELECT * FROM exact_day_calculated
    UNION ALL
    SELECT * FROM asof_latest
  )
  SELECT
    cd.client_id,
    cd.client_name,
    cd.planner,
    cd.manager,
    cd.mediator,
    cd.leader,
    cd.health_score,
    cd.health_category,
    cd.nps_score_v3_pillar,
    cd.referral_pillar,
    cd.payment_pillar,
    cd.cross_sell_pillar,
    cd.tenure_pillar,
    cd.recorded_date,
    cd.created_at
  FROM combined_data cd
  ORDER BY cd.client_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_sankey_snapshot IS 'Snapshot de Health Score para Movement Sankey com SECURITY DEFINER para ignorar RLS';

-- 3. get_client_health_score_evolution
-- ============================================
-- FUNÇÃO: get_client_health_score_evolution
-- ============================================
-- DESCRIÇÃO:
-- Retorna a evolução do Health Score de um cliente específico com Forward Filling.
-- Gera uma série completa de datas entre a data inicial (created_at do cliente ou MIN_HISTORY_DATE)
-- e a data atual, preenchendo lacunas com o último Health Score conhecido.
--
-- PARÂMETROS:
--   p_client_id: UUID do cliente
--
-- RETORNO:
--   Tabela com recorded_date, health_score, health_category e outros campos relevantes
--   Ordenada por data crescente, com Forward Filling aplicado
--
-- USO:
--   SELECT * FROM get_client_health_score_evolution('uuid-do-cliente'::UUID);

CREATE OR REPLACE FUNCTION get_client_health_score_evolution(
  p_client_id UUID
) RETURNS TABLE (
  recorded_date DATE,
  health_score INTEGER,
  health_category TEXT,
  nps_score_v3_pillar INTEGER,
  referral_pillar INTEGER,
  payment_pillar INTEGER,
  cross_sell_pillar INTEGER,
  tenure_pillar INTEGER,
  client_name TEXT,
  planner TEXT,
  created_at TIMESTAMPTZ,
  is_forward_filled BOOLEAN -- Indica se o registro foi preenchido pelo Forward Filling
) AS $$
DECLARE
  v_client_created_at DATE;
  v_client_last_seen_at DATE;
  v_start_date DATE;
  v_end_date DATE;
  v_min_history_date DATE := '2025-11-13'::DATE; -- Data mínima confiável
BEGIN
  -- Validar que cliente existe
  SELECT 
    DATE(c.created_at),
    DATE(c.last_seen_at)
  INTO 
    v_client_created_at,
    v_client_last_seen_at
  FROM clients c
  WHERE c.id = p_client_id;
  
  IF v_client_created_at IS NULL THEN
    RAISE EXCEPTION 'Cliente não encontrado: %', p_client_id;
  END IF;
  
  -- Determinar data inicial: usar a mais recente entre created_at e MIN_HISTORY_DATE
  -- Se o cliente foi criado antes de MIN_HISTORY_DATE, começar de MIN_HISTORY_DATE
  v_start_date := GREATEST(v_client_created_at, v_min_history_date);
  
  -- Data final: SEMPRE usar CURRENT_DATE (não permitir datas futuras)
  v_end_date := CURRENT_DATE;
  
  -- Validar que start_date <= end_date
  IF v_start_date > v_end_date THEN
    RETURN;
  END IF;
  
  RETURN QUERY
  WITH 
  -- Gerar série de datas entre start_date e CURRENT_DATE (limitar para evitar datas futuras)
  dates_series AS (
    SELECT generate_series(v_start_date, CURRENT_DATE, interval '1 day')::date AS day
  ),
  -- Calcular score em tempo real para CURRENT_DATE usando função centralizada
  -- CORREÇÃO: Usar calculate_health_score_v3() em vez de código duplicado (~150 linhas eliminadas)
  current_day_calculated AS (
    SELECT 
      CURRENT_DATE AS recorded_date,
      (score_json->>'health_score')::INTEGER AS health_score,
      (score_json->>'health_category')::TEXT AS health_category,
      (score_json->>'nps_score_v3_pillar')::INTEGER AS nps_score_v3_pillar,
      (score_json->>'referral_pillar')::INTEGER AS referral_pillar,
      (score_json->>'payment_pillar')::INTEGER AS payment_pillar,
      (score_json->>'cross_sell_pillar')::INTEGER AS cross_sell_pillar,
      (score_json->>'tenure_pillar')::INTEGER AS tenure_pillar,
      c.name AS client_name,
      c.planner,
      CURRENT_TIMESTAMP AS created_at,
      FALSE AS is_forward_filled
    FROM clients c
    CROSS JOIN LATERAL calculate_health_score_v3(c.id) AS score_json
    WHERE c.id = p_client_id
  ),
  -- Buscar histórico real do cliente (apenas registros existentes, EXCETO CURRENT_DATE)
  -- CURRENT_DATE será calculado em tempo real pela CTE current_day_calculated
  real_history AS (
    SELECT 
      h.recorded_date,
      h.health_score,
      h.health_category,
      h.nps_score_v3_pillar,
      h.referral_pillar,
      h.payment_pillar,
      h.cross_sell_pillar,
      h.tenure_pillar,
      h.client_name,
      h.planner,
      h.created_at,
      FALSE AS is_forward_filled
    FROM health_score_history h
    WHERE h.client_id = p_client_id
      AND h.recorded_date >= v_start_date
      AND h.recorded_date < CURRENT_DATE -- ✅ EXCLUIR CURRENT_DATE (será calculado em tempo real)
      AND h.recorded_date >= v_min_history_date -- Garantir que não usa dados anteriores à data mínima
    ORDER BY h.recorded_date ASC
  ),
  -- Aplicar Forward Filling: para cada dia sem dados, usar o último Health Score conhecido
  -- OTIMIZAÇÃO: Usar LATERAL JOIN para buscar o último registro conhecido uma única vez por dia
  -- CORREÇÃO: Para CURRENT_DATE, usar score calculado em tempo real (não histórico)
  filled_history AS (
    SELECT 
      d.day AS recorded_date,
      -- Para CURRENT_DATE, usar score calculado em tempo real; senão usar histórico ou Forward Fill
      CASE 
        WHEN d.day = CURRENT_DATE THEN cdc.health_score
        ELSE COALESCE(
          rh.health_score,
          last_known.health_score
        )
      END AS health_score,
      CASE 
        WHEN d.day = CURRENT_DATE THEN cdc.health_category
        ELSE COALESCE(
          rh.health_category,
          last_known.health_category
        )
      END AS health_category,
      CASE 
        WHEN d.day = CURRENT_DATE THEN cdc.nps_score_v3_pillar
        ELSE COALESCE(
          rh.nps_score_v3_pillar,
          last_known.nps_score_v3_pillar
        )
      END AS nps_score_v3_pillar,
      CASE 
        WHEN d.day = CURRENT_DATE THEN cdc.referral_pillar
        ELSE COALESCE(
          rh.referral_pillar,
          last_known.referral_pillar
        )
      END AS referral_pillar,
      CASE 
        WHEN d.day = CURRENT_DATE THEN cdc.payment_pillar
        ELSE COALESCE(
          rh.payment_pillar,
          last_known.payment_pillar
        )
      END AS payment_pillar,
      CASE 
        WHEN d.day = CURRENT_DATE THEN cdc.cross_sell_pillar
        ELSE COALESCE(
          rh.cross_sell_pillar,
          last_known.cross_sell_pillar
        )
      END AS cross_sell_pillar,
      CASE 
        WHEN d.day = CURRENT_DATE THEN cdc.tenure_pillar
        ELSE COALESCE(
          rh.tenure_pillar,
          last_known.tenure_pillar
        )
      END AS tenure_pillar,
      CASE 
        WHEN d.day = CURRENT_DATE THEN cdc.client_name
        ELSE COALESCE(
          rh.client_name,
          last_known.client_name,
          (SELECT c1.name FROM clients c1 WHERE c1.id = p_client_id)
        )
      END AS client_name,
      CASE 
        WHEN d.day = CURRENT_DATE THEN cdc.planner
        ELSE COALESCE(
          rh.planner,
          last_known.planner,
          (SELECT c2.planner FROM clients c2 WHERE c2.id = p_client_id)
        )
      END AS planner,
      CASE 
        WHEN d.day = CURRENT_DATE THEN cdc.created_at
        ELSE COALESCE(
          rh.created_at,
          last_known.created_at,
          CURRENT_TIMESTAMP
        )
      END AS created_at,
      -- Marcar se foi preenchido pelo Forward Filling (não para CURRENT_DATE calculado)
      CASE 
        WHEN d.day = CURRENT_DATE THEN FALSE
        ELSE (rh.recorded_date IS NULL)
      END AS is_forward_filled
    FROM dates_series d
    LEFT JOIN real_history rh ON rh.recorded_date = d.day
    LEFT JOIN current_day_calculated cdc ON d.day = CURRENT_DATE -- JOIN para CURRENT_DATE calculado
    -- LATERAL JOIN: buscar o último registro conhecido antes desta data (apenas se não houver registro exato)
    LEFT JOIN LATERAL (
      SELECT 
        h2.health_score,
        h2.health_category,
        h2.nps_score_v3_pillar,
        h2.referral_pillar,
        h2.payment_pillar,
        h2.cross_sell_pillar,
        h2.tenure_pillar,
        h2.client_name,
        h2.planner,
        h2.created_at
      FROM health_score_history h2
      WHERE h2.client_id = p_client_id
        AND h2.recorded_date < d.day
        AND h2.recorded_date >= v_min_history_date
      ORDER BY h2.recorded_date DESC, h2.created_at DESC
      LIMIT 1
    ) last_known ON rh.recorded_date IS NULL AND d.day < CURRENT_DATE -- Apenas buscar se não houver registro exato E não for CURRENT_DATE
  )
  SELECT
    fh.recorded_date,
    fh.health_score,
    fh.health_category,
    fh.nps_score_v3_pillar,
    fh.referral_pillar,
    fh.payment_pillar,
    fh.cross_sell_pillar,
    fh.tenure_pillar,
    fh.client_name,
    fh.planner,
    fh.created_at,
    fh.is_forward_filled
  FROM filled_history fh
  -- Filtrar apenas registros que têm pelo menos um valor válido (não são completamente NULL)
  -- E limitar até CURRENT_DATE para evitar datas futuras
  WHERE (fh.health_score IS NOT NULL OR fh.health_category IS NOT NULL)
    AND fh.recorded_date <= CURRENT_DATE -- ✅ FILTRO CRÍTICO: evitar datas futuras
  ORDER BY fh.recorded_date ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


COMMENT ON FUNCTION get_client_health_score_evolution IS 'Função com SECURITY DEFINER para ignorar RLS';

-- 4. diff_snapshot_pairs
-- Função para comparar pares (nome|planejador) da planilha com o snapshot atual
-- Retorna os pares que estão na planilha mas não no snapshot

CREATE OR REPLACE FUNCTION diff_snapshot_pairs(p_pairs TEXT[])
RETURNS TABLE(pair TEXT) AS $$
BEGIN
  RETURN QUERY
  WITH 
    -- Obter a data do último snapshot
    last_snapshot AS (
      SELECT MAX(last_seen_at) AS last_date
      FROM clients
      WHERE last_seen_at IS NOT NULL
    ),
    -- Obter todos os pares (nome|planejador) do snapshot atual
    snapshot_pairs AS (
      SELECT DISTINCT 
        lower(trim(c.name)) || '|' || lower(trim(c.planner)) AS pair
      FROM clients c
      CROSS JOIN last_snapshot ls
      WHERE c.last_seen_at = ls.last_date
        AND c.name IS NOT NULL 
        AND c.name != '0'
        AND c.planner IS NOT NULL
        AND c.planner != '0'
    ),
    -- Converter array de entrada em tabela
    input_pairs AS (
      SELECT unnest(p_pairs) AS pair
    )
  -- Retornar pares que estão no input mas não no snapshot
  SELECT ip.pair
  FROM input_pairs ip
  LEFT JOIN snapshot_pairs sp ON ip.pair = sp.pair
  WHERE sp.pair IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


COMMENT ON FUNCTION diff_snapshot_pairs IS 'Função com SECURITY DEFINER para ignorar RLS';

-- 5. get_hierarchy_cascade
CREATE OR REPLACE FUNCTION get_hierarchy_cascade(
  p_role TEXT,
  p_hierarchy_name TEXT
)
RETURNS TABLE(
  planner_names TEXT[],
  leader_names TEXT[],
  mediator_names TEXT[]
) AS $$
DECLARE
  v_planner_names TEXT[];
  v_leader_names TEXT[];
  v_mediator_names TEXT[];
BEGIN
  -- Inicializar arrays
  v_planner_names := ARRAY[]::TEXT[];
  v_leader_names := ARRAY[]::TEXT[];
  v_mediator_names := ARRAY[]::TEXT[];

  CASE p_role
    WHEN 'manager' THEN
      -- Gerente vê tudo, não precisa filtrar
      RETURN QUERY SELECT ARRAY[]::TEXT[], ARRAY[]::TEXT[], ARRAY[]::TEXT[];
      RETURN;
    
    WHEN 'mediator' THEN
      -- Buscar todos os líderes abaixo deste mediador
      SELECT ARRAY_AGG(DISTINCT c.leader::TEXT)
      INTO v_leader_names
      FROM clients c
      WHERE c.mediator = p_hierarchy_name
        AND c.leader IS NOT NULL
        AND c.leader != '0';
      
      -- Buscar todos os planejadores abaixo deste mediador (direto ou via líderes)
      SELECT ARRAY_AGG(DISTINCT c.planner::TEXT)
      INTO v_planner_names
      FROM clients c
      WHERE (c.mediator = p_hierarchy_name OR c.leader = ANY(v_leader_names))
        AND c.planner IS NOT NULL
        AND c.planner != '0';
      
      RETURN QUERY SELECT v_planner_names, v_leader_names, ARRAY[p_hierarchy_name]::TEXT[];
    
    WHEN 'leader' THEN
      -- Buscar todos os planejadores abaixo deste líder
      SELECT ARRAY_AGG(DISTINCT c.planner::TEXT)
      INTO v_planner_names
      FROM clients c
      WHERE c.leader = p_hierarchy_name
        AND c.planner IS NOT NULL
        AND c.planner != '0';
      
      RETURN QUERY SELECT v_planner_names, ARRAY[p_hierarchy_name]::TEXT[], ARRAY[]::TEXT[];
    
    WHEN 'planner' THEN
      -- Planejador vê apenas seus próprios clientes
      RETURN QUERY SELECT ARRAY[p_hierarchy_name]::TEXT[], ARRAY[]::TEXT[], ARRAY[]::TEXT[];
    
    ELSE
      RETURN QUERY SELECT ARRAY[]::TEXT[], ARRAY[]::TEXT[], ARRAY[]::TEXT[];
  END CASE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Função para validar se um nome existe na hierarquia
CREATE OR REPLACE FUNCTION validate_hierarchy_name(
  p_role TEXT,
  p_hierarchy_name TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_exists BOOLEAN := FALSE;
BEGIN
  CASE p_role
    WHEN 'manager' THEN
      SELECT EXISTS(
        SELECT 1 FROM clients 
        WHERE manager = p_hierarchy_name 
          AND manager IS NOT NULL 
          AND manager != '0'
      ) INTO v_exists;
    
    WHEN 'mediator' THEN
      SELECT EXISTS(
        SELECT 1 FROM clients 
        WHERE mediator = p_hierarchy_name 
          AND mediator IS NOT NULL 
          AND mediator != '0'
      ) INTO v_exists;
    
    WHEN 'leader' THEN
      SELECT EXISTS(
        SELECT 1 FROM clients 
        WHERE leader = p_hierarchy_name 
          AND leader IS NOT NULL 
          AND leader != '0'
      ) INTO v_exists;
    
    WHEN 'planner' THEN
      SELECT EXISTS(
        SELECT 1 FROM clients 
        WHERE planner = p_hierarchy_name 
          AND planner IS NOT NULL 
          AND planner != '0'
      ) INTO v_exists;
    
    ELSE
      v_exists := FALSE;
  END CASE;
  
  RETURN v_exists;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_user_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_user_profiles_updated_at();

-- 6. Habilitar RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Política: usuários podem ver apenas seu próprio perfil
CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  USING (auth.uid() = id);

-- Política: usuários podem atualizar apenas seu próprio perfil
CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  USING (auth.uid() = id);

-- Política: qualquer usuário autenticado pode ver nomes disponíveis (para signup)
CREATE POLICY "Authenticated users can view available names"
  ON user_profiles FOR SELECT
  USING (true);

-- 7. Função helper para obter perfil do usuário atual
CREATE OR REPLACE FUNCTION get_current_user_profile()
RETURNS TABLE(
  id UUID,
  email TEXT,
  role TEXT,
  hierarchy_name TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    up.id,
    up.email,
    up.role,
    up.hierarchy_name
  FROM user_profiles up
  WHERE up.id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_hierarchy_cascade IS 'Função com SECURITY DEFINER para ignorar RLS';

-- 6. bulk_insert_clients_v3
-- ============================================
-- CORREÇÕES PARA FLUXO DE IMPORTAÇÃO DIÁRIA
-- ============================================
-- Data: 2025-11-13
-- Objetivo: Garantir histórico fidedigno com importação diária de planilhas CSV
--
-- Correções aplicadas:
-- 1. Desabilitar trigger automático (não há edição manual)
-- 2. Usar data da planilha em last_seen_at com proteção GREATEST
-- 3. Garantir que histórico use sempre a data da planilha
-- ============================================

-- ============================================
-- 1. DESABILITAR TRIGGER AUTOMÁTICO
-- ============================================
-- Como não há mais edição manual de clientes, o trigger pode causar
-- registros duplicados no histórico. Desabilitamos para evitar isso.

DROP TRIGGER IF EXISTS clients_health_history_trigger ON clients;

-- Comentário explicativo
COMMENT ON TRIGGER clients_health_history_trigger ON clients IS 
'Trigger desabilitado - histórico é registrado manualmente durante bulk import com data correta da planilha';

-- ============================================
-- 2. CRIAR/ATUALIZAR FUNÇÃO bulk_insert_clients_v3
-- ============================================
-- Esta função é chamada pelo frontend e deve:
-- - Usar data da planilha em last_seen_at (com proteção GREATEST)
-- - Registrar histórico com data da planilha
-- - Converter p_import_date para TIMESTAMPTZ para last_seen_at

CREATE OR REPLACE FUNCTION bulk_insert_clients_v3(
  clients_json JSONB, 
  p_import_date DATE DEFAULT CURRENT_DATE, 
  p_seen_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS SETOF clients AS $$
DECLARE
  client_record JSONB;
  result clients;
  seen_at_from_date TIMESTAMPTZ;
  v_error_message TEXT;
BEGIN
  -- CORREÇÃO CRÍTICA: Envolver em transação explícita para garantir atomicidade
  -- Se qualquer cliente falhar, toda importação é revertida (rollback automático)
  
  -- Converter data da planilha para TIMESTAMPTZ (início do dia)
  -- Se p_import_date foi fornecido, usar ele; senão usar p_seen_at
  IF p_import_date IS NOT NULL AND p_import_date != CURRENT_DATE THEN
    seen_at_from_date := (p_import_date::text || ' 00:00:00')::TIMESTAMPTZ;
  ELSE
    seen_at_from_date := p_seen_at;
  END IF;

  -- Processar cada cliente do JSON dentro de transação
  BEGIN
    FOR client_record IN SELECT * FROM jsonb_array_elements(clients_json)
    LOOP
      -- Chamar função singular que faz o upsert
      -- Se algum cliente falhar aqui, exceção será capturada e toda transação revertida
      SELECT * INTO result FROM bulk_insert_client_v3(
        client_record, 
        p_import_date, 
        seen_at_from_date
      );
      
      RETURN NEXT result;
    END LOOP;
    
    -- Se chegou aqui, todos os clientes foram inseridos com sucesso
    RETURN;
    
  EXCEPTION
    WHEN OTHERS THEN
      -- Capturar erro e fazer rollback automático
      GET STACKED DIAGNOSTICS v_error_message = MESSAGE_TEXT;
      RAISE EXCEPTION 'Erro ao importar clientes: %. Rollback executado - nenhum cliente foi inserido.', v_error_message;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 3. ATUALIZAR bulk_insert_client_v3
-- ============================================
-- Modificar para usar GREATEST em last_seen_at (proteção contra retrocesso)

CREATE OR REPLACE FUNCTION bulk_insert_client_v3(
  payload JSONB, 
  p_import_date DATE DEFAULT CURRENT_DATE, 
  p_seen_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS clients AS $$
DECLARE
  result clients;
  seen_at_final TIMESTAMPTZ;
BEGIN
  IF (payload->>'name') IS NULL 
     OR trim((payload->>'name')::text) = ''
     OR trim(lower((payload->>'name')::text)) IN ('0','#n/d','n/d','na','n/a','-','—','#ref!')
     OR (payload->>'planner') IS NULL 
     OR trim(lower((payload->>'planner')::text)) IN ('0','#n/d','n/d','na','n/a','-','—','','#ref!') THEN
    RAISE EXCEPTION 'Invalid name/planner';
  END IF;

  -- CORREÇÃO CRÍTICA: Sempre usar p_import_date quando fornecido
  -- Converter data da planilha para TIMESTAMPTZ
  -- Se p_import_date foi fornecido explicitamente, usar ele (mesmo que seja CURRENT_DATE)
  -- Se não foi fornecido (NULL), usar p_seen_at
  IF p_import_date IS NOT NULL THEN
    -- Sempre usar p_import_date quando fornecido, independente de ser CURRENT_DATE ou não
    seen_at_final := (p_import_date::text || ' 00:00:00')::TIMESTAMPTZ;
  ELSE
    -- Se p_import_date não foi fornecido, usar p_seen_at
    seen_at_final := p_seen_at;
  END IF;

  INSERT INTO clients (
    name, planner, phone, email, leader, mediator, manager,
    is_spouse, spouse_partner_name, months_since_closing, nps_score_v3, has_nps_referral,
    overdue_installments, overdue_days, cross_sell_count, meetings_enabled,
    last_meeting, has_scheduled_meeting, app_usage, payment_status,
    has_referrals, nps_score, ecosystem_usage,
    identity_key, is_active, last_seen_at
  ) VALUES (
    (payload->>'name')::TEXT,
    CASE 
      WHEN trim(lower((payload->>'planner')::text)) IN ('#n/d','n/d','na','n/a','0','-','—','','#ref!') THEN NULL
      ELSE (payload->>'planner')::TEXT
    END,
    CASE 
      WHEN (payload->>'phone')::text ~* 'e\+|,' THEN NULL
      ELSE (
        CASE WHEN length(regexp_replace((payload->>'phone')::text, '[^0-9]+', '', 'g')) >= 9
             THEN regexp_replace((payload->>'phone')::text, '[^0-9]+', '', 'g')
             ELSE NULL END
      )
    END,
    (payload->>'email')::TEXT,
    CASE 
      WHEN (payload->>'leader') IS NULL THEN NULL
      WHEN trim(lower((payload->>'leader')::text)) IN ('#n/d','n/d','na','n/a','0','-','—','','#ref!') THEN NULL
      ELSE (payload->>'leader')::TEXT
    END,
    CASE 
      WHEN (payload->>'mediator') IS NULL THEN NULL
      WHEN trim(lower((payload->>'mediator')::text)) IN ('#n/d','n/d','na','n/a','0','-','—','','#ref!') THEN NULL
      ELSE (payload->>'mediator')::TEXT
    END,
    CASE 
      WHEN (payload->>'manager') IS NULL THEN NULL
      WHEN trim(lower((payload->>'manager')::text)) IN ('#n/d','n/d','na','n/a','0','-','—','','#ref!') THEN NULL
      ELSE (payload->>'manager')::TEXT
    END,
    COALESCE(
      CASE 
        WHEN regexp_replace((payload->>'is_spouse')::text, '\\D+', '', 'g') ~ '^\\d+$' THEN 
          (regexp_replace((payload->>'is_spouse')::text, '\\D+', '', 'g')::int > 0)
        ELSE (lower(trim((payload->>'is_spouse')::text)) IN ('sim','s','true','t','1','x','yes','y'))
      END,
      false
    ),
    NULLIF(trim((payload->>'spouse_partner_name')::TEXT), ''), -- CORREÇÃO: Adicionar spouse_partner_name
    CASE 
      WHEN regexp_replace((payload->>'months_since_closing')::text, '[^0-9]+', '', 'g') ~ '^[0-9]+$' 
      THEN regexp_replace((payload->>'months_since_closing')::text, '[^0-9]+', '', 'g')::INTEGER 
      ELSE NULL 
    END,
    CASE 
      WHEN regexp_replace((payload->>'nps_score_v3')::text, '[^0-9]+', '', 'g') ~ '^[0-9]+$' 
      THEN regexp_replace((payload->>'nps_score_v3')::text, '[^0-9]+', '', 'g')::INTEGER 
      ELSE NULL 
    END,
    COALESCE(
      CASE 
      WHEN regexp_replace((payload->>'has_nps_referral')::text, '[^0-9]+', '', 'g') ~ '^[0-9]+$' THEN 
        (regexp_replace((payload->>'has_nps_referral')::text, '[^0-9]+', '', 'g')::int > 0)
        ELSE (
          lower(trim((payload->>'has_nps_referral')::text)) IN (
            'sim','s','true','t','1','x','ok','yes','y','indicou','indicacao','indicação'
          )
        )
      END,
      false
    ),
    COALESCE(
      CASE WHEN regexp_replace((payload->>'overdue_installments')::text, '[^0-9]+', '', 'g') ~ '^[0-9]+$'
           THEN regexp_replace((payload->>'overdue_installments')::text, '[^0-9]+', '', 'g')::INTEGER
           ELSE NULL END
    , 0),
    COALESCE(
      CASE WHEN regexp_replace((payload->>'overdue_days')::text, '[^0-9]+', '', 'g') ~ '^[0-9]+$'
           THEN regexp_replace((payload->>'overdue_days')::text, '[^0-9]+', '', 'g')::INTEGER
           ELSE NULL END
    , 0),
    COALESCE(
      CASE WHEN regexp_replace((payload->>'cross_sell_count')::text, '[^0-9]+', '', 'g') ~ '^[0-9]+$'
           THEN regexp_replace((payload->>'cross_sell_count')::text, '[^0-9]+', '', 'g')::INTEGER
           ELSE NULL END
    , 0),
    COALESCE((payload->>'meetings_enabled')::BOOLEAN, false),
    COALESCE((payload->>'last_meeting')::TEXT, 'Nunca'),
    COALESCE((payload->>'has_scheduled_meeting')::BOOLEAN, false),
    COALESCE((payload->>'app_usage')::TEXT, 'Nunca usou'),
    COALESCE((payload->>'payment_status')::TEXT, 'Em dia'),
    COALESCE((payload->>'has_referrals')::BOOLEAN, false),
    COALESCE((payload->>'nps_score')::TEXT, 'Não avaliado'),
    COALESCE((payload->>'ecosystem_usage')::TEXT, 'Não usa'),
    COALESCE(
      NULLIF(NULLIF(
        CASE 
          WHEN (payload->>'phone')::text ~* 'e\+|,' THEN NULL
          ELSE (
            CASE WHEN length(regexp_replace((payload->>'phone')::text, '[^0-9]+', '', 'g')) >= 9
                 THEN regexp_replace((payload->>'phone')::text, '[^0-9]+', '', 'g')
                 ELSE NULL END
          )
        END
      , ''), '0'),
      NULLIF(NULLIF(lower(trim((payload->>'email')::text)), ''), '0'),
      -- CORREÇÃO: Usar texto normalizado ao invés de MD5 para facilitar debug e queries
      lower(trim((payload->>'name')::text)) || '|' || lower(trim((payload->>'planner')::text))
    ),
    TRUE,
    seen_at_final
  )
  ON CONFLICT (identity_key)
  DO UPDATE SET
    phone = EXCLUDED.phone,
    email = EXCLUDED.email,
    leader = EXCLUDED.leader,
    mediator = EXCLUDED.mediator,
    manager = EXCLUDED.manager,
    is_spouse = EXCLUDED.is_spouse,
    spouse_partner_name = EXCLUDED.spouse_partner_name, -- CORREÇÃO: Atualizar spouse_partner_name
    months_since_closing = EXCLUDED.months_since_closing,
    nps_score_v3 = EXCLUDED.nps_score_v3,
    has_nps_referral = EXCLUDED.has_nps_referral,
    overdue_installments = EXCLUDED.overdue_installments,
    overdue_days = EXCLUDED.overdue_days,
    cross_sell_count = GREATEST(EXCLUDED.cross_sell_count, clients.cross_sell_count),
    meetings_enabled = EXCLUDED.meetings_enabled,
    last_meeting = EXCLUDED.last_meeting,
    has_scheduled_meeting = EXCLUDED.has_scheduled_meeting,
    app_usage = EXCLUDED.app_usage,
    payment_status = EXCLUDED.payment_status,
    has_referrals = EXCLUDED.has_referrals,
    nps_score = EXCLUDED.nps_score,
    ecosystem_usage = EXCLUDED.ecosystem_usage,
    planner = EXCLUDED.planner,
    is_active = TRUE,
    -- IMPORTANTE: Usar GREATEST para proteger contra retrocesso de data
    -- Só atualiza last_seen_at se a nova data for >= data atual
    last_seen_at = GREATEST(EXCLUDED.last_seen_at, clients.last_seen_at)
  RETURNING * INTO result;

  -- Registrar health score no histórico (agora inclui cônjuges também)
  -- CORREÇÃO CRÍTICA: Sempre usar p_import_date quando fornecido
  -- Se p_import_date foi fornecido (não NULL), usar ele explicitamente
  -- Se não foi fornecido (NULL), usar CURRENT_DATE como fallback
  -- IMPORTANTE: p_import_date deve ser sempre a data da planilha CSV, nunca CURRENT_DATE por padrão
  IF p_import_date IS NOT NULL THEN
    -- Usar p_import_date explicitamente (data da planilha)
    PERFORM record_health_score_history_v3(result.id, p_import_date);
  ELSE
    -- Fallback: usar CURRENT_DATE apenas se p_import_date não foi fornecido
    PERFORM record_health_score_history_v3(result.id, CURRENT_DATE);
  END IF;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- VERIFICAÇÃO
-- ============================================
-- Verificar se trigger foi desabilitado
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_trigger 
      WHERE tgname = 'clients_health_history_trigger' 
      AND tgenabled = 'D'
    ) THEN '✅ Trigger desabilitado corretamente'
    WHEN NOT EXISTS (
      SELECT 1 FROM pg_trigger 
      WHERE tgname = 'clients_health_history_trigger'
    ) THEN '✅ Trigger não existe (já estava desabilitado ou foi removido)'
    ELSE '⚠️ Trigger ainda está habilitado'
  END AS trigger_status;

-- Verificar se funções foram criadas
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'bulk_insert_clients_v3') 
    THEN '✅ Função bulk_insert_clients_v3 criada'
    ELSE '❌ Função bulk_insert_clients_v3 não encontrada'
  END AS function_status;


COMMENT ON FUNCTION bulk_insert_clients_v3 IS 'Função de bulk insert com SECURITY DEFINER para ignorar RLS';

-- 7. backfill_health_score_history
-- Extensão para análise temporal do Health Score Dashboard
-- Execute este script APÓS o setup.sql principal

-- Criar tabela para histórico de Health Score
CREATE TABLE IF NOT EXISTS health_score_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  recorded_date DATE NOT NULL,
  
  -- Dados do cliente no momento do registro
  client_name TEXT NOT NULL,
  planner TEXT NOT NULL,
  
  -- Cálculos do Health Score
  health_score INTEGER NOT NULL,
  health_category TEXT NOT NULL,
  
  -- Breakdown detalhado do score
  meeting_engagement INTEGER NOT NULL,
  app_usage INTEGER NOT NULL,
  payment_status INTEGER NOT NULL,
  ecosystem_engagement INTEGER NOT NULL,
  nps_score INTEGER NOT NULL,
  
  -- Dados originais para referência
  last_meeting TEXT NOT NULL,
  has_scheduled_meeting BOOLEAN NOT NULL,
  app_usage_status TEXT NOT NULL,
  payment_status_detail TEXT NOT NULL,
  has_referrals BOOLEAN NOT NULL,
  nps_score_detail TEXT NOT NULL,
  ecosystem_usage TEXT NOT NULL,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraint para evitar duplicatas por cliente por dia
  CONSTRAINT unique_client_date UNIQUE(client_id, recorded_date)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_health_history_client ON health_score_history(client_id);
CREATE INDEX IF NOT EXISTS idx_health_history_date ON health_score_history(recorded_date);
CREATE INDEX IF NOT EXISTS idx_health_history_planner ON health_score_history(planner);
CREATE INDEX IF NOT EXISTS idx_health_history_client_date ON health_score_history(client_id, recorded_date);

-- Função para calcular Health Score (replicada do frontend)
CREATE OR REPLACE FUNCTION calculate_health_score(
  p_last_meeting TEXT,
  p_has_scheduled_meeting BOOLEAN,
  p_app_usage TEXT,
  p_payment_status TEXT,
  p_has_referrals BOOLEAN,
  p_nps_score TEXT,
  p_ecosystem_usage TEXT
) RETURNS JSON AS $$
DECLARE
  meeting_score INTEGER := 0;
  app_score INTEGER := 0;
  payment_score INTEGER := 0;
  ecosystem_score INTEGER := 0;
  nps_score_val INTEGER := 0;
  total_score INTEGER := 0;
  category TEXT := '';
BEGIN
  -- Override rule: 3+ parcelas em atraso = 0
  IF p_payment_status = '3+ parcelas em atraso' THEN
    RETURN json_build_object(
      'total', 0,
      'category', 'Crítico',
      'meeting_engagement', 0,
      'app_usage', 0,
      'payment_status', 0,
      'ecosystem_engagement', 0,
      'nps_score', 0
    );
  END IF;

  -- Cálculo Meeting Engagement (40 pontos máx)
  CASE p_last_meeting
    WHEN '< 30 dias' THEN meeting_score := 30;
    WHEN '31-60 dias' THEN meeting_score := 15;
    WHEN '> 60 dias' THEN meeting_score := -10;
    ELSE meeting_score := 0;
  END CASE;
  
  IF p_has_scheduled_meeting THEN
    meeting_score := meeting_score + 10;
  END IF;

  -- Cálculo App Usage (30 pontos máx)
  CASE p_app_usage
    WHEN 'Acessou e categorizou (15 dias)' THEN app_score := 30;
    WHEN 'Acessou, sem categorização' THEN app_score := 15;
    WHEN 'Sem acesso/categorização (30+ dias)' THEN app_score := -10;
    ELSE app_score := 0;
  END CASE;

  -- Cálculo Payment Status (30 pontos máx)
  CASE p_payment_status
    WHEN 'Pagamento em dia' THEN payment_score := 30;
    WHEN '1 parcela em atraso' THEN payment_score := -5;
    WHEN '2 parcelas em atraso' THEN payment_score := -15;
    ELSE payment_score := 0;
  END CASE;

  -- Cálculo Ecosystem Engagement (15 pontos máx)
  CASE p_ecosystem_usage
    WHEN 'Usou 2+ áreas' THEN ecosystem_score := 10;
    WHEN 'Usou 1 área' THEN ecosystem_score := 5;
    WHEN 'Não usou' THEN ecosystem_score := 0;
    ELSE ecosystem_score := 0;
  END CASE;
  
  IF p_has_referrals THEN
    ecosystem_score := ecosystem_score + 5;
  END IF;

  -- Cálculo NPS (15 pontos máx)
  CASE p_nps_score
    WHEN 'Promotor (9-10)' THEN nps_score_val := 15;
    WHEN 'Neutro (7-8)' THEN nps_score_val := 0;
    WHEN 'Detrator (0-6)' THEN nps_score_val := -15;
    ELSE nps_score_val := 0;
  END CASE;

  -- Total
  total_score := meeting_score + app_score + payment_score + ecosystem_score + nps_score_val;

  -- Categoria
  IF total_score >= 100 THEN category := 'Ótimo';
  ELSIF total_score >= 60 THEN category := 'Estável';
  ELSIF total_score >= 35 THEN category := 'Atenção';
  ELSE category := 'Crítico';
  END IF;

  RETURN json_build_object(
    'total', total_score,
    'category', category,
    'meeting_engagement', meeting_score,
    'app_usage', app_score,
    'payment_status', payment_score,
    'ecosystem_engagement', ecosystem_score,
    'nps_score', nps_score_val
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função AS-OF: série temporal diária usando o último estado conhecido até cada data
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
BEGIN
  RETURN QUERY
  WITH dates AS (
    SELECT generate_series(start_date, end_date, interval '1 day')::date AS day
  ),
  last_snapshots AS (
    SELECT 
      d.day AS snapshot_date,
      s.planner,
      s.manager,
      s.mediator,
      s.leader,
      s.health_score,
      s.health_category,
      s.meeting_engagement,
      s.app_usage,
      s.payment_status,
      s.ecosystem_engagement,
      s.nps_score
    FROM dates d
    JOIN LATERAL (
      SELECT DISTINCT ON (h.client_id)
        h.client_id,
        h.planner,
        h.manager,
        h.mediator,
        h.leader,
        h.health_score,
        h.health_category,
        h.meeting_engagement,
        h.app_usage,
        h.payment_status,
        h.ecosystem_engagement,
        h.nps_score,
        h.recorded_date
      FROM health_score_history h
      WHERE h.recorded_date <= d.day
      ORDER BY h.client_id, h.recorded_date DESC
    ) s ON true
    WHERE (planner_filter = 'all' OR s.planner = planner_filter)
      AND s.planner <> '0'
      AND (
        managers IS NULL 
        OR s.manager = ANY(managers)
        OR (include_null_manager AND s.manager IS NULL)
      )
      AND (
        mediators IS NULL 
        OR s.mediator = ANY(mediators)
        OR (include_null_mediator AND s.mediator IS NULL)
      )
      AND (
        leaders IS NULL 
        OR s.leader = ANY(leaders)
        OR (include_null_leader AND s.leader IS NULL)
      )
  ),
  aggregated AS (
    SELECT 
      ls.snapshot_date,
      CASE WHEN planner_filter = 'all' THEN 'all' ELSE ls.planner END AS planner_label,
      COUNT(*) AS total_clients,
      ROUND(AVG(ls.health_score), 2) AS avg_health_score,
      COUNT(CASE WHEN ls.health_category = 'Ótimo' THEN 1 END) AS excellent_count,
      COUNT(CASE WHEN ls.health_category = 'Estável' THEN 1 END) AS stable_count,
      COUNT(CASE WHEN ls.health_category = 'Atenção' THEN 1 END) AS warning_count,
      COUNT(CASE WHEN ls.health_category = 'Crítico' THEN 1 END) AS critical_count,
      ROUND(AVG(ls.meeting_engagement), 2) AS avg_meeting_engagement,
      ROUND(AVG(ls.app_usage), 2) AS avg_app_usage,
      ROUND(AVG(ls.payment_status), 2) AS avg_payment_status,
      ROUND(AVG(ls.ecosystem_engagement), 2) AS avg_ecosystem_engagement,
      ROUND(AVG(ls.nps_score), 2) AS avg_nps_score
    FROM last_snapshots ls
    GROUP BY ls.snapshot_date, CASE WHEN planner_filter = 'all' THEN 'all' ELSE ls.planner END
    ORDER BY ls.snapshot_date
  )
  SELECT
    aggregated.snapshot_date AS recorded_date,
    aggregated.planner_label AS planner,
    aggregated.total_clients,
    aggregated.avg_health_score,
    aggregated.excellent_count,
    aggregated.stable_count,
    aggregated.warning_count,
    aggregated.critical_count,
    aggregated.avg_meeting_engagement,
    aggregated.avg_app_usage,
    aggregated.avg_payment_status,
    aggregated.avg_ecosystem_engagement,
    aggregated.avg_nps_score
  FROM aggregated
  ORDER BY aggregated.snapshot_date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para registrar Health Score histórico
CREATE OR REPLACE FUNCTION record_health_score_history(client_row clients)
RETURNS VOID AS $$
DECLARE
  health_calc JSON;
  record_date DATE := CURRENT_DATE;
BEGIN
  -- Calcular Health Score
  health_calc := calculate_health_score(
    client_row.last_meeting,
    client_row.has_scheduled_meeting,
    client_row.app_usage,
    client_row.payment_status,
    client_row.has_referrals,
    client_row.nps_score,
    client_row.ecosystem_usage
  );

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
    ecosystem_usage
  ) VALUES (
    client_row.id,
    record_date,
    client_row.name,
    client_row.planner,
    (health_calc->>'total')::INTEGER,
    health_calc->>'category',
    (health_calc->>'meeting_engagement')::INTEGER,
    (health_calc->>'app_usage')::INTEGER,
    (health_calc->>'payment_status')::INTEGER,
    (health_calc->>'ecosystem_engagement')::INTEGER,
    (health_calc->>'nps_score')::INTEGER,
    client_row.last_meeting,
    client_row.has_scheduled_meeting,
    client_row.app_usage,
    client_row.payment_status,
    client_row.has_referrals,
    client_row.nps_score,
    client_row.ecosystem_usage
  )
  ON CONFLICT (client_id, recorded_date) 
  DO UPDATE SET
    client_name = EXCLUDED.client_name,
    planner = EXCLUDED.planner,
    health_score = EXCLUDED.health_score,
    health_category = EXCLUDED.health_category,
    meeting_engagement = EXCLUDED.meeting_engagement,
    app_usage = EXCLUDED.app_usage,
    payment_status = EXCLUDED.payment_status,
    ecosystem_engagement = EXCLUDED.ecosystem_engagement,
    nps_score = EXCLUDED.nps_score,
    last_meeting = EXCLUDED.last_meeting,
    has_scheduled_meeting = EXCLUDED.has_scheduled_meeting,
    app_usage_status = EXCLUDED.app_usage_status,
    payment_status_detail = EXCLUDED.payment_status_detail,
    has_referrals = EXCLUDED.has_referrals,
    nps_score_detail = EXCLUDED.nps_score_detail,
    ecosystem_usage = EXCLUDED.ecosystem_usage,
    created_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para registrar histórico automaticamente
CREATE OR REPLACE FUNCTION trigger_record_health_history()
RETURNS TRIGGER AS $$
BEGIN
  -- Registrar para INSERT e UPDATE
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    PERFORM record_health_score_history(NEW);
    RETURN NEW;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Criar trigger
DROP TRIGGER IF EXISTS clients_health_history_trigger ON clients;
CREATE TRIGGER clients_health_history_trigger
  AFTER INSERT OR UPDATE ON clients
  FOR EACH ROW
  EXECUTE FUNCTION trigger_record_health_history();

-- Habilitar RLS na nova tabela
ALTER TABLE health_score_history ENABLE ROW LEVEL SECURITY;

-- Política para permitir operações (idempotente)
DROP POLICY IF EXISTS "Enable all operations for health_score_history" ON health_score_history;
CREATE POLICY "Enable all operations for health_score_history" ON health_score_history
FOR ALL USING (true);

-- View para facilitar consultas de análise temporal
-- Criada com security_invoker = true para respeitar RLS e permissões do usuário que consulta
-- No PostgreSQL 15+, isso garante que a view respeite as políticas RLS da tabela subjacente
CREATE OR REPLACE VIEW temporal_health_analysis 
WITH (security_invoker = true) AS
SELECT 
  recorded_date,
  planner,
  COUNT(*) as total_clients,
  ROUND(AVG(health_score), 2) as avg_health_score,
  COUNT(CASE WHEN health_category = 'Ótimo' THEN 1 END) as excellent_count,
  COUNT(CASE WHEN health_category = 'Estável' THEN 1 END) as stable_count,
  COUNT(CASE WHEN health_category = 'Atenção' THEN 1 END) as warning_count,
  COUNT(CASE WHEN health_category = 'Crítico' THEN 1 END) as critical_count,
  ROUND(AVG(meeting_engagement), 2) as avg_meeting_engagement,
  ROUND(AVG(app_usage), 2) as avg_app_usage,
  ROUND(AVG(payment_status), 2) as avg_payment_status,
  ROUND(AVG(ecosystem_engagement), 2) as avg_ecosystem_engagement,
  ROUND(AVG(nps_score), 2) as avg_nps_score
FROM health_score_history
WHERE planner <> '0' AND client_name <> '0'
GROUP BY recorded_date, planner
ORDER BY recorded_date DESC, planner;

-- Função para análise temporal agregada (todos os planejadores)
CREATE OR REPLACE FUNCTION get_aggregated_temporal_analysis(
  start_date DATE,
  end_date DATE
) RETURNS TABLE (
  recorded_date DATE,
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
BEGIN
  RETURN QUERY
  SELECT 
    h.recorded_date,
    COUNT(*) as total_clients,
    ROUND(AVG(h.health_score), 2) as avg_health_score,
    COUNT(CASE WHEN h.health_category = 'Ótimo' THEN 1 END) as excellent_count,
    COUNT(CASE WHEN h.health_category = 'Estável' THEN 1 END) as stable_count,
    COUNT(CASE WHEN h.health_category = 'Atenção' THEN 1 END) as warning_count,
    COUNT(CASE WHEN h.health_category = 'Crítico' THEN 1 END) as critical_count,
    ROUND(AVG(h.meeting_engagement), 2) as avg_meeting_engagement,
    ROUND(AVG(h.app_usage), 2) as avg_app_usage,
    ROUND(AVG(h.payment_status), 2) as avg_payment_status,
    ROUND(AVG(h.ecosystem_engagement), 2) as avg_ecosystem_engagement,
    ROUND(AVG(h.nps_score), 2) as avg_nps_score
  FROM health_score_history h
  WHERE h.recorded_date >= start_date AND h.recorded_date <= end_date
    AND h.planner <> '0' AND h.client_name <> '0'
  GROUP BY h.recorded_date
  ORDER BY h.recorded_date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para popular histórico de clientes existentes
CREATE OR REPLACE FUNCTION backfill_health_score_history()
RETURNS INTEGER AS $$
DECLARE
  client_record clients%ROWTYPE;
  records_created INTEGER := 0;
BEGIN
  -- Iterar sobre todos os clientes existentes
  FOR client_record IN SELECT * FROM clients LOOP
    -- Registrar histórico para cada cliente
    PERFORM record_health_score_history(client_record);
    records_created := records_created + 1;
  END LOOP;
  
  RETURN records_created;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Verificar se tudo foi criado
SELECT 
  'Tables' as type, 
  table_name 
FROM information_schema.tables 
WHERE table_name IN ('health_score_history')
UNION ALL
SELECT 
  'Views' as type,
  table_name
FROM information_schema.views
WHERE table_name IN ('temporal_health_analysis')
UNION ALL
SELECT 
  'Functions' as type,
  routine_name
FROM information_schema.routines
WHERE routine_name IN (
  'calculate_health_score', 
  'record_health_score_history', 
  'trigger_record_health_history',
  'get_aggregated_temporal_analysis',
  'backfill_health_score_history'
);

COMMENT ON FUNCTION backfill_health_score_history IS 'Função com SECURITY DEFINER para ignorar RLS';

