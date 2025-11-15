-- Script completo para configurar a hierarquia de forma persistente
-- Execute este script no SQL Editor do Supabase

-- 1. Criar tabela para definir a hierarquia de forma persistente
CREATE TABLE IF NOT EXISTS hierarchy_roles (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('manager', 'mediator', 'leader', 'planner')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_hierarchy_roles_name ON hierarchy_roles(name);
CREATE INDEX IF NOT EXISTS idx_hierarchy_roles_role ON hierarchy_roles(role);

-- 2. Inserir os dados da hierarquia conforme especificado
-- Gerentes
INSERT INTO hierarchy_roles (name, role) VALUES
  ('Gabriel Cury', 'manager'),
  ('Rafael Kanashiro', 'manager'),
  ('Gabriel Bueno de Melo Serrano', 'manager')
ON CONFLICT (name) DO UPDATE SET role = EXCLUDED.role, updated_at = NOW();

-- Mediadores
INSERT INTO hierarchy_roles (name, role) VALUES
  ('Vinicius Semeride Francini', 'mediator'),
  ('Gustavo Machado', 'mediator'),
  ('Caio Bragança', 'mediator'),
  ('Gustavo Gomes', 'mediator'),
  ('Matheus Okamura', 'mediator')
ON CONFLICT (name) DO UPDATE SET role = EXCLUDED.role, updated_at = NOW();

-- Líderes em Formação
INSERT INTO hierarchy_roles (name, role) VALUES
  ('Andre Luiz Soares Prezia', 'leader'),
  ('João Pedro Lotti Jardim', 'leader'),
  ('Francisco Rivera', 'leader'),
  ('Murilo Chiachio Santiago', 'leader'),
  ('Diego Perissinotto', 'leader'),
  ('Hélio Brollo Junior', 'leader'),
  ('Wellington Carvalho', 'leader'),
  ('Lucca de Lauro', 'leader')
ON CONFLICT (name) DO UPDATE SET role = EXCLUDED.role, updated_at = NOW();

-- 3. Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_hierarchy_roles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS hierarchy_roles_updated_at ON hierarchy_roles;
CREATE TRIGGER hierarchy_roles_updated_at
  BEFORE UPDATE ON hierarchy_roles
  FOR EACH ROW
  EXECUTE FUNCTION update_hierarchy_roles_updated_at();

-- 4. Atualizar função get_available_names_by_role para usar a tabela hierarchy_roles
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

-- 5. Atualizar função validate_hierarchy_name para usar a tabela hierarchy_roles
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

-- 6. Comentários para documentação
COMMENT ON TABLE hierarchy_roles IS 'Define a hierarquia de cargos da empresa. Gerentes, Mediadores e Líderes em Formação podem também atender clientes próprios (aparecer como planner), mas mantêm seu cargo principal.';
COMMENT ON COLUMN hierarchy_roles.name IS 'Nome completo da pessoa na hierarquia';
COMMENT ON COLUMN hierarchy_roles.role IS 'Cargo principal: manager, mediator, leader ou planner';

