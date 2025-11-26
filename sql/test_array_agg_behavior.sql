-- Test ARRAY_AGG behavior with empty result sets

-- Test 1: ARRAY_AGG with rows
SELECT
  'Test 1: ARRAY_AGG with rows' AS test_name,
  ARRAY_AGG(normalize_text(l)) AS result,
  ARRAY_AGG(normalize_text(l)) IS NULL AS is_null
FROM UNNEST(ARRAY['helio brollo junior']) AS l
WHERE normalize_text(l) IS NOT NULL;

-- Test 2: ARRAY_AGG with zero rows (all filtered out)
SELECT
  'Test 2: ARRAY_AGG with zero rows' AS test_name,
  ARRAY_AGG(normalize_text(l)) AS result,
  ARRAY_AGG(normalize_text(l)) IS NULL AS is_null
FROM UNNEST(ARRAY['helio brollo junior']) AS l
WHERE FALSE;  -- Filter out everything

-- Test 3: Check if normalized_leaders would be NULL in the actual function
DO $$
DECLARE
  leaders TEXT[] := ARRAY['helio brollo junior'];
  normalized_leaders TEXT[];
BEGIN
  IF leaders IS NOT NULL THEN
    SELECT ARRAY_AGG(normalize_text(l)) INTO normalized_leaders
    FROM UNNEST(leaders) AS l
    WHERE normalize_text(l) IS NOT NULL;
  END IF;

  RAISE NOTICE 'leaders: %', leaders;
  RAISE NOTICE 'normalized_leaders: %', normalized_leaders;
  RAISE NOTICE 'normalized_leaders IS NULL: %', normalized_leaders IS NULL;
  RAISE NOTICE 'normalized_leaders IS NOT NULL: %', normalized_leaders IS NOT NULL;

  IF normalized_leaders IS NOT NULL THEN
    RAISE NOTICE 'First element: %', normalized_leaders[1];
  ELSE
    RAISE NOTICE 'normalized_leaders is NULL!';
  END IF;
END $$;

-- Test 4: Check if empty array vs NULL
DO $$
DECLARE
  empty_array TEXT[] := '{}';
  null_array TEXT[];
BEGIN
  RAISE NOTICE 'empty_array: %', empty_array;
  RAISE NOTICE 'empty_array IS NULL: %', empty_array IS NULL;
  RAISE NOTICE 'empty_array = {}: %', empty_array = '{}';
  RAISE NOTICE 'null_array: %', null_array;
  RAISE NOTICE 'null_array IS NULL: %', null_array IS NULL;
END $$;

-- Test 5: Simular exatamente a lógica da função
DO $$
DECLARE
  leaders TEXT[] := ARRAY['helio brollo junior'];
  normalized_leaders TEXT[];
  test_value TEXT := 'Hélio Brollo Junior';
  passes_filter BOOLEAN;
BEGIN
  -- Normalize array
  IF leaders IS NOT NULL THEN
    SELECT ARRAY_AGG(normalize_text(l)) INTO normalized_leaders
    FROM UNNEST(leaders) AS l
    WHERE normalize_text(l) IS NOT NULL;
  END IF;

  -- Check filter logic
  passes_filter := (
    normalized_leaders IS NULL
    OR EXISTS (
      SELECT 1 FROM UNNEST(normalized_leaders) AS nl
      WHERE normalize_text(test_value) = nl
         OR normalize_text(test_value) LIKE nl || '%'
         OR nl LIKE normalize_text(test_value) || '%'
    )
  );

  RAISE NOTICE 'Test value: %', test_value;
  RAISE NOTICE 'Normalized test value: %', normalize_text(test_value);
  RAISE NOTICE 'normalized_leaders: %', normalized_leaders;
  RAISE NOTICE 'Passes filter: %', passes_filter;
END $$;
