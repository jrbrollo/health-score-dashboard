-- ============================================
-- CORREÇÃO: Aplicar filtro last_seen_at = max_last_seen_at
-- ============================================
-- PROBLEMA:
-- A função get_temporal_analysis_asof estava retornando score médio de 54.61 para 14/11,
-- enquanto o Dashboard mostra 61.44 (correto).
--
-- CAUSA:
-- O Dashboard filtra apenas clientes com last_seen_at = max_last_seen_at (apenas última importação),
-- mas a função get_temporal_analysis_asof não aplicava esse filtro.
--
-- SOLUÇÃO:
-- Adicionar JOIN com tabela clients na CTE exact_day_data para filtrar apenas clientes
-- com last_seen_at igual ao máximo last_seen_at da tabela clients.

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
      d.day AS snapshot_date,
      c.id AS client_id,
      c.planner,
      c.manager,
      c.mediator,
      c.leader,
      (score_json->>'health_score')::INTEGER AS health_score,
      (score_json->>'health_category')::TEXT AS health_category,
      0::NUMERIC AS meeting_engagement,
      0::NUMERIC AS app_usage,
      0::NUMERIC AS payment_status,
      0::NUMERIC AS ecosystem_engagement,
      0::NUMERIC AS nps_score,
      CURRENT_TIMESTAMP AS created_at
    FROM dates d
    CROSS JOIN max_last_seen_at mlsa
    INNER JOIN clients c ON c.last_seen_at = mlsa.max_timestamp  -- ✅ FILTRO CRÍTICO: apenas última importação
    CROSS JOIN LATERAL calculate_health_score_v3(c.id) AS score_json
    WHERE DATE(c.last_seen_at) = d.day  -- ✅ Filtrar apenas clientes importados neste dia
      AND c.planner IS NOT NULL
      AND c.planner <> '0'
      AND (planner_filter = 'all' OR c.planner = planner_filter)
      AND (
        managers IS NULL 
        OR c.manager = ANY(managers)
        OR (include_null_manager AND c.manager IS NULL)
      )
      AND (
        mediators IS NULL 
        OR c.mediator = ANY(mediators)
        OR (include_null_mediator AND c.mediator IS NULL)
      )
      AND (
        leaders IS NULL 
        OR c.leader = ANY(leaders)
        OR (include_null_leader AND c.leader IS NULL)
      )
  ),
  days_with_exact_data AS (
    SELECT DISTINCT snapshot_date FROM exact_day_calculated
  ),
  -- Para dias sem dados exatos, usar lógica AS-OF do histórico
  -- FILTRO CRÍTICO: Aplicar mesmo filtro de last_seen_at
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
      s.nps_score,
      s.created_at
    FROM dates d
    CROSS JOIN max_last_seen_at mlsa
    LEFT JOIN days_with_exact_data dwed ON dwed.snapshot_date = d.day
    LEFT JOIN LATERAL (
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
        h.created_at
      FROM health_score_history h
      INNER JOIN clients c ON c.id = h.client_id AND c.last_seen_at = mlsa.max_timestamp  -- ✅ Qualificado: c.id e h.client_id
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
    WHERE dwed.snapshot_date IS NULL  -- ✅ Apenas dias sem dados exatos
      AND s.client_id IS NOT NULL
  ),
  -- Combinar dados exatos (calculados) e AS-OF (histórico), priorizando dados exatos
  combined_data AS (
    SELECT * FROM exact_day_calculated
    UNION ALL
    SELECT * FROM asof_data
  ),
  -- Para dados exatos, garantir que seja usado o registro mais recente quando há múltiplos
  last_snapshots AS (
    SELECT DISTINCT ON (cd.snapshot_date, cd.client_id)
      cd.snapshot_date,
      cd.client_id,
      cd.planner,
      cd.manager,
      cd.mediator,
      cd.leader,
      cd.health_score,
      cd.health_category,
      cd.meeting_engagement,
      cd.app_usage,
      cd.payment_status,
      cd.ecosystem_engagement,
      cd.nps_score
    FROM combined_data cd
    ORDER BY cd.snapshot_date, cd.client_id, cd.created_at DESC NULLS LAST
  ),
  -- ✅ CTE aggregated: Agrega dados por dia e planner
  -- IMPORTANTE: Esta CTE só contém dias que têm dados em last_snapshots
  -- Dias sem dados NÃO aparecem aqui, mas serão preservados pelo LEFT JOIN em filled_aggregated
  -- ✅ SEM FILTROS WHERE ou HAVING: Não há filtros removendo dados baseados em valores
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
    -- ✅ SEM FILTROS WHERE: Não há filtros removendo dados baseados em valores
    GROUP BY ls.snapshot_date, CASE WHEN planner_filter = 'all' THEN 'all' ELSE ls.planner END
    -- ✅ SEM HAVING: Não há filtros removendo grupos baseados em valores agregados
    ORDER BY ls.snapshot_date
  ),
  -- ✅ CORREÇÃO: Aplicar Forward Filling: garantir que todos os dias da série tenham dados
  -- Para dias sem dados agregados, usar o último valor conhecido
  -- CORREÇÃO CRÍTICA: Garantir que LEFT JOIN preserve TODOS os dias da série
  filled_aggregated AS (
    SELECT 
      d.day AS recorded_date,
      -- ✅ CORREÇÃO: Garantir que planner nunca seja NULL, usando planner_filter como fallback final
      COALESCE(
        agg.planner_label,
        last_known.planner_label,
        planner_filter  -- ✅ Fallback final para garantir que planner nunca seja NULL
      ) AS planner,
      -- ✅ CORREÇÃO CRÍTICA: Garantir que total_clients NUNCA seja NULL
      -- Isso previne que linhas sejam descartadas pela camada RPC quando total_clients é NULL
      COALESCE(
        agg.total_clients,
        last_known.total_clients,
        0::BIGINT  -- ✅ Fallback final explícito para garantir tipo BIGINT não-NULL
      )::BIGINT AS total_clients,
      -- ✅ CORREÇÃO CRÍTICA: Garantir que avg_health_score NUNCA seja NULL
      COALESCE(
        agg.avg_health_score,
        last_known.avg_health_score,
        0::NUMERIC  -- ✅ Fallback final para garantir que nunca seja NULL
      ) AS avg_health_score,
      -- ✅ CORREÇÃO: Garantir que todas as métricas NUNCA sejam NULL
      COALESCE(
        agg.excellent_count,
        last_known.excellent_count,
        0::BIGINT  -- ✅ Fallback final explícito
      )::BIGINT AS excellent_count,
      COALESCE(
        agg.stable_count,
        last_known.stable_count,
        0::BIGINT  -- ✅ Fallback final explícito
      )::BIGINT AS stable_count,
      COALESCE(
        agg.warning_count,
        last_known.warning_count,
        0::BIGINT  -- ✅ Fallback final explícito
      )::BIGINT AS warning_count,
      COALESCE(
        agg.critical_count,
        last_known.critical_count,
        0::BIGINT  -- ✅ Fallback final explícito
      )::BIGINT AS critical_count,
      COALESCE(
        agg.avg_meeting_engagement,
        last_known.avg_meeting_engagement,
        0::NUMERIC  -- ✅ Fallback final explícito
      ) AS avg_meeting_engagement,
      COALESCE(
        agg.avg_app_usage,
        last_known.avg_app_usage,
        0::NUMERIC  -- ✅ Fallback final explícito
      ) AS avg_app_usage,
      COALESCE(
        agg.avg_payment_status,
        last_known.avg_payment_status,
        0::NUMERIC  -- ✅ Fallback final explícito
      ) AS avg_payment_status,
      COALESCE(
        agg.avg_ecosystem_engagement,
        last_known.avg_ecosystem_engagement,
        0::NUMERIC  -- ✅ Fallback final explícito
      ) AS avg_ecosystem_engagement,
      COALESCE(
        agg.avg_nps_score,
        last_known.avg_nps_score,
        0::NUMERIC  -- ✅ Fallback final explícito
      ) AS avg_nps_score
    FROM dates d
    LEFT JOIN aggregated agg ON agg.snapshot_date = d.day
    -- ✅ CORREÇÃO: LATERAL JOIN deve buscar o último registro conhecido ANTES desta data
    -- Removida condição restritiva: buscar qualquer registro anterior, sem filtros de valores
    LEFT JOIN LATERAL (
      SELECT 
        a2.planner_label,
        a2.total_clients,
        a2.avg_health_score,
        a2.excellent_count,
        a2.stable_count,
        a2.warning_count,
        a2.critical_count,
        a2.avg_meeting_engagement,
        a2.avg_app_usage,
        a2.avg_payment_status,
        a2.avg_ecosystem_engagement,
        a2.avg_nps_score
      FROM aggregated a2
      WHERE a2.snapshot_date < d.day
      -- ✅ CORREÇÃO CRÍTICA: Removido filtro de planner_label para garantir Forward Filling
      -- O filtro de planner já foi aplicado na CTE aggregated, então não é necessário aqui
      -- Isso garante que o LATERAL JOIN sempre encontre o último valor conhecido
      ORDER BY a2.snapshot_date DESC
      LIMIT 1
    ) last_known ON TRUE  -- ✅ Sempre tentar buscar último valor conhecido
  )
  -- ✅ SELECT FINAL: Retornar TODOS os dias da série sem nenhum filtro WHERE
  -- O Forward Filling garante que todos os dias tenham dados válidos (reais ou preenchidos)
  -- Todas as métricas têm fallback final para garantir que nunca sejam NULL
  SELECT
    fa.recorded_date,
    fa.planner,
    fa.total_clients,
    fa.avg_health_score,
    fa.excellent_count,
    fa.stable_count,
    fa.warning_count,
    fa.critical_count,
    fa.avg_meeting_engagement,
    fa.avg_app_usage,
    fa.avg_payment_status,
    fa.avg_ecosystem_engagement,
    fa.avg_nps_score
  FROM filled_aggregated fa
  ORDER BY fa.recorded_date;
END;
$$ LANGUAGE plpgsql;

