-- Script para recriar históricos do dia 13/11/2025 com nova lógica de NPS herdado
-- Execute este script APÓS atualizar a função record_health_score_history_v3
-- Data: 2025-01-XX

-- ============================================
-- 1. DELETAR HISTÓRICOS EXISTENTES DO DIA 13/11
-- ============================================
DELETE FROM health_score_history
WHERE recorded_date = '2025-11-13';

-- ============================================
-- 2. RECRIAR HISTÓRICOS COM NOVA LÓGICA
-- ============================================
-- A função record_health_score_history_v3 já foi atualizada para herdar NPS do pagante
-- Vamos chamá-la para todos os clientes que existiam no dia 13/11

DO $$
DECLARE
  v_client RECORD;
  v_count INTEGER := 0;
BEGIN
  -- Buscar todos os clientes que existiam no dia 13/11
  -- (clientes com last_seen_at <= 13/11 ou que foram criados antes de 14/11)
  FOR v_client IN 
    SELECT DISTINCT id
    FROM clients
    WHERE (last_seen_at IS NULL OR last_seen_at <= '2025-11-13 23:59:59'::TIMESTAMPTZ)
      AND created_at <= '2025-11-14 00:00:00'::TIMESTAMPTZ
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
-- Verificar quantos históricos foram criados
SELECT 
  COUNT(*) as total_historicos,
  COUNT(*) FILTER (WHERE is_spouse = true) as conjuges,
  COUNT(*) FILTER (WHERE is_spouse = false OR is_spouse IS NULL) as nao_conjuges,
  AVG(health_score) as media_score,
  AVG(nps_score_v3_pillar) as media_nps_pillar
FROM health_score_history
WHERE recorded_date = '2025-11-13';

-- Verificar alguns exemplos de cônjuges com NPS herdado
SELECT 
  h.client_name,
  h.planner,
  h.is_spouse,
  h.nps_score_v3,
  h.nps_score_v3_pillar,
  h.health_score,
  c.spouse_partner_name
FROM health_score_history h
LEFT JOIN clients c ON h.client_id = c.id
WHERE h.recorded_date = '2025-11-13'
  AND h.is_spouse = true
LIMIT 10;

