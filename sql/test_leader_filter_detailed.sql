-- Teste detalhado do filtro de leader

-- 1. Verificar quantos clientes únicos o Abraão tem no total
SELECT
  'Total clientes Abraão' AS test_name,
  COUNT(DISTINCT client_id) AS total_clients
FROM health_score_history
WHERE recorded_date >= '2025-11-13'
  AND recorded_date <= '2025-11-26'
  AND normalize_text(planner) = normalize_text('abraao lima velozo');

-- 2. Ver distribuição de leaders para clientes do Abraão
SELECT
  'Distribuição de leaders' AS test_name,
  leader,
  normalize_text(leader) AS leader_normalized,
  COUNT(DISTINCT client_id) AS client_count
FROM health_score_history
WHERE recorded_date >= '2025-11-13'
  AND recorded_date <= '2025-11-26'
  AND normalize_text(planner) = normalize_text('abraao lima velozo')
  AND leader IS NOT NULL
GROUP BY leader, normalize_text(leader)
ORDER BY client_count DESC;

-- 3. Contar clientes Abraão com leader = Hélio
SELECT
  'Clientes Abraão + Hélio' AS test_name,
  COUNT(DISTINCT client_id) AS total_clients
FROM health_score_history
WHERE recorded_date >= '2025-11-13'
  AND recorded_date <= '2025-11-26'
  AND normalize_text(planner) = normalize_text('abraao lima velozo')
  AND normalize_text(leader) = normalize_text('helio brollo junior');

-- 4. Verificar se lógica EXISTS funciona corretamente
DO $$
DECLARE
  leaders_array TEXT[] := ARRAY['helio brollo junior'];
  test_leader TEXT := 'Hélio Brollo Junior';
  matches BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM UNNEST(leaders_array) AS nl
    WHERE normalize_text(test_leader) = nl
       OR normalize_text(test_leader) LIKE nl || '%'
       OR nl LIKE normalize_text(test_leader) || '%'
  ) INTO matches;

  RAISE NOTICE 'Test leader: %', test_leader;
  RAISE NOTICE 'Normalized: %', normalize_text(test_leader);
  RAISE NOTICE 'Leaders array: %', leaders_array;
  RAISE NOTICE 'Matches: %', matches;
END $$;

-- 5. Simular lógica AS-OF com filtro de leader aplicado DENTRO do LATERAL JOIN
WITH dates AS (
  SELECT generate_series('2025-11-13'::DATE, '2025-11-26'::DATE, interval '1 day')::date AS day
),
normalized_leaders AS (
  SELECT 'helio brollo junior'::TEXT AS leader_filter
),
last_snapshots AS (
  SELECT
    d.day AS snapshot_date,
    s.client_id,
    s.planner,
    s.leader
  FROM dates d
  CROSS JOIN normalized_leaders nl
  JOIN LATERAL (
    SELECT DISTINCT ON (h.client_id)
      h.client_id,
      h.planner,
      h.leader,
      h.recorded_date
    FROM health_score_history h
    WHERE h.recorded_date <= d.day
      -- Aplicar filtro de planner DENTRO do LATERAL
      AND normalize_text(h.planner) = normalize_text('abraao lima velozo')
      -- Aplicar filtro de leader DENTRO do LATERAL
      AND normalize_text(h.leader) = nl.leader_filter
    ORDER BY h.client_id, h.recorded_date DESC
  ) s ON true
  WHERE s.planner <> '0'
)
SELECT
  'Test: AS-OF com filtros DENTRO do LATERAL' AS test_name,
  snapshot_date,
  COUNT(DISTINCT client_id) AS total_clients
FROM last_snapshots
GROUP BY snapshot_date
ORDER BY snapshot_date;

-- 6. Comparar: filtros FORA do LATERAL (como está na função atual)
WITH dates AS (
  SELECT generate_series('2025-11-13'::DATE, '2025-11-26'::DATE, interval '1 day')::date AS day
),
normalized_leaders AS (
  SELECT 'helio brollo junior'::TEXT AS leader_filter
),
last_snapshots AS (
  SELECT
    d.day AS snapshot_date,
    s.client_id,
    s.planner,
    s.leader,
    nl.leader_filter
  FROM dates d
  CROSS JOIN normalized_leaders nl
  JOIN LATERAL (
    SELECT DISTINCT ON (h.client_id)
      h.client_id,
      h.planner,
      h.leader,
      h.recorded_date
    FROM health_score_history h
    WHERE h.recorded_date <= d.day
    ORDER BY h.client_id, h.recorded_date DESC
  ) s ON true
  WHERE s.planner <> '0'
    AND normalize_text(s.planner) = normalize_text('abraao lima velozo')
    AND normalize_text(s.leader) = nl.leader_filter
)
SELECT
  'Test: AS-OF com filtros FORA do LATERAL' AS test_name,
  snapshot_date,
  COUNT(DISTINCT client_id) AS total_clients
FROM last_snapshots
GROUP BY snapshot_date
ORDER BY snapshot_date;
