-- Diagnosticar por que 26/11 tem 1859 clientes ao invés de ~1009

-- 1. Verificar data máxima de last_seen_at
SELECT
  'Data máxima last_seen_at' AS test,
  MAX((last_seen_at AT TIME ZONE 'UTC')::DATE) AS max_date,
  COUNT(DISTINCT client_id) AS total_active_clients
FROM clients
WHERE last_seen_at IS NOT NULL;

-- 2. Contar clientes ativos (filtro que deveria ser aplicado)
WITH active_clients AS (
  SELECT DISTINCT client_id
  FROM clients
  WHERE (last_seen_at AT TIME ZONE 'UTC')::DATE = (
    SELECT MAX((last_seen_at AT TIME ZONE 'UTC')::DATE)
    FROM clients
    WHERE last_seen_at IS NOT NULL
  )
  AND name NOT IN ('0', '#N/D', 'N/D', 'N/A')
  AND planner NOT IN ('0', '#N/D', 'N/D', 'N/A')
)
SELECT
  'Total clientes ativos filtrados' AS test,
  COUNT(*) AS total
FROM active_clients;

-- 3. Verificar histórico para 26/11 COM filtro de ativos
WITH active_clients AS (
  SELECT DISTINCT client_id
  FROM clients
  WHERE (last_seen_at AT TIME ZONE 'UTC')::DATE = (
    SELECT MAX((last_seen_at AT TIME ZONE 'UTC')::DATE)
    FROM clients
    WHERE last_seen_at IS NOT NULL
  )
  AND name NOT IN ('0', '#N/D', 'N/D', 'N/A')
  AND planner NOT IN ('0', '#N/D', 'N/D', 'N/A')
)
SELECT
  'Histórico 26/11 COM filtro ativos' AS test,
  COUNT(DISTINCT h.client_id) AS unique_clients,
  COUNT(DISTINCT h.client_name) AS unique_names,
  COUNT(*) AS total_records
FROM health_score_history h
INNER JOIN active_clients ac ON h.client_id = ac.client_id
WHERE h.recorded_date = '2025-11-26';

-- 4. Verificar histórico para 26/11 SEM filtro de ativos
SELECT
  'Histórico 26/11 SEM filtro ativos' AS test,
  COUNT(DISTINCT client_id) AS unique_clients,
  COUNT(DISTINCT client_name) AS unique_names,
  COUNT(*) AS total_records
FROM health_score_history
WHERE recorded_date = '2025-11-26';

-- 5. Testar a função SQL para 26/11
SELECT
  recorded_date,
  planner,
  total_clients,
  avg_health_score
FROM get_temporal_analysis_asof(
  '2025-11-26'::DATE,
  '2025-11-26'::DATE,
  'all'
);

-- 6. Testar a função SQL para 25/11 (para comparar)
SELECT
  recorded_date,
  planner,
  total_clients,
  avg_health_score
FROM get_temporal_analysis_asof(
  '2025-11-25'::DATE,
  '2025-11-25'::DATE,
  'all'
);

-- 7. Verificar se há múltiplas importações no dia 26/11
SELECT
  'Múltiplas importações em 26/11' AS test,
  client_id,
  client_name,
  COUNT(*) AS import_count
FROM health_score_history
WHERE recorded_date = '2025-11-26'
GROUP BY client_id, client_name
HAVING COUNT(*) > 1
ORDER BY import_count DESC
LIMIT 10;
