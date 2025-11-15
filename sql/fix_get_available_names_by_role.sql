-- Corrigir função get_available_names_by_role para retornar TODOS os nomes de cada nível
-- Sem excluir nomes que aparecem em níveis superiores
-- Isso permite que uma pessoa apareça em múltiplos níveis se necessário

CREATE OR REPLACE FUNCTION get_available_names_by_role(p_role TEXT)
RETURNS TABLE(name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  CASE p_role
    WHEN 'manager' THEN
      -- Gerente: buscar TODOS os nomes que estão na coluna manager
      RETURN QUERY
      SELECT DISTINCT c.manager::TEXT
      FROM clients c
      WHERE c.manager IS NOT NULL 
        AND c.manager != '0'
        AND trim(c.manager) != ''
        AND trim(c.manager) != '#n/d'
        AND trim(c.manager) != '#REF!'
      ORDER BY c.manager;
    
    WHEN 'mediator' THEN
      -- Mediador: buscar TODOS os nomes que estão na coluna mediator
      RETURN QUERY
      SELECT DISTINCT c.mediator::TEXT
      FROM clients c
      WHERE c.mediator IS NOT NULL 
        AND c.mediator != '0'
        AND trim(c.mediator) != ''
        AND trim(c.mediator) != '#n/d'
        AND trim(c.mediator) != '#REF!'
      ORDER BY c.mediator;
    
    WHEN 'leader' THEN
      -- Líder: buscar TODOS os nomes que estão na coluna leader
      RETURN QUERY
      SELECT DISTINCT c.leader::TEXT
      FROM clients c
      WHERE c.leader IS NOT NULL 
        AND c.leader != '0'
        AND trim(c.leader) != ''
        AND trim(c.leader) != '#n/d'
        AND trim(c.leader) != '#REF!'
      ORDER BY c.leader;
    
    WHEN 'planner' THEN
      -- Planejador: buscar TODOS os nomes que estão na coluna planner
      RETURN QUERY
      SELECT DISTINCT c.planner::TEXT
      FROM clients c
      WHERE c.planner IS NOT NULL 
        AND c.planner != '0'
        AND trim(c.planner) != ''
        AND trim(c.planner) != '#n/d'
        AND trim(c.planner) != '#REF!'
      ORDER BY c.planner;
    
    ELSE
      RETURN;
  END CASE;
END;
$$;

