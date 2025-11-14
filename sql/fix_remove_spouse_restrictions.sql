-- Script para remover restrições de cônjuges
-- Cônjuges agora devem ser tratados igualmente aos outros clientes
-- Execute este script no SQL Editor do Supabase

-- ============================================
-- 1. ATUALIZAR record_health_score_history_v3
-- ============================================
-- Remover a verificação que ignora cônjuges

CREATE OR REPLACE FUNCTION record_health_score_history_v3(
  p_client_id UUID,
  p_recorded_date DATE DEFAULT CURRENT_DATE
)
RETURNS VOID AS $$
DECLARE
  v_client RECORD;
  v_nps_pillar INTEGER;
  v_referral_pillar INTEGER;
  v_payment_pillar INTEGER;
  v_cross_sell_pillar INTEGER;
  v_tenure_pillar INTEGER;
  v_health_score INTEGER;
  v_health_category TEXT;
BEGIN
  -- Buscar dados do cliente
  SELECT * INTO v_client
  FROM clients
  WHERE id = p_client_id;

  -- REMOVIDO: Verificação que ignorava cônjuges
  -- Cônjuges agora são tratados igualmente

  -- Calcular NPS Pillar (-10 a 20 pontos)
  -- NOVA LÓGICA: Detrator = -10, Neutro = 10, Promotor = 20, Null = 10
  v_nps_pillar := 10; -- Default para null (neutro)
  IF v_client.nps_score_v3 IS NOT NULL THEN
    IF v_client.nps_score_v3 >= 9 THEN
      v_nps_pillar := 20; -- Promotor
    ELSIF v_client.nps_score_v3 >= 7 THEN
      v_nps_pillar := 10; -- Neutro
    ELSE
      v_nps_pillar := -10; -- Detrator (MUDANÇA: era 0, agora -10)
    END IF;
  END IF;

  -- Calcular Referral Pillar (10 pontos)
  v_referral_pillar := CASE WHEN v_client.has_nps_referral = TRUE THEN 10 ELSE 0 END;

  -- Calcular Payment Pillar (-20 a 40 pontos)
  -- NOVA LÓGICA:
  -- 0 parcelas = 40
  -- 1 parcela: 0-7d(25), 8-15d(15), 16-30d(5), 31-60d(0), 61+d(-10)
  -- 2 parcelas: <30d(-10), ≥30d(-20)
  -- 3+ parcelas = override para score 0 total
  v_payment_pillar := 40; -- Default (adimplente)
  IF v_client.overdue_installments IS NOT NULL AND v_client.overdue_installments > 0 THEN
    IF v_client.overdue_installments >= 3 THEN
      v_payment_pillar := 0; -- 3+ parcelas = score total será 0
    ELSIF v_client.overdue_installments = 2 THEN
      IF v_client.overdue_days IS NOT NULL AND v_client.overdue_days >= 30 THEN
        v_payment_pillar := -20;
      ELSE
        v_payment_pillar := -10;
      END IF;
    ELSIF v_client.overdue_installments = 1 THEN
      IF v_client.overdue_days IS NOT NULL THEN
        IF v_client.overdue_days <= 7 THEN
          v_payment_pillar := 25;
        ELSIF v_client.overdue_days <= 15 THEN
          v_payment_pillar := 15;
        ELSIF v_client.overdue_days <= 30 THEN
          v_payment_pillar := 5;
        ELSIF v_client.overdue_days <= 60 THEN
          v_payment_pillar := 0;
        ELSE
          v_payment_pillar := -10;
        END IF;
      END IF;
    END IF;
  END IF;

  -- Calcular Cross Sell Pillar (15 pontos máx)
  IF v_client.cross_sell_count IS NULL OR v_client.cross_sell_count = 0 THEN
    v_cross_sell_pillar := 0;
  ELSIF v_client.cross_sell_count = 1 THEN
    v_cross_sell_pillar := 5;
  ELSIF v_client.cross_sell_count = 2 THEN
    v_cross_sell_pillar := 10;
  ELSE
    v_cross_sell_pillar := 15; -- 3+ produtos
  END IF;

  -- Calcular Tenure Pillar (15 pontos máx)
  -- NOVA LÓGICA:
  -- 0-4 meses = 5 pontos (Onboarding)
  -- 5-8 meses = 10 pontos (Consolidação inicial)
  -- 9-12 meses = 15 pontos (Consolidado)
  -- 13+ meses = 15 pontos (Maduro/Fidelizado)
  IF v_client.months_since_closing IS NULL OR v_client.months_since_closing < 0 THEN
    v_tenure_pillar := 0;
  ELSIF v_client.months_since_closing <= 4 THEN
    v_tenure_pillar := 5;
  ELSIF v_client.months_since_closing <= 8 THEN
    v_tenure_pillar := 10;
  ELSE
    v_tenure_pillar := 15; -- 9+ meses
  END IF;

  -- Calcular Health Score Total
  -- Override: 3+ parcelas = score 0
  IF v_client.overdue_installments IS NOT NULL AND v_client.overdue_installments >= 3 THEN
    v_health_score := 0;
    v_health_category := 'Crítico';
  ELSE
    v_health_score := v_nps_pillar + v_referral_pillar + v_payment_pillar + v_cross_sell_pillar + v_tenure_pillar;
    
    -- Garantir que não fica negativo (score mínimo = 0)
    IF v_health_score < 0 THEN
      v_health_score := 0;
    END IF;

    -- Categorizar
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

  -- Inserir ou atualizar no histórico
  INSERT INTO health_score_history (
    client_id,
    recorded_date,
    client_name,
    planner,
    health_score,
    health_category,
    -- Campos v2 (deprecated, valores padrão)
    meeting_engagement,
    app_usage,
    payment_status,
    ecosystem_engagement,
    nps_score,
    last_meeting,
    has_scheduled_meeting,
    app_usage_status,
    payment_status_detail,
    has_referrals,
    nps_score_detail,
    ecosystem_usage,
    -- Campos v3
    email,
    phone,
    is_spouse,
    leader,
    mediator,
    manager,
    months_since_closing,
    nps_score_v3,
    has_nps_referral,
    overdue_installments,
    overdue_days,
    cross_sell_count,
    -- Pilares v3
    nps_score_v3_pillar,
    referral_pillar,
    payment_pillar,
    cross_sell_pillar,
    tenure_pillar
  )
  VALUES (
    v_client.id,
    p_recorded_date,
    v_client.name,
    v_client.planner,
    v_health_score,
    v_health_category,
    -- Campos v2 (deprecated)
    0, 0, 0, 0, 0,
    'Nunca', FALSE, 'Nunca usou', 'Em dia', FALSE, 'Não avaliado', 'Não usa',
    -- Campos v3
    v_client.email,
    v_client.phone,
    v_client.is_spouse,
    v_client.leader,
    v_client.mediator,
    v_client.manager,
    v_client.months_since_closing,
    v_client.nps_score_v3,
    v_client.has_nps_referral,
    v_client.overdue_installments,
    v_client.overdue_days,
    v_client.cross_sell_count,
    -- Pilares v3
    v_nps_pillar,
    v_referral_pillar,
    v_payment_pillar,
    v_cross_sell_pillar,
    v_tenure_pillar
  )
  ON CONFLICT (client_id, recorded_date)
  DO UPDATE SET
    health_score = EXCLUDED.health_score,
    health_category = EXCLUDED.health_category,
    client_name = EXCLUDED.client_name,
    planner = EXCLUDED.planner,
    nps_score_v3_pillar = EXCLUDED.nps_score_v3_pillar,
    referral_pillar = EXCLUDED.referral_pillar,
    payment_pillar = EXCLUDED.payment_pillar,
    cross_sell_pillar = EXCLUDED.cross_sell_pillar,
    tenure_pillar = EXCLUDED.tenure_pillar,
    nps_score_v3 = EXCLUDED.nps_score_v3,
    has_nps_referral = EXCLUDED.has_nps_referral,
    overdue_installments = EXCLUDED.overdue_installments,
    overdue_days = EXCLUDED.overdue_days,
    cross_sell_count = EXCLUDED.cross_sell_count,
    months_since_closing = EXCLUDED.months_since_closing,
    email = EXCLUDED.email,
    phone = EXCLUDED.phone,
    is_spouse = EXCLUDED.is_spouse,
    leader = EXCLUDED.leader,
    mediator = EXCLUDED.mediator,
    manager = EXCLUDED.manager;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 2. ATUALIZAR bulk_insert_client_v3
-- ============================================
-- Remover verificação que só cria histórico para não-cônjuges

-- Nota: Esta função está em fix_import_flow.sql
-- A linha 237-239 precisa ser atualizada para:
-- PERFORM record_health_score_history_v3(result.id, p_import_date);
-- (remover o IF que verifica is_spouse)

-- ============================================
-- 3. ATUALIZAR create_bulk_insert_client_v3
-- ============================================
-- Remover verificação que só cria histórico para não-cônjuges

-- Nota: Esta função está em create_bulk_insert_function.sql
-- A linha 360-362 precisa ser atualizada para:
-- PERFORM record_health_score_history_v3(result.id, p_import_date);
-- (remover o IF que verifica is_spouse)

-- ============================================
-- VERIFICAÇÃO
-- ============================================
-- Verificar se a função foi atualizada corretamente
SELECT 
  proname as function_name,
  pg_get_functiondef(oid) as function_definition
FROM pg_proc
WHERE proname = 'record_health_score_history_v3'
  AND pronargs = 2;

