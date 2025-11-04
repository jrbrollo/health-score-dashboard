-- Script para corrigir a função record_health_score_history_v3
-- Execute este comando no SQL Editor do Supabase

CREATE OR REPLACE FUNCTION record_health_score_history_v3(client_row clients)
RETURNS VOID AS $$
DECLARE
  health_calc JSON;
  record_date DATE := CURRENT_DATE;
BEGIN
  -- Ignorar cônjuges
  IF client_row.is_spouse THEN
    RETURN;
  END IF;

  -- Calcular Health Score v3
  health_calc := calculate_health_score_v3(
    client_row.nps_score_v3,
    client_row.has_nps_referral,
    client_row.overdue_installments,
    client_row.overdue_days,
    client_row.cross_sell_count,
    client_row.months_since_closing
  );

  -- Inserir ou atualizar registro histórico (upsert)
  INSERT INTO health_score_history (
    client_id,
    recorded_date,
    client_name,
    planner,
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
    ecosystem_usage
  ) VALUES (
    client_row.id,
    record_date,
    client_row.name,
    client_row.planner,
    client_row.email,
    client_row.phone,
    client_row.is_spouse,
    client_row.leader,
    client_row.mediator,
    client_row.manager,
    client_row.months_since_closing,
    client_row.nps_score_v3,
    client_row.has_nps_referral,
    client_row.overdue_installments,
    client_row.overdue_days,
    client_row.cross_sell_count,
    (health_calc->>'total')::INTEGER,
    health_calc->>'category',
    0, -- meeting_engagement (INTEGER) - não usado em v3
    0, -- app_usage (INTEGER) - não usado em v3
    (health_calc->>'payment')::INTEGER, -- payment_status (INTEGER) - score do pilar
    (health_calc->>'cross_sell')::INTEGER + (health_calc->>'referral')::INTEGER, -- ecosystem_engagement (INTEGER)
    (health_calc->>'nps')::INTEGER, -- nps_score (INTEGER) - score do pilar
    client_row.last_meeting, -- last_meeting (TEXT)
    client_row.has_scheduled_meeting, -- has_scheduled_meeting (BOOLEAN)
    client_row.app_usage, -- app_usage_status (TEXT)
    client_row.payment_status, -- payment_status_detail (TEXT)
    client_row.has_referrals, -- has_referrals (BOOLEAN)
    client_row.nps_score, -- nps_score_detail (TEXT)
    client_row.ecosystem_usage -- ecosystem_usage (TEXT)
  )
  ON CONFLICT (client_id, recorded_date) 
  DO UPDATE SET
    client_name = EXCLUDED.client_name,
    planner = EXCLUDED.planner,
    email = EXCLUDED.email,
    phone = EXCLUDED.phone,
    is_spouse = EXCLUDED.is_spouse,
    leader = EXCLUDED.leader,
    mediator = EXCLUDED.mediator,
    manager = EXCLUDED.manager,
    months_since_closing = EXCLUDED.months_since_closing,
    nps_score_v3 = EXCLUDED.nps_score_v3,
    has_nps_referral = EXCLUDED.has_nps_referral,
    overdue_installments = EXCLUDED.overdue_installments,
    overdue_days = EXCLUDED.overdue_days,
    cross_sell_count = EXCLUDED.cross_sell_count,
    health_score = EXCLUDED.health_score,
    health_category = EXCLUDED.health_category,
    meeting_engagement = EXCLUDED.meeting_engagement,
    app_usage = EXCLUDED.app_usage,
    payment_status = EXCLUDED.payment_status,
    ecosystem_engagement = EXCLUDED.ecosystem_engagement,
    nps_score = EXCLUDED.nps_score,
    last_meeting = EXCLUDED.last_meeting,
    has_scheduled_meeting = EXCLUDED.has_scheduled_meeting,
    app_usage_status = EXCLUDED.app_usage_status,
    payment_status_detail = EXCLUDED.payment_status_detail,
    has_referrals = EXCLUDED.has_referrals,
    nps_score_detail = EXCLUDED.nps_score_detail,
    ecosystem_usage = EXCLUDED.ecosystem_usage,
    created_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Mensagem de sucesso
SELECT 'Função record_health_score_history_v3 atualizada com sucesso!' as status;





