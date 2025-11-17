-- ============================================
-- CORREÇÃO: Usar dados exatos do dia quando disponíveis
-- ============================================
-- PROBLEMA:
-- A função get_temporal_analysis_asof estava usando lógica AS-OF (recorded_date <= d.day)
-- que incluía clientes de dias anteriores mesmo quando havia dados exatos para o dia.
-- Exemplo: Para 14/11, estava incluindo clientes de 13/11 que não têm registro em 14/11.
--
-- CAUSA:
-- WHERE h.recorded_date <= d.day
-- Isso faz sentido para Forward Filling (quando não há dados), mas quando há dados
-- para um dia específico, deveria usar APENAS os registros daquele dia.
--
-- SOLUÇÃO:
-- Modificar para usar registros onde recorded_date = d.day quando há dados para aquele dia.
-- Usar lógica AS-OF apenas quando não há dados exatos para o dia.

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
  SELECT MAX(h.recorded_date) INTO max_historical_date
  FROM health_score_history h;
  
  IF max_historical_date IS NULL THEN
    RETURN;
  END IF;
  
  IF end_date > max_historical_date THEN
    end_date := max_historical_date;
  END IF;
  
  IF start_date > end_date THEN
    RETURN;
  END IF;
  
  RETURN QUERY
  WITH dates AS (
    SELECT generate_series(start_date, end_date, interval '1 day')::date AS day
  ),
  -- CORREÇÃO: Tentar primeiro usar dados exatos do dia (recorded_date = d.day)
  -- Se não houver dados exatos, usar lógica AS-OF (último snapshot conhecido)
  exact_day_data AS (
    SELECT 
      d.day AS snapshot_date,
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
      h.created_at
    FROM dates d
    INNER JOIN health_score_history h ON h.recorded_date = d.day
    WHERE (planner_filter = 'all' OR h.planner = planner_filter)
      AND h.planner <> '0'
      AND (
        managers IS NULL 
        OR h.manager = ANY(managers)
        OR (include_null_manager AND h.manager IS NULL)
      )
      AND (
        mediators IS NULL 
        OR h.mediator = ANY(mediators)
        OR (include_null_mediator AND h.mediator IS NULL)
      )
      AND (
        leaders IS NULL 
        OR h.leader = ANY(leaders)
        OR (include_null_leader AND h.leader IS NULL)
      )
  ),
  -- Para dias sem dados exatos, usar lógica AS-OF (último snapshot conhecido)
  asof_data AS (
    SELECT 
      d.day AS snapshot_date,
      s.client_id,
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
    -- Apenas processar dias que NÃO têm dados exatos
    WHERE NOT EXISTS (
      SELECT 1 FROM exact_day_data ed WHERE ed.snapshot_date = d.day
    )
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
        h.nps_score
      FROM health_score_history h
      WHERE h.recorded_date < d.day
        AND (planner_filter = 'all' OR h.planner = planner_filter)
        AND h.planner <> '0'
        AND (
          managers IS NULL 
          OR h.manager = ANY(managers)
          OR (include_null_manager AND h.manager IS NULL)
        )
        AND (
          mediators IS NULL 
          OR h.mediator = ANY(mediators)
          OR (include_null_mediator AND h.mediator IS NULL)
        )
        AND (
          leaders IS NULL 
          OR h.leader = ANY(leaders)
          OR (include_null_leader AND h.leader IS NULL)
        )
      ORDER BY h.client_id, h.recorded_date DESC, h.created_at DESC
    ) s ON true
  ),
  -- Combinar dados exatos e AS-OF, priorizando dados exatos
  combined_data AS (
    SELECT * FROM exact_day_data
    UNION ALL
    SELECT * FROM asof_data
  ),
  -- Para dados exatos, garantir que seja usado o registro mais recente quando há múltiplos
  last_snapshots AS (
    SELECT DISTINCT ON (snapshot_date, client_id)
      snapshot_date,
      client_id,
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
    FROM combined_data
    ORDER BY snapshot_date, client_id, created_at DESC NULLS LAST
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
  WHERE aggregated.total_clients > 0
  ORDER BY aggregated.snapshot_date;
END;
$$ LANGUAGE plpgsql;

