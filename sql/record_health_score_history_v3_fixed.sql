-- Função para registrar Health Score v3 no histórico
-- Esta função calcula e registra o health score baseado nos critérios v3

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

  -- Ignorar cônjuges
  IF v_client.is_spouse = TRUE THEN
    RETURN;
  END IF;

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
  v_payment_pillar := 40; -- Adimplente
  
  IF COALESCE(v_client.overdue_installments, 0) = 1 THEN
    -- 1 parcela atrasada
    IF COALESCE(v_client.overdue_days, 0) <= 7 THEN
      v_payment_pillar := 25;
    ELSIF COALESCE(v_client.overdue_days, 0) <= 15 THEN
      v_payment_pillar := 15;
    ELSIF COALESCE(v_client.overdue_days, 0) <= 30 THEN
      v_payment_pillar := 5;
    ELSIF COALESCE(v_client.overdue_days, 0) <= 60 THEN
      v_payment_pillar := 0; -- MUDANÇA: era -5, agora 0
    ELSE
      v_payment_pillar := -10; -- 61+ dias - MUDANÇA: era -15, agora -10
    END IF;
  ELSIF COALESCE(v_client.overdue_installments, 0) = 2 THEN
    -- 2 parcelas atrasadas
    IF COALESCE(v_client.overdue_days, 0) >= 30 THEN
      v_payment_pillar := -20; -- NOVO: 2 parcelas + 30+ dias
    ELSE
      v_payment_pillar := -10; -- 2 parcelas com menos de 30 dias
    END IF;
  ELSIF COALESCE(v_client.overdue_installments, 0) >= 3 THEN
    -- 3+ parcelas: zerar tudo (tratado abaixo)
    v_payment_pillar := 0;
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
  -- NOVA LÓGICA:
  -- 0-4 meses = 5, 5-8 meses = 10, 9-12 meses = 15, 13-24 meses = 15, 25+ meses = 15
  v_tenure_pillar := 0;
  IF v_client.months_since_closing IS NOT NULL AND v_client.months_since_closing >= 0 THEN
    IF v_client.months_since_closing >= 25 THEN
      v_tenure_pillar := 15; -- Fidelizado (25+ meses)
    ELSIF v_client.months_since_closing >= 13 THEN
      v_tenure_pillar := 15; -- Maduro (13-24) - MUDANÇA: era 12, agora 15
    ELSIF v_client.months_since_closing >= 9 THEN
      v_tenure_pillar := 15; -- Consolidado (9-12) - MUDANÇA: era 7-12, agora 9-12
    ELSIF v_client.months_since_closing >= 5 THEN
      v_tenure_pillar := 10; -- Consolidação inicial (5-8) - MUDANÇA: era 4-6, agora 5-8
    ELSIF v_client.months_since_closing >= 0 THEN
      v_tenure_pillar := 5; -- Onboarding (0-4) - MUDANÇA: era 0-3, agora 0-4
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
    nps_score_v3_pillar = EXCLUDED.nps_score_v3_pillar,
    referral_pillar = EXCLUDED.referral_pillar,
    payment_pillar = EXCLUDED.payment_pillar,
    cross_sell_pillar = EXCLUDED.cross_sell_pillar,
    tenure_pillar = EXCLUDED.tenure_pillar,
    months_since_closing = EXCLUDED.months_since_closing,
    nps_score_v3 = EXCLUDED.nps_score_v3,
    has_nps_referral = EXCLUDED.has_nps_referral,
    overdue_installments = EXCLUDED.overdue_installments,
    overdue_days = EXCLUDED.overdue_days,
    cross_sell_count = EXCLUDED.cross_sell_count;

END;
$$ LANGUAGE plpgsql;

