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

  -- Calcular NPS Pillar (20 pontos)
  v_nps_pillar := 0;
  IF v_client.nps_score_v3 IS NOT NULL THEN
    IF v_client.nps_score_v3 >= 9 THEN
      v_nps_pillar := 20;
    ELSIF v_client.nps_score_v3 >= 7 THEN
      v_nps_pillar := 10;
    ELSE
      v_nps_pillar := 0;
    END IF;
  END IF;

  -- Calcular Referral Pillar (10 pontos)
  v_referral_pillar := CASE WHEN v_client.has_nps_referral = TRUE THEN 10 ELSE 0 END;

  -- Calcular Payment Pillar (40 pontos)
  v_payment_pillar := 40;
  IF COALESCE(v_client.overdue_installments, 0) > 0 THEN
    IF COALESCE(v_client.overdue_days, 0) > 90 THEN
      v_payment_pillar := 0;
    ELSIF COALESCE(v_client.overdue_days, 0) > 60 THEN
      v_payment_pillar := 10;
    ELSIF COALESCE(v_client.overdue_days, 0) > 30 THEN
      v_payment_pillar := 20;
    ELSE
      v_payment_pillar := 30;
    END IF;
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
  IF v_client.months_since_closing IS NOT NULL THEN
    IF v_client.months_since_closing >= 12 THEN
      v_tenure_pillar := 15;
    ELSIF v_client.months_since_closing >= 6 THEN
      v_tenure_pillar := 10;
    ELSIF v_client.months_since_closing >= 3 THEN
      v_tenure_pillar := 5;
    END IF;
  END IF;

  -- Calcular Health Score Total
  v_health_score := v_nps_pillar + v_referral_pillar + v_payment_pillar + v_cross_sell_pillar + v_tenure_pillar;

  -- Determinar categoria
  IF v_health_score >= 100 THEN
    v_health_category := 'Ótimo';
  ELSIF v_health_score >= 60 THEN
    v_health_category := 'Estável';
  ELSIF v_health_score >= 35 THEN
    v_health_category := 'Atenção';
  ELSE
    v_health_category := 'Crítico';
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

