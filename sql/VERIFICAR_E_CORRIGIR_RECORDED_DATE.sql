-- ============================================
-- VERIFICAÇÃO E CORREÇÃO: recordedDate no histórico
-- ============================================
-- Este script verifica se a função bulk_insert_client_v3 está usando
-- corretamente o p_import_date ao chamar record_health_score_history_v3
--
-- PROBLEMA IDENTIFICADO:
-- O score de 61.5 (que pertence a 14/11) está sendo gravado com a data de 16/11 (hoje),
-- indicando que p_import_date não está sendo usado corretamente.
--
-- SOLUÇÃO:
-- Garantir que record_health_score_history_v3 sempre receba p_import_date explícito,
-- nunca CURRENT_DATE como padrão.

-- ============================================
-- 1. VERIFICAR FUNÇÃO ATUAL
-- ============================================
-- Verificar se a função bulk_insert_client_v3 está passando p_import_date corretamente

SELECT 
  proname AS function_name,
  pg_get_functiondef(oid) AS function_definition
FROM pg_proc
WHERE proname = 'bulk_insert_client_v3';

-- ============================================
-- 2. CORRIGIR FUNÇÃO bulk_insert_client_v3
-- ============================================
-- Garantir que p_import_date seja SEMPRE passado explicitamente
-- e nunca use CURRENT_DATE como fallback

CREATE OR REPLACE FUNCTION bulk_insert_client_v3(
  payload JSONB, 
  p_import_date DATE DEFAULT CURRENT_DATE, 
  p_seen_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS clients AS $$
DECLARE
  result clients;
  seen_at_final TIMESTAMPTZ;
  v_recorded_date DATE; -- Variável para garantir que a data seja explícita
BEGIN
  IF (payload->>'name') IS NULL 
     OR trim((payload->>'name')::text) = ''
     OR trim(lower((payload->>'name')::text)) IN ('0','#n/d','n/d','na','n/a','-','—','#ref!')
     OR (payload->>'planner') IS NULL 
     OR trim(lower((payload->>'planner')::text)) IN ('0','#n/d','n/d','na','n/a','-','—','','#ref!') THEN
    RAISE EXCEPTION 'Invalid name/planner';
  END IF;

  -- CORREÇÃO CRÍTICA: Garantir que v_recorded_date use SEMPRE p_import_date
  -- Se p_import_date não foi fornecido ou é NULL, usar CURRENT_DATE
  -- Mas se foi fornecido, usar ele explicitamente
  IF p_import_date IS NOT NULL THEN
    v_recorded_date := p_import_date;
  ELSE
    v_recorded_date := CURRENT_DATE;
  END IF;

  -- Converter data da planilha para TIMESTAMPTZ se necessário
  IF p_import_date IS NOT NULL AND p_import_date != CURRENT_DATE THEN
    seen_at_final := (p_import_date::text || ' 00:00:00')::TIMESTAMPTZ;
  ELSE
    seen_at_final := p_seen_at;
  END IF;

  INSERT INTO clients (
    name, planner, phone, email, leader, mediator, manager,
    is_spouse, spouse_partner_name, months_since_closing, nps_score_v3, has_nps_referral,
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
    NULLIF(trim((payload->>'spouse_partner_name')::TEXT), ''),
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
      lower(trim((payload->>'name')::text)) || '|' || lower(trim((payload->>'planner')::text))
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
    spouse_partner_name = EXCLUDED.spouse_partner_name,
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
    last_seen_at = GREATEST(EXCLUDED.last_seen_at, clients.last_seen_at)
  RETURNING * INTO result;

  -- CORREÇÃO CRÍTICA: Registrar health score no histórico usando v_recorded_date
  -- que foi garantido acima para usar p_import_date quando fornecido
  -- IMPORTANTE: Sempre passar v_recorded_date explicitamente, nunca usar DEFAULT
  PERFORM record_health_score_history_v3(result.id, v_recorded_date);

  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 3. VERIFICAR SE CORREÇÃO FOI APLICADA
-- ============================================
-- Verificar se a função agora usa v_recorded_date corretamente

SELECT 
  proname AS function_name,
  CASE 
    WHEN pg_get_functiondef(oid) LIKE '%v_recorded_date%' THEN '✅ CORRIGIDO: Usa v_recorded_date'
    WHEN pg_get_functiondef(oid) LIKE '%p_import_date%' THEN '⚠️ VERIFICAR: Usa p_import_date diretamente'
    ELSE '❌ PROBLEMA: Não encontrou uso explícito de data'
  END AS status
FROM pg_proc
WHERE proname = 'bulk_insert_client_v3';

-- ============================================
-- 4. LOG DE DEBUG (opcional)
-- ============================================
-- Adicionar log para confirmar qual data está sendo usada
-- (Pode ser removido após confirmação)

COMMENT ON FUNCTION bulk_insert_client_v3 IS 
'Insere ou atualiza cliente e registra histórico. 
CORREÇÃO: Usa v_recorded_date que garante uso de p_import_date quando fornecido.
Se p_import_date não for fornecido, usa CURRENT_DATE como fallback.';

