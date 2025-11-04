-- Versão final simples
DROP FUNCTION IF EXISTS bulk_insert_clients(TEXT);

CREATE OR REPLACE FUNCTION bulk_insert_clients(clients_json TEXT)
RETURNS SETOF clients AS $$
BEGIN
  RETURN QUERY
  INSERT INTO clients (
    name, planner, phone, email, leader, mediator, manager,
    is_spouse, months_since_closing, nps_score_v3, has_nps_referral,
    overdue_installments, overdue_days, cross_sell_count, meetings_enabled,
    last_meeting, has_scheduled_meeting, app_usage, payment_status,
    has_referrals, nps_score, ecosystem_usage
  )
  SELECT
    (client->>'name'),
    (client->>'planner'),
    (client->>'phone'),
    (client->>'email'),
    (client->>'leader'),
    (client->>'mediator'),
    (client->>'manager'),
    COALESCE((client->>'is_spouse')::BOOLEAN, false),
    (client->>'months_since_closing')::INTEGER,
    (client->>'nps_score_v3')::INTEGER,
    COALESCE((client->>'has_nps_referral')::BOOLEAN, false),
    COALESCE((client->>'overdue_installments')::INTEGER, 0),
    COALESCE((client->>'overdue_days')::INTEGER, 0),
    COALESCE((client->>'cross_sell_count')::INTEGER, 0),
    COALESCE((client->>'meetings_enabled')::BOOLEAN, false),
    COALESCE((client->>'last_meeting'), 'Nunca'),
    COALESCE((client->>'has_scheduled_meeting')::BOOLEAN, false),
    COALESCE((client->>'app_usage'), 'Nunca usou'),
    COALESCE((client->>'payment_status'), 'Em dia'),
    COALESCE((client->>'has_referrals')::BOOLEAN, false),
    COALESCE((client->>'nps_score'), 'Não avaliado'),
    COALESCE((client->>'ecosystem_usage'), 'Não usa')
  FROM jsonb_array_elements(clients_json::jsonb) AS client
  RETURNING *;
END;
$$ LANGUAGE plpgsql;








