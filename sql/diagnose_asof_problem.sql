-- Diagnosticar o problema da lógica AS-OF
-- Hipótese: A lógica AS-OF está incluindo clientes que mudaram de planner/leader ao longo do tempo

-- 1. Ver estado ATUAL (último registro de cada cliente, independente de data)
WITH latest_state AS (
  SELECT DISTINCT ON (client_id)
    client_id,
    planner,
    leader,
    recorded_date
  FROM health_score_history
  ORDER BY client_id, recorded_date DESC
)
SELECT
  'Estado ATUAL: Clientes Abraão + Hélio' AS test_name,
  COUNT(*) AS total_clients
FROM latest_state
WHERE normalize_text(planner) = normalize_text('abraao lima velozo')
  AND normalize_text(leader) = normalize_text('helio brollo junior');

-- 2. Ver estado AS-OF em 2025-11-26 (deve ser igual ao estado atual se não houve mudanças)
WITH asof_state AS (
  SELECT DISTINCT ON (client_id)
    client_id,
    planner,
    leader,
    recorded_date
  FROM health_score_history
  WHERE recorded_date <= '2025-11-26'::DATE
  ORDER BY client_id, recorded_date DESC
)
SELECT
  'AS-OF 2025-11-26: Clientes Abraão + Hélio' AS test_name,
  COUNT(*) AS total_clients
FROM asof_state
WHERE normalize_text(planner) = normalize_text('abraao lima velozo')
  AND normalize_text(leader) = normalize_text('helio brollo junior');

-- 3. Comparar: mostrar clientes que aparecem no AS-OF mas não no estado atual
WITH latest_state AS (
  SELECT DISTINCT ON (client_id)
    client_id,
    planner AS current_planner,
    leader AS current_leader,
    recorded_date AS current_date
  FROM health_score_history
  ORDER BY client_id, recorded_date DESC
),
asof_state AS (
  SELECT DISTINCT ON (client_id)
    client_id,
    planner AS asof_planner,
    leader AS asof_leader,
    recorded_date AS asof_date
  FROM health_score_history
  WHERE recorded_date <= '2025-11-26'::DATE
  ORDER BY client_id, recorded_date DESC
)
SELECT
  'Clientes que mudaram (AS-OF vs ATUAL)' AS test_name,
  a.client_id,
  a.asof_planner,
  a.asof_leader,
  a.asof_date,
  l.current_planner,
  l.current_leader,
  l.current_date
FROM asof_state a
LEFT JOIN latest_state l ON a.client_id = l.client_id
WHERE normalize_text(a.asof_planner) = normalize_text('abraao lima velozo')
  AND normalize_text(a.asof_leader) = normalize_text('helio brollo junior')
  AND (
    normalize_text(l.current_planner) != normalize_text('abraao lima velozo')
    OR normalize_text(l.current_leader) != normalize_text('helio brollo junior')
    OR l.client_id IS NULL
  )
ORDER BY a.client_id
LIMIT 20;

-- 4. Ver a evolução temporal de um cliente específico que pode ter mudado
-- Primeiro, encontrar um cliente que aparece no AS-OF mas não no estado atual
WITH problematic_clients AS (
  WITH latest_state AS (
    SELECT DISTINCT ON (client_id)
      client_id,
      planner AS current_planner,
      leader AS current_leader
    FROM health_score_history
    ORDER BY client_id, recorded_date DESC
  ),
  asof_state AS (
    SELECT DISTINCT ON (client_id)
      client_id,
      planner AS asof_planner,
      leader AS asof_leader
    FROM health_score_history
    WHERE recorded_date <= '2025-11-26'::DATE
    ORDER BY client_id, recorded_date DESC
  )
  SELECT a.client_id
  FROM asof_state a
  LEFT JOIN latest_state l ON a.client_id = l.client_id
  WHERE normalize_text(a.asof_planner) = normalize_text('abraao lima velozo')
    AND normalize_text(a.asof_leader) = normalize_text('helio brollo junior')
    AND (
      normalize_text(l.current_planner) != normalize_text('abraao lima velozo')
      OR normalize_text(l.current_leader) != normalize_text('helio brollo junior')
      OR l.client_id IS NULL
    )
  LIMIT 1
)
SELECT
  'Evolução temporal de cliente problemático' AS test_name,
  h.client_id,
  h.recorded_date,
  h.planner,
  h.leader
FROM health_score_history h
WHERE h.client_id IN (SELECT client_id FROM problematic_clients)
ORDER BY h.recorded_date DESC
LIMIT 10;

-- 5. Verificar se existem registros duplicados na mesma data
SELECT
  'Registros duplicados na mesma data' AS test_name,
  client_id,
  recorded_date,
  COUNT(*) AS record_count,
  STRING_AGG(DISTINCT planner, ', ') AS planners,
  STRING_AGG(DISTINCT leader, ', ') AS leaders
FROM health_score_history
WHERE normalize_text(planner) = normalize_text('abraao lima velozo')
  OR normalize_text(leader) = normalize_text('helio brollo junior')
GROUP BY client_id, recorded_date
HAVING COUNT(*) > 1
ORDER BY record_count DESC
LIMIT 10;
