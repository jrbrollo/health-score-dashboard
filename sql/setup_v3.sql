-- Script para migração Health Score v3
-- Execute este script no SQL Editor do Supabase

-- ============================================
-- MIGRAÇÃO DA TABELA CLIENTS PARA V3
-- ============================================

-- Adicionar novas colunas à tabela clients existente
ALTER TABLE clients 
  -- Dados pessoais
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS is_spouse BOOLEAN DEFAULT FALSE,
  
  -- Hierarquia comercial
  ADD COLUMN IF NOT EXISTS leader TEXT,
  ADD COLUMN IF NOT EXISTS mediator TEXT,
  ADD COLUMN IF NOT EXISTS manager TEXT,
  
  -- Métricas v3
  ADD COLUMN IF NOT EXISTS months_since_closing INTEGER,
  ADD COLUMN IF NOT EXISTS nps_score_v3 INTEGER, -- 0-10 ou NULL para "Não Encontrou"
  ADD COLUMN IF NOT EXISTS has_nps_referral BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS overdue_installments INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overdue_days INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cross_sell_count INTEGER DEFAULT 0,
  
  -- Campos de reunião (preparados para versão futura, não usados agora)
  ADD COLUMN IF NOT EXISTS last_meeting_v3 TEXT,
  ADD COLUMN IF NOT EXISTS has_scheduled_meeting_v3 BOOLEAN,
  ADD COLUMN IF NOT EXISTS meetings_enabled BOOLEAN DEFAULT FALSE,
  
  -- Identidade e atividade
  ADD COLUMN IF NOT EXISTS identity_key TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP WITH TIME ZONE;

-- Criar índices para as novas colunas
CREATE INDEX IF NOT EXISTS idx_clients_is_spouse ON clients(is_spouse);
CREATE INDEX IF NOT EXISTS idx_clients_manager ON clients(manager);
CREATE INDEX IF NOT EXISTS idx_clients_mediator ON clients(mediator);
CREATE INDEX IF NOT EXISTS idx_clients_leader ON clients(leader);
CREATE INDEX IF NOT EXISTS idx_clients_months_since_closing ON clients(months_since_closing);
CREATE INDEX IF NOT EXISTS idx_clients_overdue_installments ON clients(overdue_installments);

-- Removido: índice único por (planner, name) não é mais usado; usamos identity_key
-- DROP INDEX IF EXISTS uniq_clients_planner_name;

-- Índice único por identidade (preferível) quando identity_key estiver populado
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uniq_clients_identity_key'
  ) THEN
    CREATE UNIQUE INDEX uniq_clients_identity_key ON clients(identity_key) WHERE identity_key IS NOT NULL AND identity_key <> '';
  END IF;
END $$;

-- ============================================
-- RPC: FINALIZAÇÃO DO DIA (inativar não importados)
-- ============================================

CREATE OR REPLACE FUNCTION end_of_day_finalize(imported_identity_keys TEXT[])
RETURNS JSON AS $$
DECLARE
  deactivated_count INTEGER := 0;
  reactivated_count INTEGER := 0;
BEGIN
  -- Reativar os que vieram hoje
  UPDATE clients
  SET is_active = TRUE,
      last_seen_at = NOW()
  WHERE identity_key IS NOT NULL
    AND identity_key <> ''
    AND (imported_identity_keys IS NOT NULL AND identity_key = ANY(imported_identity_keys))
    AND (is_active IS DISTINCT FROM TRUE);
  GET DIAGNOSTICS reactivated_count = ROW_COUNT;

  -- Inativar os que não vieram hoje (e que já foram vistos antes de hoje)
  UPDATE clients
  SET is_active = FALSE
  WHERE identity_key IS NOT NULL
    AND identity_key <> ''
    AND (imported_identity_keys IS NULL OR NOT (identity_key = ANY(imported_identity_keys)))
    AND (last_seen_at IS NULL OR last_seen_at::date < CURRENT_DATE)
    AND is_active IS DISTINCT FROM FALSE;
  GET DIAGNOSTICS deactivated_count = ROW_COUNT;

  RETURN json_build_object(
    'reactivated', reactivated_count,
    'deactivated', deactivated_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Versão por data (usa last_seen_at = p_import_date)
CREATE OR REPLACE FUNCTION end_of_day_finalize_by_date(p_import_date DATE)
RETURNS JSON AS $$
DECLARE
  deactivated_count INTEGER := 0;
BEGIN
  UPDATE clients
  SET is_active = FALSE
  WHERE (last_seen_at IS NULL OR last_seen_at::date <> p_import_date)
    AND is_active IS DISTINCT FROM FALSE;

  GET DIAGNOSTICS deactivated_count = ROW_COUNT;

  RETURN json_build_object(
    'import_date', p_import_date,
    'deactivated', deactivated_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNÇÃO DE CÁLCULO HEALTH SCORE V3
-- ============================================

CREATE OR REPLACE FUNCTION calculate_health_score_v3(
  p_nps_score INTEGER,
  p_has_nps_referral BOOLEAN,
  p_overdue_installments INTEGER,
  p_overdue_days INTEGER,
  p_cross_sell_count INTEGER,
  p_months_since_closing INTEGER
) RETURNS JSON AS $$
DECLARE
  nps_points INTEGER := 0;
  referral_points INTEGER := 0;
  payment_points INTEGER := 0;
  cross_sell_points INTEGER := 0;
  tenure_points INTEGER := 0;
  total_score INTEGER := 0;
  category TEXT := '';
BEGIN
  -- ============================================
  -- 1. NPS (20 pontos máx)
  -- ============================================
  IF p_nps_score IS NULL THEN
    -- "Não Encontrou" = neutro (cliente novo < 6 meses ou cônjuge)
    nps_points := 10;
  ELSIF p_nps_score >= 9 THEN
    -- Promotor
    nps_points := 20;
  ELSIF p_nps_score >= 7 THEN
    -- Neutro
    nps_points := 10;
  ELSE
    -- Detrator (0-6)
    nps_points := 0;
  END IF;

  -- ============================================
  -- 2. Indicação NPS (10 pontos máx)
  -- ============================================
  IF p_has_nps_referral THEN
    referral_points := 10;
  ELSE
    referral_points := 0;
  END IF;

  -- ============================================
  -- 3. Inadimplência (40 pontos máx) - RIGOROSO
  -- ============================================
  
  -- Override: 3+ parcelas = score total 0
  IF p_overdue_installments >= 3 THEN
    RETURN json_build_object(
      'total', 0,
      'category', 'Crítico',
      'nps', 0,
      'referral', 0,
      'payment', 0,
      'cross_sell', 0,
      'tenure', 0
    );
  END IF;

  IF p_overdue_installments = 0 THEN
    -- Adimplente
    payment_points := 40;
  ELSIF p_overdue_installments = 1 THEN
    -- 1 parcela atrasada - penalizar por dias
    IF p_overdue_days <= 7 THEN
      payment_points := 25;
    ELSIF p_overdue_days <= 15 THEN
      payment_points := 15;
    ELSIF p_overdue_days <= 30 THEN
      payment_points := 5;
    ELSIF p_overdue_days <= 60 THEN
      payment_points := -5;
    ELSE
      payment_points := -15;
    END IF;
  ELSIF p_overdue_installments = 2 THEN
    -- 2 parcelas atrasadas - sempre penaliza
    payment_points := -10;
  END IF;

  -- ============================================
  -- 4. Cross Sell (15 pontos máx)
  -- ============================================
  IF p_cross_sell_count = 0 THEN
    cross_sell_points := 0;
  ELSIF p_cross_sell_count = 1 THEN
    cross_sell_points := 5;
  ELSIF p_cross_sell_count = 2 THEN
    cross_sell_points := 10;
  ELSE
    -- 3+ produtos
    cross_sell_points := 15;
  END IF;

  -- ============================================
  -- 5. Meses de Fechamento (15 pontos máx)
  -- ============================================
  IF p_months_since_closing IS NULL OR p_months_since_closing < 0 THEN
    tenure_points := 0;
  ELSIF p_months_since_closing <= 3 THEN
    -- Onboarding (0-3 meses)
    tenure_points := 5;
  ELSIF p_months_since_closing <= 6 THEN
    -- Consolidação inicial (4-6 meses)
    tenure_points := 10;
  ELSIF p_months_since_closing <= 12 THEN
    -- Consolidado (7-12 meses)
    tenure_points := 15;
  ELSIF p_months_since_closing <= 24 THEN
    -- Maduro (13-24 meses)
    tenure_points := 12;
  ELSE
    -- Fidelizado (25+ meses)
    tenure_points := 15;
  END IF;

  -- ============================================
  -- TOTAL (0-100, truncar se negativo)
  -- ============================================
  total_score := nps_points + referral_points + payment_points + cross_sell_points + tenure_points;
  
  -- Garantir que não fica negativo
  IF total_score < 0 THEN
    total_score := 0;
  END IF;

  -- ============================================
  -- CATEGORIZAÇÃO
  -- ============================================
  IF total_score >= 75 THEN
    category := 'Ótimo';
  ELSIF total_score >= 50 THEN
    category := 'Estável';
  ELSIF total_score >= 30 THEN
    category := 'Atenção';
  ELSE
    category := 'Crítico';
  END IF;

  RETURN json_build_object(
    'total', total_score,
    'category', category,
    'nps', nps_points,
    'referral', referral_points,
    'payment', payment_points,
    'cross_sell', cross_sell_points,
    'tenure', tenure_points
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================
-- ATUALIZAR TABELA DE HISTÓRICO TEMPORAL
-- ============================================

-- Adicionar novas colunas ao histórico
ALTER TABLE health_score_history
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS is_spouse BOOLEAN,
  ADD COLUMN IF NOT EXISTS leader TEXT,
  ADD COLUMN IF NOT EXISTS mediator TEXT,
  ADD COLUMN IF NOT EXISTS manager TEXT,
  ADD COLUMN IF NOT EXISTS months_since_closing INTEGER,
  ADD COLUMN IF NOT EXISTS nps_score_v3 INTEGER,
  ADD COLUMN IF NOT EXISTS has_nps_referral BOOLEAN,
  ADD COLUMN IF NOT EXISTS overdue_installments INTEGER,
  ADD COLUMN IF NOT EXISTS overdue_days INTEGER,
  ADD COLUMN IF NOT EXISTS cross_sell_count INTEGER;

-- Criar índices para hierarquia no histórico
CREATE INDEX IF NOT EXISTS idx_health_history_manager ON health_score_history(manager);
CREATE INDEX IF NOT EXISTS idx_health_history_mediator ON health_score_history(mediator);
CREATE INDEX IF NOT EXISTS idx_health_history_leader ON health_score_history(leader);

-- ============================================
-- FUNÇÃO PARA REGISTRAR HISTÓRICO V3
-- ============================================

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
    manager,
    mediator,
    leader,
    email,
    phone,
    is_spouse,
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
    CASE WHEN client_row.manager IS NULL OR trim(lower(client_row.manager)) IN ('#n/d','n/d','na','n/a','0','-','—','', '#ref!') THEN NULL ELSE client_row.manager END,
    CASE WHEN client_row.mediator IS NULL OR trim(lower(client_row.mediator)) IN ('#n/d','n/d','na','n/a','0','-','—','', '#ref!') THEN NULL ELSE client_row.mediator END,
    CASE WHEN client_row.leader IS NULL OR trim(lower(client_row.leader)) IN ('#n/d','n/d','na','n/a','0','-','—','', '#ref!') THEN NULL ELSE client_row.leader END,
    client_row.email,
    client_row.phone,
    client_row.is_spouse,
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
    manager = EXCLUDED.manager,
    mediator = EXCLUDED.mediator,
    leader = EXCLUDED.leader,
    email = EXCLUDED.email,
    phone = EXCLUDED.phone,
    is_spouse = EXCLUDED.is_spouse,
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

-- ============================================
-- ATUALIZAR TRIGGER PARA USAR V3
-- ============================================

CREATE OR REPLACE FUNCTION trigger_record_health_history_v3()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    PERFORM record_health_score_history_v3(NEW);
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Substituir trigger antigo
DROP TRIGGER IF EXISTS clients_health_history_trigger ON clients;
CREATE TRIGGER clients_health_history_trigger
  AFTER INSERT OR UPDATE ON clients
  FOR EACH ROW
  EXECUTE FUNCTION trigger_record_health_history_v3();

-- ============================================
-- VERIFICAÇÃO
-- ============================================

SELECT 
  'Migração v3 concluída!' as status,
  COUNT(*) as total_columns
FROM information_schema.columns 
WHERE table_name = 'clients';

