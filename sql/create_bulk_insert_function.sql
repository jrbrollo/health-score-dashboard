-- Criar função SQL para bulk insert de clientes
-- Execute este comando no SQL Editor do Supabase

-- Remover assinaturas antigas para evitar ambiguidade
DROP FUNCTION IF EXISTS bulk_insert_clients(JSONB);
DROP FUNCTION IF EXISTS bulk_insert_client(JSONB);

CREATE OR REPLACE FUNCTION bulk_insert_clients(clients_json JSONB, p_import_date DATE DEFAULT CURRENT_DATE, p_seen_at TIMESTAMPTZ DEFAULT NOW())
RETURNS SETOF clients AS $$
BEGIN
  RETURN QUERY
  WITH client AS (
    SELECT client FROM jsonb_array_elements(clients_json) AS client
  ),
  norm AS (
    SELECT
      (client.client->>'name')::TEXT AS name,
      CASE 
        WHEN client.client->>'planner' IS NULL THEN NULL
        WHEN trim(lower((client.client->>'planner')::text)) IN ('#n/d','n/d','na','n/a','0','-','—','','#ref!') THEN NULL
        ELSE (client.client->>'planner')::TEXT
      END AS planner,
      -- Normaliza telefone: extrai dígitos e invalida formatos de planilha (E+, vírgula) ou curtos (<9)
      CASE 
        WHEN (client.client->>'phone')::text ~* 'e\+|,' THEN NULL
        ELSE (
          CASE 
            WHEN length(regexp_replace((client.client->>'phone')::text, '[^0-9]+', '', 'g')) >= 9
              THEN regexp_replace((client.client->>'phone')::text, '[^0-9]+', '', 'g')
            ELSE NULL
          END
        )
      END AS phone,
      (client.client->>'email')::TEXT AS email,
      CASE 
        WHEN (client.client->>'leader') IS NULL THEN NULL
        WHEN trim(lower((client.client->>'leader')::text)) IN ('#n/d','n/d','na','n/a','0','-','—','','#ref!') THEN NULL
        ELSE (client.client->>'leader')::TEXT
      END AS leader,
      CASE 
        WHEN (client.client->>'mediator') IS NULL THEN NULL
        WHEN trim(lower((client.client->>'mediator')::text)) IN ('#n/d','n/d','na','n/a','0','-','—','','#ref!') THEN NULL
        ELSE (client.client->>'mediator')::TEXT
      END AS mediator,
      CASE 
        WHEN (client.client->>'manager') IS NULL THEN NULL
        WHEN trim(lower((client.client->>'manager')::text)) IN ('#n/d','n/d','na','n/a','0','-','—','','#ref!') THEN NULL
        ELSE (client.client->>'manager')::TEXT
      END AS manager,
      COALESCE(
        CASE 
          WHEN regexp_replace((client.client->>'is_spouse')::text, '\\D+', '', 'g') ~ '^\\d+$' THEN 
            (regexp_replace((client.client->>'is_spouse')::text, '\\D+', '', 'g')::int > 0)
          ELSE (lower(trim((client.client->>'is_spouse')::text)) IN ('sim','s','true','t','1','x','yes','y'))
        END,
        false
      ) AS is_spouse,
      CASE 
        WHEN regexp_replace((client.client->>'months_since_closing')::text, '[^0-9]+', '', 'g') ~ '^[0-9]+$' 
        THEN regexp_replace((client.client->>'months_since_closing')::text, '[^0-9]+', '', 'g')::INTEGER 
        ELSE NULL 
      END AS months_since_closing,
      CASE 
        WHEN regexp_replace((client.client->>'nps_score_v3')::text, '[^0-9]+', '', 'g') ~ '^[0-9]+$' 
        THEN regexp_replace((client.client->>'nps_score_v3')::text, '[^0-9]+', '', 'g')::INTEGER 
        ELSE NULL 
      END AS nps_score_v3,
      COALESCE(
        CASE 
          WHEN regexp_replace((client.client->>'has_nps_referral')::text, '[^0-9]+', '', 'g') ~ '^[0-9]+$' THEN 
            (regexp_replace((client.client->>'has_nps_referral')::text, '[^0-9]+', '', 'g')::int > 0)
          ELSE (
            lower(trim((client.client->>'has_nps_referral')::text)) IN (
              'sim','s','true','t','1','x','ok','yes','y','indicou','indicacao','indicação'
            )
          )
        END,
        false
      ) AS has_nps_referral,
      COALESCE(
        CASE WHEN regexp_replace((client.client->>'overdue_installments')::text, '[^0-9]+', '', 'g') ~ '^[0-9]+$'
             THEN regexp_replace((client.client->>'overdue_installments')::text, '[^0-9]+', '', 'g')::INTEGER
             ELSE NULL END
      , 0) AS overdue_installments,
      COALESCE(
        CASE WHEN regexp_replace((client.client->>'overdue_days')::text, '[^0-9]+', '', 'g') ~ '^[0-9]+$'
             THEN regexp_replace((client.client->>'overdue_days')::text, '[^0-9]+', '', 'g')::INTEGER
             ELSE NULL END
      , 0) AS overdue_days,
      COALESCE(
        CASE WHEN regexp_replace((client.client->>'cross_sell_count')::text, '[^0-9]+', '', 'g') ~ '^[0-9]+$'
             THEN regexp_replace((client.client->>'cross_sell_count')::text, '[^0-9]+', '', 'g')::INTEGER
             ELSE NULL END
      , 0) AS cross_sell_count,
      COALESCE((client.client->>'meetings_enabled')::BOOLEAN, false) AS meetings_enabled,
      COALESCE((client.client->>'last_meeting')::TEXT, 'Nunca') AS last_meeting,
      COALESCE((client.client->>'has_scheduled_meeting')::BOOLEAN, false) AS has_scheduled_meeting,
      COALESCE((client.client->>'app_usage')::TEXT, 'Nunca usou') AS app_usage,
      COALESCE((client.client->>'payment_status')::TEXT, 'Em dia') AS payment_status,
      COALESCE((client.client->>'has_referrals')::BOOLEAN, false) AS has_referrals,
      COALESCE((client.client->>'nps_score')::TEXT, 'Não avaliado') AS nps_score,
      COALESCE((client.client->>'ecosystem_usage')::TEXT, 'Não usa') AS ecosystem_usage,
      COALESCE(
        NULLIF(NULLIF(
          CASE 
            WHEN (client.client->>'phone')::text ~* 'e\+|,' THEN NULL
            ELSE (
              CASE WHEN length(regexp_replace((client.client->>'phone')::text, '[^0-9]+', '', 'g')) >= 9
                   THEN regexp_replace((client.client->>'phone')::text, '[^0-9]+', '', 'g')
                   ELSE NULL END
            )
          END
        , ''), '0'),
        NULLIF(NULLIF(lower(trim((client.client->>'email')::text)), ''), '0'),
        md5(lower(trim((client.client->>'name')::text)) || '|' || lower(trim((client.client->>'planner')::text)))
      ) AS ik
    FROM client
    WHERE (client.client->>'name') IS NOT NULL 
      AND trim((client.client->>'name')::text) <> ''
      AND trim(lower((client.client->>'name')::text)) NOT IN ('0','#n/d','n/d','na','n/a','-','—','#ref!')
      AND (client.client->>'planner') IS NOT NULL 
      AND trim(lower((client.client->>'planner')::text)) NOT IN ('0','#n/d','n/d','na','n/a','-','—','','#ref!')
  ),
  dedup AS (
    SELECT DISTINCT ON (ik) *
    FROM norm
    ORDER BY ik,
      COALESCE(cross_sell_count, 0) DESC,
      COALESCE(months_since_closing, -1) DESC,
      name DESC
  )
  INSERT INTO clients (
    name, planner, phone, email, leader, mediator, manager,
    is_spouse, months_since_closing, nps_score_v3, has_nps_referral,
    overdue_installments, overdue_days, cross_sell_count, meetings_enabled,
    last_meeting, has_scheduled_meeting, app_usage, payment_status,
    has_referrals, nps_score, ecosystem_usage,
    identity_key, is_active, last_seen_at
  )
  SELECT
    name, planner, phone, email, leader, mediator, manager,
    is_spouse, months_since_closing, nps_score_v3, has_nps_referral,
    overdue_installments, overdue_days, cross_sell_count, meetings_enabled,
    last_meeting, has_scheduled_meeting, app_usage, payment_status,
    has_referrals, nps_score, ecosystem_usage,
    ik, TRUE, p_seen_at
  FROM dedup
  ON CONFLICT (identity_key)
  DO UPDATE SET
    phone = EXCLUDED.phone,
    email = EXCLUDED.email,
    leader = EXCLUDED.leader,
    mediator = EXCLUDED.mediator,
    manager = EXCLUDED.manager,
    is_spouse = EXCLUDED.is_spouse,
    months_since_closing = EXCLUDED.months_since_closing,
    nps_score_v3 = EXCLUDED.nps_score_v3,
    has_nps_referral = EXCLUDED.has_nps_referral,
    overdue_installments = EXCLUDED.overdue_installments,
    overdue_days = EXCLUDED.overdue_days,
    cross_sell_count = GREATEST(EXCLUDED.cross_sell_count, clients.cross_sell_count),
    meetings_enabled = EXCLUDED.meetings_enabled,
    last_meeting = EXCLUDED.last_meeting,
    has_scheduled_meeting = EXCLUDED.has_scheduled_meeting,
    app_usage = EXCLUDED.app_usage,
    payment_status = EXCLUDED.payment_status,
    has_referrals = EXCLUDED.has_referrals,
    nps_score = EXCLUDED.nps_score,
    ecosystem_usage = EXCLUDED.ecosystem_usage,
    planner = EXCLUDED.planner,
    is_active = TRUE,
    last_seen_at = p_seen_at
  RETURNING *;
END;
$$ LANGUAGE plpgsql;

-- Testar a função
SELECT bulk_insert_clients('[
  {
    "name": "TESTE RPC",
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
]'::jsonb, CURRENT_DATE);

-- Limpar teste
DELETE FROM clients WHERE name = 'TESTE RPC';


-- Versão single-row com upsert e filtros de placeholders
CREATE OR REPLACE FUNCTION bulk_insert_client(payload JSONB, p_import_date DATE DEFAULT CURRENT_DATE, p_seen_at TIMESTAMPTZ DEFAULT NOW())
RETURNS clients AS $$
DECLARE
  result clients;
BEGIN
  IF (payload->>'name') IS NULL 
     OR trim((payload->>'name')::text) = ''
     OR trim(lower((payload->>'name')::text)) IN ('0','#n/d','n/d','na','n/a','-','—','#ref!')
     OR (payload->>'planner') IS NULL 
     OR trim(lower((payload->>'planner')::text)) IN ('0','#n/d','n/d','na','n/a','-','—','','#ref!') THEN
    RAISE EXCEPTION 'Invalid name/planner';
  END IF;

  INSERT INTO clients (
    name, planner, phone, email, leader, mediator, manager,
    is_spouse, months_since_closing, nps_score_v3, has_nps_referral,
    overdue_installments, overdue_days, cross_sell_count, meetings_enabled,
    last_meeting, has_scheduled_meeting, app_usage, payment_status,
    has_referrals, nps_score, ecosystem_usage,
    identity_key, is_active, last_seen_at
  ) VALUES (
    (payload->>'name')::TEXT,
    CASE 
      WHEN trim(lower((payload->>'planner')::text)) IN ('#n/d','n/d','na','n/a','0','-','—','','#ref!') THEN NULL
      ELSE (payload->>'planner')::TEXT
    END,
    -- phone normalizado
    CASE 
      WHEN (payload->>'phone')::text ~* 'e\+|,' THEN NULL
      ELSE (
        CASE WHEN length(regexp_replace((payload->>'phone')::text, '[^0-9]+', '', 'g')) >= 9
             THEN regexp_replace((payload->>'phone')::text, '[^0-9]+', '', 'g')
             ELSE NULL END
      )
    END,
    (payload->>'email')::TEXT,
    CASE 
      WHEN (payload->>'leader') IS NULL THEN NULL
      WHEN trim(lower((payload->>'leader')::text)) IN ('#n/d','n/d','na','n/a','0','-','—','','#ref!') THEN NULL
      ELSE (payload->>'leader')::TEXT
    END,
    CASE 
      WHEN (payload->>'mediator') IS NULL THEN NULL
      WHEN trim(lower((payload->>'mediator')::text)) IN ('#n/d','n/d','na','n/a','0','-','—','','#ref!') THEN NULL
      ELSE (payload->>'mediator')::TEXT
    END,
    CASE 
      WHEN (payload->>'manager') IS NULL THEN NULL
      WHEN trim(lower((payload->>'manager')::text)) IN ('#n/d','n/d','na','n/a','0','-','—','','#ref!') THEN NULL
      ELSE (payload->>'manager')::TEXT
    END,
    COALESCE(
      CASE 
        WHEN regexp_replace((payload->>'is_spouse')::text, '\\D+', '', 'g') ~ '^\\d+$' THEN 
          (regexp_replace((payload->>'is_spouse')::text, '\\D+', '', 'g')::int > 0)
        ELSE (lower(trim((payload->>'is_spouse')::text)) IN ('sim','s','true','t','1','x','yes','y'))
      END,
      false
    ),
    CASE 
      WHEN regexp_replace((payload->>'months_since_closing')::text, '[^0-9]+', '', 'g') ~ '^[0-9]+$' 
      THEN regexp_replace((payload->>'months_since_closing')::text, '[^0-9]+', '', 'g')::INTEGER 
      ELSE NULL 
    END,
    CASE 
      WHEN regexp_replace((payload->>'nps_score_v3')::text, '[^0-9]+', '', 'g') ~ '^[0-9]+$' 
      THEN regexp_replace((payload->>'nps_score_v3')::text, '[^0-9]+', '', 'g')::INTEGER 
      ELSE NULL 
    END,
    COALESCE(
      CASE 
      WHEN regexp_replace((payload->>'has_nps_referral')::text, '[^0-9]+', '', 'g') ~ '^[0-9]+$' THEN 
        (regexp_replace((payload->>'has_nps_referral')::text, '[^0-9]+', '', 'g')::int > 0)
        ELSE (
          lower(trim((payload->>'has_nps_referral')::text)) IN (
            'sim','s','true','t','1','x','ok','yes','y','indicou','indicacao','indicação'
          )
        )
      END,
      false
    ),
    COALESCE(
      CASE WHEN regexp_replace((payload->>'overdue_installments')::text, '[^0-9]+', '', 'g') ~ '^[0-9]+$'
           THEN regexp_replace((payload->>'overdue_installments')::text, '[^0-9]+', '', 'g')::INTEGER
           ELSE NULL END
    , 0),
    COALESCE(
      CASE WHEN regexp_replace((payload->>'overdue_days')::text, '[^0-9]+', '', 'g') ~ '^[0-9]+$'
           THEN regexp_replace((payload->>'overdue_days')::text, '[^0-9]+', '', 'g')::INTEGER
           ELSE NULL END
    , 0),
    COALESCE(
      CASE WHEN regexp_replace((payload->>'cross_sell_count')::text, '[^0-9]+', '', 'g') ~ '^[0-9]+$'
           THEN regexp_replace((payload->>'cross_sell_count')::text, '[^0-9]+', '', 'g')::INTEGER
           ELSE NULL END
    , 0),
    COALESCE((payload->>'meetings_enabled')::BOOLEAN, false),
    COALESCE((payload->>'last_meeting')::TEXT, 'Nunca'),
    COALESCE((payload->>'has_scheduled_meeting')::BOOLEAN, false),
    COALESCE((payload->>'app_usage')::TEXT, 'Nunca usou'),
    COALESCE((payload->>'payment_status')::TEXT, 'Em dia'),
    COALESCE((payload->>'has_referrals')::BOOLEAN, false),
    COALESCE((payload->>'nps_score')::TEXT, 'Não avaliado'),
    COALESCE((payload->>'ecosystem_usage')::TEXT, 'Não usa'),
    -- identity_key: telefone normalizado (só dígitos) -> e-mail -> hash(name|planner)
    COALESCE(
      NULLIF(NULLIF(
        CASE 
          WHEN (payload->>'phone')::text ~* 'e\+|,' THEN NULL
          ELSE (
            CASE WHEN length(regexp_replace((payload->>'phone')::text, '[^0-9]+', '', 'g')) >= 9
                 THEN regexp_replace((payload->>'phone')::text, '[^0-9]+', '', 'g')
                 ELSE NULL END
          )
        END
      , ''), '0'),
      NULLIF(NULLIF(lower(trim((payload->>'email')::text)), ''), '0'),
      md5(lower(trim((payload->>'name')::text)) || '|' || lower(trim((payload->>'planner')::text)))
    ),
    TRUE,
    p_seen_at
  )
  ON CONFLICT (identity_key)
  DO UPDATE SET
    phone = EXCLUDED.phone,
    email = EXCLUDED.email,
    leader = EXCLUDED.leader,
    mediator = EXCLUDED.mediator,
    manager = EXCLUDED.manager,
    is_spouse = EXCLUDED.is_spouse,
    months_since_closing = EXCLUDED.months_since_closing,
    nps_score_v3 = EXCLUDED.nps_score_v3,
    has_nps_referral = EXCLUDED.has_nps_referral,
    overdue_installments = EXCLUDED.overdue_installments,
    overdue_days = EXCLUDED.overdue_days,
    cross_sell_count = GREATEST(EXCLUDED.cross_sell_count, clients.cross_sell_count),
    meetings_enabled = EXCLUDED.meetings_enabled,
    last_meeting = EXCLUDED.last_meeting,
    has_scheduled_meeting = EXCLUDED.has_scheduled_meeting,
    app_usage = EXCLUDED.app_usage,
    payment_status = EXCLUDED.payment_status,
    has_referrals = EXCLUDED.has_referrals,
    nps_score = EXCLUDED.nps_score,
    ecosystem_usage = EXCLUDED.ecosystem_usage,
    planner = EXCLUDED.planner, -- se o cliente mudar de planejador, atualiza
    is_active = TRUE,
    last_seen_at = p_seen_at
  RETURNING * INTO result;

  -- Registrar health score no histórico (agora inclui cônjuges também)
  PERFORM record_health_score_history_v3(result.id, p_import_date);

  RETURN result;
END;
$$ LANGUAGE plpgsql;

