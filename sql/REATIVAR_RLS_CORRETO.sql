-- ============================================
-- REATIVAR RLS COM POLÍTICAS CORRETAS
-- Health Score Dashboard - Correção de Recursão
-- ============================================
-- 
-- Este script reativa RLS com políticas que não causam recursão
-- IMPORTANTE: Execute apenas após testar que o sistema está funcionando
-- ============================================

-- Reativar RLS
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

-- Remover políticas antigas se existirem
DROP POLICY IF EXISTS "Users can access clients" ON clients;
DROP POLICY IF EXISTS "Managers have full access" ON clients;
DROP POLICY IF EXISTS "Other roles can access their hierarchy" ON clients;

-- Criar função SECURITY DEFINER que bypassa RLS
-- Esta função já deve existir, mas vamos garantir que está correta
CREATE OR REPLACE FUNCTION check_user_access_to_client(
  p_manager TEXT,
  p_mediator TEXT,
  p_leader TEXT,
  p_planner TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_role TEXT;
  v_user_hierarchy_name TEXT;
BEGIN
  -- Função SECURITY DEFINER executa com privilégios elevados
  -- e pode acessar user_profiles sem passar por RLS
  SELECT role, hierarchy_name INTO v_user_role, v_user_hierarchy_name
  FROM user_profiles
  WHERE id = auth.uid()
  LIMIT 1;
  
  IF v_user_role IS NULL OR v_user_hierarchy_name IS NULL THEN
    RETURN FALSE;
  END IF;
  
  IF v_user_role = 'manager' THEN
    RETURN TRUE;
  END IF;
  
  IF v_user_role = 'planner' THEN
    RETURN v_user_hierarchy_name = p_planner;
  END IF;
  
  IF v_user_role = 'leader' THEN
    RETURN v_user_hierarchy_name = p_leader OR v_user_hierarchy_name = p_planner;
  END IF;
  
  IF v_user_role = 'mediator' THEN
    RETURN v_user_hierarchy_name = p_mediator 
       OR v_user_hierarchy_name = p_leader 
       OR v_user_hierarchy_name = p_planner;
  END IF;
  
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- Criar política usando a função
CREATE POLICY "Users can access clients"
ON clients FOR ALL
USING (
  check_user_access_to_client(
    manager,
    mediator,
    leader,
    planner
  )
)
WITH CHECK (
  check_user_access_to_client(
    manager,
    mediator,
    leader,
    planner
  )
);

-- Verificar políticas criadas
SELECT 
  tablename,
  policyname,
  cmd
FROM pg_policies
WHERE tablename = 'clients';

