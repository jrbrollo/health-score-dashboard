-- Corrigir função bulk_insert_clients para tratar phone como TEXT sempre
-- Execute este comando no SQL Editor do Supabase

DROP FUNCTION IF EXISTS bulk_insert_clients(JSONB);

CREATE OR REPLACE FUNCTION bulk_insert_clients(clients_json JSONB)
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
    -- Forçar phone como TEXT, mesmo se vier como número no JSON
    CASE 
      WHEN jsonb_typeof(client->'phone') = 'number' THEN (client->>'phone')
      WHEN jsonb_typeof(client->'phone') = 'string' THEN (client->>'phone')
      ELSE NULL
    END,
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
  FROM jsonb_array_elements(clients_json) AS client
  RETURNING *;
END;
$$ LANGUAGE plpgsql;

-- Testar com telefone problemático
SELECT bulk_insert_clients('[
  {
    "name": "TESTE Phone Long",
    "planner": "Teste",
    "phone": "5519996573733",
    "email": null,
    "leader": null,
    "mediator": null,
    "manager": null,
    "is_spouse": false,
    "months_since_closing": 0,
    "nps_score_v3": 10,
    "has_nps_referral": false,
    "overdue_installments": 0,
    "overdue_days": 0,
    "cross_sell_count": 1,
    "meetings_enabled": false,
    "last_meeting": "Nunca",
    "has_scheduled_meeting": false,
    "app_usage": "Nunca usou",
    "payment_status": "Em dia",
    "has_referrals": false,
    "nps_score": "Não avaliado",
    "ecosystem_usage": "Não usa"
  }
]'::jsonb);

-- Limpar teste
DELETE FROM clients WHERE name LIKE 'TESTE%';








