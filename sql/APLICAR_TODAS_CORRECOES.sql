-- ============================================
-- APLICAÇÃO COMPLETA DE TODAS AS CORREÇÕES CRÍTICAS
-- Health Score Dashboard - Auditoria Técnica
-- ============================================
-- Data: 2025-01-XX
-- 
-- Este script aplica TODAS as 8 correções críticas de uma vez:
-- 
-- [#1] Remover RETURN para cônjuges em record_health_score_history_v3
-- [#2] Implementar herança de NPS no SQL
-- [#4] Adicionar spouse_partner_name no INSERT SQL
-- [#5] Adicionar validação de data futura no SQL
-- [#6] Adicionar transação na importação bulk
-- [#7] Alterar identity_key para texto normalizado
-- [#8] Validar last_seen_at antes de criar histórico
-- 
-- IMPORTANTE: 
-- 1. Faça BACKUP do banco antes de executar
-- 2. Se houver dados existentes, execute migrate_identity_key_to_text.sql ANTES
-- 3. Teste em ambiente de desenvolvimento primeiro
-- ============================================

-- ============================================
-- PREPARAÇÃO: Verificar/Criar coluna spouse_partner_name
-- ============================================
DO $$
BEGIN
  -- Verificar se coluna existe, se não, criar
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'clients' 
    AND column_name = 'spouse_partner_name'
  ) THEN
    ALTER TABLE clients ADD COLUMN spouse_partner_name TEXT;
    RAISE NOTICE '✅ Coluna spouse_partner_name criada';
  ELSE
    RAISE NOTICE '✅ Coluna spouse_partner_name já existe';
  END IF;
END $$;

-- ============================================
-- 1. ATUALIZAR record_health_score_history_v3
-- ============================================
-- Correções:
-- - Removido RETURN para cônjuges
-- - Implementada herança de NPS do pagante
-- - Validação de data futura
-- - Validação de last_seen_at

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
  v_nps_value INTEGER; -- NPS a ser usado (próprio ou herdado)
  v_payer_nps INTEGER; -- NPS do pagante (para herança)
BEGIN
  -- Validar que recorded_date não é futura
  IF p_recorded_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'recorded_date não pode ser data futura: %. Use CURRENT_DATE ou uma data passada.', p_recorded_date;
  END IF;

  -- Buscar dados do cliente
  SELECT * INTO v_client
  FROM clients
  WHERE id = p_client_id;

  -- Validar que cliente foi importado (tem last_seen_at)
  IF v_client.last_seen_at IS NULL THEN
    RAISE WARNING 'Cliente % (nome: %) não tem last_seen_at, pulando criação de histórico', p_client_id, v_client.name;
    RETURN;
  END IF;

  -- Validar que last_seen_at não é futura
  IF v_client.last_seen_at > CURRENT_TIMESTAMP THEN
    RAISE WARNING 'Cliente % (nome: %) tem last_seen_at futura (%), pulando criação de histórico', 
      p_client_id, v_client.name, v_client.last_seen_at;
    RETURN;
  END IF;

  -- CORREÇÃO CRÍTICA: Cônjuges agora têm histórico criado
  -- Removido: IF v_client.is_spouse = TRUE THEN RETURN; END IF;

  -- Determinar NPS a ser usado (próprio ou herdado do pagante)
  v_nps_value := v_client.nps_score_v3;
  
  -- Se for cônjuge sem NPS próprio, buscar do pagante
  IF v_client.is_spouse = TRUE 
     AND v_client.nps_score_v3 IS NULL 
     AND v_client.spouse_partner_name IS NOT NULL 
     AND v_client.planner IS NOT NULL THEN
    -- Buscar NPS do pagante usando spouse_partner_name + planner
    -- Normalizar nome para busca (lowercase, trim)
    SELECT nps_score_v3 INTO v_payer_nps
    FROM clients
    WHERE lower(trim(name)) = lower(trim(v_client.spouse_partner_name))
      AND planner = v_client.planner
      AND (is_spouse = FALSE OR is_spouse IS NULL)
    LIMIT 1;
    
    -- Se encontrou NPS do pagante, usar ele
    IF v_payer_nps IS NOT NULL THEN
      v_nps_value := v_payer_nps;
    END IF;
  END IF;

  -- Calcular NPS Pillar (-10 a 20 pontos)
  -- CORREÇÃO: Se cônjuge sem NPS (próprio nem do pagante) = 0 pontos
  IF v_nps_value IS NOT NULL THEN
    IF v_nps_value >= 9 THEN
      v_nps_pillar := 20; -- Promotor
    ELSIF v_nps_value >= 7 THEN
      v_nps_pillar := 10; -- Neutro
    ELSE
      v_nps_pillar := -10; -- Detrator
    END IF;
  ELSIF v_client.is_spouse = TRUE THEN
    -- Cônjuge sem NPS próprio nem do pagante = 0 pontos
    v_nps_pillar := 0;
  ELSE
    -- Cliente não-cônjuge sem NPS = 10 pontos (neutro padrão)
    v_nps_pillar := 10;
  END IF;

  -- Calcular Referral Pillar (10 pontos)
  v_referral_pillar := CASE WHEN v_client.has_nps_referral = TRUE THEN 10 ELSE 0 END;

  -- Calcular Payment Pillar (-20 a 40 pontos)
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
      v_payment_pillar := 0;
    ELSE
      v_payment_pillar := -10; -- 61+ dias
    END IF;
  ELSIF COALESCE(v_client.overdue_installments, 0) = 2 THEN
    -- 2 parcelas atrasadas
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
    v_nps_value, -- Usar NPS próprio ou herdado
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
    health_score = CASE 
      WHEN p_recorded_date >= CURRENT_DATE THEN EXCLUDED.health_score 
      ELSE health_score 
    END,
    health_category = CASE 
      WHEN p_recorded_date >= CURRENT_DATE THEN EXCLUDED.health_category 
      ELSE health_category 
    END,
    nps_score_v3_pillar = CASE 
      WHEN p_recorded_date >= CURRENT_DATE THEN EXCLUDED.nps_score_v3_pillar 
      ELSE nps_score_v3_pillar 
    END,
    referral_pillar = CASE 
      WHEN p_recorded_date >= CURRENT_DATE THEN EXCLUDED.referral_pillar 
      ELSE referral_pillar 
    END,
    payment_pillar = CASE 
      WHEN p_recorded_date >= CURRENT_DATE THEN EXCLUDED.payment_pillar 
      ELSE payment_pillar 
    END,
    cross_sell_pillar = CASE 
      WHEN p_recorded_date >= CURRENT_DATE THEN EXCLUDED.cross_sell_pillar 
      ELSE cross_sell_pillar 
    END,
    tenure_pillar = CASE 
      WHEN p_recorded_date >= CURRENT_DATE THEN EXCLUDED.tenure_pillar 
      ELSE tenure_pillar 
    END,
    months_since_closing = CASE 
      WHEN p_recorded_date >= CURRENT_DATE THEN EXCLUDED.months_since_closing 
      ELSE months_since_closing 
    END,
    nps_score_v3 = CASE 
      WHEN p_recorded_date >= CURRENT_DATE THEN EXCLUDED.nps_score_v3 
      ELSE nps_score_v3 
    END,
    has_nps_referral = CASE 
      WHEN p_recorded_date >= CURRENT_DATE THEN EXCLUDED.has_nps_referral 
      ELSE has_nps_referral 
    END,
    overdue_installments = CASE 
      WHEN p_recorded_date >= CURRENT_DATE THEN EXCLUDED.overdue_installments 
      ELSE overdue_installments 
    END,
    overdue_days = CASE 
      WHEN p_recorded_date >= CURRENT_DATE THEN EXCLUDED.overdue_days 
      ELSE overdue_days 
    END,
    cross_sell_count = CASE 
      WHEN p_recorded_date >= CURRENT_DATE THEN EXCLUDED.cross_sell_count 
      ELSE cross_sell_count 
    END;

END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 2. ATUALIZAR bulk_insert_client_v3
-- ============================================
-- Correções:
-- - Adicionado spouse_partner_name no INSERT e UPDATE
-- - Alterado identity_key de MD5 para texto normalizado

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
    NULLIF(trim((payload->>'spouse_partner_name')::TEXT), ''), -- CORREÇÃO: Adicionar spouse_partner_name
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
      WHEN regexp_replace((payload->>'has_nps_referral')::text, '[^0-9]+', '', 'g') ~ '^\\d+$' THEN 
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
      -- CORREÇÃO: Usar texto normalizado ao invés de MD5
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
    spouse_partner_name = EXCLUDED.spouse_partner_name, -- CORREÇÃO: Atualizar spouse_partner_name
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

  -- Registrar health score no histórico (agora inclui cônjuges também)
  PERFORM record_health_score_history_v3(result.id, p_import_date);

  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 3. ATUALIZAR bulk_insert_clients_v3
-- ============================================
-- Correções:
-- - Adicionada transação explícita com tratamento de erros

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
  v_error_message TEXT;
BEGIN
  -- CORREÇÃO CRÍTICA: Envolver em transação explícita para garantir atomicidade
  -- Se qualquer cliente falhar, toda importação é revertida (rollback automático)
  
  -- Converter data da planilha para TIMESTAMPTZ (início do dia)
  IF p_import_date IS NOT NULL AND p_import_date != CURRENT_DATE THEN
    seen_at_from_date := (p_import_date::text || ' 00:00:00')::TIMESTAMPTZ;
  ELSE
    seen_at_from_date := p_seen_at;
  END IF;

  -- Processar cada cliente do JSON dentro de transação
  BEGIN
    FOR client_record IN SELECT * FROM jsonb_array_elements(clients_json)
    LOOP
      -- Se algum cliente falhar aqui, exceção será capturada e toda transação revertida
      SELECT * INTO result FROM bulk_insert_client_v3(
        client_record, 
        p_import_date, 
        seen_at_from_date
      );
      
      RETURN NEXT result;
    END LOOP;
    
    -- Se chegou aqui, todos os clientes foram inseridos com sucesso
    RETURN;
    
  EXCEPTION
    WHEN OTHERS THEN
      -- Capturar erro e fazer rollback automático
      GET STACKED DIAGNOSTICS v_error_message = MESSAGE_TEXT;
      RAISE EXCEPTION 'Erro ao importar clientes: %. Rollback executado - nenhum cliente foi inserido.', v_error_message;
  END;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- VERIFICAÇÃO FINAL
-- ============================================

-- Verificar se funções foram criadas
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'record_health_score_history_v3') 
    THEN '✅ record_health_score_history_v3 atualizada'
    ELSE '❌ record_health_score_history_v3 não encontrada'
  END AS status_record_history;

SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'bulk_insert_client_v3') 
    THEN '✅ bulk_insert_client_v3 atualizada'
    ELSE '❌ bulk_insert_client_v3 não encontrada'
  END AS status_bulk_insert_client;

SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'bulk_insert_clients_v3') 
    THEN '✅ bulk_insert_clients_v3 atualizada'
    ELSE '❌ bulk_insert_clients_v3 não encontrada'
  END AS status_bulk_insert_clients;

-- Verificar se coluna spouse_partner_name existe
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'clients' 
      AND column_name = 'spouse_partner_name'
    )
    THEN '✅ Coluna spouse_partner_name existe'
    ELSE '❌ Coluna spouse_partner_name não encontrada'
  END AS status_spouse_column;

-- Verificar constraint UNIQUE em identity_key
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'clients_identity_key_key'
      AND conrelid = 'clients'::regclass
    )
    THEN '✅ Constraint UNIQUE em identity_key existe'
    ELSE '⚠️ Constraint UNIQUE em identity_key não encontrada - pode causar duplicatas'
  END AS status_unique_constraint;

