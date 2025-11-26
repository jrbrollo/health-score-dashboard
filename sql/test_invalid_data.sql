-- Testar quantos clientes têm dados inválidos

-- 1. Total de clientes Abraão + Hélio (sem filtro de validade)
WITH latest_state AS (
  SELECT DISTINCT ON (client_id)
    client_id,
    client_name,
    planner,
    leader,
    recorded_date
  FROM health_score_history
  ORDER BY client_id, recorded_date DESC
)
SELECT
  'Total Abraão + Hélio (sem filtro)' AS test_name,
  COUNT(*) AS total_clients
FROM latest_state
WHERE normalize_text(planner) = normalize_text('abraao lima velozo')
  AND normalize_text(leader) = normalize_text('helio brollo junior');

-- 2. Clientes com client_name inválido
WITH latest_state AS (
  SELECT DISTINCT ON (client_id)
    client_id,
    client_name,
    planner,
    leader,
    recorded_date
  FROM health_score_history
  ORDER BY client_id, recorded_date DESC
)
SELECT
  'Clientes com nome inválido' AS test_name,
  COUNT(*) AS total_clients
FROM latest_state
WHERE normalize_text(planner) = normalize_text('abraao lima velozo')
  AND normalize_text(leader) = normalize_text('helio brollo junior')
  AND (
    client_name IS NULL
    OR TRIM(client_name) = ''
    OR LOWER(TRIM(client_name)) IN ('#n/d', 'n/d', 'na', 'n/a', '0', '-', '—', '#ref!')
  );

-- 3. Mostrar exemplos de clientes com nome inválido
WITH latest_state AS (
  SELECT DISTINCT ON (client_id)
    client_id,
    client_name,
    planner,
    leader,
    recorded_date
  FROM health_score_history
  ORDER BY client_id, recorded_date DESC
)
SELECT
  'Exemplos de nomes inválidos' AS test_name,
  client_id,
  client_name,
  planner,
  leader
FROM latest_state
WHERE normalize_text(planner) = normalize_text('abraao lima velozo')
  AND normalize_text(leader) = normalize_text('helio brollo junior')
  AND (
    client_name IS NULL
    OR TRIM(client_name) = ''
    OR LOWER(TRIM(client_name)) IN ('#n/d', 'n/d', 'na', 'n/a', '0', '-', '—', '#ref!')
  )
ORDER BY client_id
LIMIT 20;

-- 4. Total de clientes com nome VÁLIDO (deve ser 32)
WITH latest_state AS (
  SELECT DISTINCT ON (client_id)
    client_id,
    client_name,
    planner,
    leader,
    recorded_date
  FROM health_score_history
  ORDER BY client_id, recorded_date DESC
)
SELECT
  'Total Abraão + Hélio com nome VÁLIDO' AS test_name,
  COUNT(*) AS total_clients
FROM latest_state
WHERE normalize_text(planner) = normalize_text('abraao lima velozo')
  AND normalize_text(leader) = normalize_text('helio brollo junior')
  AND client_name IS NOT NULL
  AND TRIM(client_name) != ''
  AND LOWER(TRIM(client_name)) NOT IN ('#n/d', 'n/d', 'na', 'n/a', '0', '-', '—', '#ref!');

-- 5. Verificar também se há filtro no planner
WITH latest_state AS (
  SELECT DISTINCT ON (client_id)
    client_id,
    client_name,
    planner,
    leader,
    recorded_date
  FROM health_score_history
  ORDER BY client_id, recorded_date DESC
)
SELECT
  'Clientes com planner = 0' AS test_name,
  COUNT(*) AS total_clients
FROM latest_state
WHERE normalize_text(leader) = normalize_text('helio brollo junior')
  AND planner = '0';
