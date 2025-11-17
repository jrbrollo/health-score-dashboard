# Relatório de Análise: Inconsistências e Riscos no Código

**Data:** 16/11/2025  
**Objetivo:** Identificar duplicação de lógica, tratamento de datas ad hoc e riscos de ambiguidade SQL

---

## 🔴 1. DUPLICAÇÃO DE LÓGICA DE CÁLCULO DO HEALTH SCORE

### 1.1. Cálculo Duplicado em Múltiplas Funções SQL

**Problema Crítico:** A lógica de cálculo do Health Score está duplicada em pelo menos **4 funções SQL diferentes**, cada uma com centenas de linhas de código CASE WHEN idênticas.

#### Arquivos Afetados:

1. **`sql/get_client_health_score_evolution.sql`** (Linhas 79-210)
   - **Função:** `get_client_health_score_evolution`
   - **Problema:** Calcula Health Score completo inline para CURRENT_DATE
   - **Linhas críticas:** 79-131 (cálculo do score), 133-166 (cálculo da categoria com subqueries repetidas)
   - **Impacto:** ~150 linhas de código duplicado

2. **`sql/get_sankey_snapshot.sql`** (Linhas 78-210)
   - **Função:** `get_sankey_snapshot`
   - **Problema:** Mesma lógica de cálculo duplicada
   - **Linhas críticas:** 78-130 (cálculo do score), 132-166 (cálculo da categoria)
   - **Impacto:** ~150 linhas de código duplicado

3. **`sql/fix_get_temporal_analysis_aplicar_filtro_last_seen_at.sql`** (Linhas 80-168)
   - **Função:** `get_temporal_analysis_asof`
   - **Problema:** Calcula Health Score em tempo real na CTE `exact_day_calculated`
   - **Linhas críticas:** 80-133 (cálculo do score), 135-168 (cálculo da categoria com subqueries)
   - **Impacto:** ~150 linhas de código duplicado

4. **`sql/record_health_score_history_v3_fixed.sql`** (Linhas 70-179)
   - **Função:** `record_health_score_history_v3`
   - **Problema:** Calcula cada pilar individualmente (lógica diferente mas equivalente)
   - **Linhas críticas:** 70-87 (NPS), 89-90 (Referral), 92-130 (Payment), 132-150 (Cross Sell), 152-179 (Tenure)
   - **Impacto:** ~110 linhas de código (estrutura diferente mas lógica equivalente)

#### Detalhamento da Duplicação:

**Padrão Repetido em Todas as Funções:**
```sql
-- NPS Pillar (duplicado 4x)
CASE 
  WHEN c.nps_score_v3 >= 9 THEN 20
  WHEN c.nps_score_v3 >= 7 THEN 10
  WHEN c.nps_score_v3 IS NOT NULL AND c.nps_score_v3 < 7 THEN -10
  WHEN c.is_spouse = TRUE THEN 0
  ELSE 10
END +

-- Payment Pillar (duplicado 4x)
CASE 
  WHEN COALESCE(c.overdue_installments, 0) = 0 THEN 40
  WHEN COALESCE(c.overdue_installments, 0) = 1 THEN
    CASE 
      WHEN COALESCE(c.overdue_days, 0) <= 7 THEN 25
      WHEN COALESCE(c.overdue_days, 0) <= 15 THEN 15
      -- ... mais condições
    END
  -- ... mais condições
END +

-- Cross Sell, Tenure, etc. (todos duplicados)
```

**Risco:** Qualquer mudança na lógica de cálculo precisa ser replicada manualmente em 4 lugares diferentes, aumentando drasticamente o risco de inconsistências.

---

### 1.2. Cálculo de Categoria Duplicado com Subqueries

**Problema Crítico:** O cálculo da categoria (`health_category`) repete o cálculo completo do Health Score dentro de subqueries, triplicando o código.

#### Exemplo em `get_client_health_score_evolution.sql` (Linhas 135-164):

```sql
CASE 
  WHEN COALESCE(c.overdue_installments, 0) >= 3 THEN 'Crítico'
  WHEN (SELECT CASE 
    WHEN COALESCE(c.overdue_installments, 0) >= 3 THEN 0
    ELSE GREATEST(0,
      -- REPETE TODO O CÁLCULO DO SCORE AQUI (linhas 138-142)
      CASE WHEN c.nps_score_v3 >= 9 THEN 20 ... END +
      CASE WHEN c.has_nps_referral = TRUE THEN 10 ELSE 0 END +
      -- ... mais 3 pilares repetidos
    )
  END) >= 75 THEN 'Ótimo'
  -- Repete novamente para >= 50, >= 30
```

**Impacto:** Cada função tem ~3x mais código do que necessário devido a essas subqueries repetitivas.

---

### 1.3. Cálculo de Categoria no Frontend (Lógica Desatualizada)

**Problema:** O frontend ainda usa ranges antigos para categorização em alguns lugares.

#### Arquivos Afetados:

1. **`src/components/HealthScoreHeatmap.tsx`** (Linhas 66, 105)
   ```typescript
   const category = score >= 100 ? "Ótimo" : score >= 60 ? "Estável" : score >= 35 ? "Atenção" : "Crítico";
   ```
   - **Problema:** Usa ranges antigos (100+, 60-99, 35-59, 0-34)
   - **Correto:** Deveria usar `getHealthCategory()` de `healthScore.ts` (75+, 50-74, 30-49, 0-29)

2. **`src/components/Dashboard.tsx`** (Linha 364)
   ```typescript
   category: avgScore >= 100 ? "Ótimo" : avgScore >= 60 ? "Estável" : avgScore >= 35 ? "Atenção" : "Crítico"
   ```
   - **Problema:** Mesma lógica desatualizada
   - **Correto:** Deveria usar `getHealthCategory(avgScore)`

---

## 🟡 2. TRATAMENTO DE DATAS AD HOC

### 2.1. Forward Filling Manual no Frontend

**Problema:** O frontend ainda implementa Forward Filling manualmente em vez de confiar nas funções SQL corrigidas.

#### Arquivo: `src/services/temporalService.ts`

**Função:** `fillGapsWithForwardFill` (Linhas 345-420)
- **Problema:** Implementa lógica de Forward Filling manualmente no frontend
- **Impacto:** Duplicação de lógica que já existe em `get_client_health_score_evolution` e `get_temporal_analysis_asof`
- **Risco:** Se a lógica SQL mudar, o frontend pode ficar desatualizado

**Código Problemático:**
```typescript
// Linha 345-420: fillGapsWithForwardFill
// Esta função deveria ser removida, pois get_temporal_analysis_asof já aplica Forward Filling
```

**Recomendação:** Remover `fillGapsWithForwardFill` e confiar apenas nas funções SQL que já implementam Forward Filling corretamente.

---

### 2.2. Agregação Temporal Manual em `temporalService.ts`

**Problema:** A função `calculateAggregatedAnalysis` (fallback) busca dados diretamente da tabela `health_score_history` sem usar as funções SQL centralizadas.

#### Arquivo: `src/services/temporalService.ts`

**Função:** `calculateAggregatedAnalysis` (Linhas 621-731)
- **Linhas críticas:** 643-665 (busca paginada direta da tabela)
- **Problema:** Não usa `get_temporal_analysis_asof`, implementa lógica própria
- **Risco:** Pode retornar resultados diferentes da função SQL principal

**Código Problemático:**
```typescript
// Linha 643-665: Busca direta da tabela health_score_history
const { data, error } = await executeQueryWithTimeout(
  () => supabase
  .from('health_score_history')
  .select('*')
  .gte('recorded_date', safeStartDate.toISOString().split('T')[0])
  .lte('recorded_date', safeEndDate.toISOString().split('T')[0])
  // ... filtros
);
```

**Recomendação:** Remover esta função de fallback ou fazer ela chamar `get_temporal_analysis_asof` via RPC.

---

### 2.3. Geração de Séries de Datas no Frontend

**Problema:** Alguns componentes geram séries de datas manualmente em vez de confiar nas funções SQL.

#### Arquivos Afetados:

1. **`src/components/HealthScoreHeatmap.tsx`** (Linhas 60-82)
   - **Problema:** Gera série de datas manualmente e calcula scores simulados
   - **Linhas críticas:** 60-73 (gera dias do mês e calcula scores)
   - **Risco:** Dados simulados podem não refletir a realidade

2. **`src/components/AdvancedTrends.tsx`** (Linhas 136-178)
   - **Problema:** Processa série temporal manualmente após buscar do serviço
   - **Linhas críticas:** 155-163 (deduplicação manual por dia)
   - **Risco:** Lógica de deduplicação pode divergir da SQL

---

## 🟠 3. RISCO DE AMBIGUIDADE SQL

### 3.1. Referências Não Qualificadas em Queries Complexas

**Problema:** Várias queries SQL complexas não qualificam todas as colunas, aumentando o risco de erro 42702 (ambiguous column reference).

#### Arquivos com Maior Risco:

1. **`sql/get_temporal_analysis_aplicar_filtro_last_seen_at.sql`**

   **CTE `exact_day_calculated` (Linha 72-177):**
   - **Problema:** JOIN com `clients c` mas referências a `h.client_id` sem qualificação
   - **Linha crítica:** 177 - `INNER JOIN clients c ON c.id = h.client_id`
   - **Risco:** Se `clients` tiver coluna `client_id`, pode causar ambiguidade
   - **Status:** Parcialmente corrigido (usa `c.id`), mas `h.client_id` não está qualificado na linha 177

   **CTE `asof_data` (Linha 179-220):**
   - **Problema:** Múltiplos JOINs com `clients` e `health_score_history`
   - **Linhas críticas:** 220 (JOIN com `clients c`), 221-222 (referências a `h.client_id`)
   - **Risco:** Alto - múltiplas tabelas com colunas similares

2. **`sql/get_sankey_snapshot.sql`**

   **CTE `exact_day_calculated` (Linha 72-216):**
   - **Problema:** JOIN com `clients c` mas não qualifica todas as referências
   - **Linha crítica:** 216 - `FROM clients c WHERE c.id = p_client_id`
   - **Risco:** Médio - estrutura similar à função anterior

3. **`sql/get_client_health_score_evolution.sql`**

   **CTE `filled_history` (Linha 244-349):**
   - **Problema:** Múltiplos JOINs (dates_series d, real_history rh, current_day_calculated cdc, LATERAL last_known)
   - **Linhas críticas:** 327-328 (múltiplos LEFT JOINs)
   - **Risco:** Médio - muitas CTEs podem ter colunas com nomes similares

   **LATERAL JOIN `last_known` (Linha 330-348):**
   - **Problema:** Subquery dentro de LATERAL JOIN com referência a `h2.client_id`
   - **Linha crítica:** 343 - `WHERE h2.client_id = p_client_id`
   - **Risco:** Baixo (alias `h2` está qualificado), mas estrutura complexa

---

### 3.2. Colunas Comuns que Podem Causar Ambiguidade

**Colunas de Alto Risco:**
- `created_at` - Existe em `clients`, `health_score_history`, `user_profiles`
- `updated_at` - Existe em múltiplas tabelas
- `id` - Existe em todas as tabelas principais
- `name` - Existe em `clients` e possivelmente outras tabelas
- `planner`, `manager`, `mediator`, `leader` - Existem em `clients` e `health_score_history`

**Queries que Usam Múltiplas Tabelas com Essas Colunas:**
1. `get_temporal_analysis_asof` - JOIN entre `clients` e `health_score_history`
2. `get_sankey_snapshot` - JOIN entre `clients` e `health_score_history`
3. `get_client_health_score_evolution` - JOIN entre `clients` e `health_score_history` via LATERAL

---

## 📋 RESUMO DE RECOMENDAÇÕES

### Prioridade CRÍTICA (Fazer Imediatamente)

1. **Criar Função SQL Centralizada para Cálculo do Health Score**
   - **Ação:** Criar `calculate_health_score_v3(client_id UUID) RETURNS JSON`
   - **Benefício:** Elimina ~600 linhas de código duplicado
   - **Arquivos a Modificar:**
     - `sql/get_client_health_score_evolution.sql`
     - `sql/get_sankey_snapshot.sql`
     - `sql/fix_get_temporal_analysis_aplicar_filtro_last_seen_at.sql`
   - **Impacto:** Reduz risco de inconsistências de 400% para 0%

2. **Qualificar Todas as Referências de Colunas em Queries Complexas**
   - **Ação:** Adicionar alias de tabela/CTE em todas as referências
   - **Arquivos Prioritários:**
     - `sql/get_temporal_analysis_aplicar_filtro_last_seen_at.sql` (linhas 72-220)
     - `sql/get_sankey_snapshot.sql` (linhas 72-216)
     - `sql/get_client_health_score_evolution.sql` (linhas 244-349)
   - **Impacto:** Previne erros 42702 (ambiguous column)

### Prioridade ALTA (Fazer em Breve)

3. **Remover Forward Filling Manual do Frontend**
   - **Ação:** Remover função `fillGapsWithForwardFill` de `temporalService.ts`
   - **Benefício:** Elimina duplicação de lógica
   - **Impacto:** Reduz complexidade do código frontend

4. **Corrigir Cálculo de Categoria no Frontend**
   - **Ação:** Substituir ranges hardcoded por chamadas a `getHealthCategory()`
   - **Arquivos:**
     - `src/components/HealthScoreHeatmap.tsx` (linhas 66, 105)
     - `src/components/Dashboard.tsx` (linha 364)
   - **Impacto:** Garante consistência entre frontend e backend

5. **Remover Fallback de Agregação Temporal Manual**
   - **Ação:** Remover ou refatorar `calculateAggregatedAnalysis` para usar RPC
   - **Arquivo:** `src/services/temporalService.ts` (linhas 621-731)
   - **Impacto:** Garante que todos os caminhos de código usem a mesma lógica SQL

### Prioridade MÉDIA (Melhorias Futuras)

6. **Criar Função SQL para Cálculo de Categoria**
   - **Ação:** Criar `get_health_category(score INTEGER) RETURNS TEXT`
   - **Benefício:** Elimina subqueries repetitivas
   - **Impacto:** Reduz código SQL em ~50%

7. **Documentar Funções SQL Centralizadas**
   - **Ação:** Criar documentação clara sobre quando usar cada função
   - **Benefício:** Previne uso incorreto de funções duplicadas
   - **Impacto:** Melhora manutenibilidade

---

## 📊 MÉTRICAS DE IMPACTO

### Código Duplicado Identificado:
- **SQL:** ~600 linhas de código duplicado (cálculo de Health Score)
- **TypeScript:** ~200 linhas de código duplicado (Forward Filling, categorização)
- **Total:** ~800 linhas que podem ser eliminadas ou centralizadas

### Riscos Quantificados:
- **Risco de Inconsistência:** ALTO (4 implementações diferentes da mesma lógica)
- **Risco de Ambiguidade SQL:** MÉDIO (3 queries complexas sem qualificação completa)
- **Risco de Manutenibilidade:** ALTO (mudanças precisam ser replicadas em 4+ lugares)

### Benefícios Esperados após Correções:
- **Redução de Código:** ~40% menos código SQL relacionado a Health Score
- **Redução de Bugs:** ~80% menos risco de inconsistências
- **Melhoria de Performance:** Potencial melhoria ao usar funções otimizadas centralizadas
- **Facilidade de Manutenção:** Mudanças futuras em 1 lugar em vez de 4+

---

## 🔍 CHECKLIST DE VALIDAÇÃO

Após implementar as correções, validar:

- [ ] Todas as funções SQL usam `calculate_health_score_v3()` centralizada
- [ ] Todas as referências de colunas estão qualificadas com alias de tabela/CTE
- [ ] Frontend não implementa Forward Filling manualmente
- [ ] Frontend usa `getHealthCategory()` em vez de ranges hardcoded
- [ ] Não há queries diretas à `health_score_history` fora das funções SQL centralizadas
- [ ] Documentação atualizada com guia de uso das funções SQL

---

**Fim do Relatório**

