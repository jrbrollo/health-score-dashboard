# PROMPT PARA AUDITORIA TÉCNICA - HEALTH SCORE DASHBOARD

## 📋 CONTEXTO GERAL DA FERRAMENTA

### O que é a ferramenta?
A **Health Score Dashboard** é uma aplicação web de gestão de carteira de clientes desenvolvida para uma empresa de planejamento financeiro. A ferramenta permite avaliar quantitativamente a "saúde" da carteira de clientes através de um sistema de pontuação (Health Score) que varia de 0 a 100 pontos, categorizando clientes em quatro níveis: **Ótimo** (100+), **Estável** (60-99), **Atenção** (35-59) e **Crítico** (0-34).

### Propósito Principal
1. **Avaliação quantitativa** da saúde da carteira através de métricas objetivas
2. **Análise temporal comparativa** da evolução dos clientes ao longo do tempo
3. **Gestão centralizada** de clientes com funcionalidades de CRUD
4. **Importação em massa** de dados via CSV diariamente
5. **Visualizações analíticas** para tomada de decisão estratégica
6. **Filtragem hierárquica** por estrutura organizacional (Gerentes → Mediadores → Líderes → Planejadores)

---

## 🏗️ ARQUITETURA TÉCNICA

### Stack Tecnológico
- **Frontend:** React 18 + TypeScript + Vite
- **UI Library:** Shadcn/ui + Tailwind CSS
- **Estado:** React Query para cache e sincronização
- **Roteamento:** React Router DOM
- **Gráficos:** Recharts para visualizações
- **Backend:** Supabase (PostgreSQL)
- **Autenticação:** Supabase Auth com Row Level Security (RLS)
- **Deploy:** Vercel com integração automática GitHub

### Como estamos usando o Supabase?
O Supabase é usado como **Backend-as-a-Service (BaaS)** completo:

1. **Banco de Dados PostgreSQL:**
   - Armazena dados de clientes (`clients` table)
   - Armazena histórico temporal (`health_score_history` table)
   - Armazena perfis de usuários (`user_profiles` table)
   - Armazena hierarquia organizacional (`hierarchy_roles` table)

2. **Autenticação e Autorização:**
   - Supabase Auth para login/signup
   - Row Level Security (RLS) para controle de acesso
   - Perfis de usuário vinculados a hierarquia organizacional

3. **Remote Procedure Calls (RPC):**
   - Funções SQL executadas diretamente do frontend
   - `bulk_insert_clients_v3`: Importação em massa de clientes
   - `record_health_score_history_v3`: Registro automático de histórico
   - `get_temporal_analysis_asof`: Análise temporal agregada
   - `get_available_names_by_role`: Busca de nomes por hierarquia
   - `validate_hierarchy_name`: Validação de nomes na hierarquia

4. **API REST:**
   - Queries diretas nas tabelas via Supabase Client
   - Operações CRUD padrão (create, read, update, delete)

---

## 📊 ESTRUTURA DE DADOS

### Fonte de Dados
A fonte primária de dados é uma **planilha CSV** (Google Sheets ou arquivo local) que é importada **diariamente** através da interface web. O CSV contém informações atualizadas de todos os clientes da carteira.

### Estrutura do CSV (Colunas Esperadas)
```
- Clientes (nome do cliente)
- Email
- Telefone
- Cônjuge (indica se é cônjuge e nome do pagante)
- Meses do Fechamento (tempo de relacionamento)
- Planejador (responsável direto)
- Líder em Formação (hierarquia)
- Mediador (hierarquia)
- Gerente (hierarquia)
- NPS (nota 0-10 ou vazio)
- Indicação NPS (sim/não)
- Inadimplência Parcelas (quantidade)
- Inadimplência Dias (dias de atraso)
- Cross Sell (quantidade de produtos adicionais)
```

### Tabela `clients` (Estrutura Completa)
```sql
CREATE TABLE clients (
  -- Identificação
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  identity_key TEXT, -- Chave única: "nome_normalizado|planner_normalizado"
  
  -- Contato
  email TEXT,
  phone TEXT, -- IMPORTANTE: TEXT, não INTEGER (pode ter caracteres especiais)
  
  -- Hierarquia Comercial
  planner TEXT NOT NULL, -- Planejador responsável
  leader TEXT, -- Líder em Formação
  mediator TEXT, -- Mediador
  manager TEXT, -- Gerente
  
  -- Flags e Relacionamentos
  is_spouse BOOLEAN DEFAULT FALSE, -- Indica se é cônjuge
  spouse_partner_name TEXT, -- Nome do cliente pagante (para herdar NPS)
  
  -- Métricas v3 (Health Score)
  months_since_closing INTEGER, -- Meses desde fechamento
  nps_score_v3 INTEGER, -- 0-10 ou NULL para "Não Encontrou"
  has_nps_referral BOOLEAN DEFAULT FALSE, -- Indicação NPS
  overdue_installments INTEGER DEFAULT 0, -- Parcelas em atraso (0 = adimplente)
  overdue_days INTEGER DEFAULT 0, -- Dias de inadimplência
  cross_sell_count INTEGER DEFAULT 0, -- Produtos cross sell
  
  -- Status e Atividade
  is_active BOOLEAN DEFAULT TRUE,
  last_seen_at TIMESTAMP WITH TIME ZONE, -- Data da última atualização do CSV
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Índices Importantes:**
- `idx_clients_planner` em `planner`
- `idx_clients_manager` em `manager`
- `idx_clients_mediator` em `mediator`
- `idx_clients_leader` em `leader`
- `idx_clients_is_spouse` em `is_spouse`
- `idx_clients_identity_key` em `identity_key` (único)

### Tabela `health_score_history` (Histórico Temporal)
```sql
CREATE TABLE health_score_history (
  -- Identificação
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  recorded_date DATE NOT NULL, -- Data do registro (snapshot)
  
  -- Dados do Cliente no Momento do Registro (snapshot)
  client_name TEXT NOT NULL,
  planner TEXT NOT NULL,
  
  -- Cálculos do Health Score
  health_score INTEGER NOT NULL, -- Score total (0-100)
  health_category TEXT NOT NULL, -- 'Ótimo', 'Estável', 'Atenção', 'Crítico'
  
  -- Breakdown Detalhado (Pilares v3)
  nps_score_v3_pillar INTEGER NOT NULL, -- -10 a 20 pontos
  referral_pillar INTEGER NOT NULL, -- 0 a 10 pontos
  payment_pillar INTEGER NOT NULL, -- -20 a 40 pontos
  cross_sell_pillar INTEGER NOT NULL, -- 0 a 15 pontos
  tenure_pillar INTEGER NOT NULL, -- 0 a 15 pontos
  
  -- Dados Originais para Referência (snapshot)
  months_since_closing INTEGER,
  nps_score_v3 INTEGER,
  has_nps_referral BOOLEAN,
  overdue_installments INTEGER,
  overdue_days INTEGER,
  cross_sell_count INTEGER,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraint: Um registro por cliente por dia
  CONSTRAINT unique_client_date UNIQUE(client_id, recorded_date)
);
```

**Índices Importantes:**
- `idx_health_history_client` em `client_id`
- `idx_health_history_date` em `recorded_date`
- `idx_health_history_planner` em `planner`
- `idx_health_history_client_date` em `(client_id, recorded_date)`

### Tabela `hierarchy_roles` (Hierarquia Organizacional)
```sql
CREATE TABLE hierarchy_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL, -- Nome da pessoa
  role TEXT NOT NULL CHECK (role IN ('manager', 'mediator', 'leader')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(name, role)
);
```

**Dados Esperados:**
- **Gerentes (3):** Gabriel Cury, Rafael Kanashiro, Gabriel Bueno de Melo Serrano
- **Mediadores (5):** Vinicius Semeride Francini, Gustavo Machado, Caio Bragança, Gustavo Gomes, Matheus Okamura
- **Líderes em Formação (8):** Andre Luiz Soares Prezia, João Pedro Lotti Jardim, Francisco Rivera, Murilo Chiachio Santiago, Diego Perissinotto, Hélio Brollo Junior, Wellington Carvalho, Lucca de Lauro
- **Planejadores:** Todos os demais (não estão nesta tabela, são buscados dinamicamente de `clients.planner`)

### Tabela `user_profiles` (Autenticação)
```sql
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('manager', 'mediator', 'leader', 'planner')),
  hierarchy_name TEXT NOT NULL, -- Nome exato na hierarquia
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

## 🎯 TELAS E FUNCIONALIDADES

### 1. **Tela de Login (`/login`)**
**Componente:** `Login.tsx`

**Objetivos:**
- Autenticação de usuários existentes
- Criação de novas contas com validação de hierarquia
- Reset de senha

**Funcionalidades:**
- Login com email/senha via Supabase Auth
- Signup com seleção de cargo (manager, mediator, leader, planner)
- Validação de nome na hierarquia antes de criar conta
- Dropdown pesquisável para seleção de planejadores (lista longa)
- Validação de que o nome existe na hierarquia selecionada

**Dados Utilizados:**
- `user_profiles` para verificar usuários existentes
- `hierarchy_roles` para validar managers/mediators/leaders
- `clients.planner` para listar planejadores (filtrado para remover números e valores inválidos)

---

### 2. **Dashboard Principal (`/`)**
**Componente:** `Dashboard.tsx` (renderizado por `Index.tsx`)

**Objetivos:**
- Visão geral da carteira de clientes
- Filtragem por hierarquia organizacional
- Navegação para análises detalhadas
- Importação de CSV

**Funcionalidades Principais:**

#### **Aba "Visão Geral"**
- **Cards de Estatísticas:**
  - Total de clientes
  - Score médio geral
  - Distribuição por categoria (Ótimo, Estável, Atenção, Crítico)
  - Cards clicáveis que abrem drawer com lista de clientes da categoria
  
- **Filtros Hierárquicos:**
  - Filtro por Planejador (dropdown pesquisável)
  - Filtro por Gerente (dropdown)
  - Filtro por Mediador (dropdown)
  - Filtro por Líder (dropdown)
  - Filtros aplicam cascata (selecionar gerente filtra mediadores/líderes/planejadores)

- **Ações:**
  - Botão "Gerenciar Clientes" → navega para tela de gestão
  - Botão "Importar CSV" → abre modal de importação

#### **Aba "Análise de Indicadores"**
**Componente:** `AnalyticsView.tsx`

- **Insights e Recomendações:**
  - Cards clicáveis com oportunidades de melhoria
  - Plano de Ação Prioritário
  - Distribuições de métricas (NPS, Cross Sell, etc.)

- **Ranking de Planejadores:**
  - Lista ordenada por score médio
  - Métricas por planejador (total de clientes, score médio, distribuição)

#### **Aba "Análise Temporal"**
**Componente:** `TemporalAnalysis.tsx`

**OBJETIVO CRÍTICO:** Análise comparativa ao longo do tempo

- **Gráfico de Linha Temporal:**
  - Eixo X: Datas (período selecionado)
  - Eixo Y: Score médio
  - Múltiplas linhas por planejador (se filtrado)
  
- **Seletor de Período:**
  - Date range picker (início e fim)
  - Botões rápidos (7 dias, 30 dias, 90 dias, 1 ano)
  - **IMPORTANTE:** Deve respeitar `maxHistoryDate` (última data com histórico)

- **Dados Exibidos:**
  - Score médio por data
  - Total de clientes por data
  - Distribuição por categoria por data
  - Breakdown de pilares por data

**Dependências Críticas:**
- Requer histórico completo e consistente em `health_score_history`
- Cada data deve ter snapshot de todos os clientes ativos naquele dia
- Dados devem ser imutáveis (não alterar histórico de datas passadas)

#### **Aba "Análises Avançadas"**
**Componente:** `AdvancedAnalytics.tsx`

- **Movement Sankey Diagram:**
  - Visualização de transições de categoria entre duas datas
  - Mostra quantos clientes mudaram de categoria (ex: Estável → Atenção)
  - **OBJETIVO CRÍTICO:** Comparar estado inicial vs estado final
  
- **Portfolio Metrics:**
  - Matriz de concentração de risco
  - Distribuições e correlações

#### **Aba "Qualidade de Dados"**
**Componente:** `DataQuality.tsx`

- Identificação de dados faltantes ou inconsistentes
- Validação de integridade

---

### 3. **Gerenciar Clientes**
**Componente:** `ClientManager.tsx`

**Objetivos:**
- Listagem completa de clientes com filtros
- Edição individual de clientes
- Visualização detalhada de cada cliente

**Funcionalidades:**
- Lista paginada de clientes
- Filtros por categoria, planejador, hierarquia
- Busca por nome
- Cards de clientes com badge de categoria
- Drawer de detalhes ao clicar em "ver detalhes"
- Edição inline de campos do cliente
- Badge de Health Score com breakdown visual

---

### 4. **Importação CSV**
**Componente:** `BulkImportV3.tsx`

**Objetivos:**
- Importar dados diários do CSV
- Validar estrutura e dados antes de inserir
- Criar histórico automaticamente

**Processo de Importação:**

1. **Upload do Arquivo:**
   - Validação de tamanho (máx 10MB)
   - Leitura como texto UTF-8

2. **Validação Prévia:**
   - Verifica headers obrigatórios (case-insensitive)
   - Valida se CSV não está vazio
   - Extrai data da planilha (do nome do arquivo ou primeira linha)

3. **Parsing e Normalização:**
   - Parse manual do CSV (delimitador `;`)
   - Normalização de nomes (lowercase, trim)
   - Validação de campos obrigatórios (nome, planner)
   - Sanitização de telefones (remover caracteres não numéricos, manter como TEXT)
   - Parse de valores numéricos com fallback seguro

4. **Identificação de Cônjuges:**
   - Detecta campo "Cônjuge" preenchido
   - Extrai nome do pagante
   - Marca `is_spouse = TRUE`
   - Define `spouse_partner_name`

5. **Upsert no Banco:**
   - Chave única: `identity_key = "nome_normalizado|planner_normalizado"`
   - Se cliente existe: atualiza campos
   - Se cliente não existe: cria novo registro
   - Atualiza `last_seen_at` com data do CSV

6. **Criação de Histórico:**
   - Para cada cliente importado/atualizado:
     - Chama `record_health_score_history_v3(client_id, sheet_date)`
     - Função calcula Health Score e cria registro em `health_score_history`
     - **IMPORTANTE:** Histórico é criado apenas se `last_seen_at` existe e não é data futura

**Validações Críticas:**
- Nome e planner não podem ser vazios, `#n/d`, `#REF!`, ou apenas números
- Telefone deve ser TEXT (não INTEGER) para evitar overflow
- Valores numéricos validados antes de cast para INTEGER
- Duplicatas evitadas via `identity_key`

---

## 🔄 SISTEMA DE HEALTH SCORE

### Metodologia de Cálculo (v3)

O Health Score é calculado baseado em **5 pilares fundamentais**:

#### **1. NPS Score (-10 a 20 pontos)**
- **Promotor (9-10):** +20 pontos
- **Neutro (7-8):** +10 pontos
- **Detrator (0-6):** -10 pontos
- **Null (não respondeu):** +10 pontos (neutro padrão)
- **Cônjuge sem NPS:** Herda do pagante. Se pagante não tem NPS, recebe 0 pontos

#### **2. Indicação NPS (0 a 10 pontos)**
- **Tem indicação:** +10 pontos
- **Sem indicação:** 0 pontos

#### **3. Status de Pagamento (-20 a 40 pontos)**
- **Adimplente (0 parcelas):** +40 pontos
- **1 parcela atrasada:**
  - 0-7 dias: +25 pontos
  - 8-15 dias: +15 pontos
  - 16-30 dias: +5 pontos
  - 31-60 dias: 0 pontos
  - 61+ dias: -10 pontos
- **2 parcelas atrasadas:**
  - <30 dias: -10 pontos
  - ≥30 dias: -20 pontos
- **3+ parcelas:** Override para score total = 0 (Crítico)

#### **4. Cross Sell (0 a 15 pontos)**
- **3+ produtos:** +15 pontos
- **2 produtos:** +10 pontos
- **1 produto:** +5 pontos
- **0 produtos:** 0 pontos

#### **5. Tempo de Relacionamento (0 a 15 pontos)**
- **25+ meses:** +15 pontos (Fidelizado)
- **13-24 meses:** +15 pontos (Maduro)
- **9-12 meses:** +15 pontos (Consolidado)
- **5-8 meses:** +10 pontos (Consolidação inicial)
- **0-4 meses:** +5 pontos (Novo)

### Categorização
- **Ótimo:** 100+ pontos
- **Estável:** 60-99 pontos
- **Atenção:** 35-59 pontos
- **Crítico:** 0-34 pontos

### Cálculo no Banco vs Frontend
- **Frontend:** `calculateHealthScore()` em `src/utils/healthScore.ts` (para exibição em tempo real)
- **Backend:** `record_health_score_history_v3()` em SQL (para persistência no histórico)
- **IMPORTANTE:** Ambos devem ter lógica idêntica para consistência

---

## 📅 SISTEMA DE HISTÓRICO TEMPORAL

### Objetivo Crítico
O histórico temporal é **fundamental** para a ferramenta funcionar corretamente. Ele permite:
1. **Análise comparativa** entre períodos
2. **Visualização de tendências** ao longo do tempo
3. **Movement Sankey Diagram** (transições de categoria)
4. **Análise de performance** de planejadores ao longo do tempo

### Como o Histórico é Criado

#### **1. Durante Importação CSV:**
- Após cada cliente ser importado/atualizado, chama-se `record_health_score_history_v3(client_id, sheet_date)`
- A função SQL:
  - Busca dados atuais do cliente
  - Calcula Health Score baseado nos dados atuais
  - Cria registro em `health_score_history` com `recorded_date = sheet_date`
  - **Constraint:** `UNIQUE(client_id, recorded_date)` evita duplicatas

#### **2. Regras de Criação:**
- Histórico é criado apenas se `last_seen_at` existe e não é data futura
- Histórico é criado para **todos os clientes**, incluindo cônjuges
- Cônjuges herdam NPS do pagante se não tiverem NPS próprio
- Histórico de datas passadas **não pode ser alterado** (apenas `CURRENT_DATE` ou futuras)

#### **3. Estrutura do Registro Histórico:**
Cada registro contém:
- **Snapshot dos dados** do cliente naquela data
- **Score calculado** naquela data
- **Breakdown completo** dos pilares
- **Categoria** atribuída

### Problemas Comuns e Soluções

#### **Problema 1: Clientes Faltando no Histórico**
- **Causa:** Cliente não foi importado ou `last_seen_at` não foi definido
- **Solução:** Garantir que todos os clientes do CSV tenham `last_seen_at` definido na importação

#### **Problema 2: Histórico Duplicado**
- **Causa:** Múltiplas importações na mesma data
- **Solução:** Constraint `UNIQUE(client_id, recorded_date)` + `ON CONFLICT DO UPDATE`

#### **Problema 3: Histórico de Datas Passadas Alterado**
- **Causa:** Reimportação de CSV antigo altera histórico
- **Solução:** Função SQL valida que apenas `CURRENT_DATE` ou futuras podem ser atualizadas

#### **Problema 4: Cônjuges Sem Histórico**
- **Causa:** Lógica antiga excluía cônjuges
- **Solução:** Remover restrição, criar histórico para todos (cônjuges herdam NPS)

---

## 🔍 FUNÇÕES SQL CRÍTICAS

### `record_health_score_history_v3(client_id, recorded_date)`
**Objetivo:** Calcular e registrar Health Score no histórico

**Lógica:**
1. Busca dados do cliente
2. Calcula cada pilar do Health Score
3. Soma total e determina categoria
4. Insere ou atualiza registro em `health_score_history`
5. **IMPORTANTE:** Valida que `recorded_date` não é passada (exceto se for `CURRENT_DATE`)

**Parâmetros:**
- `p_client_id UUID`: ID do cliente
- `p_recorded_date DATE`: Data do registro (padrão: `CURRENT_DATE`)

**Retorno:** `VOID`

---

### `bulk_insert_clients_v3(clients_json JSONB, sheet_date DATE)`
**Objetivo:** Importação em massa de clientes

**Lógica:**
1. Recebe array JSON de clientes
2. Para cada cliente:
   - Normaliza nome e planner
   - Valida campos obrigatórios
   - Cria `identity_key`
   - Faz UPSERT na tabela `clients`
   - Atualiza `last_seen_at` com `sheet_date`
   - Chama `record_health_score_history_v3` para criar histórico

**Parâmetros:**
- `clients_json JSONB`: Array de objetos cliente
- `sheet_date DATE`: Data da planilha

**Retorno:** Número de clientes inseridos/atualizados

**Validações:**
- Nome e planner não podem ser vazios ou inválidos (`#n/d`, `#REF!`, números)
- Telefone deve ser TEXT (não INTEGER)
- Valores numéricos validados antes de cast

---

### `get_temporal_analysis_asof(start_date, end_date, planner_filter, manager_filter, mediator_filter, leader_filter)`
**Objetivo:** Análise temporal agregada para gráficos

**Lógica:**
1. Valida que `start_date <= end_date`
2. Limita `end_date` ao máximo histórico disponível (`MAX(recorded_date)`)
3. Agrupa por `recorded_date` e `planner`
4. Calcula médias e contagens
5. Aplica filtros de hierarquia
6. Retorna dados agregados por data

**Parâmetros:**
- `start_date DATE`: Data inicial
- `end_date DATE`: Data final
- `planner_filter TEXT[]`: Array de planejadores (ou NULL)
- `manager_filter TEXT[]`: Array de gerentes (ou NULL)
- `mediator_filter TEXT[]`: Array de mediadores (ou NULL)
- `leader_filter TEXT[]`: Array de líderes (ou NULL)

**Retorno:** Tabela com colunas:
- `recorded_date`
- `planner`
- `total_clients`
- `avg_health_score`
- `excellent_count`, `stable_count`, `warning_count`, `critical_count`
- `avg_*_pillar` (médias dos pilares)

---

## ⚠️ PONTOS CRÍTICOS PARA AUDITORIA

### 1. **Persistência de Dados**
- ✅ **Garantir que todos os clientes do CSV sejam importados**
- ✅ **Validar que `identity_key` é único e consistente**
- ✅ **Garantir que `last_seen_at` é sempre definido na importação**
- ✅ **Validar tipos de dados (telefone como TEXT, não INTEGER)**
- ✅ **Garantir que cônjuges tenham `spouse_partner_name` definido**

### 2. **Persistência de Histórico**
- ✅ **Garantir que histórico é criado para TODOS os clientes importados**
- ✅ **Garantir que histórico não é alterado para datas passadas**
- ✅ **Garantir que cada cliente tenha apenas um registro por data (`UNIQUE(client_id, recorded_date)`)**
- ✅ **Garantir que histórico seja criado com `recorded_date = sheet_date` (não `CURRENT_DATE`)**
- ✅ **Garantir que cônjuges tenham histórico (herdando NPS do pagante)**

### 3. **Análise Temporal Comparativa**
- ✅ **Garantir que `get_temporal_analysis_asof` retorna dados consistentes**
- ✅ **Garantir que `end_date` não excede `MAX(recorded_date)`**
- ✅ **Garantir que dados agregados estão corretos (médias, contagens)**
- ✅ **Garantir que filtros de hierarquia funcionam corretamente**

### 4. **Movement Sankey Diagram**
- ✅ **Garantir que estado inicial vem do histórico da `start_date`**
- ✅ **Garantir que estado final vem do histórico da `end_date`**
- ✅ **Garantir que clientes não aparecem como "Novo" se já existiam na `start_date`**
- ✅ **Garantir que transições de categoria estão corretas**

### 5. **Validação de Dados**
- ✅ **Garantir que campos obrigatórios são validados antes de inserir**
- ✅ **Garantir que valores inválidos (`#n/d`, `#REF!`, números soltos) são rejeitados**
- ✅ **Garantir que telefones são tratados como TEXT**
- ✅ **Garantir que valores numéricos são validados antes de cast**

### 6. **Hierarquia Organizacional**
- ✅ **Garantir que `hierarchy_roles` está atualizado e correto**
- ✅ **Garantir que filtros de hierarquia aplicam cascata corretamente**
- ✅ **Garantir que planejadores são listados corretamente (sem números, incluindo managers/mediators/leaders se aplicável)**

### 7. **Cálculo de Health Score**
- ✅ **Garantir que lógica no frontend (`calculateHealthScore`) é idêntica à do backend (`record_health_score_history_v3`)**
- ✅ **Garantir que herança de NPS para cônjuges funciona corretamente**
- ✅ **Garantir que override de 3+ parcelas funciona (score = 0)**

---

## 🎯 PERGUNTAS PARA A AUDITORIA

1. **A estrutura de dados está correta para suportar análise temporal?**
   - Histórico está sendo criado corretamente?
   - Dados são imutáveis para datas passadas?

2. **A validação de dados está robusta o suficiente?**
   - Campos obrigatórios são validados?
   - Valores inválidos são rejeitados?
   - Tipos de dados estão corretos?

3. **O processo de importação está garantindo persistência completa?**
   - Todos os clientes do CSV são importados?
   - Histórico é criado para todos?
   - `last_seen_at` é sempre definido?

4. **As funções SQL estão corretas e consistentes?**
   - Lógica de cálculo está correta?
   - Validações estão adequadas?
   - Performance está otimizada?

5. **A análise temporal está funcionando corretamente?**
   - Dados agregados estão corretos?
   - Filtros funcionam?
   - Movement Sankey está correto?

6. **Há riscos de perda de dados ou inconsistências?**
   - Constraints estão adequados?
   - Transações estão sendo usadas?
   - Rollback está implementado?

---

## 📝 NOTAS FINAIS

Esta ferramenta é **crítica** para a operação da empresa, pois:
- Baseia decisões estratégicas em dados quantitativos
- Acompanha evolução da carteira ao longo do tempo
- Identifica oportunidades de melhoria
- Avalia performance de planejadores

Portanto, é **essencial** garantir:
- ✅ **Integridade dos dados**
- ✅ **Consistência do histórico**
- ✅ **Precisão dos cálculos**
- ✅ **Confiabilidade das análises temporais**

Qualquer problema nessas áreas pode levar a:
- ❌ Decisões incorretas baseadas em dados errados
- ❌ Perda de confiança na ferramenta
- ❌ Necessidade de correções manuais complexas
- ❌ Impacto negativo no negócio

---

**Este prompt deve ser usado para solicitar uma auditoria técnica completa focada em garantir que a ferramenta funcione corretamente, especialmente em relação à persistência de dados e histórico temporal.**

