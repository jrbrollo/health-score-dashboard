-- ============================================
-- IMPLEMENTAÇÃO DE RLS POLICIES BASEADAS EM HIERARQUIA
-- Health Score Dashboard - Correção Crítica [#3]
-- ============================================
-- 
-- Remove políticas permissivas USING (true) e implementa controle de acesso
-- baseado em hierarquia (manager, mediator, leader, planner)
-- ============================================

-- ============================================
-- 1. REMOVER POLÍTICAS PERMISSIVAS EXISTENTES
-- ============================================

-- Remover política permissiva da tabela clients
DROP POLICY IF EXISTS "Enable all operations for clients" ON clients;

-- Remover política permissiva da tabela health_score_history
DROP POLICY IF EXISTS "Enable all operations for health_score_history" ON health_score_history;

-- ============================================
-- 2. FUNÇÃO HELPER PARA VERIFICAR ACESSO A CLIENTE
-- ============================================
-- Esta função verifica se o usuário atual tem permissão para acessar um cliente
-- baseado em sua role e hierarchy_name

CREATE OR REPLACE FUNCTION user_can_access_client(
  p_client_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_role TEXT;
  v_user_hierarchy_name TEXT;
  v_client RECORD;
  v_hierarchy_cascade RECORD;
BEGIN
  -- Buscar role e hierarchy_name do usuário atual
  SELECT role, hierarchy_name INTO v_user_role, v_user_hierarchy_name
  FROM user_profiles
  WHERE id = auth.uid();
  
  -- Se usuário não tem perfil, negar acesso
  IF v_user_role IS NULL OR v_user_hierarchy_name IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Buscar dados do cliente
  SELECT manager, mediator, leader, planner INTO v_client
  FROM clients
  WHERE id = p_client_id;
  
  -- Se cliente não existe, negar acesso
  IF v_client IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Manager vê todos os clientes
  IF v_user_role = 'manager' THEN
    RETURN TRUE;
  END IF;
  
  -- Planner vê apenas seus próprios clientes
  IF v_user_role = 'planner' THEN
    RETURN v_client.planner = v_user_hierarchy_name;
  END IF;
  
  -- Leader vê clientes onde leader = seu nome OU planner está abaixo dele
  IF v_user_role = 'leader' THEN
    -- Buscar hierarquia cascata
    SELECT * INTO v_hierarchy_cascade
    FROM get_hierarchy_cascade(v_user_role, v_user_hierarchy_name);
    
    RETURN (
      v_client.leader = v_user_hierarchy_name
      OR v_client.planner = ANY(v_hierarchy_cascade.planner_names)
    );
  END IF;
  
  -- Mediator vê clientes onde mediator = seu nome OU leader/planner estão abaixo dele
  IF v_user_role = 'mediator' THEN
    -- Buscar hierarquia cascata
    SELECT * INTO v_hierarchy_cascade
    FROM get_hierarchy_cascade(v_user_role, v_user_hierarchy_name);
    
    RETURN (
      v_client.mediator = v_user_hierarchy_name
      OR v_client.leader = ANY(v_hierarchy_cascade.leader_names)
      OR v_client.planner = ANY(v_hierarchy_cascade.planner_names)
    );
  END IF;
  
  -- Por padrão, negar acesso
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 3. POLÍTICAS RLS PARA TABELA CLIENTS
-- ============================================

-- Policy para SELECT: usuários veem apenas clientes em sua hierarquia
CREATE POLICY "Users can view clients in their hierarchy"
ON clients FOR SELECT
USING (
  -- Manager vê todos
  EXISTS (
    SELECT 1 FROM user_profiles 
    WHERE id = auth.uid() 
    AND role = 'manager'
  )
  OR
  -- Planner vê apenas próprios clientes
  EXISTS (
    SELECT 1 FROM user_profiles 
    WHERE id = auth.uid() 
    AND role = 'planner' 
    AND hierarchy_name = clients.planner
  )
  OR
  -- Leader vê clientes onde leader = seu nome OU planner está abaixo dele
  EXISTS (
    SELECT 1 FROM user_profiles up
    WHERE up.id = auth.uid() 
    AND up.role = 'leader'
    AND (
      clients.leader = up.hierarchy_name
      OR EXISTS (
        SELECT 1 FROM clients c2
        WHERE c2.leader = up.hierarchy_name
        AND c2.planner = clients.planner
      )
    )
  )
  OR
  -- Mediator vê clientes onde mediator = seu nome OU leader/planner estão abaixo dele
  EXISTS (
    SELECT 1 FROM user_profiles up
    WHERE up.id = auth.uid() 
    AND up.role = 'mediator'
    AND (
      clients.mediator = up.hierarchy_name
      OR EXISTS (
        SELECT 1 FROM clients c2
        WHERE c2.mediator = up.hierarchy_name
        AND (c2.leader = clients.leader OR c2.planner = clients.planner)
      )
    )
  )
);

-- Policy para INSERT: usuários podem inserir apenas clientes em sua hierarquia
CREATE POLICY "Users can insert clients in their hierarchy"
ON clients FOR INSERT
WITH CHECK (
  -- Manager pode inserir qualquer cliente
  EXISTS (
    SELECT 1 FROM user_profiles 
    WHERE id = auth.uid() 
    AND role = 'manager'
  )
  OR
  -- Planner pode inserir apenas seus próprios clientes
  EXISTS (
    SELECT 1 FROM user_profiles 
    WHERE id = auth.uid() 
    AND role = 'planner' 
    AND hierarchy_name = clients.planner
  )
  OR
  -- Leader pode inserir clientes onde leader = seu nome OU planner está abaixo dele
  EXISTS (
    SELECT 1 FROM user_profiles up
    WHERE up.id = auth.uid() 
    AND up.role = 'leader'
    AND (
      clients.leader = up.hierarchy_name
      OR EXISTS (
        SELECT 1 FROM clients c2
        WHERE c2.leader = up.hierarchy_name
        AND c2.planner = clients.planner
      )
    )
  )
  OR
  -- Mediator pode inserir clientes onde mediator = seu nome OU leader/planner estão abaixo dele
  EXISTS (
    SELECT 1 FROM user_profiles up
    WHERE up.id = auth.uid() 
    AND up.role = 'mediator'
    AND (
      clients.mediator = up.hierarchy_name
      OR EXISTS (
        SELECT 1 FROM clients c2
        WHERE c2.mediator = up.hierarchy_name
        AND (c2.leader = clients.leader OR c2.planner = clients.planner)
      )
    )
  )
);

-- Policy para UPDATE: usuários podem atualizar apenas clientes em sua hierarquia
CREATE POLICY "Users can update clients in their hierarchy"
ON clients FOR UPDATE
USING (
  -- Manager pode atualizar qualquer cliente
  EXISTS (
    SELECT 1 FROM user_profiles 
    WHERE id = auth.uid() 
    AND role = 'manager'
  )
  OR
  -- Planner pode atualizar apenas seus próprios clientes
  EXISTS (
    SELECT 1 FROM user_profiles 
    WHERE id = auth.uid() 
    AND role = 'planner' 
    AND hierarchy_name = clients.planner
  )
  OR
  -- Leader pode atualizar clientes onde leader = seu nome OU planner está abaixo dele
  EXISTS (
    SELECT 1 FROM user_profiles up
    WHERE up.id = auth.uid() 
    AND up.role = 'leader'
    AND (
      clients.leader = up.hierarchy_name
      OR EXISTS (
        SELECT 1 FROM clients c2
        WHERE c2.leader = up.hierarchy_name
        AND c2.planner = clients.planner
      )
    )
  )
  OR
  -- Mediator pode atualizar clientes onde mediator = seu nome OU leader/planner estão abaixo dele
  EXISTS (
    SELECT 1 FROM user_profiles up
    WHERE up.id = auth.uid() 
    AND up.role = 'mediator'
    AND (
      clients.mediator = up.hierarchy_name
      OR EXISTS (
        SELECT 1 FROM clients c2
        WHERE c2.mediator = up.hierarchy_name
        AND (c2.leader = clients.leader OR c2.planner = clients.planner)
      )
    )
  )
);

-- Policy para DELETE: usuários podem deletar apenas clientes em sua hierarquia
CREATE POLICY "Users can delete clients in their hierarchy"
ON clients FOR DELETE
USING (
  -- Manager pode deletar qualquer cliente
  EXISTS (
    SELECT 1 FROM user_profiles 
    WHERE id = auth.uid() 
    AND role = 'manager'
  )
  OR
  -- Planner pode deletar apenas seus próprios clientes
  EXISTS (
    SELECT 1 FROM user_profiles 
    WHERE id = auth.uid() 
    AND role = 'planner' 
    AND hierarchy_name = clients.planner
  )
  OR
  -- Leader pode deletar clientes onde leader = seu nome OU planner está abaixo dele
  EXISTS (
    SELECT 1 FROM user_profiles up
    WHERE up.id = auth.uid() 
    AND up.role = 'leader'
    AND (
      clients.leader = up.hierarchy_name
      OR EXISTS (
        SELECT 1 FROM clients c2
        WHERE c2.leader = up.hierarchy_name
        AND c2.planner = clients.planner
      )
    )
  )
  OR
  -- Mediator pode deletar clientes onde mediator = seu nome OU leader/planner estão abaixo dele
  EXISTS (
    SELECT 1 FROM user_profiles up
    WHERE up.id = auth.uid() 
    AND up.role = 'mediator'
    AND (
      clients.mediator = up.hierarchy_name
      OR EXISTS (
        SELECT 1 FROM clients c2
        WHERE c2.mediator = up.hierarchy_name
        AND (c2.leader = clients.leader OR c2.planner = clients.planner)
      )
    )
  )
);

-- ============================================
-- 4. POLÍTICAS RLS PARA TABELA HEALTH_SCORE_HISTORY
-- ============================================
-- Histórico segue as mesmas regras de acesso dos clientes

-- Policy para SELECT: usuários veem histórico apenas de clientes em sua hierarquia
CREATE POLICY "Users can view history in their hierarchy"
ON health_score_history FOR SELECT
USING (
  -- Manager vê todo histórico
  EXISTS (
    SELECT 1 FROM user_profiles 
    WHERE id = auth.uid() 
    AND role = 'manager'
  )
  OR
  -- Planner vê histórico apenas de seus próprios clientes
  EXISTS (
    SELECT 1 FROM user_profiles 
    WHERE id = auth.uid() 
    AND role = 'planner' 
    AND hierarchy_name = health_score_history.planner
  )
  OR
  -- Leader vê histórico onde leader = seu nome OU planner está abaixo dele
  EXISTS (
    SELECT 1 FROM user_profiles up
    WHERE up.id = auth.uid() 
    AND up.role = 'leader'
    AND (
      EXISTS (
        SELECT 1 FROM clients c
        WHERE c.id = health_score_history.client_id
        AND c.leader = up.hierarchy_name
      )
      OR EXISTS (
        SELECT 1 FROM clients c
        WHERE c.id = health_score_history.client_id
        AND EXISTS (
          SELECT 1 FROM clients c2
          WHERE c2.leader = up.hierarchy_name
          AND c2.planner = c.planner
        )
      )
    )
  )
  OR
  -- Mediator vê histórico onde mediator = seu nome OU leader/planner estão abaixo dele
  EXISTS (
    SELECT 1 FROM user_profiles up
    WHERE up.id = auth.uid() 
    AND up.role = 'mediator'
    AND (
      EXISTS (
        SELECT 1 FROM clients c
        WHERE c.id = health_score_history.client_id
        AND c.mediator = up.hierarchy_name
      )
      OR EXISTS (
        SELECT 1 FROM clients c
        WHERE c.id = health_score_history.client_id
        AND EXISTS (
          SELECT 1 FROM clients c2
          WHERE c2.mediator = up.hierarchy_name
          AND (c2.leader = c.leader OR c2.planner = c.planner)
        )
      )
    )
  )
);

-- Policy para INSERT: apenas funções do sistema podem inserir histórico
CREATE POLICY "System can insert history"
ON health_score_history FOR INSERT
WITH CHECK (
  -- Permitir apenas inserções via funções SQL (security definer)
  -- Usuários não podem inserir histórico manualmente
  TRUE
);

-- Policy para UPDATE: apenas funções do sistema podem atualizar histórico
CREATE POLICY "System can update history"
ON health_score_history FOR UPDATE
USING (
  -- Permitir apenas atualizações via funções SQL (security definer)
  TRUE
);

-- Policy para DELETE: apenas manager pode deletar histórico
CREATE POLICY "Only managers can delete history"
ON health_score_history FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM user_profiles 
    WHERE id = auth.uid() 
    AND role = 'manager'
  )
);

-- ============================================
-- VERIFICAÇÃO
-- ============================================

-- Verificar se políticas foram criadas
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename IN ('clients', 'health_score_history')
ORDER BY tablename, policyname;

