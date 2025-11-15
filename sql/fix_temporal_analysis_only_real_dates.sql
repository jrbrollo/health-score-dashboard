-- Correção: get_temporal_analysis_asof deve retornar apenas datas com histórico real
-- Não deve gerar datas futuras ou sem dados

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
  max_historical_date DATE;
BEGIN
  -- Buscar a data máxima que existe no histórico
  SELECT MAX(h.recorded_date) INTO max_historical_date
  FROM health_score_history h;
  
  -- Se não houver histórico, retornar vazio
  IF max_historical_date IS NULL THEN
    RETURN;
  END IF;
  
  -- Limitar end_date para não ultrapassar a data máxima do histórico
  IF end_date > max_historical_date THEN
    end_date := max_historical_date;
  END IF;
  
  -- Se start_date for maior que end_date após o ajuste, retornar vazio
  IF start_date > end_date THEN
    RETURN;
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
  -- IMPORTANTE: Retornar apenas datas que têm pelo menos um snapshot
  -- Isso evita mostrar datas futuras ou sem dados
  WHERE aggregated.total_clients > 0
  ORDER BY aggregated.snapshot_date;
END;
$$ LANGUAGE plpgsql;

