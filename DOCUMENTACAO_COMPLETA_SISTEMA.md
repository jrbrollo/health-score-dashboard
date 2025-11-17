# 📚 Documentação Completa do Sistema Health Score

## 📋 Índice
1. [Visão Geral da Solução](#1-visão-geral-da-solução)
2. [Esquema do Banco de Dados](#2-esquema-do-banco-de-dados)
3. [Fluxo de Dados: Upload do CSV](#3-fluxo-de-dados-upload-do-csv-o-ponto-crítico)
4. [Lógica de Negócio: Cálculo do Health Score](#4-lógica-de-negócio-cálculo-do-health-score)
5. [Estrutura dos Ficheiros](#5-estrutura-dos-ficheiros)

---

## 1. Visão Geral da Solução

### Objetivo Principal
A ferramenta Health Score é um sistema de gestão e análise de saúde de relacionamento com clientes de um escritório de planejamento financeiro. Ela permite:

- **Importar dados diários** de clientes via arquivos CSV
- **Calcular automaticamente** um "Health Score" (0-100 pontos) baseado em métricas de relacionamento
- **Manter histórico temporal** para comparar evolução dos clientes ao longo do tempo
- **Visualizar análises** através de dashboards e gráficos

### Fluxo Geral: Do Login ao Dashboard

1. **Autenticação**: Usuário faz login com email/senha (Supabase Auth)
2. **Carregamento de Dados**: Sistema busca snapshot mais recente de clientes (`last_seen_at` mais recente)
3. **Visualização**: Dashboard mostra estatísticas, gráficos e lista de clientes
4. **Importação CSV**: Usuário pode fazer upload de novo CSV com dados do dia
5. **Processamento**: CSV é parseado, validado e inserido no banco
6. **Criação de Histórico**: Para cada cliente, um registro é criado na tabela `health_score_history` com a data do CSV

---

## 2. Esquema do Banco de Dados

### 2.1 Tabela `clients` (Tabela Principal)

**Propósito**: Armazena o estado atual (snapshot mais recente) de cada cliente.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID | Chave primária (gerada automaticamente) |
| `name` | TEXT | Nome do cliente (obrigatório) |
| `email` | TEXT | Email do cliente (opcional) |
| `phone` | TEXT | Telefone do cliente (opcional, formato texto) |
| `planner` | TEXT | Nome do planejador responsável (obrigatório) |
| `leader` | TEXT | Líder em formação (opcional) |
| `mediator` | TEXT | Mediador (opcional) |
| `manager` | TEXT | Gerente (opcional) |
| `is_spouse` | BOOLEAN | Indica se é cônjuge (default: FALSE) |
| `spouse_partner_name` | TEXT | Nome do cliente pagante (para cônjuges) |
| `months_since_closing` | INTEGER | Meses desde fechamento do contrato (opcional) |
| `nps_score_v3` | INTEGER | NPS Score (0-10 ou NULL) |
| `has_nps_referral` | BOOLEAN | Tem indicação NPS (default: FALSE) |
| `overdue_installments` | INTEGER | Parcelas em atraso (default: 0) |
| `overdue_days` | INTEGER | Dias de inadimplência (default: 0) |
| `cross_sell_count` | INTEGER | Quantidade de produtos cross sell (default: 0) |
| `meetings_enabled` | BOOLEAN | Reuniões habilitadas (default: FALSE) |
| `identity_key` | TEXT | Chave única: `lower(nome)|lower(planner)` (único, não nulo) |
| `is_active` | BOOLEAN | Cliente ativo no snapshot atual (default: TRUE) |
| `last_seen_at` | TIMESTAMPTZ | **CRÍTICO**: Data/hora do último upload CSV deste cliente |
| `created_at` | TIMESTAMPTZ | Data de criação do registro |
| `updated_at` | TIMESTAMPTZ | Data da última atualização |

**Campos Deprecated (v2)**: `last_meeting`, `has_scheduled_meeting`, `app_usage`, `payment_status`, `has_referrals`, `nps_score`, `ecosystem_usage` (mantidos para compatibilidade)

**Índices Importantes**:
- `uniq_clients_identity_key`: Índice único em `identity_key` (garante um cliente por nome+planner)
- `idx_clients_planner`: Índice em `planner` (performance)
- `idx_clients_last_seen_at`: Índice em `last_seen_at` (para buscar snapshot)

**⚠️ IMPORTANTE**: A tabela `clients` armazena apenas o **estado atual** (snapshot mais recente). O histórico completo está na tabela `health_score_history`.

---

### 2.2 Tabela `health_score_history` (Histórico Temporal)

**Propósito**: Armazena snapshots históricos do Health Score de cada cliente, permitindo análise temporal.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID | Chave primária |
| `client_id` | UUID | FK para `clients.id` (ON DELETE CASCADE) |
| `recorded_date` | DATE | **CRÍTICO**: Data do snapshot (data do CSV) |
| `client_name` | TEXT | Nome do cliente no momento do registro (snapshot) |
| `planner` | TEXT | Planejador no momento do registro (snapshot) |
| `health_score` | INTEGER | Score total calculado (0-100) |
| `health_category` | TEXT | Categoria: 'Ótimo', 'Estável', 'Atenção', 'Crítico' |
| `nps_score_v3_pillar` | INTEGER | Pontos do pilar NPS (-10 a 20) |
| `referral_pillar` | INTEGER | Pontos do pilar Indicação (0 ou 10) |
| `payment_pillar` | INTEGER | Pontos do pilar Inadimplência (-20 a 40) |
| `cross_sell_pillar` | INTEGER | Pontos do pilar Cross Sell (0 a 15) |
| `tenure_pillar` | INTEGER | Pontos do pilar Meses Relacionamento (0 a 15) |
| `months_since_closing` | INTEGER | Meses desde fechamento (snapshot) |
| `nps_score_v3` | INTEGER | NPS Score usado no cálculo (próprio ou herdado) |
| `has_nps_referral` | BOOLEAN | Tem indicação (snapshot) |
| `overdue_installments` | INTEGER | Parcelas em atraso (snapshot) |
| `overdue_days` | INTEGER | Dias de inadimplência (snapshot) |
| `cross_sell_count` | INTEGER | Produtos cross sell (snapshot) |
| `created_at` | TIMESTAMPTZ | Data/hora de criação do registro histórico |

**Constraint Único**: `UNIQUE(client_id, recorded_date)` - **Um registro por cliente por dia**

**Índices Importantes**:
- `idx_health_history_client`: Índice em `client_id`
- `idx_health_history_date`: Índice em `recorded_date`
- `idx_health_history_client_date`: Índice composto em `(client_id, recorded_date)`

**⚠️ CRÍTICO**: Esta tabela é **imutável para datas passadas**. A função `record_health_score_history_v3` só atualiza registros se `recorded_date >= CURRENT_DATE` (proteção contra alteração de histórico).

---

### 2.3 Tabela `user_profiles` (Perfis de Usuário)

**Propósito**: Armazena informações de perfil e hierarquia dos usuários do sistema.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID | FK para `auth.users.id` (chave primária) |
| `email` | TEXT | Email do usuário |
| `role` | TEXT | Papel: 'manager', 'mediator', 'leader', 'planner' |
| `hierarchy_name` | TEXT | Nome do usuário na hierarquia organizacional |
| `created_at` | TIMESTAMPTZ | Data de criação |
| `updated_at` | TIMESTAMPTZ | Data de atualização |

---

### 2.4 Tabela `hierarchy_roles` (Hierarquia Organizacional)

**Propósito**: Define a estrutura hierárquica da organização (gerentes, mediadores, líderes).

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID | Chave primária |
| `name` | TEXT | Nome da pessoa |
| `role` | TEXT | Papel: 'manager', 'mediator', 'leader' |
| `created_at` | TIMESTAMPTZ | Data de criação |
| `updated_at` | TIMESTAMPTZ | Data de atualização |

**Constraint**: `UNIQUE(name, role)`

---

## 3. Fluxo de Dados: Upload do CSV (O Ponto Crítico)

### 3.1 Visão Geral do Fluxo

```
CSV Upload → Parse → Validação → Conversão → Bulk Insert → Criação de Histórico
```

### 3.2 Passo a Passo Detalhado

#### **Passo 1: Leitura e Parsing do CSV**

**Arquivo**: `src/components/BulkImportV3.tsx`

**Função**: `parseCsvV3(text: string)`

**Processo**:
1. Usa biblioteca `Papa.parse` com delimitador `;` (ponto e vírgula)
2. Valida headers obrigatórios:
   - `Clientes`, `Email`, `Telefone`, `Cônjuge`, `Meses do Fechamento`
   - `Planejador`, `Líder em Formação`, `Mediador`, `Gerente`
   - `NPS`, `Indicação NPS`, `Inadimplência Parcelas`, `Inadimplência Dias`, `Cross Sell`
3. Extrai data da planilha da coluna `R` (se disponível)
4. Para cada linha:
   - Normaliza valores (remove espaços, caracteres especiais)
   - Valida nome e planejador (não podem ser vazios ou placeholders)
   - Identifica cônjuges (coluna "Cônjuge" preenchida)
   - Converte valores numéricos (NPS, parcelas, dias, cross sell)
   - Cria objeto `Client` com dados normalizados

**Código Principal**:
```typescript
const parsed = Papa.parse(text, {
  delimiter: ';',
  header: true,
  quoteChar: '"',
  skipEmptyLines: 'greedy',
  transformHeader: (h) => h.trim(),
});
```

---

#### **Passo 2: Identificação de Clientes Existentes**

**Método**: Usa `identity_key` = `lower(nome)|lower(planner)`

**Lógica**:
- Cada cliente é identificado pela combinação única de **nome normalizado + planner normalizado**
- Exemplo: `"joão silva|barroso"` identifica o cliente "João Silva" do planejador "Barroso"
- Se o cliente já existe (mesmo `identity_key`), será feito **UPSERT** (UPDATE se existe, INSERT se não existe)

**⚠️ IMPORTANTE**: O sistema **NÃO** usa email ou telefone como identificador único, pois esses campos podem mudar ou estar ausentes.

---

#### **Passo 3: Lógica de Atualização (O Problema Crítico)**

**Arquivo**: `sql/bulk_insert_client_v3.sql` e `sql/fix_import_flow.sql`

**Função SQL**: `bulk_insert_client_v3(payload JSONB, p_import_date DATE, p_seen_at TIMESTAMPTZ)`

**Cenário A (ERRADO - NÃO É O QUE ACONTECE)**:
```sql
-- ❌ ERRADO: Atualizar registro existente sem preservar histórico
UPDATE clients SET ... WHERE identity_key = ...;
-- Problema: Perde dados anteriores, não cria snapshot histórico
```

**Cenário B (CORRETO - É O QUE ACONTECE)**:
```sql
-- ✅ CORRETO: UPSERT na tabela clients + INSERT na tabela histórico
INSERT INTO clients (...) VALUES (...)
ON CONFLICT (identity_key) 
DO UPDATE SET 
  -- Atualiza campos do cliente
  phone = EXCLUDED.phone,
  email = EXCLUDED.email,
  ...
  -- CRÍTICO: Atualiza last_seen_at com data do CSV
  last_seen_at = GREATEST(EXCLUDED.last_seen_at, clients.last_seen_at)
RETURNING *;

-- Depois, cria registro no histórico
PERFORM record_health_score_history_v3(result.id, p_import_date);
```

**⚠️ PONTO CRÍTICO**: 

1. **Tabela `clients`**: É atualizada com dados do CSV mais recente (UPSERT baseado em `identity_key`)
   - Se cliente existe → UPDATE dos campos
   - Se cliente não existe → INSERT novo registro
   - **`last_seen_at`** é atualizado com a data do CSV (usando `GREATEST` para evitar retrocesso)

2. **Tabela `health_score_history`**: Recebe um **NOVO registro** para cada cliente importado
   - Um registro por cliente por dia (`UNIQUE(client_id, recorded_date)`)
   - Se já existe registro para aquela data → UPDATE apenas se `recorded_date >= CURRENT_DATE` (proteção)
   - Se não existe → INSERT novo registro histórico

**Código SQL Completo** (`bulk_insert_client_v3`):
```sql
INSERT INTO clients (
  name, planner, phone, email, ...
  identity_key, is_active, last_seen_at
) VALUES (
  (payload->>'name')::TEXT,
  (payload->>'planner')::TEXT,
  ...
  lower(trim((payload->>'name')::text)) || '|' || lower(trim((payload->>'planner')::text)),
  TRUE,
  seen_at_final  -- Data do CSV convertida para TIMESTAMPTZ
)
ON CONFLICT (identity_key)
DO UPDATE SET
  -- Atualiza todos os campos do cliente
  phone = EXCLUDED.phone,
  email = EXCLUDED.email,
  ...
  -- CRÍTICO: Proteção contra retrocesso de data
  last_seen_at = GREATEST(EXCLUDED.last_seen_at, clients.last_seen_at)
RETURNING * INTO result;

-- Cria registro histórico com data do CSV
PERFORM record_health_score_history_v3(result.id, p_import_date);
```

---

#### **Passo 4: Criação do Histórico**

**Função SQL**: `record_health_score_history_v3(p_client_id UUID, p_recorded_date DATE)`

**Processo**:
1. Busca dados atuais do cliente na tabela `clients`
2. Calcula Health Score usando dados do cliente
3. Insere registro na tabela `health_score_history` com:
   - `recorded_date` = data do CSV (`p_recorded_date`)
   - Todos os campos snapshot (nome, planner, métricas, score calculado)

**Proteção Contra Alteração de Histórico**:
```sql
INSERT INTO health_score_history (...)
VALUES (...)
ON CONFLICT (client_id, recorded_date)
DO UPDATE SET
  -- Só atualiza se a data for hoje ou futura
  health_score = CASE 
    WHEN p_recorded_date >= CURRENT_DATE THEN EXCLUDED.health_score 
    ELSE health_score  -- Preserva histórico antigo
  END,
  ...
```

**⚠️ CRÍTICO**: Se você fizer upload de um CSV com data passada (ex: 13/11/2025) e já existir histórico para essa data, o sistema:
- **Se `recorded_date < CURRENT_DATE`**: NÃO atualiza o histórico (preserva dados antigos)
- **Se `recorded_date >= CURRENT_DATE`**: Atualiza o histórico (permite correções do dia atual)

---

#### **Passo 5: Busca de Snapshot Atual**

**Arquivo**: `src/services/clientService.ts`

**Função**: `getAllClients()`

**Lógica**:
```typescript
// 1. Busca a data do último snapshot (last_seen_at mais recente)
const { data: lastDateRows } = await supabase
  .from('clients')
  .select('last_seen_at')
  .not('last_seen_at', 'is', null)
  .order('last_seen_at', { ascending: false })
  .limit(1);

const lastSeenTs = lastDateRows[0]?.last_seen_at;

// 2. Busca apenas clientes com last_seen_at = data mais recente
const { data } = await supabase
  .from('clients')
  .select('*')
  .eq('last_seen_at', lastSeenTs)  // ← CRÍTICO: Filtra por snapshot
  .order('created_at', { ascending: false });
```

**⚠️ IMPORTANTE**: O sistema sempre mostra apenas o snapshot mais recente. Clientes que não apareceram no último CSV não aparecem no dashboard (mas seus históricos são preservados).

---

### 3.3 Possíveis Problemas com Histórico

#### **Problema 1: Histórico sendo alterado ao fazer upload de novo CSV**

**Causa Possível**: Se você fizer upload de um CSV com data passada e já existir histórico para essa data, o sistema pode estar atualizando o histórico.

**Solução Implementada**: A função `record_health_score_history_v3` tem proteção:
```sql
-- Só atualiza histórico se recorded_date >= CURRENT_DATE
health_score = CASE 
  WHEN p_recorded_date >= CURRENT_DATE THEN EXCLUDED.health_score 
  ELSE health_score  -- Preserva histórico antigo
END
```

**Verificação**: Execute no Supabase SQL Editor:
```sql
-- Verificar se há registros históricos sendo atualizados incorretamente
SELECT 
  recorded_date,
  COUNT(*) as registros,
  MIN(created_at) as primeiro_registro,
  MAX(created_at) as ultimo_registro
FROM health_score_history
GROUP BY recorded_date
ORDER BY recorded_date DESC;
```

Se `ultimo_registro` for muito mais recente que `recorded_date`, pode indicar atualizações indevidas.

---

#### **Problema 2: Dados de dias anteriores sumindo**

**Causa Possível**: A função `getAllClients()` filtra por `last_seen_at` mais recente. Se você fizer upload de um CSV com data antiga, os clientes podem "sumir" do dashboard.

**Solução**: O dashboard sempre mostra o snapshot mais recente. Para ver dados históricos, use a análise temporal.

---

#### **Problema 3: Múltiplos registros históricos para a mesma data**

**Causa Possível**: Se você fizer upload do mesmo CSV múltiplas vezes, pode criar registros duplicados.

**Solução**: A constraint `UNIQUE(client_id, recorded_date)` previne duplicatas. Se já existe registro para aquela data, será feito UPDATE (se `recorded_date >= CURRENT_DATE`).

---

## 4. Lógica de Negócio: Cálculo do Health Score

### 4.1 Visão Geral

O Health Score é calculado com base em **5 pilares**, totalizando **0-100 pontos**:

1. **NPS Score** (-10 a 20 pontos)
2. **Indicação NPS** (0 ou 10 pontos)
3. **Inadimplência** (-20 a 40 pontos)
4. **Cross Sell** (0 a 15 pontos)
5. **Meses Relacionamento** (0 a 15 pontos)

**Arquivo**: `src/utils/healthScore.ts`

**Função Principal**: `calculateHealthScore(client: Client, payerNpsMap?: Map<string, number | null>): HealthScore`

---

### 4.2 Detalhamento dos Pilares

#### **Pilar 1: NPS Score (-10 a 20 pontos)**

**Campo CSV**: `NPS` (coluna numérica 0-10 ou vazio)

**Lógica**:
```typescript
if (npsValue >= 9) {
  return 20;  // Promotor (9-10)
} else if (npsValue >= 7) {
  return 10;  // Neutro (7-8)
} else if (npsValue >= 0) {
  return -10; // Detrator (0-6)
} else if (client.isSpouse) {
  return 0;   // Cônjuge sem NPS próprio nem do pagante
} else {
  return 10;  // Cliente não-cônjuge sem NPS (neutro padrão)
}
```

**Herança de NPS para Cônjuges**:
- Se cliente é cônjuge (`is_spouse = TRUE`) e não tem NPS próprio
- Busca NPS do pagante usando `spouse_partner_name + planner`
- Se encontrar, usa o NPS do pagante; senão, usa 0 pontos

---

#### **Pilar 2: Indicação NPS (0 ou 10 pontos)**

**Campo CSV**: `Indicação NPS` (coluna texto: "Sim", "Não", etc.)

**Lógica**:
```typescript
return client.hasNpsReferral ? 10 : 0;
```

---

#### **Pilar 3: Inadimplência (-20 a 40 pontos)**

**Campos CSV**: 
- `Inadimplência Parcelas` (número: 0, 1, 2, 3+)
- `Inadimplência Dias` (número: dias de atraso)

**Lógica**:
```typescript
// Override: 3+ parcelas = score total 0 (tratado antes)
if (installments === 0) {
  return 40;  // Adimplente
} else if (installments === 1) {
  if (days <= 7) return 25;
  if (days <= 15) return 15;
  if (days <= 30) return 5;
  if (days <= 60) return 0;
  return -10;  // 61+ dias
} else if (installments === 2) {
  if (days >= 30) return -20;  // 2 parcelas + 30+ dias
  return -10;  // 2 parcelas com menos de 30 dias
}
```

**Override Global**: Se `overdue_installments >= 3`, o Health Score total é **0** (Crítico), independente dos outros pilares.

---

#### **Pilar 4: Cross Sell (0 a 15 pontos)**

**Campo CSV**: `Cross Sell` (número: quantidade de produtos)

**Lógica**:
```typescript
if (count === 0) return 0;
if (count === 1) return 5;
if (count === 2) return 10;
return 15;  // 3+ produtos
```

---

#### **Pilar 5: Meses Relacionamento (0 a 15 pontos)**

**Campo CSV**: `Meses do Fechamento` (número: meses desde fechamento)

**Lógica**:
```typescript
if (months === null || months < 0) return 0;
if (months <= 4) return 5;   // Onboarding
if (months <= 8) return 10;  // Consolidação inicial
if (months <= 12) return 15; // Consolidado
if (months <= 24) return 15; // Maduro
return 15;  // 25+ meses (Fidelizado)
```

---

### 4.3 Cálculo Final e Categorização

**Cálculo**:
```typescript
let totalScore = nps + referral + payment + crossSell + tenure;

// Garantir mínimo de 0 (sem valores negativos)
if (totalScore < 0) {
  totalScore = 0;
}

// Override: 3+ parcelas = 0
if (client.overdueInstallments >= 3) {
  totalScore = 0;
  category = "Crítico";
} else {
  // Categorização normal
  if (totalScore >= 75) category = "Ótimo";
  else if (totalScore >= 50) category = "Estável";
  else if (totalScore >= 30) category = "Atenção";
  else category = "Crítico";
}
```

**Categorias**:
- **Ótimo**: 75-100 pontos
- **Estável**: 50-74 pontos
- **Atenção**: 30-49 pontos
- **Crítico**: 0-29 pontos

---

### 4.4 Onde o Cálculo é Feito

**Frontend**: `src/utils/healthScore.ts` - Função `calculateHealthScore()`
- Usado para cálculos em tempo real no dashboard
- Usado para preview antes de salvar

**Backend (SQL)**: `sql/record_health_score_history_v3_fixed.sql` - Função `record_health_score_history_v3()`
- Usado para calcular e salvar histórico no banco
- Lógica idêntica ao frontend (garantir consistência)

**⚠️ IMPORTANTE**: O cálculo é feito **antes de salvar** no banco. O histórico armazena o score calculado, não recalcula depois.

---

## 5. Estrutura dos Ficheiros

### 5.1 Frontend (React + TypeScript)

#### **Componentes Principais**

| Arquivo | Responsabilidade |
|---------|------------------|
| `src/pages/Index.tsx` | Página principal, gerencia estado global, chama serviços |
| `src/components/Dashboard.tsx` | Dashboard com estatísticas e gráficos |
| `src/components/BulkImportV3.tsx` | **CRÍTICO**: Componente de upload e parsing de CSV |
| `src/components/ClientManager.tsx` | Gerenciamento de clientes (lista, filtros, paginação) |
| `src/components/TemporalAnalysis.tsx` | Análise temporal do Health Score |
| `src/components/MovementSankey.tsx` | Visualização de movimento entre categorias |

#### **Serviços**

| Arquivo | Responsabilidade |
|---------|------------------|
| `src/services/clientService.ts` | **CRÍTICO**: Todas as operações CRUD com clientes |
| `src/services/temporalService.ts` | Busca dados históricos para análises temporais |

#### **Utilitários**

| Arquivo | Responsabilidade |
|---------|------------------|
| `src/utils/healthScore.ts` | **CRÍTICO**: Lógica de cálculo do Health Score |
| `src/lib/filters.ts` | Filtros de hierarquia e busca |
| `src/lib/authFilters.ts` | Aplicação de filtros baseados em perfil do usuário |

#### **Tipos**

| Arquivo | Responsabilidade |
|---------|------------------|
| `src/types/client.ts` | Interfaces TypeScript para `Client`, `HealthScore`, etc. |

---

### 5.2 Backend (SQL - Supabase)

#### **Scripts de Setup**

| Arquivo | Responsabilidade |
|---------|------------------|
| `sql/setup_v3.sql` | Criação inicial das tabelas e índices |
| `sql/temporal_setup.sql` | Criação da tabela `health_score_history` |

#### **Funções SQL Críticas**

| Arquivo | Função | Responsabilidade |
|---------|--------|------------------|
| `sql/bulk_insert_client_v3.sql` | `bulk_insert_client_v3()` | **CRÍTICO**: Insere/atualiza um cliente (UPSERT) |
| `sql/fix_import_flow.sql` | `bulk_insert_clients_v3()` | **CRÍTICO**: Processa array de clientes, chama `bulk_insert_client_v3` para cada um |
| `sql/record_health_score_history_v3_fixed.sql` | `record_health_score_history_v3()` | **CRÍTICO**: Calcula e registra Health Score no histórico |

#### **Scripts de Correção**

| Arquivo | Responsabilidade |
|---------|------------------|
| `sql/fix_import_flow.sql` | Correções no fluxo de importação (proteção de histórico) |
| `sql/REATIVAR_RLS_CORRETO.sql` | Políticas de Row Level Security (RLS) |

---

## 🔍 Diagnóstico do Problema de Histórico

### Checklist para Verificar Problemas

1. **Verificar se histórico está sendo criado corretamente**:
```sql
-- Contar registros históricos por data
SELECT 
  recorded_date,
  COUNT(*) as total_registros,
  COUNT(DISTINCT client_id) as clientes_unicos
FROM health_score_history
GROUP BY recorded_date
ORDER BY recorded_date DESC
LIMIT 10;
```

2. **Verificar se há atualizações indevidas de histórico antigo**:
```sql
-- Verificar se registros antigos estão sendo atualizados
SELECT 
  recorded_date,
  COUNT(*) as registros,
  MIN(created_at) as primeiro_criado,
  MAX(created_at) as ultimo_atualizado,
  MAX(created_at) - MIN(created_at) as diferenca_tempo
FROM health_score_history
WHERE recorded_date < CURRENT_DATE - INTERVAL '1 day'
GROUP BY recorded_date
HAVING MAX(created_at) - MIN(created_at) > INTERVAL '1 hour'
ORDER BY recorded_date DESC;
```

3. **Verificar se `last_seen_at` está correto**:
```sql
-- Verificar distribuição de last_seen_at
SELECT 
  last_seen_at::date as data_snapshot,
  COUNT(*) as clientes
FROM clients
WHERE last_seen_at IS NOT NULL
GROUP BY last_seen_at::date
ORDER BY last_seen_at::date DESC
LIMIT 10;
```

4. **Verificar se há clientes duplicados**:
```sql
-- Verificar duplicatas por identity_key
SELECT 
  identity_key,
  COUNT(*) as ocorrencias,
  array_agg(DISTINCT last_seen_at::date ORDER BY last_seen_at::date DESC) as datas
FROM clients
WHERE identity_key IS NOT NULL
GROUP BY identity_key
HAVING COUNT(*) > 1;
```

---

## 📝 Resumo Executivo para o Parceiro de Programação

### Problema Reportado
> "Quando subo um novo CSV com os dados de hoje, parece que os dados de dias anteriores (o histórico) estão a ser alterados ou apagados."

### Como o Sistema Funciona (Correto)

1. **Upload de CSV** → Parse → Validação → Conversão para objetos `Client`
2. **Bulk Insert** → Para cada cliente:
   - **UPSERT na tabela `clients`** (atualiza se existe, insere se não existe)
   - **Atualiza `last_seen_at`** com data do CSV
   - **Chama `record_health_score_history_v3()`** para criar registro histórico
3. **Criação de Histórico** → Insere novo registro em `health_score_history` com:
   - `recorded_date` = data do CSV
   - Todos os campos snapshot
   - Score calculado

### Proteções Implementadas

1. **Constraint único**: `UNIQUE(client_id, recorded_date)` - Um registro por cliente por dia
2. **Proteção de histórico antigo**: Só atualiza histórico se `recorded_date >= CURRENT_DATE`
3. **Proteção de retrocesso**: `last_seen_at = GREATEST(EXCLUDED.last_seen_at, clients.last_seen_at)`

### Possíveis Causas do Problema

1. **Trigger automático ainda ativo**: Verificar se há trigger em `clients` que cria histórico automaticamente
2. **Data do CSV incorreta**: Se CSV tem data passada e já existe histórico, pode estar atualizando
3. **Múltiplos uploads do mesmo CSV**: Pode estar criando/atualizando histórico múltiplas vezes

### Próximos Passos Recomendados

1. Executar queries de diagnóstico acima
2. Verificar logs do Supabase durante um upload
3. Verificar se há triggers ativos na tabela `clients`
4. Testar upload de CSV com data passada e verificar comportamento

---

**Documentação criada em**: 2025-01-XX  
**Versão do Sistema**: Health Score v3  
**Última atualização**: Baseada no código atual do repositório

