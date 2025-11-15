-- ============================================
-- MIGRAÇÃO: Alterar identity_key de MD5 para texto normalizado
-- ============================================
-- Data: 2025-01-XX
-- Objetivo: Facilitar debug e queries manuais usando texto legível
-- 
-- IMPORTANTE: Executar este script ANTES de atualizar as funções SQL
-- para garantir que dados existentes sejam migrados corretamente
-- ============================================

-- 1. Verificar se há identity_keys em formato MD5 (32 caracteres hexadecimais)
DO $$
DECLARE
  v_md5_count INTEGER;
  v_text_count INTEGER;
BEGIN
  -- Contar registros com MD5 (32 caracteres hexadecimais)
  SELECT COUNT(*) INTO v_md5_count
  FROM clients
  WHERE identity_key ~ '^[0-9a-f]{32}$';
  
  -- Contar registros com texto normalizado (contém '|')
  SELECT COUNT(*) INTO v_text_count
  FROM clients
  WHERE identity_key LIKE '%|%';
  
  RAISE NOTICE 'Registros com identity_key MD5: %', v_md5_count;
  RAISE NOTICE 'Registros com identity_key texto: %', v_text_count;
  
  IF v_md5_count > 0 THEN
    RAISE NOTICE 'Migração necessária: % registros precisam ser atualizados', v_md5_count;
  ELSE
    RAISE NOTICE 'Nenhuma migração necessária - todos os registros já estão em formato texto';
  END IF;
END $$;

-- 2. Atualizar identity_key de MD5 para texto normalizado
-- ATENÇÃO: Isso pode demorar se houver muitos registros
UPDATE clients
SET identity_key = lower(trim(name)) || '|' || lower(trim(planner))
WHERE identity_key ~ '^[0-9a-f]{32}$'  -- Formato MD5
  AND name IS NOT NULL
  AND planner IS NOT NULL
  AND trim(name) != ''
  AND trim(planner) != '';

-- 3. Verificar se há duplicatas após migração
DO $$
DECLARE
  v_duplicate_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_duplicate_count
  FROM (
    SELECT identity_key, COUNT(*) as cnt
    FROM clients
    WHERE identity_key IS NOT NULL
    GROUP BY identity_key
    HAVING COUNT(*) > 1
  ) duplicates;
  
  IF v_duplicate_count > 0 THEN
    RAISE WARNING 'ATENÇÃO: Encontradas % identity_keys duplicadas após migração!', v_duplicate_count;
    RAISE NOTICE 'Verifique manualmente os registros duplicados:';
    RAISE NOTICE 'SELECT identity_key, COUNT(*) FROM clients GROUP BY identity_key HAVING COUNT(*) > 1;';
  ELSE
    RAISE NOTICE '✅ Migração concluída sem duplicatas';
  END IF;
END $$;

-- 4. Verificar constraint UNIQUE
DO $$
DECLARE
  v_unique_constraint_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'clients_identity_key_key'
      AND conrelid = 'clients'::regclass
  ) INTO v_unique_constraint_exists;
  
  IF NOT v_unique_constraint_exists THEN
    RAISE NOTICE 'Criando constraint UNIQUE em identity_key...';
    ALTER TABLE clients ADD CONSTRAINT clients_identity_key_key UNIQUE (identity_key);
    RAISE NOTICE '✅ Constraint UNIQUE criada';
  ELSE
    RAISE NOTICE '✅ Constraint UNIQUE já existe';
  END IF;
END $$;

-- 5. Estatísticas finais
SELECT 
  'Migração concluída' as status,
  COUNT(*) FILTER (WHERE identity_key ~ '^[0-9a-f]{32}$') as ainda_md5,
  COUNT(*) FILTER (WHERE identity_key LIKE '%|%') as formato_texto,
  COUNT(*) FILTER (WHERE identity_key IS NULL) as sem_identity_key,
  COUNT(*) as total_registros
FROM clients;

