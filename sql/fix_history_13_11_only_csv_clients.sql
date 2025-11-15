-- Script para CORRIGIR o histórico do dia 13/11/2025
-- Problema: O histórico atual inclui 1.813 clientes, mas a planilha do 13/11 tem apenas 1.176
-- Solução: Deletar o histórico atual e recriar APENAS para clientes que estavam na planilha do 13/11
-- (clientes com last_seen_at = '2025-11-13')

-- ============================================
-- 1. DELETAR HISTÓRICOS EXISTENTES DO DIA 13/11
-- ============================================
DELETE FROM health_score_history
WHERE recorded_date = '2025-11-13';

-- ============================================
-- 2. RECRIAR HISTÓRICOS APENAS PARA CLIENTES DA PLANILHA DO 13/11
-- ============================================
-- IMPORTANTE: Apenas clientes com last_seen_at = '2025-11-13' devem estar no histórico
-- Esses são os clientes que estavam na planilha do dia 13/11

DO $$
DECLARE
  v_client RECORD;
  v_count INTEGER := 0;
BEGIN
  -- Buscar APENAS clientes que estavam na planilha do 13/11
  -- Critério: last_seen_at = '2025-11-13' (data exata da planilha)
  -- IMPORTANTE: Este script deve ser executado APÓS importar a planilha do 13/11
  FOR v_client IN 
    SELECT DISTINCT id
    FROM clients
    WHERE last_seen_at IS NOT NULL
      AND DATE(last_seen_at) = '2025-11-13'::DATE
      AND name != '0'
      AND planner != '0'
    ORDER BY id
  LOOP
    -- Chamar função para criar histórico com nova lógica
    PERFORM record_health_score_history_v3(v_client.id, '2025-11-13'::DATE);
    v_count := v_count + 1;
    
    -- Log a cada 100 clientes
    IF v_count % 100 = 0 THEN
      RAISE NOTICE 'Processados % clientes...', v_count;
    END IF;
  END LOOP;
  
  RAISE NOTICE '✅ Total de históricos recriados: %', v_count;
END $$;

-- ============================================
-- 3. VERIFICAÇÃO
-- ============================================
-- Verificar quantos históricos foram criados (deve ser ~1.176)
SELECT 
  COUNT(*) as total_historicos,
  COUNT(*) FILTER (WHERE is_spouse = true) as conjuges,
  COUNT(*) FILTER (WHERE is_spouse = false OR is_spouse IS NULL) as nao_conjuges,
  ROUND(AVG(health_score), 2) as media_score,
  ROUND(AVG(nps_score_v3_pillar), 2) as media_nps_pillar
FROM health_score_history
WHERE recorded_date = '2025-11-13';

-- Verificar se há clientes com last_seen_at diferente de 13/11 (não deveria ter)
SELECT 
  COUNT(*) as clientes_com_last_seen_diferente,
  COUNT(*) FILTER (WHERE DATE(c.last_seen_at) != '2025-11-13'::DATE) as diferentes_de_13_11
FROM health_score_history h
LEFT JOIN clients c ON h.client_id = c.id
WHERE h.recorded_date = '2025-11-13';

