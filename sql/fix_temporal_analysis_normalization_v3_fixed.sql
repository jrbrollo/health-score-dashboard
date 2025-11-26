-- ============================================
-- CORREÇÃO v3 FIXED: Resolver ambiguidade de nomes de colunas
-- ============================================

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
  -- Renomear variáveis para evitar conflito com nomes de colunas
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
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_temporal_analysis_asof IS 'Versão v3 com normalização de texto e deduplicação por client_name';
