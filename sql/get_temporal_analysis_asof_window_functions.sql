-- ============================================
-- CORREÇÃO ESTRUTURAL DEFINITIVA: Forward Filling com Subconsultas Correlacionadas
-- ============================================
-- MOTIVAÇÃO:
-- A lógica anterior de LEFT JOIN LATERAL era inadequada para séries temporais agrupadas,
-- causando o descarte das linhas sem dados (NULL) em vez de preenchê-las (Forward Filling).
-- A nova implementação usa CROSS JOIN para criar a grade completa de dados (Data x Planner)
-- e subconsultas correlacionadas para garantir o preenchimento correto de cada métrica.
--
-- PARÂMETROS:
--   start_date: Data inicial da série
--   end_date: Data final da série
--   planner_filter: Filtro de planner ('all' ou nome específico)
--
-- RETORNO:
--   Tabela com recorded_date, planner e todas as métricas agregadas
--   com Forward Filling aplicado usando subconsultas correlacionadas

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
    WITH 
    -- 1. Gerar série de datas completa
    date_series AS (
        SELECT generate_series(
            start_date::date,
            end_date::date,
            '1 day'::interval
        )::date AS day
    ),
    
    -- 2. Obter o last_seen_at mais recente (filtro usado pelo Dashboard)
    max_last_seen_at AS (
        SELECT MAX(last_seen_at) AS max_timestamp
        FROM clients
        WHERE last_seen_at IS NOT NULL
    ),
    
    -- 3. Calcular scores e filtrar clientes com score válido (alinhar com card "Score Atual")
    clients_with_score AS (
        SELECT 
            c.id,
            c.last_seen_at,
            c.planner,
            c.manager,
            c.mediator,
            c.leader,
            calculate_health_score_v3(c.id) AS score_json,
            (calculate_health_score_v3(c.id)->>'health_score')::NUMERIC AS calculated_score,
            (calculate_health_score_v3(c.id)->>'health_category')::TEXT AS calculated_category
        FROM clients c
        WHERE c.planner IS NOT NULL
            AND c.planner <> '0'
            -- ✅ CORREÇÃO: Filtrar clientes com score válido para alinhar com card "Score Atual"
            -- Aplicar filtro após calcular o score (não pode ser feito na WHERE da exact_day_calculated)
            -- ✅ CORREÇÃO: Removido filtro rígido c.last_seen_at = mlsa.max_timestamp para incluir todos os clientes ativos
            AND (calculate_health_score_v3(c.id)->>'health_score')::NUMERIC IS NOT NULL
            AND (calculate_health_score_v3(c.id)->>'health_score')::NUMERIC > 0
    ),
    
    -- 4a. Para dias com dados exatos, calcular scores em tempo real usando clients_with_score
    exact_day_calculated AS (
        SELECT 
            DATE(cws.last_seen_at) AS snapshot_date,
            CASE WHEN planner_filter = 'all' THEN 'all' ELSE cws.planner END AS planner_label,
            COUNT(*) AS total_clients,
            -- ✅ CORREÇÃO: Usar score já calculado e filtrado da CTE clients_with_score
            ROUND(AVG(cws.calculated_score), 2) AS avg_health_score,
            COUNT(*) FILTER (WHERE cws.calculated_category = 'Ótimo') AS excellent_count,
            COUNT(*) FILTER (WHERE cws.calculated_category = 'Estável') AS stable_count,
            COUNT(*) FILTER (WHERE cws.calculated_category = 'Atenção') AS warning_count,
            COUNT(*) FILTER (WHERE cws.calculated_category = 'Crítico') AS critical_count,
            0::NUMERIC AS avg_meeting_engagement,
            0::NUMERIC AS avg_app_usage,
            0::NUMERIC AS avg_payment_status,
            0::NUMERIC AS avg_ecosystem_engagement,
            0::NUMERIC AS avg_nps_score
        FROM date_series ds
        INNER JOIN clients_with_score cws ON DATE(cws.last_seen_at) = ds.day
        WHERE DATE(cws.last_seen_at) BETWEEN start_date AND end_date
            AND (planner_filter = 'all' OR cws.planner = planner_filter)
            AND (
                managers IS NULL 
                OR cws.manager = ANY(managers)
                OR (include_null_manager AND cws.manager IS NULL)
            )
            AND (
                mediators IS NULL 
                OR cws.mediator = ANY(mediators)
                OR (include_null_mediator AND cws.mediator IS NULL)
            )
            AND (
                leaders IS NULL 
                OR cws.leader = ANY(leaders)
                OR (include_null_leader AND cws.leader IS NULL)
            )
        GROUP BY DATE(cws.last_seen_at), CASE WHEN planner_filter = 'all' THEN 'all' ELSE cws.planner END
    ),
    -- 3b. Para dias sem dados exatos, usar histórico
    historical_aggregated AS (
        SELECT 
            h.recorded_date::date AS snapshot_date,
            CASE WHEN planner_filter = 'all' THEN 'all' ELSE h.planner END AS planner_label,
            COUNT(*) AS total_clients,
            -- ✅ CORREÇÃO: Forçar CAST para NUMERIC antes de calcular AVG para evitar perda de precisão
            ROUND(AVG(h.health_score::NUMERIC), 2) AS avg_health_score,
            COUNT(*) FILTER (WHERE h.health_category = 'Ótimo') AS excellent_count,
            COUNT(*) FILTER (WHERE h.health_category = 'Estável') AS stable_count,
            COUNT(*) FILTER (WHERE h.health_category = 'Atenção') AS warning_count,
            COUNT(*) FILTER (WHERE h.health_category = 'Crítico') AS critical_count,
            ROUND(AVG(h.meeting_engagement), 2) AS avg_meeting_engagement,
            ROUND(AVG(h.app_usage), 2) AS avg_app_usage,
            ROUND(AVG(h.payment_status), 2) AS avg_payment_status,
            ROUND(AVG(h.ecosystem_engagement), 2) AS avg_ecosystem_engagement,
            ROUND(AVG(h.nps_score), 2) AS avg_nps_score
        FROM health_score_history h
        CROSS JOIN max_last_seen_at mlsa
        INNER JOIN clients c ON c.id = h.client_id AND c.last_seen_at = mlsa.max_timestamp
        WHERE 
            h.recorded_date BETWEEN start_date AND end_date
            AND (planner_filter = 'all' OR h.planner = planner_filter)
            AND h.planner IS NOT NULL
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
            -- ✅ EXCLUIR dias que têm dados exatos (priorizar cálculo em tempo real)
            AND NOT EXISTS (
                SELECT 1 FROM exact_day_calculated edc 
                WHERE edc.snapshot_date = h.recorded_date::date
                    AND edc.planner_label = CASE WHEN planner_filter = 'all' THEN 'all' ELSE h.planner END
            )
        GROUP BY h.recorded_date::date, CASE WHEN planner_filter = 'all' THEN 'all' ELSE h.planner END
    ),
    -- 3c. Combinar dados exatos (calculados) e históricos, priorizando dados exatos
    raw_aggregated AS (
        SELECT * FROM exact_day_calculated
        UNION ALL
        SELECT * FROM historical_aggregated
    ),
    
    -- 4. Listar todos os planners únicos no período (para o CROSS JOIN)
    unique_planners AS (
        SELECT DISTINCT planner_label AS planner
        FROM raw_aggregated
        UNION
        -- Garantir que 'all' ou o planner_filter esteja presente mesmo sem dados
        SELECT planner_filter AS planner
        WHERE planner_filter = 'all' OR EXISTS (
            SELECT 1 FROM raw_aggregated WHERE planner_label = planner_filter
        )
    ),
    
    -- 5. Criar grid completo: todas as datas X todos os planners
    complete_grid AS (
        SELECT 
            ds.day,
            up.planner
        FROM date_series ds
        CROSS JOIN unique_planners up
    ),
    
    -- 6. Forward filling com subconsultas correlacionadas
    filled_data AS (
        SELECT 
            cg.day AS recorded_date,
            cg.planner,
            
            -- Forward fill: preenche NULL com último valor conhecido usando subconsulta correlacionada
            COALESCE(
                ra.total_clients,
                (SELECT a3.total_clients 
                 FROM raw_aggregated a3 
                 WHERE a3.planner_label = cg.planner 
                   AND a3.snapshot_date < cg.day 
                   AND a3.total_clients IS NOT NULL
                 ORDER BY a3.snapshot_date DESC 
                 LIMIT 1),
                0::BIGINT
            )::BIGINT AS total_clients,
            
            COALESCE(
                ra.avg_health_score,
                (SELECT a3.avg_health_score 
                 FROM raw_aggregated a3 
                 WHERE a3.planner_label = cg.planner 
                   AND a3.snapshot_date < cg.day 
                   AND a3.avg_health_score IS NOT NULL
                 ORDER BY a3.snapshot_date DESC 
                 LIMIT 1),
                0::NUMERIC
            ) AS avg_health_score,
            
            COALESCE(
                ra.excellent_count,
                (SELECT a3.excellent_count 
                 FROM raw_aggregated a3 
                 WHERE a3.planner_label = cg.planner 
                   AND a3.snapshot_date < cg.day 
                   AND a3.excellent_count IS NOT NULL
                 ORDER BY a3.snapshot_date DESC 
                 LIMIT 1),
                0::BIGINT
            )::BIGINT AS excellent_count,
            
            COALESCE(
                ra.stable_count,
                (SELECT a3.stable_count 
                 FROM raw_aggregated a3 
                 WHERE a3.planner_label = cg.planner 
                   AND a3.snapshot_date < cg.day 
                   AND a3.stable_count IS NOT NULL
                 ORDER BY a3.snapshot_date DESC 
                 LIMIT 1),
                0::BIGINT
            )::BIGINT AS stable_count,
            
            COALESCE(
                ra.warning_count,
                (SELECT a3.warning_count 
                 FROM raw_aggregated a3 
                 WHERE a3.planner_label = cg.planner 
                   AND a3.snapshot_date < cg.day 
                   AND a3.warning_count IS NOT NULL
                 ORDER BY a3.snapshot_date DESC 
                 LIMIT 1),
                0::BIGINT
            )::BIGINT AS warning_count,
            
            COALESCE(
                ra.critical_count,
                (SELECT a3.critical_count 
                 FROM raw_aggregated a3 
                 WHERE a3.planner_label = cg.planner 
                   AND a3.snapshot_date < cg.day 
                   AND a3.critical_count IS NOT NULL
                 ORDER BY a3.snapshot_date DESC 
                 LIMIT 1),
                0::BIGINT
            )::BIGINT AS critical_count,
            
            COALESCE(
                ra.avg_meeting_engagement,
                (SELECT a3.avg_meeting_engagement 
                 FROM raw_aggregated a3 
                 WHERE a3.planner_label = cg.planner 
                   AND a3.snapshot_date < cg.day 
                   AND a3.avg_meeting_engagement IS NOT NULL
                 ORDER BY a3.snapshot_date DESC 
                 LIMIT 1),
                0::NUMERIC
            ) AS avg_meeting_engagement,
            
            COALESCE(
                ra.avg_app_usage,
                (SELECT a3.avg_app_usage 
                 FROM raw_aggregated a3 
                 WHERE a3.planner_label = cg.planner 
                   AND a3.snapshot_date < cg.day 
                   AND a3.avg_app_usage IS NOT NULL
                 ORDER BY a3.snapshot_date DESC 
                 LIMIT 1),
                0::NUMERIC
            ) AS avg_app_usage,
            
            COALESCE(
                ra.avg_payment_status,
                (SELECT a3.avg_payment_status 
                 FROM raw_aggregated a3 
                 WHERE a3.planner_label = cg.planner 
                   AND a3.snapshot_date < cg.day 
                   AND a3.avg_payment_status IS NOT NULL
                 ORDER BY a3.snapshot_date DESC 
                 LIMIT 1),
                0::NUMERIC
            ) AS avg_payment_status,
            
            COALESCE(
                ra.avg_ecosystem_engagement,
                (SELECT a3.avg_ecosystem_engagement 
                 FROM raw_aggregated a3 
                 WHERE a3.planner_label = cg.planner 
                   AND a3.snapshot_date < cg.day 
                   AND a3.avg_ecosystem_engagement IS NOT NULL
                 ORDER BY a3.snapshot_date DESC 
                 LIMIT 1),
                0::NUMERIC
            ) AS avg_ecosystem_engagement,
            
            COALESCE(
                ra.avg_nps_score,
                (SELECT a3.avg_nps_score 
                 FROM raw_aggregated a3 
                 WHERE a3.planner_label = cg.planner 
                   AND a3.snapshot_date < cg.day 
                   AND a3.avg_nps_score IS NOT NULL
                 ORDER BY a3.snapshot_date DESC 
                 LIMIT 1),
                0::NUMERIC
            ) AS avg_nps_score
            
        FROM complete_grid cg
        LEFT JOIN raw_aggregated ra 
            ON cg.day = ra.snapshot_date 
            AND cg.planner = ra.planner_label
    )
    
    -- 7. Retornar todos os dias (não filtrar por total_clients IS NOT NULL)
    -- O Forward Filling garante que todos os dias tenham valores válidos
    SELECT 
        fd.recorded_date,
        fd.planner,
        fd.total_clients,
        fd.avg_health_score,
        fd.excellent_count,
        fd.stable_count,
        fd.warning_count,
        fd.critical_count,
        fd.avg_meeting_engagement,
        fd.avg_app_usage,
        fd.avg_payment_status,
        fd.avg_ecosystem_engagement,
        fd.avg_nps_score
    FROM filled_data fd
    ORDER BY fd.recorded_date, fd.planner;
    
END;
$$ LANGUAGE plpgsql;
