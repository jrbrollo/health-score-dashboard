-- ============================================
-- CORREÇÃO: Normalização de filtros hierárquicos em funções temporais
-- ============================================
-- PROBLEMA: Funções SQL faziam comparações case-sensitive e sem normalização
-- de diacríticos, causando falha quando frontend passava filtros normalizados
-- (ex: 'abraao lima velozo' não encontrava 'Abraão Lima Velozo')
--
-- SOLUÇÃO: Adicionar normalização de texto (lowercase + sem acentos) em:
--   - get_temporal_analysis_asof
--   - get_sankey_snapshot
--   - get_sankey_movement (se existir)
--
-- DATA: 2025-11-26
-- AUTOR: Claude AI

-- Criar extensão unaccent se não existir (para remover acentos)
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Dropar função antiga se existir (necessário para alterar assinatura)
DROP FUNCTION IF EXISTS normalize_text(text);

-- Função auxiliar para normalizar texto (lowercase + sem acentos)
CREATE OR REPLACE FUNCTION normalize_text(text_value TEXT)
RETURNS TEXT AS $$
BEGIN
  IF text_value IS NULL OR TRIM(text_value) = '' THEN
    RETURN NULL;
  END IF;

  -- Normalizar: lowercase + sem acentos + trim
  RETURN LOWER(TRIM(unaccent(text_value)));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Recriar função get_temporal_analysis_asof com normalização
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
BEGIN
  -- Normalizar planner_filter
  normalized_planner := CASE
    WHEN planner_filter = 'all' THEN 'all'
    ELSE normalize_text(planner_filter)
  END;

  -- Normalizar arrays de filtros hierárquicos
  IF managers IS NOT NULL THEN
    SELECT ARRAY_AGG(normalize_text(m)) INTO normalized_managers
    FROM UNNEST(managers) AS m
    WHERE normalize_text(m) IS NOT NULL;
  END IF;

  IF mediators IS NOT NULL THEN
    SELECT ARRAY_AGG(normalize_text(m)) INTO normalized_mediators
    FROM UNNEST(mediators) AS m
    WHERE normalize_text(m) IS NOT NULL;
  END IF;

  IF leaders IS NOT NULL THEN
    SELECT ARRAY_AGG(normalize_text(l)) INTO normalized_leaders
    FROM UNNEST(leaders) AS l
    WHERE normalize_text(l) IS NOT NULL;
  END IF;

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
    WHERE (
        normalized_planner = 'all'
        OR normalize_text(s.planner) = normalized_planner
        OR normalize_text(s.planner) LIKE normalized_planner || '%'
        OR normalized_planner LIKE normalize_text(s.planner) || '%'
      )
      AND s.planner <> '0'
      AND (
        normalized_managers IS NULL
        OR EXISTS (
          SELECT 1 FROM UNNEST(normalized_managers) AS nm
          WHERE normalize_text(s.manager) = nm
             OR normalize_text(s.manager) LIKE nm || '%'
             OR nm LIKE normalize_text(s.manager) || '%'
        )
        OR (include_null_manager AND s.manager IS NULL)
      )
      AND (
        normalized_mediators IS NULL
        OR EXISTS (
          SELECT 1 FROM UNNEST(normalized_mediators) AS nm
          WHERE normalize_text(s.mediator) = nm
             OR normalize_text(s.mediator) LIKE nm || '%'
             OR nm LIKE normalize_text(s.mediator) || '%'
        )
        OR (include_null_mediator AND s.mediator IS NULL)
      )
      AND (
        normalized_leaders IS NULL
        OR EXISTS (
          SELECT 1 FROM UNNEST(normalized_leaders) AS nl
          WHERE normalize_text(s.leader) = nl
             OR normalize_text(s.leader) LIKE nl || '%'
             OR nl LIKE normalize_text(s.leader) || '%'
        )
        OR (include_null_leader AND s.leader IS NULL)
      )
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
    FROM last_snapshots ls
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
