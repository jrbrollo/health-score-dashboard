-- Script para corrigir o tipo da coluna phone (caso esteja como INTEGER)
-- Execute este comando no SQL Editor do Supabase

-- 1. Verificar se phone está como INTEGER na tabela health_score_history
DO $$
BEGIN
  -- Tentar alterar o tipo da coluna phone na tabela health_score_history
  BEGIN
    ALTER TABLE health_score_history ALTER COLUMN phone TYPE TEXT;
    RAISE NOTICE 'Coluna phone em health_score_history alterada para TEXT';
  EXCEPTION
    WHEN undefined_column THEN
      RAISE NOTICE 'Coluna phone não existe em health_score_history';
    WHEN OTHERS THEN
      RAISE NOTICE 'Coluna phone já é TEXT ou não precisa ser alterada';
  END;
  
  -- Tentar alterar o tipo da coluna phone na tabela clients (por garantia)
  BEGIN
    ALTER TABLE clients ALTER COLUMN phone TYPE TEXT;
    RAISE NOTICE 'Coluna phone em clients alterada para TEXT';
  EXCEPTION
    WHEN undefined_column THEN
      RAISE NOTICE 'Coluna phone não existe em clients';
    WHEN OTHERS THEN
      RAISE NOTICE 'Coluna phone já é TEXT ou não precisa ser alterada';
  END;
END $$;

-- Verificar os tipos atuais
SELECT 'clients' as table_name, column_name, data_type
FROM information_schema.columns
WHERE table_name = 'clients' AND column_name = 'phone'
UNION ALL
SELECT 'health_score_history' as table_name, column_name, data_type
FROM information_schema.columns
WHERE table_name = 'health_score_history' AND column_name = 'phone';


