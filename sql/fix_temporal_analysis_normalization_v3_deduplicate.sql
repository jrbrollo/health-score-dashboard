-- ============================================
-- CORREÇÃO v3: Normalização + Deduplicação por client_name
-- ============================================
-- Correção FINAL que resolve o problema de clientes duplicados com IDs diferentes
--
-- PROBLEMA IDENTIFICADO:
-- - Dashboard busca da tabela `clients` (snapshot único do dia)
-- - Função SQL busca de `health_score_history` (múltiplos registros ao longo do tempo)
-- - Mesmo cliente pode ter múltiplos client_ids na history (ex: 3 IDs para "Eber Pereira da Fonseca")
-- - SQL conta por client_id (46 registros) vs Dashboard conta por client_name único (32 clientes)
--
-- SOLUÇÃO:
-- - Deduplic por client_name ANTES de agregar
-- - Usar DISTINCT ON (client_name) ao invés de DISTINCT ON (client_id)
--
-- DATA: 2025-11-26
-- AUTOR: Claude AI

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
  normalized_planner TEXT;
  normalized_managers TEXT[];
  normalized_mediators TEXT[];
  normalized_leaders TEXT[];
  has_manager_filter BOOLEAN;
  has_mediator_filter BOOLEAN;
  has_leader_filter BOOLEAN;
BEGIN
  normalized_planner := CASE
    WHEN planner_filter = 'all' THEN 'all'
    ELSE normalize_text(planner_filter)
  END;

  IF managers IS NOT NULL AND ARRAY_LENGTH(managers, 1) > 0 THEN
    SELECT ARRAY_AGG(normalize_text(m)) INTO normalized_managers
    FROM UNNEST(managers) AS m
    WHERE normalize_text(m) IS NOT NULL;
    has_manager_filter := (normalized_managers IS NOT NULL AND ARRAY_LENGTH(normalized_managers, 1) > 0);
  ELSE
    has_manager_filter := FALSE;
  END IF;

  IF mediators IS NOT NULL AND ARRAY_LENGTH(mediators, 1) > 0 THEN
    SELECT ARRAY_AGG(normalize_text(m)) INTO normalized_mediators
    FROM UNNEST(mediators) AS m
    WHERE normalize_text(m) IS NOT NULL;
    has_mediator_filter := (normalized_mediators IS NOT NULL AND ARRAY_LENGTH(normalized_mediators, 1) > 0);
  ELSE
    has_mediator_filter := FALSE;
  END IF;

  IF leaders IS NOT NULL AND ARRAY_LENGTH(leaders, 1) > 0 THEN
    SELECT ARRAY_AGG(normalize_text(l)) INTO normalized_leaders
    FROM UNNEST(leaders) AS l
    WHERE normalize_text(l) IS NOT NULL;
    has_leader_filter := (normalized_leaders IS NOT NULL AND ARRAY_LENGTH(normalized_leaders, 1) > 0);
  ELSE
    has_leader_filter := FALSE;
  END IF;

  RETURN QUERY
  WITH dates AS (
    SELECT generate_series(start_date, end_date, interval '1 day')::date AS day
  ),
  -- Primeiro pegar o último registro de cada client_id
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
        normalized_planner = 'all'
        OR normalize_text(s.planner) = normalized_planner
        OR normalize_text(s.planner) LIKE normalized_planner || '%'
        OR normalized_planner LIKE normalize_text(s.planner) || '%'
      )
      AND s.planner <> '0'
      AND (
        NOT has_manager_filter
        OR EXISTS (
          SELECT 1 FROM UNNEST(normalized_managers) AS nm
          WHERE normalize_text(s.manager) = nm
             OR normalize_text(s.manager) LIKE nm || '%'
             OR nm LIKE normalize_text(s.manager) || '%'
        )
        OR (include_null_manager AND s.manager IS NULL)
      )
      AND (
        NOT has_mediator_filter
        OR EXISTS (
          SELECT 1 FROM UNNEST(normalized_mediators) AS nm
          WHERE normalize_text(s.mediator) = nm
             OR normalize_text(s.mediator) LIKE nm || '%'
             OR nm LIKE normalize_text(s.mediator) || '%'
        )
        OR (include_null_mediator AND s.mediator IS NULL)
      )
      AND (
        NOT has_leader_filter
        OR EXISTS (
          SELECT 1 FROM UNNEST(normalized_leaders) AS nl
          WHERE normalize_text(s.leader) = nl
             OR normalize_text(s.leader) LIKE nl || '%'
             OR nl LIKE normalize_text(s.leader) || '%'
        )
        OR (include_null_leader AND s.leader IS NULL)
      )
  ),
  -- CHAVE: Deduplic por client_name (pegar apenas 1 registro por nome)
  -- Isso resolve o problema de múltiplos IDs para o mesmo cliente
  deduplicated_snapshots AS (
    SELECT DISTINCT ON (snapshot_date, client_name)
      snapshot_date,
      client_name,
      planner,
      manager,
      mediator,
      leader,
      health_score,
      health_category,
      meeting_engagement,
      app_usage,
      payment_status,
      ecosystem_engagement,
      nps_score
    FROM last_snapshots_by_id
    -- Priorizar o client_id com a data de criação mais recente se houver duplicatas
    ORDER BY snapshot_date, client_name, client_id DESC
  ),
  aggregated AS (
    SELECT
      ls.snapshot_date,
      CASE WHEN normalized_planner = 'all' THEN 'all' ELSE ls.planner END AS planner_label,
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
    FROM deduplicated_snapshots ls
    GROUP BY ls.snapshot_date, CASE WHEN normalized_planner = 'all' THEN 'all' ELSE ls.planner END
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
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_temporal_analysis_asof IS 'Versão v3 com normalização de texto e deduplicação por client_name para evitar contar o mesmo cliente múltiplas vezes';
