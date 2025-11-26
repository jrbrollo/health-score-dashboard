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
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_user_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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

COMMENT ON FUNCTION get_hierarchy_cascade IS 'Função com SECURITY DEFINER para ignorar RLS';
