-- Função que insere clientes individualmente para evitar problemas com JSON parsing
DROP FUNCTION IF EXISTS bulk_insert_clients(TEXT);

CREATE OR REPLACE FUNCTION bulk_insert_clients_individual(
  p_name TEXT,
  p_planner TEXT,
  p_phone TEXT,
  p_email TEXT,
  p_leader TEXT,
  p_mediator TEXT,
  p_manager TEXT,
  p_is_spouse BOOLEAN,
  p_months_since_closing INTEGER,
  p_nps_score_v3 INTEGER,
  p_has_nps_referral BOOLEAN,
  p_overdue_installments INTEGER,
  p_overdue_days INTEGER,
  p_cross_sell_count INTEGER,
  p_meetings_enabled BOOLEAN,
  p_last_meeting TEXT,
  p_has_scheduled_meeting BOOLEAN,
  p_app_usage TEXT,
  p_payment_status TEXT,
  p_has_referrals BOOLEAN,
  p_nps_score TEXT,
  p_ecosystem_usage TEXT
)
RETURNS clients AS $$
DECLARE
  result clients;
BEGIN
  INSERT INTO clients (
    name, planner, phone, email, leader, mediator, manager,
    is_spouse, months_since_closing, nps_score_v3, has_nps_referral,
    overdue_installments, overdue_days, cross_sell_count, meetings_enabled,
    last_meeting, has_scheduled_meeting, app_usage, payment_status,
    has_referrals, nps_score, ecosystem_usage
  ) VALUES (
    p_name, p_planner, p_phone, p_email, p_leader, p_mediator, p_manager,
    COALESCE(p_is_spouse, false),
    p_months_since_closing,
    p_nps_score_v3,
    COALESCE(p_has_nps_referral, false),
    COALESCE(p_overdue_installments, 0),
    COALESCE(p_overdue_days, 0),
    COALESCE(p_cross_sell_count, 0),
    COALESCE(p_meetings_enabled, false),
    COALESCE(p_last_meeting, 'Nunca'),
    COALESCE(p_has_scheduled_meeting, false),
    COALESCE(p_app_usage, 'Nunca usou'),
    COALESCE(p_payment_status, 'Em dia'),
    COALESCE(p_has_referrals, false),
    COALESCE(p_nps_score, 'Não avaliado'),
    COALESCE(p_ecosystem_usage, 'Não usa')
  )
  RETURNING * INTO result;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;








