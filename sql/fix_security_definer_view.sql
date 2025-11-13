-- Script para corrigir o problema de SECURITY DEFINER na view temporal_health_analysis
-- Este script remove o SECURITY DEFINER e recria a view com SECURITY INVOKER
-- Mantém a funcionalidade intacta, apenas melhora a segurança

-- IMPORTANTE: Execute este script no Supabase SQL Editor ou via MCP
-- Este script é seguro e não afeta os dados, apenas recria a definição da view

-- 1. Remover a view atual (isso não afeta os dados, apenas a definição)
DROP VIEW IF EXISTS temporal_health_analysis CASCADE;

-- 2. Recriar a view COM security_invoker = true
-- No PostgreSQL 15+, você pode usar WITH (security_invoker = true) para garantir que a view respeite RLS
CREATE VIEW temporal_health_analysis 
WITH (security_invoker = true) AS
SELECT 
  recorded_date,
  planner,
  COUNT(*) as total_clients,
  ROUND(AVG(health_score), 2) as avg_health_score,
  COUNT(CASE WHEN health_category = 'Ótimo' THEN 1 END) as excellent_count,
  COUNT(CASE WHEN health_category = 'Estável' THEN 1 END) as stable_count,
  COUNT(CASE WHEN health_category = 'Atenção' THEN 1 END) as warning_count,
  COUNT(CASE WHEN health_category = 'Crítico' THEN 1 END) as critical_count,
  ROUND(AVG(meeting_engagement), 2) as avg_meeting_engagement,
  ROUND(AVG(app_usage), 2) as avg_app_usage,
  ROUND(AVG(payment_status), 2) as avg_payment_status,
  ROUND(AVG(ecosystem_engagement), 2) as avg_ecosystem_engagement,
  ROUND(AVG(nps_score), 2) as avg_nps_score
FROM health_score_history
WHERE planner <> '0' AND client_name <> '0'
GROUP BY recorded_date, planner
ORDER BY recorded_date DESC, planner;

-- 3. Verificar se a view foi criada corretamente
SELECT 
  schemaname,
  viewname,
  viewowner
FROM pg_views
WHERE viewname = 'temporal_health_analysis';

-- ✅ Pronto! A view agora usa SECURITY INVOKER por padrão
-- ✅ A funcionalidade permanece intacta
-- ✅ A segurança foi melhorada, respeitando RLS e permissões do usuário
