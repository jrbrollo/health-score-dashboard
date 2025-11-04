-- Limpeza de placeholders e deduplicação segura
-- Execute no SQL Editor do Supabase

BEGIN;

-- 1) Normalizar hierarquia: transformar placeholders em NULL
UPDATE clients
SET manager = NULL
WHERE manager IS NOT NULL AND trim(lower(manager)) IN ('#n/d','n/d','na','n/a','0','-','—','', '#ref!');

UPDATE clients
SET mediator = NULL
WHERE mediator IS NOT NULL AND trim(lower(mediator)) IN ('#n/d','n/d','na','n/a','0','-','—','', '#ref!');

UPDATE clients
SET leader = NULL
WHERE leader IS NOT NULL AND trim(lower(leader)) IN ('#n/d','n/d','na','n/a','0','-','—','', '#ref!');

-- 2) Sanear identity_key inválida e recalcular
UPDATE clients
SET identity_key = NULL
WHERE identity_key IS NOT NULL AND trim(identity_key) IN ('', '0');

UPDATE clients c
SET identity_key = COALESCE(
  NULLIF(NULLIF(regexp_replace(c.phone::text, '\\D+', '', 'g'), ''), '0'),
  NULLIF(NULLIF(lower(trim(c.email)), ''), '0'),
  md5(lower(trim(c.name)) || '|' || lower(trim(c.planner)))
)
WHERE c.identity_key IS NULL;

-- 3) Deduplicar sem identidade (sem phone e sem email), por (name, planner)
CREATE TEMP TABLE _dup_groups AS
SELECT lower(trim(name)) AS n, lower(trim(planner)) AS p
FROM clients
WHERE COALESCE(regexp_replace(phone::text, '\\D+', '', 'g'),'') = ''
  AND COALESCE(NULLIF(lower(trim(email)),''),'') = ''
GROUP BY lower(trim(name)), lower(trim(planner))
HAVING COUNT(*) > 1;

CREATE TEMP TABLE _canon_np AS
SELECT id, name, planner
FROM (
  SELECT c.*,
         row_number() OVER (
           PARTITION BY lower(trim(c.name)), lower(trim(c.planner))
           ORDER BY COALESCE(c.updated_at,c.created_at,'epoch'::timestamptz) DESC, c.id DESC
         ) AS rn
  FROM clients c
  JOIN _dup_groups g
    ON lower(trim(c.name)) = g.n
   AND lower(trim(c.planner)) = g.p
  WHERE COALESCE(regexp_replace(c.phone::text, '\\D+', '', 'g'),'') = ''
    AND COALESCE(NULLIF(lower(trim(c.email)),''),'') = ''
)
WHERE rn = 1;

-- Remover colisão de histórico por data
DELETE FROM health_score_history h
USING (
  SELECT d.id dup_id, c.id canon_id, h.recorded_date
  FROM clients d
  JOIN _canon_np c
    ON lower(trim(d.name)) = lower(trim(c.name))
   AND lower(trim(d.planner)) = lower(trim(c.planner))
  JOIN health_score_history h ON h.client_id = d.id
  WHERE d.id <> c.id
    AND EXISTS (
      SELECT 1 FROM health_score_history hx
      WHERE hx.client_id = c.id AND hx.recorded_date = h.recorded_date
    )
) x
WHERE h.client_id = x.dup_id AND h.recorded_date = x.recorded_date;

-- Mover restante do histórico
UPDATE health_score_history h
SET client_id = c.id
FROM clients d
JOIN _canon_np c
  ON lower(trim(d.name)) = lower(trim(c.name))
 AND lower(trim(d.planner)) = lower(trim(c.planner))
WHERE h.client_id = d.id AND d.id <> c.id;

-- Apagar duplicados
DELETE FROM clients d
USING _canon_np c
WHERE lower(trim(d.name)) = lower(trim(c.name))
  AND lower(trim(d.planner)) = lower(trim(c.planner))
  AND d.id <> c.id;

-- 4) Recriar índice único completo de identity_key (garantir integridade)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uniq_clients_identity_key'
  ) THEN
    DROP INDEX uniq_clients_identity_key;
  END IF;
END $$;

CREATE UNIQUE INDEX uniq_clients_identity_key ON clients(identity_key);

COMMIT;







