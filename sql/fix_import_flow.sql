-- ============================================
-- CORREÇÕES PARA FLUXO DE IMPORTAÇÃO DIÁRIA
-- ============================================
-- Data: 2025-11-13
-- Objetivo: Garantir histórico fidedigno com importação diária de planilhas CSV
--
-- Correções aplicadas:
-- 1. Desabilitar trigger automático (não há edição manual)
-- 2. Usar data da planilha em last_seen_at com proteção GREATEST
-- 3. Garantir que histórico use sempre a data da planilha
-- ============================================

-- ============================================
-- 1. DESABILITAR TRIGGER AUTOMÁTICO
-- ============================================
-- Como não há mais edição manual de clientes, o trigger pode causar
-- registros duplicados no histórico. Desabilitamos para evitar isso.

DROP TRIGGER IF EXISTS clients_health_history_trigger ON clients;

-- Comentário explicativo
COMMENT ON TRIGGER clients_health_history_trigger ON clients IS 
'Trigger desabilitado - histórico é registrado manualmente durante bulk import com data correta da planilha';

-- ============================================
-- 2. CRIAR/ATUALIZAR FUNÇÃO bulk_insert_clients_v3
-- ============================================
-- Esta função é chamada pelo frontend e deve:
-- - Usar data da planilha em last_seen_at (com proteção GREATEST)
-- - Registrar histórico com data da planilha
-- - Converter p_import_date para TIMESTAMPTZ para last_seen_at

CREATE OR REPLACE FUNCTION bulk_insert_clients_v3(
  clients_json JSONB, 
  p_import_date DATE DEFAULT CURRENT_DATE, 
  p_seen_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS SETOF clients AS $$
DECLARE
  client_record JSONB;
  result clients;
  seen_at_from_date TIMESTAMPTZ;
BEGIN
  -- Converter data da planilha para TIMESTAMPTZ (início do dia)
  -- Se p_import_date foi fornecido, usar ele; senão usar p_seen_at
  IF p_import_date IS NOT NULL AND p_import_date != CURRENT_DATE THEN
    seen_at_from_date := (p_import_date::text || ' 00:00:00')::TIMESTAMPTZ;
  ELSE
    seen_at_from_date := p_seen_at;
  END IF;

  -- Processar cada cliente do JSON
  FOR client_record IN SELECT * FROM jsonb_array_elements(clients_json)
  LOOP
    -- Chamar função singular que faz o upsert
    SELECT * INTO result FROM bulk_insert_client_v3(
      client_record, 
      p_import_date, 
      seen_at_from_date
    );
    
    RETURN NEXT result;
  END LOOP;
  
  RETURN;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 3. ATUALIZAR bulk_insert_client_v3
-- ============================================
-- Modificar para usar GREATEST em last_seen_at (proteção contra retrocesso)

CREATE OR REPLACE FUNCTION bulk_insert_client_v3(
  payload JSONB, 
  p_import_date DATE DEFAULT CURRENT_DATE, 
  p_seen_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS clients AS $$
DECLARE
  result clients;
  seen_at_final TIMESTAMPTZ;
BEGIN
  IF (payload->>'name') IS NULL 
     OR trim((payload->>'name')::text) = ''
     OR trim(lower((payload->>'name')::text)) IN ('0','#n/d','n/d','na','n/a','-','—','#ref!')
     OR (payload->>'planner') IS NULL 
     OR trim(lower((payload->>'planner')::text)) IN ('0','#n/d','n/d','na','n/a','-','—','','#ref!') THEN
    RAISE EXCEPTION 'Invalid name/planner';
  END IF;

  -- Converter data da planilha para TIMESTAMPTZ se necessário
  IF p_import_date IS NOT NULL AND p_import_date != CURRENT_DATE THEN
    seen_at_final := (p_import_date::text || ' 00:00:00')::TIMESTAMPTZ;
  ELSE
    seen_at_final := p_seen_at;
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
    seen_at_final
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
    planner = EXCLUDED.planner,
    is_active = TRUE,
    -- IMPORTANTE: Usar GREATEST para proteger contra retrocesso de data
    -- Só atualiza last_seen_at se a nova data for >= data atual
    last_seen_at = GREATEST(EXCLUDED.last_seen_at, clients.last_seen_at)
  RETURNING * INTO result;

  -- Registrar health score no histórico (agora inclui cônjuges também)
  -- IMPORTANTE: Usar p_import_date (data da planilha), não CURRENT_DATE
  PERFORM record_health_score_history_v3(result.id, p_import_date);

  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- VERIFICAÇÃO
-- ============================================
-- Verificar se trigger foi desabilitado
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_trigger 
      WHERE tgname = 'clients_health_history_trigger' 
      AND tgenabled = 'D'
    ) THEN '✅ Trigger desabilitado corretamente'
    WHEN NOT EXISTS (
      SELECT 1 FROM pg_trigger 
      WHERE tgname = 'clients_health_history_trigger'
    ) THEN '✅ Trigger não existe (já estava desabilitado ou foi removido)'
    ELSE '⚠️ Trigger ainda está habilitado'
  END AS trigger_status;

-- Verificar se funções foram criadas
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'bulk_insert_clients_v3') 
    THEN '✅ Função bulk_insert_clients_v3 criada'
    ELSE '❌ Função bulk_insert_clients_v3 não encontrada'
  END AS function_status;

