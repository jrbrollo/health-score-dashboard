-- Script de teste para diagnosticar problema de filtros
-- Execute este script no Supabase SQL Editor para ver os resultados

-- 1. Testar normalização básica
SELECT
  'Test 1: normalize_text()' AS test_name,
  normalize_text('Abraão Lima Velozo') AS normalized_abraao,
  normalize_text('abraao lima velozo') AS normalized_abraao_lower,
  normalize_text('Hélio Brollo Junior') AS normalized_helio;

-- 2. Ver quais planners e leaders existem no histórico
SELECT DISTINCT
  planner,
  normalize_text(planner) AS planner_normalized,
  leader,
  normalize_text(leader) AS leader_normalized
FROM health_score_history
WHERE recorded_date >= '2025-11-13'
  AND recorded_date <= '2025-11-26'
ORDER BY planner, leader;

-- 3. Testar filtro de planner normalizado
SELECT
  'Test 3: Filtro de planner' AS test_name,
  COUNT(*) AS total_records
FROM health_score_history
WHERE recorded_date >= '2025-11-13'
  AND recorded_date <= '2025-11-26'
  AND (
    normalize_text(planner) = normalize_text('abraao lima velozo')
    OR normalize_text(planner) LIKE normalize_text('abraao lima velozo') || '%'
    OR normalize_text('abraao lima velozo') LIKE normalize_text(planner) || '%'
  );

-- 4. Testar filtro de planner + leader normalizado
SELECT
  'Test 4: Filtro planner + leader' AS test_name,
  COUNT(*) AS total_records
FROM health_score_history
WHERE recorded_date >= '2025-11-13'
  AND recorded_date <= '2025-11-26'
  AND (
    normalize_text(planner) = normalize_text('abraao lima velozo')
    OR normalize_text(planner) LIKE normalize_text('abraao lima velozo') || '%'
    OR normalize_text('abraao lima velozo') LIKE normalize_text(planner) || '%'
  )
  AND (
    normalize_text(leader) = normalize_text('helio brollo junior')
    OR normalize_text(leader) LIKE normalize_text('helio brollo junior') || '%'
    OR normalize_text('helio brollo junior') LIKE normalize_text(leader) || '%'
  );

-- 5. Testar chamada RPC exata que o frontend faz
SELECT * FROM get_temporal_analysis_asof(
  '2025-11-13'::DATE,
  '2025-11-26'::DATE,
  'abraao lima velozo',  -- planner_filter (normalizado pelo frontend)
  NULL,  -- managers
  NULL,  -- mediators
  ARRAY['helio brollo junior']  -- leaders (normalizado pelo frontend)
);

-- 6. Ver registros brutos de exemplo
SELECT
  recorded_date,
  client_name,
  planner,
  leader,
  health_score
FROM health_score_history
WHERE recorded_date >= '2025-11-13'
  AND recorded_date <= '2025-11-26'
  AND normalize_text(planner) LIKE '%abraao%'
ORDER BY recorded_date
LIMIT 10;
