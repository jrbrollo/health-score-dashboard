-- ============================================
-- FUNÇÃO CENTRALIZADA: calculate_health_score_v3
-- ============================================
-- DESCRIÇÃO:
-- Função centralizada para calcular o Health Score v3 e todos os seus pilares.
-- Esta função elimina a duplicação de ~600 linhas de código que estava espalhada
-- em múltiplas funções SQL (get_client_health_score_evolution, get_sankey_snapshot,
-- get_temporal_analysis_asof, record_health_score_history_v3).
--
-- PARÂMETROS:
--   p_client_id: UUID do cliente
--
-- RETORNO:
--   JSON com:
--     - health_score: INTEGER (score total 0-100)
--     - health_category: TEXT ('Ótimo', 'Estável', 'Atenção', 'Crítico')
--     - nps_score_v3_pillar: INTEGER (-10 a 20)
--     - referral_pillar: INTEGER (0 ou 10)
--     - payment_pillar: INTEGER (-20 a 40)
--     - cross_sell_pillar: INTEGER (0, 5, 10 ou 15)
--     - tenure_pillar: INTEGER (0, 5, 10 ou 15)
--
-- USO:
--   SELECT * FROM calculate_health_score_v3('uuid-do-cliente'::UUID);
--   SELECT (calculate_health_score_v3('uuid-do-cliente'::UUID)->>'health_score')::INTEGER;

CREATE OR REPLACE FUNCTION calculate_health_score_v3(
  p_client_id UUID
) RETURNS JSON AS $$
DECLARE
  v_client RECORD;
  v_nps_pillar INTEGER;
  v_referral_pillar INTEGER;
  v_payment_pillar INTEGER;
  v_cross_sell_pillar INTEGER;
  v_tenure_pillar INTEGER;
  v_health_score INTEGER;
  v_health_category TEXT;
  v_nps_value INTEGER; -- NPS a ser usado (próprio ou herdado)
  v_payer_nps INTEGER; -- NPS do pagante (para herança)
BEGIN
  -- Buscar dados do cliente
  SELECT * INTO v_client
  FROM clients c
  WHERE c.id = p_client_id;

  -- Validar que cliente existe
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente não encontrado: %', p_client_id;
  END IF;

  -- Determinar NPS a ser usado (próprio ou herdado do pagante)
  v_nps_value := v_client.nps_score_v3;
  
  -- Se for cônjuge sem NPS próprio, buscar do pagante
  IF v_client.is_spouse = TRUE 
     AND v_client.nps_score_v3 IS NULL 
     AND v_client.spouse_partner_name IS NOT NULL 
     AND v_client.planner IS NOT NULL THEN
    -- Buscar NPS do pagante usando spouse_partner_name + planner
    -- Normalizar nome para busca (lowercase, trim)
    SELECT c2.nps_score_v3 INTO v_payer_nps
    FROM clients c2
    WHERE lower(trim(c2.name)) = lower(trim(v_client.spouse_partner_name))
      AND c2.planner = v_client.planner
      AND (c2.is_spouse = FALSE OR c2.is_spouse IS NULL)
    LIMIT 1;
    
    -- Se encontrou NPS do pagante, usar ele
    IF v_payer_nps IS NOT NULL THEN
      v_nps_value := v_payer_nps;
    END IF;
  END IF;

  -- Calcular NPS Pillar (-10 a 20 pontos)
  -- LÓGICA: Detrator (0-6) = -10, Neutro (7-8) = 10, Promotor (9-10) = 20
  -- Null (não respondeu) = 10 pontos (neutro padrão para clientes não-cônjuges)
  -- Cônjuge sem NPS próprio nem do pagante = 0 pontos
  IF v_nps_value IS NOT NULL THEN
    IF v_nps_value >= 9 THEN
      v_nps_pillar := 20; -- Promotor
    ELSIF v_nps_value >= 7 THEN
      v_nps_pillar := 10; -- Neutro
    ELSE
      v_nps_pillar := -10; -- Detrator
    END IF;
  ELSIF v_client.is_spouse = TRUE THEN
    -- Cônjuge sem NPS próprio nem do pagante = 0 pontos
    v_nps_pillar := 0;
  ELSE
    -- Cliente não-cônjuge sem NPS = 10 pontos (neutro padrão)
    v_nps_pillar := 10;
  END IF;

  -- Calcular Referral Pillar (10 pontos)
  v_referral_pillar := CASE WHEN v_client.has_nps_referral = TRUE THEN 10 ELSE 0 END;

  -- Calcular Payment Pillar (-20 a 40 pontos)
  -- LÓGICA:
  -- 0 parcelas = 40
  -- 1 parcela: 0-7d(25), 8-15d(15), 16-30d(5), 31-60d(0), 61+d(-10)
  -- 2 parcelas: <30d(-10), ≥30d(-20)
  -- 3+ parcelas = override para score 0 total (tratado depois)
  v_payment_pillar := 40; -- Adimplente
  
  IF COALESCE(v_client.overdue_installments, 0) = 1 THEN
    IF COALESCE(v_client.overdue_days, 0) <= 7 THEN
      v_payment_pillar := 25;
    ELSIF COALESCE(v_client.overdue_days, 0) <= 15 THEN
      v_payment_pillar := 15;
    ELSIF COALESCE(v_client.overdue_days, 0) <= 30 THEN
      v_payment_pillar := 5;
    ELSIF COALESCE(v_client.overdue_days, 0) <= 60 THEN
      v_payment_pillar := 0;
    ELSE
      v_payment_pillar := -10;
    END IF;
  ELSIF COALESCE(v_client.overdue_installments, 0) = 2 THEN
    IF COALESCE(v_client.overdue_days, 0) >= 30 THEN
      v_payment_pillar := -20;
    ELSE
      v_payment_pillar := -10;
    END IF;
  ELSIF COALESCE(v_client.overdue_installments, 0) >= 3 THEN
    v_payment_pillar := 0; -- Será override para score 0 total
  END IF;

  -- Calcular Cross Sell Pillar (15 pontos)
  v_cross_sell_pillar := 0;
  IF COALESCE(v_client.cross_sell_count, 0) >= 3 THEN
    v_cross_sell_pillar := 15;
  ELSIF COALESCE(v_client.cross_sell_count, 0) = 2 THEN
    v_cross_sell_pillar := 10;
  ELSIF COALESCE(v_client.cross_sell_count, 0) = 1 THEN
    v_cross_sell_pillar := 5;
  END IF;

  -- Calcular Tenure Pillar (15 pontos)
  v_tenure_pillar := 0;
  IF v_client.months_since_closing IS NOT NULL AND v_client.months_since_closing >= 0 THEN
    IF v_client.months_since_closing >= 25 THEN
      v_tenure_pillar := 15;
    ELSIF v_client.months_since_closing >= 13 THEN
      v_tenure_pillar := 15;
    ELSIF v_client.months_since_closing >= 9 THEN
      v_tenure_pillar := 15;
    ELSIF v_client.months_since_closing >= 5 THEN
      v_tenure_pillar := 10;
    ELSIF v_client.months_since_closing >= 0 THEN
      v_tenure_pillar := 5;
    END IF;
  END IF;

  -- Calcular Health Score Total
  v_health_score := v_nps_pillar + v_referral_pillar + v_payment_pillar + v_cross_sell_pillar + v_tenure_pillar;

  -- Override: 3+ parcelas em atraso = Score 0
  IF COALESCE(v_client.overdue_installments, 0) >= 3 THEN
    v_health_score := 0;
    v_health_category := 'Crítico';
  ELSE
    -- Garantir score mínimo de 0 (sem valores negativos)
    IF v_health_score < 0 THEN
      v_health_score := 0;
    END IF;

    -- Determinar categoria (escala 0-100)
    IF v_health_score >= 75 THEN
      v_health_category := 'Ótimo';
    ELSIF v_health_score >= 50 THEN
      v_health_category := 'Estável';
    ELSIF v_health_score >= 30 THEN
      v_health_category := 'Atenção';
    ELSE
      v_health_category := 'Crítico';
    END IF;
  END IF;

  -- Retornar JSON com todos os valores calculados
  RETURN json_build_object(
    'health_score', v_health_score,
    'health_category', v_health_category,
    'nps_score_v3_pillar', v_nps_pillar,
    'referral_pillar', v_referral_pillar,
    'payment_pillar', v_payment_pillar,
    'cross_sell_pillar', v_cross_sell_pillar,
    'tenure_pillar', v_tenure_pillar
  );
END;
$$ LANGUAGE plpgsql;

