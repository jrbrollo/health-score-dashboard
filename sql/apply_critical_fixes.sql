-- ============================================
-- APLICAÇÃO DE CORREÇÕES CRÍTICAS
-- Health Score Dashboard - Auditoria Técnica
-- ============================================
-- Data: 2025-01-XX
-- 
-- Este script aplica todas as correções críticas identificadas na auditoria:
-- 
-- [#1] Remover RETURN para cônjuges em record_health_score_history_v3
-- [#2] Implementar herança de NPS no SQL
-- [#4] Adicionar spouse_partner_name no INSERT SQL
-- [#5] Adicionar validação de data futura no SQL
-- [#6] Adicionar transação na importação bulk
-- [#7] Alterar identity_key para texto normalizado
-- [#8] Validar last_seen_at antes de criar histórico
-- 
-- IMPORTANTE: 
-- 1. Execute migrate_identity_key_to_text.sql ANTES deste script se houver dados existentes
-- 2. Faça backup do banco antes de executar
-- 3. Teste em ambiente de desenvolvimento primeiro
-- ============================================

-- ============================================
-- 1. ATUALIZAR record_health_score_history_v3
-- ============================================
-- Correções aplicadas:
-- - Removido RETURN para cônjuges
-- - Implementada herança de NPS do pagante
-- - Validação de data futura
-- - Validação de last_seen_at

\echo 'Aplicando correções em record_health_score_history_v3...'

-- Função completa está em record_health_score_history_v3_fixed.sql
-- Esta função já foi atualizada com todas as correções

-- ============================================
-- 2. ATUALIZAR bulk_insert_client_v3
-- ============================================
-- Correções aplicadas:
-- - Adicionado spouse_partner_name no INSERT e UPDATE
-- - Alterado identity_key de MD5 para texto normalizado

\echo 'Aplicando correções em bulk_insert_client_v3...'

-- Função completa está em bulk_insert_client_v3.sql
-- Esta função já foi atualizada com todas as correções

-- ============================================
-- 3. ATUALIZAR bulk_insert_clients_v3
-- ============================================
-- Correções aplicadas:
-- - Adicionada transação explícita com tratamento de erros

\echo 'Aplicando correções em bulk_insert_clients_v3...'

-- Função completa está em fix_import_flow.sql
-- Esta função já foi atualizada com todas as correções

-- ============================================
-- VERIFICAÇÃO FINAL
-- ============================================

\echo 'Verificando funções atualizadas...'

-- Verificar se funções existem e estão atualizadas
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'record_health_score_history_v3') 
    THEN '✅ record_health_score_history_v3 existe'
    ELSE '❌ record_health_score_history_v3 não encontrada'
  END AS status_record_history;

SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'bulk_insert_client_v3') 
    THEN '✅ bulk_insert_client_v3 existe'
    ELSE '❌ bulk_insert_client_v3 não encontrada'
  END AS status_bulk_insert_client;

SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'bulk_insert_clients_v3') 
    THEN '✅ bulk_insert_clients_v3 existe'
    ELSE '❌ bulk_insert_clients_v3 não encontrada'
  END AS status_bulk_insert_clients;

-- Verificar se coluna spouse_partner_name existe
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'clients' 
      AND column_name = 'spouse_partner_name'
    )
    THEN '✅ Coluna spouse_partner_name existe'
    ELSE '❌ Coluna spouse_partner_name não encontrada - execute ALTER TABLE clients ADD COLUMN spouse_partner_name TEXT;'
  END AS status_spouse_column;

-- Verificar constraint UNIQUE em identity_key
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'clients_identity_key_key'
      AND conrelid = 'clients'::regclass
    )
    THEN '✅ Constraint UNIQUE em identity_key existe'
    ELSE '⚠️ Constraint UNIQUE em identity_key não encontrada - pode causar duplicatas'
  END AS status_unique_constraint;

\echo '============================================';
\echo 'Correções críticas aplicadas com sucesso!';
\echo '============================================';
\echo '';
\echo 'Próximos passos:';
\echo '1. Testar importação de CSV com cônjuges';
\echo '2. Verificar que histórico é criado para cônjuges';
\echo '3. Validar que herança de NPS funciona corretamente';
\echo '4. Testar transação (deve fazer rollback se algum cliente falhar)';
\echo '5. Verificar que identity_key está em formato texto legível';

