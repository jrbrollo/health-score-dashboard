# Hierarquia Persistente - Health Score Dashboard

## Visão Geral

A hierarquia de cargos da empresa agora é definida de forma **persistente** através da tabela `hierarchy_roles` no banco de dados. Isso garante que a lógica de negócio seja consistente em toda a ferramenta.

## Estrutura da Hierarquia

### Gerentes (3)
- Gabriel Cury
- Rafael Kanashiro
- Gabriel Bueno de Melo Serrano

### Mediadores (5)
- Vinicius Semeride Francini
- Gustavo Machado
- Caio Bragança
- Gustavo Gomes
- Matheus Okamura

### Líderes em Formação (8)
- Andre Luiz Soares Prezia
- João Pedro Lotti Jardim
- Francisco Rivera
- Murilo Chiachio Santiago
- Diego Perissinotto
- Hélio Brollo Junior
- Wellington Carvalho
- Lucca de Lauro

### Planejadores
Todos os demais nomes que aparecem na coluna `planner` da tabela `clients`, **exceto** aqueles que são Gerentes, Mediadores ou Líderes em Formação.

## Regra de Negócio Importante

**Gerentes, Mediadores e Líderes em Formação podem atender clientes próprios**, e nesses casos seus nomes aparecem na coluna `planner` da tabela `clients`. **Isso não os torna Planejadores** - eles mantêm seu cargo principal definido na tabela `hierarchy_roles`.

## Tabela `hierarchy_roles`

```sql
CREATE TABLE hierarchy_roles (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('manager', 'mediator', 'leader', 'planner')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## Funções SQL Atualizadas

### `get_available_names_by_role(p_role TEXT)`
Retorna os nomes disponíveis para cada cargo:
- **Manager/Mediator/Leader**: Busca diretamente da tabela `hierarchy_roles`
- **Planner**: Busca da coluna `planner` da tabela `clients`, excluindo nomes que são Gerentes, Mediadores ou Líderes

### `validate_hierarchy_name(p_role TEXT, p_hierarchy_name TEXT)`
Valida se um nome existe na hierarquia com o cargo especificado:
- **Manager/Mediator/Leader**: Verifica na tabela `hierarchy_roles`
- **Planner**: Verifica na coluna `planner` da tabela `clients`, excluindo nomes que são Gerentes, Mediadores ou Líderes

## Como Atualizar a Hierarquia

Para adicionar ou modificar pessoas na hierarquia, execute:

```sql
-- Adicionar um novo Gerente
INSERT INTO hierarchy_roles (name, role) VALUES
  ('Nome Completo', 'manager')
ON CONFLICT (name) DO UPDATE SET role = EXCLUDED.role, updated_at = NOW();

-- Adicionar um novo Mediador
INSERT INTO hierarchy_roles (name, role) VALUES
  ('Nome Completo', 'mediator')
ON CONFLICT (name) DO UPDATE SET role = EXCLUDED.role, updated_at = NOW();

-- Adicionar um novo Líder em Formação
INSERT INTO hierarchy_roles (name, role) VALUES
  ('Nome Completo', 'leader')
ON CONFLICT (name) DO UPDATE SET role = EXCLUDED.role, updated_at = NOW();

-- Remover alguém da hierarquia (torná-lo Planejador)
DELETE FROM hierarchy_roles WHERE name = 'Nome Completo';
```

## Impacto na Ferramenta

Esta estrutura garante que:
1. A criação de conta sempre mostra as listas corretas para cada cargo
2. A validação de hierarquia é consistente em toda a aplicação
3. Os filtros de hierarquia funcionam corretamente
4. A lógica de negócio é centralizada e fácil de manter

