-- Atualizar função validate_hierarchy_name para usar a tabela hierarchy_roles
-- Esta função valida se um nome existe na hierarquia com o cargo especificado

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
      -- Verificar se o nome está na tabela hierarchy_roles como manager
      SELECT EXISTS(
        SELECT 1 FROM hierarchy_roles 
        WHERE name = p_hierarchy_name 
          AND role = 'manager'
      ) INTO v_exists;
    
    WHEN 'mediator' THEN
      -- Verificar se o nome está na tabela hierarchy_roles como mediator
      SELECT EXISTS(
        SELECT 1 FROM hierarchy_roles 
        WHERE name = p_hierarchy_name 
          AND role = 'mediator'
      ) INTO v_exists;
    
    WHEN 'leader' THEN
      -- Verificar se o nome está na tabela hierarchy_roles como leader
      SELECT EXISTS(
        SELECT 1 FROM hierarchy_roles 
        WHERE name = p_hierarchy_name 
          AND role = 'leader'
      ) INTO v_exists;
    
    WHEN 'planner' THEN
      -- Verificar se o nome existe na coluna planner E não é Gerente/Mediador/Líder
      SELECT EXISTS(
        SELECT 1 FROM clients 
        WHERE planner = p_hierarchy_name 
          AND planner IS NOT NULL 
          AND planner != '0'
          AND trim(planner) != ''
          -- Verificar que não é Gerente, Mediador ou Líder
          AND planner NOT IN (
            SELECT hr.name
            FROM hierarchy_roles hr
            WHERE hr.role IN ('manager', 'mediator', 'leader')
          )
      ) INTO v_exists;
    
    ELSE
      v_exists := FALSE;
  END CASE;
  
  RETURN v_exists;
END;
$$ LANGUAGE plpgsql;

