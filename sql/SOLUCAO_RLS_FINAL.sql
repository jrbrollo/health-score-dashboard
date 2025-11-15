-- ============================================
-- SOLUÇÃO FINAL PARA RLS SEM RECURSÃO
-- Health Score Dashboard
-- ============================================
-- 
-- Se ainda houver recursão, use esta solução alternativa
-- que não consulta user_profiles dentro da política
-- ============================================

-- Opção 1: Desabilitar RLS temporariamente (já feito)
-- ALTER TABLE clients DISABLE ROW LEVEL SECURITY;

-- Opção 2: Criar view materializada com role e hierarchy_name
-- Isso evita consultar user_profiles dentro da política

-- Criar função que retorna role e hierarchy_name sem causar recursão
-- Usando uma abordagem que não consulta user_profiles diretamente na política
CREATE OR REPLACE FUNCTION get_user_role_hierarchy_safe()
RETURNS TABLE(role TEXT, hierarchy_name TEXT) AS $$
BEGIN
  -- Esta função executa como SECURITY DEFINER
  -- e deve poder acessar user_profiles sem passar por RLS
  RETURN QUERY
  SELECT up.role, up.hierarchy_name
  FROM user_profiles up
  WHERE up.id = auth.uid()
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- Política usando a função (deve evitar recursão)
DROP POLICY IF EXISTS "Users can access clients" ON clients;

CREATE POLICY "Users can access clients"
ON clients FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM get_user_role_hierarchy_safe() u
    WHERE (
      u.role = 'manager'
      OR (u.role = 'planner' AND u.hierarchy_name = planner)
      OR (u.role = 'leader' AND (u.hierarchy_name = leader OR u.hierarchy_name = planner))
      OR (u.role = 'mediator' AND (
        u.hierarchy_name = mediator 
        OR u.hierarchy_name = leader 
        OR u.hierarchy_name = planner
      ))
    )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM get_user_role_hierarchy_safe() u
    WHERE (
      u.role = 'manager'
      OR (u.role = 'planner' AND u.hierarchy_name = planner)
      OR (u.role = 'leader' AND (u.hierarchy_name = leader OR u.hierarchy_name = planner))
      OR (u.role = 'mediator' AND (
        u.hierarchy_name = mediator 
        OR u.hierarchy_name = leader 
        OR u.hierarchy_name = planner
      ))
    )
  )
);

-- Se ainda houver recursão, use política permissiva temporária:
-- DROP POLICY IF EXISTS "Users can access clients" ON clients;
-- CREATE POLICY "Temporary permissive" ON clients FOR ALL USING (true);
-- ATENÇÃO: Isso permite acesso total - usar apenas temporariamente!

