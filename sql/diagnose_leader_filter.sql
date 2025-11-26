-- ============================================
-- DIAGNÓSTICO: Testar filtro de leader isoladamente
-- ============================================

-- 1. Verificar se a função normalize_text existe e funciona
SELECT
  'Test: normalize_text' AS test_name,
  normalize_text('Hélio Brollo Junior') AS normalized_helio,
  normalize_text('helio brollo junior') AS normalized_helio_lower;

-- 2. Ver quantos clientes Abraão tem ao todo
SELECT
  'Test: Total clients for Abraão' AS test_name,
  COUNT(DISTINCT client_id) AS total_clients
FROM health_score_history
WHERE recorded_date >= '2025-11-13'
  AND recorded_date <= '2025-11-26'
  AND (
    normalize_text(planner) = normalize_text('abraao lima velozo')
    OR normalize_text(planner) LIKE normalize_text('abraao lima velozo') || '%'
    OR normalize_text('abraao lima velozo') LIKE normalize_text(planner) || '%'
  );

-- 3. Ver quantos clientes Abraão tem com leader = Hélio
SELECT
  'Test: Abraão clients with Hélio as leader' AS test_name,
  COUNT(DISTINCT client_id) AS total_clients
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

-- 4. Ver exemplos de valores de leader para clientes do Abraão
SELECT DISTINCT
  leader,
  normalize_text(leader) AS leader_normalized,
  COUNT(DISTINCT client_id) AS client_count
FROM health_score_history
WHERE recorded_date >= '2025-11-13'
  AND recorded_date <= '2025-11-26'
  AND (
    normalize_text(planner) = normalize_text('abraao lima velozo')
    OR normalize_text(planner) LIKE normalize_text('abraao lima velozo') || '%'
    OR normalize_text('abraao lima velozo') LIKE normalize_text(planner) || '%'
  )
GROUP BY leader, normalize_text(leader)
ORDER BY client_count DESC;

-- 5. Testar a lógica EXISTS que está na função
DO $$
DECLARE
  normalized_leaders TEXT[];
  test_leader TEXT := 'Hélio Brollo Junior';
  matches BOOLEAN;
BEGIN
  -- Simular normalização
  normalized_leaders := ARRAY['helio brollo junior'];

  -- Testar EXISTS logic
  SELECT EXISTS (
    SELECT 1 FROM UNNEST(normalized_leaders) AS nl
    WHERE normalize_text(test_leader) = nl
       OR normalize_text(test_leader) LIKE nl || '%'
       OR nl LIKE normalize_text(test_leader) || '%'
  ) INTO matches;

  RAISE NOTICE 'Test leader: %, Normalized: %, Matches: %',
    test_leader, normalize_text(test_leader), matches;
END $$;

-- 6. Verificar se o problema está na agregação
WITH dates AS (
  SELECT generate_series('2025-11-13'::DATE, '2025-11-26'::DATE, interval '1 day')::date AS day
),
last_snapshots AS (
  SELECT
    d.day AS snapshot_date,
    s.client_id,
    s.planner,
    s.leader
  FROM dates d
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
  WHERE (
      normalize_text(s.planner) = normalize_text('abraao lima velozo')
      OR normalize_text(s.planner) LIKE normalize_text('abraao lima velozo') || '%'
      OR normalize_text('abraao lima velozo') LIKE normalize_text(s.planner) || '%'
    )
    AND s.planner <> '0'
)
SELECT
  'Test: AS-OF aggregation without leader filter' AS test_name,
  snapshot_date,
  COUNT(DISTINCT client_id) AS total_clients,
  COUNT(DISTINCT CASE WHEN normalize_text(leader) = 'helio brollo junior' THEN client_id END) AS helio_clients
FROM last_snapshots
GROUP BY snapshot_date
ORDER BY snapshot_date;

-- 7. Testar com leader filter aplicado
WITH dates AS (
  SELECT generate_series('2025-11-13'::DATE, '2025-11-26'::DATE, interval '1 day')::date AS day
),
normalized_leaders AS (
  SELECT ARRAY_AGG(normalize_text(l)) AS leaders_array
  FROM UNNEST(ARRAY['helio brollo junior']) AS l
  WHERE normalize_text(l) IS NOT NULL
),
last_snapshots AS (
  SELECT
    d.day AS snapshot_date,
    s.client_id,
    s.planner,
    s.leader,
    nl.leaders_array
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
  WHERE (
      normalize_text(s.planner) = normalize_text('abraao lima velozo')
      OR normalize_text(s.planner) LIKE normalize_text('abraao lima velozo') || '%'
      OR normalize_text('abraao lima velozo') LIKE normalize_text(s.planner) || '%'
    )
    AND s.planner <> '0'
    AND (
      nl.leaders_array IS NULL
      OR EXISTS (
        SELECT 1 FROM UNNEST(nl.leaders_array) AS nla
        WHERE normalize_text(s.leader) = nla
           OR normalize_text(s.leader) LIKE nla || '%'
           OR nla LIKE normalize_text(s.leader) || '%'
      )
    )
)
SELECT
  'Test: AS-OF with leader filter applied' AS test_name,
  snapshot_date,
  COUNT(DISTINCT client_id) AS total_clients,
  leaders_array[1] AS leader_filter
FROM last_snapshots
GROUP BY snapshot_date, leaders_array
ORDER BY snapshot_date;
