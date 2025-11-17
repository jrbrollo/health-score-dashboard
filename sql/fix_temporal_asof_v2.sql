-- ========================================
-- CORREÇÃO CRÍTICA: GET_TEMPORAL_ANALYSIS_ASOF
-- ========================================
-- PROBLEMA: Função acumula TODOS os clientes históricos até cada data,
--           mostrando 1862 clientes ao invés dos 1008 do dia específico
--
-- CAUSA: WHERE h.recorded_date <= d.day (pega último registro de CADA cliente)
-- SOLUÇÃO: WHERE h.recorded_date = d.day (pega APENAS clientes daquele dia)
--
-- APLICAR NO SUPABASE SQL EDITOR
-- ========================================

-- PASSO 1: Deletar TODAS as versões antigas da função
DROP FUNCTION IF EXISTS get_temporal_analysis_asof(DATE, DATE, TEXT, TEXT[], TEXT[], TEXT[], BOOLEAN, BOOLEAN, BOOLEAN);
DROP FUNCTION IF EXISTS get_temporal_analysis_asof(DATE, DATE, TEXT, TEXT[], TEXT[], TEXT[]);
DROP FUNCTION IF EXISTS get_temporal_analysis_asof(DATE, DATE, TEXT);
DROP FUNCTION IF EXISTS get_temporal_analysis_asof(DATE, DATE);
DROP FUNCTION IF EXISTS get_temporal_analysis_asof;

-- PASSO 2: Criar função corrigida com lógica de "apenas clientes do dia"
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
  daily_snapshots AS (
    SELECT
      d.day AS snapshot_date,
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
  aggregated AS (
    SELECT
      ds.snapshot_date,
      CASE WHEN planner_filter = 'all' THEN 'all' ELSE ds.planner END AS planner_label,
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
    FROM daily_snapshots ds
    GROUP BY ds.snapshot_date, CASE WHEN planner_filter = 'all' THEN 'all' ELSE ds.planner END
    ORDER BY ds.snapshot_date
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

COMMENT ON FUNCTION get_temporal_analysis_asof IS 'Versão corrigida (v2) que mostra apenas clientes ativos em cada dia específico, não um snapshot acumulado';

-- ========================================
-- VALIDAÇÃO PÓS-APLICAÇÃO
-- ========================================
-- Execute esta query para verificar se está funcionando corretamente:

SELECT
  recorded_date,
  total_clients,
  avg_health_score
FROM get_temporal_analysis_asof('2025-11-13'::DATE, '2025-11-17'::DATE, 'all'::TEXT)
ORDER BY recorded_date;

-- Resultado esperado:
-- 2025-11-13 | 1000 | 51.64
-- 2025-11-14 | 1008 | 54.61
-- 2025-11-15 | 0    | NULL  (ou não aparece - sem importação)
-- 2025-11-16 | 0    | NULL  (ou não aparece - sem importação)
-- 2025-11-17 | 1003 | 61.89

-- ========================================
-- DIFERENÇAS DA CORREÇÃO
-- ========================================
-- ANTES (linhas 195-213 do temporal_setup.sql):
--   JOIN LATERAL (
--     SELECT DISTINCT ON (h.client_id)
--       ...
--     FROM health_score_history h
--     WHERE h.recorded_date <= d.day  -- ❌ ERRADO: acumula clientes
--     ORDER BY h.client_id, h.recorded_date DESC
--   ) s ON true
--
-- DEPOIS (linhas 60-83 deste arquivo):
--   INNER JOIN health_score_history h
--     ON h.recorded_date = d.day  -- ✅ CORRETO: apenas clientes do dia
--
-- IMPACTO:
-- - Antes: Mostrava 1862 clientes no dia 14/11 (todos que existiram até aquele dia)
-- - Depois: Mostra 1008 clientes no dia 14/11 (apenas os importados naquele dia)
-- - Resolve o bug de "histórico muda após novo import"
-- - Clientes que saíram da base não afetam dias futuros
