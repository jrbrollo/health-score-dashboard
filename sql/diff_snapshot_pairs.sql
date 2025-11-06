-- Função para comparar pares (nome|planejador) da planilha com o snapshot atual
-- Retorna os pares que estão na planilha mas não no snapshot

CREATE OR REPLACE FUNCTION diff_snapshot_pairs(p_pairs TEXT[])
RETURNS TABLE(pair TEXT) AS $$
BEGIN
  RETURN QUERY
  WITH 
    -- Obter a data do último snapshot
    last_snapshot AS (
      SELECT MAX(last_seen_at) AS last_date
      FROM clients
      WHERE last_seen_at IS NOT NULL
    ),
    -- Obter todos os pares (nome|planejador) do snapshot atual
    snapshot_pairs AS (
      SELECT DISTINCT 
        lower(trim(c.name)) || '|' || lower(trim(c.planner)) AS pair
      FROM clients c
      CROSS JOIN last_snapshot ls
      WHERE c.last_seen_at = ls.last_date
        AND c.name IS NOT NULL 
        AND c.name != '0'
        AND c.planner IS NOT NULL
        AND c.planner != '0'
    ),
    -- Converter array de entrada em tabela
    input_pairs AS (
      SELECT unnest(p_pairs) AS pair
    )
  -- Retornar pares que estão no input mas não no snapshot
  SELECT ip.pair
  FROM input_pairs ip
  LEFT JOIN snapshot_pairs sp ON ip.pair = sp.pair
  WHERE sp.pair IS NULL;
END;
$$ LANGUAGE plpgsql;

