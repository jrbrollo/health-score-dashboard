-- Atualizar função get_available_names_by_role para usar a tabela hierarchy_roles
-- Esta função agora retorna nomes baseados na hierarquia definida, não nas colunas da tabela clients

CREATE OR REPLACE FUNCTION get_available_names_by_role(p_role TEXT)
RETURNS TABLE(name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  CASE p_role
    WHEN 'manager' THEN
      -- Gerentes: buscar apenas da tabela hierarchy_roles
      RETURN QUERY
      SELECT hr.name::TEXT
      FROM hierarchy_roles hr
      WHERE hr.role = 'manager'
      ORDER BY hr.name;
    
    WHEN 'mediator' THEN
      -- Mediadores: buscar apenas da tabela hierarchy_roles
      RETURN QUERY
      SELECT hr.name::TEXT
      FROM hierarchy_roles hr
      WHERE hr.role = 'mediator'
      ORDER BY hr.name;
    
    WHEN 'leader' THEN
      -- Líderes em Formação: buscar apenas da tabela hierarchy_roles
      RETURN QUERY
      SELECT hr.name::TEXT
      FROM hierarchy_roles hr
      WHERE hr.role = 'leader'
      ORDER BY hr.name;
    
    WHEN 'planner' THEN
      -- Planejadores: buscar todos os nomes DISTINTOS da coluna planner
      -- que NÃO estão na tabela hierarchy_roles com outro cargo
      RETURN QUERY
      SELECT DISTINCT c.planner::TEXT
      FROM clients c
      WHERE c.planner IS NOT NULL 
        AND c.planner != '0'
        AND trim(c.planner) != ''
        AND trim(c.planner) != '#n/d'
        AND trim(c.planner) != '#REF!'
        -- Excluir nomes que são Gerentes, Mediadores ou Líderes
        AND c.planner NOT IN (
          SELECT hr.name
          FROM hierarchy_roles hr
          WHERE hr.role IN ('manager', 'mediator', 'leader')
        )
      ORDER BY c.planner;
    
    ELSE
      RETURN;
  END CASE;
END;
$$;

