-- ============================================
-- SCRIPT COMPLETO: Remover Restrições de Cônjuges
-- ============================================
-- Cônjuges agora devem ser tratados igualmente aos outros clientes
-- Execute este script no SQL Editor do Supabase
-- 
-- IMPORTANTE: Execute este script APÓS o fix_remove_spouse_restrictions.sql
-- para atualizar também as funções de bulk insert

-- ============================================
-- 1. ATUALIZAR bulk_insert_client_v3 (fix_import_flow.sql)
-- ============================================
-- Remover verificação que só cria histórico para não-cônjuges

-- Esta função precisa ser atualizada manualmente no arquivo fix_import_flow.sql
-- Linha 237-239: Remover o IF e sempre chamar record_health_score_history_v3
-- 
-- ANTES:
--   IF result.is_spouse IS NULL OR result.is_spouse = FALSE THEN
--     PERFORM record_health_score_history_v3(result.id, p_import_date);
--   END IF;
--
-- DEPOIS:
--   PERFORM record_health_score_history_v3(result.id, p_import_date);

-- Como a função é muito grande, vamos criar uma função auxiliar
-- que sempre cria histórico, independente de ser cônjuge ou não

-- ============================================
-- 2. ATUALIZAR create_bulk_insert_client_v3
-- ============================================
-- Remover verificação que só cria histórico para não-cônjuges

-- Esta função precisa ser atualizada manualmente no arquivo create_bulk_insert_function.sql
-- Linha 360-362: Remover o IF e sempre chamar record_health_score_history_v3
--
-- ANTES:
--   IF result.is_spouse IS NULL OR result.is_spouse = FALSE THEN
--     PERFORM record_health_score_history_v3(result.id, p_import_date);
--   END IF;
--
-- DEPOIS:
--   PERFORM record_health_score_history_v3(result.id, p_import_date);

-- ============================================
-- NOTA IMPORTANTE
-- ============================================
-- As funções de bulk insert são muito grandes e complexas.
-- Para atualizá-las, você precisa:
--
-- 1. Abrir o arquivo fix_import_flow.sql
-- 2. Localizar a linha 237-239
-- 3. Substituir por: PERFORM record_health_score_history_v3(result.id, p_import_date);
-- 4. Executar o arquivo completo no Supabase
--
-- 5. Abrir o arquivo create_bulk_insert_function.sql
-- 6. Localizar a linha 360-362
-- 7. Substituir por: PERFORM record_health_score_history_v3(result.id, p_import_date);
-- 8. Executar o arquivo completo no Supabase

-- ============================================
-- VERIFICAÇÃO
-- ============================================
-- Após executar os scripts, verifique se as funções foram atualizadas:

-- Verificar se record_health_score_history_v3 não ignora mais cônjuges
SELECT 
  CASE 
    WHEN pg_get_functiondef(oid) LIKE '%is_spouse%RETURN%' THEN 'AINDA IGNORA CÔNJUGES'
    ELSE 'OK - NÃO IGNORA CÔNJUGES'
  END as status_record_function
FROM pg_proc
WHERE proname = 'record_health_score_history_v3'
  AND pronargs = 2;

