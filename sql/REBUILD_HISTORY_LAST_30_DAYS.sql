-- ============================================
-- RECONSTRUIR HISTÓRICO DOS ÚLTIMOS 30 DIAS
-- ============================================
-- Este script limpa e reconstrói o histórico dos últimos 30 dias
-- usando apenas clientes ativos e a lógica v3 correta.

-- 1. Limpar histórico dos últimos 30 dias
DELETE FROM health_score_history 
WHERE recorded_date >= CURRENT_DATE - INTERVAL '30 days';

-- 2. Recalcular histórico apenas para hoje
-- (Os dias anteriores ficarão vazios, e o Forward Filling do SQL vai preencher automaticamente)
SELECT backfill_health_score_history();

-- 3. Verificar resultado
SELECT 
  recorded_date,
  COUNT(*) as total_registros,
  ROUND(AVG(health_score), 2) as score_medio
FROM health_score_history
WHERE recorded_date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY recorded_date
ORDER BY recorded_date DESC;
