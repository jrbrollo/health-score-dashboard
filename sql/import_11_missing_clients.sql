-- Script para importar os 11 clientes faltantes identificados
-- Alguns têm planner "#n/d" que foi filtrado na validação
-- Vamos importá-los com planner NULL quando for "#n/d"

DO $$
DECLARE
  v_import_date DATE := '2025-11-13';
  v_seen_at TIMESTAMPTZ := '2025-11-13 00:00:00'::TIMESTAMPTZ;
  v_result RECORD;
  v_count INTEGER := 0;
BEGIN
  -- Lista dos 11 clientes faltantes
  -- Para clientes com planner "#n/d", vamos usar "Sem Planejador"
  FOR v_result IN
    SELECT * FROM bulk_insert_client_v3(
      jsonb_build_object(
        'name', 'Adriano de Oliveira Neres Ribeiro',
        'planner', 'Sem Planejador', -- "#n/d" convertido para valor válido
        'phone', NULL,
        'email', NULL,
        'leader', NULL,
        'mediator', NULL,
        'manager', NULL,
        'is_spouse', false,
        'months_since_closing', NULL,
        'nps_score_v3', NULL,
        'has_nps_referral', false,
        'overdue_installments', 0,
        'overdue_days', 0,
        'cross_sell_count', 0,
        'meetings_enabled', false,
        'last_meeting', NULL,
        'has_scheduled_meeting', false,
        'app_usage', NULL,
        'payment_status', NULL,
        'has_referrals', false,
        'nps_score', NULL,
        'ecosystem_usage', NULL
      ),
      v_import_date,
      v_seen_at
    )
  LOOP
    v_count := v_count + 1;
  END LOOP;

  FOR v_result IN
    SELECT * FROM bulk_insert_client_v3(
      jsonb_build_object(
        'name', 'Gabriela Bernardes Ferreira',
        'planner', 'Maria Vitória Ferreira Cotrim',
        'phone', NULL,
        'email', NULL,
        'leader', NULL,
        'mediator', NULL,
        'manager', NULL,
        'is_spouse', false,
        'months_since_closing', NULL,
        'nps_score_v3', NULL,
        'has_nps_referral', false,
        'overdue_installments', 0,
        'overdue_days', 0,
        'cross_sell_count', 0,
        'meetings_enabled', false,
        'last_meeting', NULL,
        'has_scheduled_meeting', false,
        'app_usage', NULL,
        'payment_status', NULL,
        'has_referrals', false,
        'nps_score', NULL,
        'ecosystem_usage', NULL
      ),
      v_import_date,
      v_seen_at
    )
  LOOP
    v_count := v_count + 1;
  END LOOP;

  FOR v_result IN
    SELECT * FROM bulk_insert_client_v3(
      jsonb_build_object(
        'name', 'Gabriela Schaefer',
        'planner', 'Sem Planejador', -- "#n/d" convertido para valor válido
        'phone', NULL,
        'email', NULL,
        'leader', NULL,
        'mediator', NULL,
        'manager', NULL,
        'is_spouse', false,
        'months_since_closing', NULL,
        'nps_score_v3', NULL,
        'has_nps_referral', false,
        'overdue_installments', 0,
        'overdue_days', 0,
        'cross_sell_count', 0,
        'meetings_enabled', false,
        'last_meeting', NULL,
        'has_scheduled_meeting', false,
        'app_usage', NULL,
        'payment_status', NULL,
        'has_referrals', false,
        'nps_score', NULL,
        'ecosystem_usage', NULL
      ),
      v_import_date,
      v_seen_at
    )
  LOOP
    v_count := v_count + 1;
  END LOOP;

  FOR v_result IN
    SELECT * FROM bulk_insert_client_v3(
      jsonb_build_object(
        'name', 'Giovanni Bruno Gentil',
        'planner', 'Sem Planejador', -- "#n/d" convertido para valor válido
        'phone', NULL,
        'email', NULL,
        'leader', NULL,
        'mediator', NULL,
        'manager', NULL,
        'is_spouse', false,
        'months_since_closing', NULL,
        'nps_score_v3', NULL,
        'has_nps_referral', false,
        'overdue_installments', 0,
        'overdue_days', 0,
        'cross_sell_count', 0,
        'meetings_enabled', false,
        'last_meeting', NULL,
        'has_scheduled_meeting', false,
        'app_usage', NULL,
        'payment_status', NULL,
        'has_referrals', false,
        'nps_score', NULL,
        'ecosystem_usage', NULL
      ),
      v_import_date,
      v_seen_at
    )
  LOOP
    v_count := v_count + 1;
  END LOOP;

  FOR v_result IN
    SELECT * FROM bulk_insert_client_v3(
      jsonb_build_object(
        'name', 'João Victor Fernandes da Silva',
        'planner', '9',
        'phone', NULL,
        'email', NULL,
        'leader', NULL,
        'mediator', NULL,
        'manager', NULL,
        'is_spouse', false,
        'months_since_closing', NULL,
        'nps_score_v3', NULL,
        'has_nps_referral', false,
        'overdue_installments', 0,
        'overdue_days', 0,
        'cross_sell_count', 0,
        'meetings_enabled', false,
        'last_meeting', NULL,
        'has_scheduled_meeting', false,
        'app_usage', NULL,
        'payment_status', NULL,
        'has_referrals', false,
        'nps_score', NULL,
        'ecosystem_usage', NULL
      ),
      v_import_date,
      v_seen_at
    )
  LOOP
    v_count := v_count + 1;
  END LOOP;

  FOR v_result IN
    SELECT * FROM bulk_insert_client_v3(
      jsonb_build_object(
        'name', 'Karen Cristina de Araújo Ornelas',
        'planner', 'Felipe Marques Matias',
        'phone', NULL,
        'email', NULL,
        'leader', NULL,
        'mediator', NULL,
        'manager', NULL,
        'is_spouse', false,
        'months_since_closing', NULL,
        'nps_score_v3', NULL,
        'has_nps_referral', false,
        'overdue_installments', 0,
        'overdue_days', 0,
        'cross_sell_count', 0,
        'meetings_enabled', false,
        'last_meeting', NULL,
        'has_scheduled_meeting', false,
        'app_usage', NULL,
        'payment_status', NULL,
        'has_referrals', false,
        'nps_score', NULL,
        'ecosystem_usage', NULL
      ),
      v_import_date,
      v_seen_at
    )
  LOOP
    v_count := v_count + 1;
  END LOOP;

  FOR v_result IN
    SELECT * FROM bulk_insert_client_v3(
      jsonb_build_object(
        'name', 'Keylla Aguiar dos Santos',
        'planner', 'Vinicius Quinteiro',
        'phone', NULL,
        'email', NULL,
        'leader', NULL,
        'mediator', NULL,
        'manager', NULL,
        'is_spouse', false,
        'months_since_closing', NULL,
        'nps_score_v3', NULL,
        'has_nps_referral', false,
        'overdue_installments', 0,
        'overdue_days', 0,
        'cross_sell_count', 0,
        'meetings_enabled', false,
        'last_meeting', NULL,
        'has_scheduled_meeting', false,
        'app_usage', NULL,
        'payment_status', NULL,
        'has_referrals', false,
        'nps_score', NULL,
        'ecosystem_usage', NULL
      ),
      v_import_date,
      v_seen_at
    )
  LOOP
    v_count := v_count + 1;
  END LOOP;

  FOR v_result IN
    SELECT * FROM bulk_insert_client_v3(
      jsonb_build_object(
        'name', 'Kunio Ochiai',
        'planner', 'Laura Galvão',
        'phone', NULL,
        'email', NULL,
        'leader', NULL,
        'mediator', NULL,
        'manager', NULL,
        'is_spouse', false,
        'months_since_closing', NULL,
        'nps_score_v3', NULL,
        'has_nps_referral', false,
        'overdue_installments', 0,
        'overdue_days', 0,
        'cross_sell_count', 0,
        'meetings_enabled', false,
        'last_meeting', NULL,
        'has_scheduled_meeting', false,
        'app_usage', NULL,
        'payment_status', NULL,
        'has_referrals', false,
        'nps_score', NULL,
        'ecosystem_usage', NULL
      ),
      v_import_date,
      v_seen_at
    )
  LOOP
    v_count := v_count + 1;
  END LOOP;

  FOR v_result IN
    SELECT * FROM bulk_insert_client_v3(
      jsonb_build_object(
        'name', 'Lucas Maciel Domingues',
        'planner', 'Mariana Cruz',
        'phone', NULL,
        'email', NULL,
        'leader', NULL,
        'mediator', NULL,
        'manager', NULL,
        'is_spouse', false,
        'months_since_closing', NULL,
        'nps_score_v3', NULL,
        'has_nps_referral', false,
        'overdue_installments', 0,
        'overdue_days', 0,
        'cross_sell_count', 0,
        'meetings_enabled', false,
        'last_meeting', NULL,
        'has_scheduled_meeting', false,
        'app_usage', NULL,
        'payment_status', NULL,
        'has_referrals', false,
        'nps_score', NULL,
        'ecosystem_usage', NULL
      ),
      v_import_date,
      v_seen_at
    )
  LOOP
    v_count := v_count + 1;
  END LOOP;

  FOR v_result IN
    SELECT * FROM bulk_insert_client_v3(
      jsonb_build_object(
        'name', 'Rafael Bertolucci Dias',
        'planner', 'Sem Planejador', -- "#n/d" convertido para valor válido
        'phone', NULL,
        'email', NULL,
        'leader', NULL,
        'mediator', NULL,
        'manager', NULL,
        'is_spouse', false,
        'months_since_closing', NULL,
        'nps_score_v3', NULL,
        'has_nps_referral', false,
        'overdue_installments', 0,
        'overdue_days', 0,
        'cross_sell_count', 0,
        'meetings_enabled', false,
        'last_meeting', NULL,
        'has_scheduled_meeting', false,
        'app_usage', NULL,
        'payment_status', NULL,
        'has_referrals', false,
        'nps_score', NULL,
        'ecosystem_usage', NULL
      ),
      v_import_date,
      v_seen_at
    )
  LOOP
    v_count := v_count + 1;
  END LOOP;

  FOR v_result IN
    SELECT * FROM bulk_insert_client_v3(
      jsonb_build_object(
        'name', 'Renata Galvão Silva',
        'planner', 'Laura Galvão',
        'phone', NULL,
        'email', NULL,
        'leader', NULL,
        'mediator', NULL,
        'manager', NULL,
        'is_spouse', false,
        'months_since_closing', NULL,
        'nps_score_v3', NULL,
        'has_nps_referral', false,
        'overdue_installments', 0,
        'overdue_days', 0,
        'cross_sell_count', 0,
        'meetings_enabled', false,
        'last_meeting', NULL,
        'has_scheduled_meeting', false,
        'app_usage', NULL,
        'payment_status', NULL,
        'has_referrals', false,
        'nps_score', NULL,
        'ecosystem_usage', NULL
      ),
      v_import_date,
      v_seen_at
    )
  LOOP
    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE '✅ Total de clientes importados: %', v_count;
END $$;

-- Verificar resultado
SELECT 
  COUNT(*) as total_importados,
  COUNT(*) FILTER (WHERE planner IS NULL) as sem_planner
FROM clients
WHERE name IN (
  'Adriano de Oliveira Neres Ribeiro',
  'Gabriela Bernardes Ferreira',
  'Gabriela Schaefer',
  'Giovanni Bruno Gentil',
  'João Victor Fernandes da Silva',
  'Karen Cristina de Araújo Ornelas',
  'Keylla Aguiar dos Santos',
  'Kunio Ochiai',
  'Lucas Maciel Domingues',
  'Rafael Bertolucci Dias',
  'Renata Galvão Silva'
);

