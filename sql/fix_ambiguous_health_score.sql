-- Correção: Ambiguidade na coluna health_score na função record_health_score_history_v3
-- Erro: "column reference \"health_score\" is ambiguous"
-- Solução: Qualificar todas as referências a colunas na cláusula ON CONFLICT DO UPDATE SET

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
  v_payer_nps INTEGER;
BEGIN
  -- Buscar dados do cliente
  SELECT * INTO v_client
  FROM clients
  WHERE id = p_client_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Calcular NPS Pillar com herança para cônjuges
  v_nps_pillar := 10; -- Default para null (neutro)
  
  -- Buscar NPS do pagante se for cônjuge e não tiver NPS próprio
  IF v_client.is_spouse = TRUE AND v_client.nps_score_v3 IS NULL AND v_client.spouse_partner_name IS NOT NULL THEN
    SELECT nps_score_v3 INTO v_payer_nps
    FROM clients
    WHERE name = v_client.spouse_partner_name
      AND planner = v_client.planner
      AND is_spouse = FALSE
    LIMIT 1;
    
    IF v_payer_nps IS NOT NULL THEN
      v_nps_pillar := CASE
        WHEN v_payer_nps >= 9 THEN 20
        WHEN v_payer_nps >= 7 THEN 10
        ELSE -10
      END;
    ELSE
      v_nps_pillar := 0; -- Cônjuge sem NPS próprio e sem pagante = 0 pontos
    END IF;
  ELSIF v_client.nps_score_v3 IS NOT NULL THEN
    -- Lógica original para não-cônjuges ou cônjuges com NPS próprio
    IF v_client.nps_score_v3 >= 9 THEN
      v_nps_pillar := 20;
    ELSIF v_client.nps_score_v3 >= 7 THEN
      v_nps_pillar := 10;
    ELSE
      v_nps_pillar := -10;
    END IF;
  ELSE
    v_nps_pillar := 0; -- Cônjuge sem NPS próprio e sem pagante = 0 pontos
  END IF;

  -- Calcular Referral Pillar (10 pontos)
  v_referral_pillar := CASE WHEN v_client.has_nps_referral = TRUE THEN 10 ELSE 0 END;

  -- Calcular Payment Pillar (-20 a 40 pontos)
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
    IF v_health_score < 0 THEN
      v_health_score := 0;
    END IF;

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
    0, 0, 0, 0, 0,
    'Nunca', FALSE, 'Nunca usou', 'Em dia', FALSE, 'Não avaliado', 'Não usa',
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
    v_nps_pillar,
    v_referral_pillar,
    v_payment_pillar,
    v_cross_sell_pillar,
    v_tenure_pillar
  )
  ON CONFLICT (client_id, recorded_date)
  DO UPDATE SET
    -- IMPORTANTE: Qualificar todas as referências a colunas com o nome da tabela
    -- para evitar ambiguidade. health_score_history é o alias implícito na cláusula ON CONFLICT
    health_score = CASE 
      WHEN p_recorded_date >= CURRENT_DATE THEN EXCLUDED.health_score 
      ELSE health_score_history.health_score 
    END,
    health_category = CASE 
      WHEN p_recorded_date >= CURRENT_DATE THEN EXCLUDED.health_category 
      ELSE health_score_history.health_category 
    END,
    nps_score_v3_pillar = CASE 
      WHEN p_recorded_date >= CURRENT_DATE THEN EXCLUDED.nps_score_v3_pillar 
      ELSE health_score_history.nps_score_v3_pillar 
    END,
    referral_pillar = CASE 
      WHEN p_recorded_date >= CURRENT_DATE THEN EXCLUDED.referral_pillar 
      ELSE health_score_history.referral_pillar 
    END,
    payment_pillar = CASE 
      WHEN p_recorded_date >= CURRENT_DATE THEN EXCLUDED.payment_pillar 
      ELSE health_score_history.payment_pillar 
    END,
    cross_sell_pillar = CASE 
      WHEN p_recorded_date >= CURRENT_DATE THEN EXCLUDED.cross_sell_pillar 
      ELSE health_score_history.cross_sell_pillar 
    END,
    tenure_pillar = CASE 
      WHEN p_recorded_date >= CURRENT_DATE THEN EXCLUDED.tenure_pillar 
      ELSE health_score_history.tenure_pillar 
    END,
    months_since_closing = CASE 
      WHEN p_recorded_date >= CURRENT_DATE THEN EXCLUDED.months_since_closing 
      ELSE health_score_history.months_since_closing 
    END,
    nps_score_v3 = CASE 
      WHEN p_recorded_date >= CURRENT_DATE THEN EXCLUDED.nps_score_v3 
      ELSE health_score_history.nps_score_v3 
    END,
    has_nps_referral = CASE 
      WHEN p_recorded_date >= CURRENT_DATE THEN EXCLUDED.has_nps_referral 
      ELSE health_score_history.has_nps_referral 
    END,
    overdue_installments = CASE 
      WHEN p_recorded_date >= CURRENT_DATE THEN EXCLUDED.overdue_installments 
      ELSE health_score_history.overdue_installments 
    END,
    overdue_days = CASE 
      WHEN p_recorded_date >= CURRENT_DATE THEN EXCLUDED.overdue_days 
      ELSE health_score_history.overdue_days 
    END,
    cross_sell_count = CASE 
      WHEN p_recorded_date >= CURRENT_DATE THEN EXCLUDED.cross_sell_count 
      ELSE health_score_history.cross_sell_count 
    END;

END;
$$ LANGUAGE plpgsql;

