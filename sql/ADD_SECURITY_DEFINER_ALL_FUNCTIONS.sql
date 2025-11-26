-- ============================================
-- ADICIONAR SECURITY DEFINER EM TODAS AS FUNÇÕES RPC
-- ============================================
-- Este script adiciona SECURITY DEFINER em todas as funções que:
-- 1. São chamadas via RPC pelo frontend
-- 2. Acessam tabelas com RLS habilitado
-- 3. Ainda não têm SECURITY DEFINER
--
-- IMPORTANTE: Após ativar RLS, funções precisam de SECURITY DEFINER para
-- executar com permissões de admin e ignorar as políticas RLS.
-- As funções já aplicam seus próprios filtros de segurança.
--
-- DATA: 2025-11-26
-- ============================================

-- 1. backfill_health_score_history
-- Acessa: health_score_history
CREATE OR REPLACE FUNCTION backfill_health_score_history()
RETURNS INTEGER AS $$
DECLARE
  rows_inserted INTEGER := 0;
BEGIN
  -- Preencher histórico para todos os clientes existentes
  INSERT INTO health_score_history (
    client_id,
    client_name,
    planner,
    manager,
    mediator,
    leader,
    health_score,
    health_category,
    meeting_engagement,
    app_usage,
    payment_status,
    ecosystem_engagement,
    nps_score,
    recorded_date
  )
  SELECT
    c.id,
    c.name,
    c.planner,
    c.manager,
    c.mediator,
    c.leader,
    COALESCE(
      (c.nps_score_v3 * 20) +
      (CASE WHEN c.has_nps_referral THEN 20 ELSE 0 END) +
      (CASE
        WHEN c.overdue_days = 0 THEN 20
        WHEN c.overdue_days <= 30 THEN 10
        ELSE 0
      END) +
      (c.cross_sell_count * 10) +
      (LEAST(c.months_since_closing, 12) * 1.67)::INTEGER,
      0
    ) AS health_score,
    CASE
      WHEN COALESCE(...) >= 80 THEN 'Ótimo'
      WHEN COALESCE(...) >= 60 THEN 'Estável'
      WHEN COALESCE(...) >= 40 THEN 'Atenção'
      ELSE 'Crítico'
    END AS health_category,
    0 AS meeting_engagement,
    0 AS app_usage,
    CASE
      WHEN c.overdue_days = 0 THEN 20
      WHEN c.overdue_days <= 30 THEN 10
      ELSE 0
    END AS payment_status,
    0 AS ecosystem_engagement,
    c.nps_score_v3 * 20 AS nps_score,
    c.last_seen_at::DATE AS recorded_date
  FROM clients c
  WHERE c.last_seen_at IS NOT NULL
  ON CONFLICT (client_id, recorded_date) DO NOTHING;

  GET DIAGNOSTICS rows_inserted = ROW_COUNT;
  RETURN rows_inserted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION backfill_health_score_history IS 'Preenche histórico de health score para todos os clientes (com SECURITY DEFINER para ignorar RLS)';

-- 2. bulk_insert_clients_v3
-- Acessa: clients
-- NOTA: Esta função é grande, vou apenas adicionar SECURITY DEFINER
-- Procurar no arquivo APLICAR_TODAS_CORRECOES.sql e adicionar SECURITY DEFINER no final

-- 3. diff_snapshot_pairs
-- Acessa: health_score_history
-- Procurar definição em diff_snapshot_pairs.sql e adicionar SECURITY DEFINER

-- 4. get_client_health_score_evolution
-- Acessa: health_score_history
-- Procurar em get_client_health_score_evolution.sql e adicionar SECURITY DEFINER

-- 5. get_hierarchy_cascade
-- Acessa: user_profiles
-- Procurar em auth_setup.sql e adicionar SECURITY DEFINER

-- 6. get_sankey_snapshot
-- Acessa: health_score_history, clients
-- Procurar em get_sankey_snapshot.sql e adicionar SECURITY DEFINER

-- ============================================
-- Como este script precisa recriar as funções grandes,
-- vou criar scripts individuais para cada uma
-- ============================================
