-- Sistema de Autenticação e Autorização
-- Execute este script no SQL Editor do Supabase

-- 1. Criar tabela de perfis de usuário
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('manager', 'mediator', 'leader', 'planner')),
  hierarchy_name TEXT NOT NULL, -- Nome exato na hierarquia (manager, mediator, leader ou planner)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON user_profiles(role);
CREATE INDEX IF NOT EXISTS idx_user_profiles_hierarchy_name ON user_profiles(hierarchy_name);

-- 2. Função para buscar nomes disponíveis por role (apenas nomes exclusivos de cada nível)
CREATE OR REPLACE FUNCTION get_available_names_by_role(p_role TEXT)
RETURNS TABLE(name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  CASE p_role
    WHEN 'manager' THEN
      -- Gerente: buscar apenas nomes que estão na coluna manager
      RETURN QUERY
      SELECT DISTINCT c.manager::TEXT
      FROM clients c
      WHERE c.manager IS NOT NULL 
        AND c.manager != '0'
        AND trim(c.manager) != ''
      ORDER BY c.manager;
    
    WHEN 'mediator' THEN
      -- Mediador: buscar apenas nomes que estão na coluna mediator MAS NÃO estão na coluna manager
      RETURN QUERY
      SELECT DISTINCT c.mediator::TEXT
      FROM clients c
      WHERE c.mediator IS NOT NULL 
        AND c.mediator != '0'
        AND trim(c.mediator) != ''
        -- Excluir nomes que também aparecem como manager
        AND c.mediator NOT IN (
          SELECT DISTINCT manager
          FROM clients
          WHERE manager IS NOT NULL 
            AND manager != '0'
            AND trim(manager) != ''
        )
      ORDER BY c.mediator;
    
    WHEN 'leader' THEN
      -- Líder: buscar apenas nomes que estão na coluna leader MAS NÃO estão em manager ou mediator
      RETURN QUERY
      SELECT DISTINCT c.leader::TEXT
      FROM clients c
      WHERE c.leader IS NOT NULL 
        AND c.leader != '0'
        AND trim(c.leader) != ''
        -- Excluir nomes que também aparecem como manager ou mediator
        AND c.leader NOT IN (
          SELECT DISTINCT manager
          FROM clients
          WHERE manager IS NOT NULL 
            AND manager != '0'
            AND trim(manager) != ''
        )
        AND c.leader NOT IN (
          SELECT DISTINCT mediator
          FROM clients
          WHERE mediator IS NOT NULL 
            AND mediator != '0'
            AND trim(mediator) != ''
        )
      ORDER BY c.leader;
    
    WHEN 'planner' THEN
      -- Planejador: buscar apenas nomes que estão na coluna planner MAS NÃO estão em manager, mediator ou leader
      RETURN QUERY
      SELECT DISTINCT c.planner::TEXT
      FROM clients c
      WHERE c.planner IS NOT NULL 
        AND c.planner != '0'
        AND trim(c.planner) != ''
        -- Excluir nomes que também aparecem em níveis superiores
        AND c.planner NOT IN (
          SELECT DISTINCT manager
          FROM clients
          WHERE manager IS NOT NULL 
            AND manager != '0'
            AND trim(manager) != ''
        )
        AND c.planner NOT IN (
          SELECT DISTINCT mediator
          FROM clients
          WHERE mediator IS NOT NULL 
            AND mediator != '0'
            AND trim(mediator) != ''
        )
        AND c.planner NOT IN (
          SELECT DISTINCT leader
          FROM clients
          WHERE leader IS NOT NULL 
            AND leader != '0'
            AND trim(leader) != ''
        )
      ORDER BY c.planner;
    
    ELSE
      RETURN;
  END CASE;
END;
$$;

-- 3. Função para buscar hierarquia cascata (todos os nomes abaixo de um nível)
CREATE OR REPLACE FUNCTION get_hierarchy_cascade(
  p_role TEXT,
  p_hierarchy_name TEXT
)
RETURNS TABLE(
  planner_names TEXT[],
  leader_names TEXT[],
  mediator_names TEXT[]
) AS $$
DECLARE
  v_planner_names TEXT[];
  v_leader_names TEXT[];
  v_mediator_names TEXT[];
BEGIN
  -- Inicializar arrays
  v_planner_names := ARRAY[]::TEXT[];
  v_leader_names := ARRAY[]::TEXT[];
  v_mediator_names := ARRAY[]::TEXT[];

  CASE p_role
    WHEN 'manager' THEN
      -- Gerente vê tudo, não precisa filtrar
      RETURN QUERY SELECT ARRAY[]::TEXT[], ARRAY[]::TEXT[], ARRAY[]::TEXT[];
      RETURN;
    
    WHEN 'mediator' THEN
      -- Buscar todos os líderes abaixo deste mediador
      SELECT ARRAY_AGG(DISTINCT c.leader::TEXT)
      INTO v_leader_names
      FROM clients c
      WHERE c.mediator = p_hierarchy_name
        AND c.leader IS NOT NULL
        AND c.leader != '0';
      
      -- Buscar todos os planejadores abaixo deste mediador (direto ou via líderes)
      SELECT ARRAY_AGG(DISTINCT c.planner::TEXT)
      INTO v_planner_names
      FROM clients c
      WHERE (c.mediator = p_hierarchy_name OR c.leader = ANY(v_leader_names))
        AND c.planner IS NOT NULL
        AND c.planner != '0';
      
      RETURN QUERY SELECT v_planner_names, v_leader_names, ARRAY[p_hierarchy_name]::TEXT[];
    
    WHEN 'leader' THEN
      -- Buscar todos os planejadores abaixo deste líder
      SELECT ARRAY_AGG(DISTINCT c.planner::TEXT)
      INTO v_planner_names
      FROM clients c
      WHERE c.leader = p_hierarchy_name
        AND c.planner IS NOT NULL
        AND c.planner != '0';
      
      RETURN QUERY SELECT v_planner_names, ARRAY[p_hierarchy_name]::TEXT[], ARRAY[]::TEXT[];
    
    WHEN 'planner' THEN
      -- Planejador vê apenas seus próprios clientes
      RETURN QUERY SELECT ARRAY[p_hierarchy_name]::TEXT[], ARRAY[]::TEXT[], ARRAY[]::TEXT[];
    
    ELSE
      RETURN QUERY SELECT ARRAY[]::TEXT[], ARRAY[]::TEXT[], ARRAY[]::TEXT[];
  END CASE;
END;
$$ LANGUAGE plpgsql;

-- 4. Função para validar se um nome existe na hierarquia
CREATE OR REPLACE FUNCTION validate_hierarchy_name(
  p_role TEXT,
  p_hierarchy_name TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_exists BOOLEAN := FALSE;
BEGIN
  CASE p_role
    WHEN 'manager' THEN
      SELECT EXISTS(
        SELECT 1 FROM clients 
        WHERE manager = p_hierarchy_name 
          AND manager IS NOT NULL 
          AND manager != '0'
      ) INTO v_exists;
    
    WHEN 'mediator' THEN
      SELECT EXISTS(
        SELECT 1 FROM clients 
        WHERE mediator = p_hierarchy_name 
          AND mediator IS NOT NULL 
          AND mediator != '0'
      ) INTO v_exists;
    
    WHEN 'leader' THEN
      SELECT EXISTS(
        SELECT 1 FROM clients 
        WHERE leader = p_hierarchy_name 
          AND leader IS NOT NULL 
          AND leader != '0'
      ) INTO v_exists;
    
    WHEN 'planner' THEN
      SELECT EXISTS(
        SELECT 1 FROM clients 
        WHERE planner = p_hierarchy_name 
          AND planner IS NOT NULL 
          AND planner != '0'
      ) INTO v_exists;
    
    ELSE
      v_exists := FALSE;
  END CASE;
  
  RETURN v_exists;
END;
$$ LANGUAGE plpgsql;

-- 5. Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_user_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_user_profiles_updated_at();

-- 6. Habilitar RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Política: usuários podem ver apenas seu próprio perfil
CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  USING (auth.uid() = id);

-- Política: usuários podem atualizar apenas seu próprio perfil
CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  USING (auth.uid() = id);

-- Política: qualquer usuário autenticado pode ver nomes disponíveis (para signup)
CREATE POLICY "Authenticated users can view available names"
  ON user_profiles FOR SELECT
  USING (true);

-- 7. Função helper para obter perfil do usuário atual
CREATE OR REPLACE FUNCTION get_current_user_profile()
RETURNS TABLE(
  id UUID,
  email TEXT,
  role TEXT,
  hierarchy_name TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    up.id,
    up.email,
    up.role,
    up.hierarchy_name
  FROM user_profiles up
  WHERE up.id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

