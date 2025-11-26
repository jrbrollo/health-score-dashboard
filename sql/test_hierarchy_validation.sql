-- Testar se há clientes com campos hierárquicos inválidos

-- 1. Ver distribuição de todos os campos para clientes Abraão + Hélio
WITH latest_state AS (
  SELECT DISTINCT ON (client_id)
    client_id,
    client_name,
    planner,
    manager,
    mediator,
    leader,
    recorded_date
  FROM health_score_history
  ORDER BY client_id, recorded_date DESC
)
SELECT
  'Distribuição de campos' AS test_name,
  COUNT(*) AS total,
  COUNT(CASE WHEN planner IS NULL OR TRIM(planner) IN ('', '#n/d', 'n/d', 'na', 'n/a', '0', '-', '—', '#ref!') THEN 1 END) AS invalid_planner,
  COUNT(CASE WHEN manager IS NULL OR TRIM(manager) IN ('', '#n/d', 'n/d', 'na', 'n/a', '0', '-', '—', '#ref!') THEN 1 END) AS invalid_manager,
  COUNT(CASE WHEN mediator IS NULL OR TRIM(mediator) IN ('', '#n/d', 'n/d', 'na', 'n/a', '0', '-', '—', '#ref!') THEN 1 END) AS invalid_mediator,
  COUNT(CASE WHEN leader IS NULL OR TRIM(leader) IN ('', '#n/d', 'n/d', 'na', 'n/a', '0', '-', '—', '#ref!') THEN 1 END) AS invalid_leader
FROM latest_state
WHERE normalize_text(planner) = normalize_text('abraao lima velozo')
  AND normalize_text(leader) = normalize_text('helio brollo junior');

-- 2. Listar todos os 46 clientes para ver se há algum padrão
WITH latest_state AS (
  SELECT DISTINCT ON (client_id)
    client_id,
    client_name,
    planner,
    manager,
    mediator,
    leader,
    recorded_date
  FROM health_score_history
  ORDER BY client_id, recorded_date DESC
)
SELECT
  'Todos os 46 clientes Abraão + Hélio' AS test_name,
  client_id,
  client_name,
  planner,
  manager,
  mediator,
  leader
FROM latest_state
WHERE normalize_text(planner) = normalize_text('abraao lima velozo')
  AND normalize_text(leader) = normalize_text('helio brollo junior')
ORDER BY client_name;

-- 3. Verificar se há diferença entre client_id únicos vs registros
WITH latest_state AS (
  SELECT DISTINCT ON (client_id)
    client_id,
    client_name,
    planner,
    leader
  FROM health_score_history
  ORDER BY client_id, recorded_date DESC
)
SELECT
  'Contagem de IDs únicos' AS test_name,
  COUNT(*) AS total_records,
  COUNT(DISTINCT client_id) AS unique_client_ids,
  COUNT(DISTINCT client_name) AS unique_client_names
FROM latest_state
WHERE normalize_text(planner) = normalize_text('abraao lima velozo')
  AND normalize_text(leader) = normalize_text('helio brollo junior');

-- 4. Verificar se há planner = '0' sendo incluído (a função SQL filtra s.planner <> '0')
WITH latest_state AS (
  SELECT DISTINCT ON (client_id)
    client_id,
    client_name,
    planner,
    leader
  FROM health_score_history
  ORDER BY client_id, recorded_date DESC
)
SELECT
  'Clientes com planner = 0' AS test_name,
  COUNT(*) AS total_clients
FROM latest_state
WHERE normalize_text(planner) = normalize_text('abraao lima velozo')
  AND normalize_text(leader) = normalize_text('helio brollo junior')
  AND planner = '0';

-- 5. Aplicar TODOS os filtros que o Dashboard aplica
WITH latest_state AS (
  SELECT DISTINCT ON (client_id)
    client_id,
    client_name,
    planner,
    leader
  FROM health_score_history
  ORDER BY client_id, recorded_date DESC
)
SELECT
  'Total com todos os filtros Dashboard' AS test_name,
  COUNT(*) AS total_clients
FROM latest_state
WHERE normalize_text(planner) = normalize_text('abraao lima velozo')
  AND normalize_text(leader) = normalize_text('helio brollo junior')
  AND client_name IS NOT NULL
  AND TRIM(client_name) != ''
  AND LOWER(TRIM(client_name)) NOT IN ('#n/d', 'n/d', 'na', 'n/a', '0', '-', '—', '#ref!')
  AND planner <> '0';
