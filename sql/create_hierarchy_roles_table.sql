-- Criar tabela para definir a hierarquia de forma persistente
-- Esta tabela define quem é Gerente, Mediador, Líder em Formação ou Planejador

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

-- Inserir os dados da hierarquia conforme especificado
-- Gerentes
INSERT INTO hierarchy_roles (name, role) VALUES
  ('Gabriel Cury', 'manager'),
  ('Rafael Kanashiro', 'manager'),
  ('Gabriel Serrano', 'manager')
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

-- Nota: Planejadores não precisam ser inseridos explicitamente
-- Qualquer nome que não esteja nesta tabela é considerado um Planejador

-- Trigger para atualizar updated_at
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

-- Comentários para documentação
COMMENT ON TABLE hierarchy_roles IS 'Define a hierarquia de cargos da empresa. Gerentes, Mediadores e Líderes em Formação podem também atender clientes próprios (aparecer como planner), mas mantêm seu cargo principal.';
COMMENT ON COLUMN hierarchy_roles.name IS 'Nome completo da pessoa na hierarquia';
COMMENT ON COLUMN hierarchy_roles.role IS 'Cargo principal: manager, mediator, leader ou planner';

