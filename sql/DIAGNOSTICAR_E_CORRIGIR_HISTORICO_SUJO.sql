-- ============================================
-- DIAGNÓSTICO E CORREÇÃO: Histórico "Sujo"
-- ============================================
-- PROBLEMA:
-- Score de 14/11 está sendo mostrado no dia 16/11 no gráfico
-- Isso indica que há registros com recorded_date incorreto no histórico
--
-- CAUSA RAIZ:
-- Durante a primeira importação falha (16/11), foram criados registros
-- com recorded_date = '2025-11-16' quando deveria ser '2025-11-14'
--
-- SOLUÇÃO:
-- 1. Identificar registros com recorded_date incorreto
-- 2. Verificar se há registros duplicados (mesmo client_id, recorded_date diferente)
-- 3. Corrigir ou deletar registros incorretos

-- ============================================
-- 1. DIAGNÓSTICO: Identificar registros problemáticos
-- ============================================

-- Verificar registros de 16/11 que podem estar incorretos
SELECT 
  'Registros de 16/11' AS diagnostico,
  COUNT(*) AS total_registros,
  COUNT(DISTINCT client_id) AS clientes_unicos,
  MIN(health_score) AS score_minimo,
  MAX(health_score) AS score_maximo,
  ROUND(AVG(health_score), 2) AS score_medio
FROM health_score_history
WHERE recorded_date = '2025-11-16';

-- Verificar registros de 14/11 para comparação
SELECT 
  'Registros de 14/11' AS diagnostico,
  COUNT(*) AS total_registros,
  COUNT(DISTINCT client_id) AS clientes_unicos,
  MIN(health_score) AS score_minimo,
  MAX(health_score) AS score_maximo,
  ROUND(AVG(health_score), 2) AS score_medio
FROM health_score_history
WHERE recorded_date = '2025-11-14';

-- Verificar clientes que têm registros em AMBAS as datas (14/11 e 16/11)
-- Estes são os clientes problemáticos
WITH clientes_duplicados AS (
  SELECT 
    client_id,
    client_name,
    planner,
    COUNT(DISTINCT recorded_date) AS datas_diferentes,
    ARRAY_AGG(DISTINCT recorded_date ORDER BY recorded_date) AS datas_registradas
  FROM health_score_history
  WHERE recorded_date IN ('2025-11-14', '2025-11-16')
  GROUP BY client_id, client_name, planner
  HAVING COUNT(DISTINCT recorded_date) > 1
)
SELECT 
  'Clientes com registros em 14/11 E 16/11' AS diagnostico,
  COUNT(*) AS total_clientes_problematicos,
  ARRAY_AGG(client_name ORDER BY client_name) FILTER (WHERE ROW_NUMBER() OVER (ORDER BY client_name) <= 10) AS exemplos_clientes
FROM clientes_duplicados;

-- Detalhar registros duplicados para análise
SELECT 
  h.client_id,
  h.client_name,
  h.planner,
  h.recorded_date,
  h.health_score,
  h.health_category,
  h.created_at,
  h.updated_at,
  CASE 
    WHEN h.recorded_date = '2025-11-16' THEN '⚠️ SUSPEITO: Pode ser registro incorreto'
    WHEN h.recorded_date = '2025-11-14' THEN '✅ CORRETO: Data esperada'
    ELSE 'ℹ️ OUTRA DATA'
  END AS status
FROM health_score_history h
WHERE h.client_id IN (
  SELECT client_id
  FROM health_score_history
  WHERE recorded_date IN ('2025-11-14', '2025-11-16')
  GROUP BY client_id
  HAVING COUNT(DISTINCT recorded_date) > 1
)
AND h.recorded_date IN ('2025-11-14', '2025-11-16')
ORDER BY h.client_name, h.recorded_date;

-- ============================================
-- 2. CORREÇÃO: Deletar registros incorretos de 16/11
-- ============================================
-- ATENÇÃO: Esta correção assume que:
-- - Registros de 14/11 são os CORRETOS
-- - Registros de 16/11 são os INCORRETOS (criados durante importação falha)
--
-- Se um cliente tem registro em AMBAS as datas, deletar apenas o de 16/11
-- Se um cliente tem registro APENAS em 16/11, manter (pode ser correto se não há de 14/11)

-- Opção 1: Deletar registros de 16/11 que têm correspondente em 14/11
-- (Mais seguro - só deleta duplicatas)
DELETE FROM health_score_history
WHERE recorded_date = '2025-11-16'
AND client_id IN (
  SELECT DISTINCT client_id
  FROM health_score_history
  WHERE recorded_date = '2025-11-14'
);

-- Verificar quantos registros foram deletados
SELECT 
  'Registros deletados (duplicatas de 16/11)' AS resultado,
  COUNT(*) AS total_deletados
FROM health_score_history
WHERE recorded_date = '2025-11-16'
AND client_id IN (
  SELECT DISTINCT client_id
  FROM health_score_history
  WHERE recorded_date = '2025-11-14'
);

-- ============================================
-- 3. VERIFICAÇÃO PÓS-CORREÇÃO
-- ============================================

-- Verificar se ainda há registros de 16/11
SELECT 
  'Registros restantes de 16/11' AS verificacao,
  COUNT(*) AS total,
  CASE 
    WHEN COUNT(*) = 0 THEN '✅ Nenhum registro restante - correção completa'
    ELSE '⚠️ Ainda há ' || COUNT(*) || ' registros de 16/11 (podem ser legítimos se não há de 14/11)'
  END AS status
FROM health_score_history
WHERE recorded_date = '2025-11-16';

-- Verificar se não há mais duplicatas entre 14/11 e 16/11
SELECT 
  'Verificação de duplicatas' AS verificacao,
  COUNT(*) AS clientes_com_duplicatas,
  CASE 
    WHEN COUNT(*) = 0 THEN '✅ Nenhuma duplicata encontrada'
    ELSE '⚠️ Ainda há ' || COUNT(*) || ' clientes com registros em ambas as datas'
  END AS status
FROM (
  SELECT client_id
  FROM health_score_history
  WHERE recorded_date IN ('2025-11-14', '2025-11-16')
  GROUP BY client_id
  HAVING COUNT(DISTINCT recorded_date) > 1
) duplicatas;

