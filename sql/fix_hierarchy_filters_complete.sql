-- Script completo para corrigir filtros de hierarquia e adicionar funções auxiliares

-- 1. Atualizar função get_available_names_by_role para filtrar números
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
      -- E que NÃO são apenas números
      RETURN QUERY
      SELECT DISTINCT c.planner::TEXT
      FROM clients c
      WHERE c.planner IS NOT NULL 
        AND c.planner != '0'
        AND trim(c.planner) != ''
        AND trim(c.planner) != '#n/d'
        AND trim(c.planner) != '#REF!'
        -- Excluir valores que são apenas números
        AND trim(c.planner) !~ '^[0-9]+$'
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

-- 2. Criar funções auxiliares para filtros
CREATE OR REPLACE FUNCTION get_managers_for_filters()
RETURNS TABLE(name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT hr.name::TEXT
  FROM hierarchy_roles hr
  WHERE hr.role = 'manager'
  ORDER BY hr.name;
END;
$$;

CREATE OR REPLACE FUNCTION get_mediators_for_filters()
RETURNS TABLE(name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT hr.name::TEXT
  FROM hierarchy_roles hr
  WHERE hr.role = 'mediator'
  ORDER BY hr.name;
END;
$$;

CREATE OR REPLACE FUNCTION get_leaders_for_filters()
RETURNS TABLE(name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT hr.name::TEXT
  FROM hierarchy_roles hr
  WHERE hr.role = 'leader'
  ORDER BY hr.name;
END;
$$;

