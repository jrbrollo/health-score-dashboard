-- ========================================
-- CORREÇÃO URGENTE: TRIGGER DE HISTÓRICO
-- ========================================
-- PROBLEMA: Trigger antigo usa CURRENT_DATE e atualiza histórico passado
-- SOLUÇÃO: Novo trigger que respeita imutabilidade do histórico
--
-- APLICAR NO SUPABASE SQL EDITOR
-- ========================================

-- PASSO 1: Deletar trigger antigo problemático
DROP TRIGGER IF EXISTS clients_health_history_trigger ON clients;
DROP FUNCTION IF EXISTS trigger_record_health_history();
DROP FUNCTION IF EXISTS record_health_score_history(clients);

-- PASSO 2: Criar função do trigger que usa v3
CREATE OR REPLACE FUNCTION trigger_record_health_history_v3()
RETURNS TRIGGER AS $$
BEGIN
  -- ⚠️ CRÍTICO: Só criar histórico se last_seen_at mudou (significa import novo)
  -- Isso evita recriar histórico a cada UPDATE minor
  IF (TG_OP = 'INSERT') OR
     (TG_OP = 'UPDATE' AND OLD.last_seen_at IS DISTINCT FROM NEW.last_seen_at) THEN

    -- Chamar função v3 de histórico
    -- IMPORTANTE: Usa CURRENT_DATE porque trigger dispara no momento do import
    -- A proteção contra atualizar histórico passado está dentro da função v3
    PERFORM record_health_score_history_v3(NEW.id, CURRENT_DATE);

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- PASSO 3: Criar trigger novo
CREATE TRIGGER clients_health_history_trigger_v3
  AFTER INSERT OR UPDATE ON clients
  FOR EACH ROW
  EXECUTE FUNCTION trigger_record_health_history_v3();

-- ========================================
-- VALIDAÇÃO
-- ========================================
-- Execute esta query para confirmar que trigger foi criado:

SELECT
  trigger_name,
  event_manipulation,
  action_statement
FROM information_schema.triggers
WHERE event_object_table = 'clients'
  AND trigger_name = 'clients_health_history_trigger_v3';

-- Resultado esperado: 1 linha com trigger_name = 'clients_health_history_trigger_v3'

-- ========================================
-- NOTAS IMPORTANTES
-- ========================================
-- 1. O trigger antigo `clients_health_history_trigger` foi DELETADO
-- 2. Agora usa função v3 que tem proteção contra atualizar histórico passado
-- 3. Só dispara quando last_seen_at muda (evita updates desnecessários)
-- 4. A função record_health_score_history_v3() já tem lógica:
--    - Se p_recorded_date < CURRENT_DATE E já existe histórico: RETURN (não atualiza)
--    - Se p_recorded_date >= CURRENT_DATE: permite UPDATE (correções do dia)

COMMENT ON FUNCTION trigger_record_health_history_v3() IS 'Trigger function v3 que usa record_health_score_history_v3 e respeita imutabilidade do histórico passado';
