# 🔍 ANÁLISE COMPLETA: SEÇÃO DE ANÁLISE AVANÇADA

**Data:** 17/11/2025
**Analista:** Claude (Anthropic AI Assistant)
**Escopo:** Portfolio Health Metrics + Movement Sankey Diagram

---

## 📋 SUMÁRIO EXECUTIVO

Após análise detalhada dos componentes **PortfolioMetrics** e **MovementSankey**, identificamos:

- ✅ **4 funcionalidades corretas** e bem implementadas
- ⚠️ **3 bugs potenciais** que podem causar imprecisão nos dados
- 🔴 **1 bug crítico** que afeta diretamente a precisão do Movement Sankey
- 📊 **5 testes recomendados** para validação

---

## 🎯 1. PORTFOLIO HEALTH METRICS

### 1.1 Componente Analisado
**Arquivo:** `src/components/PortfolioMetrics.tsx` (825 linhas)

### 1.2 Funcionalidades Implementadas

#### ✅ Portfolio Health Index (linhas 202-203)
```typescript
const portfolioHealthIndex = Math.round(averageScore);
```
**Status:** ✅ CORRETO
- Calcula média dos health scores de todos os clientes filtrados
- Arredonda para inteiro

#### ✅ Risk Concentration (linhas 206-211)
```typescript
const riskConcentration = {
  critical: healthScores.filter(score => score.category === "Crítico").length,
  warning: healthScores.filter(score => score.category === "Atenção").length,
  stable: healthScores.filter(score => score.category === "Estável").length,
  excellent: healthScores.filter(score => score.category === "Ótimo").length
};
```
**Status:** ✅ CORRETO
- Conta corretamente clientes em cada categoria

#### ⚠️ Trend Direction (linhas 213-275)
```typescript
// Buscar dados temporais agregados
const temporalData = selectedPlanner === 'all'
  ? await temporalService.getAggregatedTemporalAnalysis(sevenDaysAgo, today, hierarchyFilters)
  : await temporalService.getTemporalAnalysis(sevenDaysAgo, today, selectedPlanner, hierarchyFilters);

// Usar score atual calculado (mais preciso) e comparar com histórico
const currentScore = averageScore;

if (pastRecord && pastRecord.avgHealthScore > 0) {
  const pastScore = pastRecord.avgHealthScore;
  const change = currentScore - pastScore;
  const changePercent = (change / pastScore) * 100;
  ...
}
```

**Status:** ⚠️ **POTENCIAL INCONSISTÊNCIA**

**Problema Identificado:**
- Compara `averageScore` calculado no **frontend** (linha 200) com `pastRecord.avgHealthScore` do **backend** (linha 250)
- Se houver divergência entre cálculo frontend e backend (que sabemos que pode existir), a tendência será **incorreta**

**Impacto:**
- Tendência pode mostrar "melhorou +5%" quando na verdade piorou
- Usuário toma decisões baseadas em dados imprecisos

**Solução Recomendada:**
```typescript
// Em vez de usar averageScore calculado agora, buscar histórico de HOJE do banco
const todayHistory = await temporalService.getTemporalAnalysis(today, today, selectedPlanner, hierarchyFilters);
const currentScore = todayHistory[0]?.avgHealthScore || averageScore; // Fallback para calculado
```

#### ✅ Volatility Index (linhas 277-281)
```typescript
const scores = healthScores.map(score => score.score);
const mean = averageScore;
const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / totalClients;
const volatilityIndex = Math.round(Math.sqrt(variance));
```
**Status:** ✅ CORRETO
- Cálculo matemático de desvio padrão está correto
- Mede dispersão dos scores na carteira

#### ✅ Planner Risk Data (linhas 294-314)
```typescript
const calculatePlannerRiskData = (clientsByPlanner: Client[]): PlannerRiskData[] => {
  const grouped = new Map<string, Client[]>();
  clientsByPlanner.forEach(client => {
    if (!client.planner || client.planner === '0') return;
    const key = client.planner;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(client);
  });
  ...
}
```
**Status:** ✅ CORRETO
- Agrupa clientes por planejador corretamente
- Filtra planejadores inválidos ('0')

---

## 🌊 2. MOVEMENT SANKEY DIAGRAM

### 2.1 Componente Analisado
**Arquivo:** `src/components/MovementSankey.tsx` (1677 linhas)

### 2.2 Funcionalidades Implementadas

#### ✅ Load Client History for Date (linhas 145-302)
```typescript
const loadClientHistoryForDate = useCallback(async (targetDate: Date, clientIds: (string | number)[]): Promise<Map<string, HealthScoreHistory>> => {
  ...
  const minDateStr = MIN_HISTORY_DATE.toISOString().split('T')[0];
  const { data, error } = await (supabase as any)
    .from('health_score_history')
    .select('...')
    .in('client_id', batch)
    .gte('recorded_date', minDateStr) // ✅ Filtro MIN_HISTORY_DATE aplicado
    .lte('recorded_date', dateStr)
    .order('recorded_date', { ascending: false })
    .limit(1000);
  ...
}
```

**Status:** ✅ CORRETO
- Busca histórico apenas a partir de MIN_HISTORY_DATE (13/11/2025)
- Usa cache para evitar buscas repetidas
- Processa em lotes para evitar URLs longas (batch size 500)
- Pega apenas o registro mais recente para cada cliente

#### 🔴 Generate Movement Data - **BUG CRÍTICO** (linhas 355-521)

**Linha 382-417:**
```typescript
// Para a data final, usar estado atual se for hoje, senão buscar histórico
const today = new Date();
today.setHours(0, 0, 0, 0);

let endHistory: Map<string, HealthScoreHistory>;

if (endDate.getTime() === today.getTime()) {
  // ❌ BUG: Se a data final for hoje, usar estado atual dos clientes
  endHistory = new Map();
  filteredClients.forEach(client => {
    const score = calculateHealthScore(client);  // ❌ PROBLEMA AQUI
    endHistory.set(String(client.id), {
      ...
      healthScore: score.score,
      healthCategory: score.category,
      ...
    });
  });
} else {
  // ✅ CORRETO: Buscar histórico na data final
  endHistory = await loadClientHistoryForDate(endDate, clientIds);
}
```

**❌ BUG CRÍTICO IDENTIFICADO:**

**Problema:**
1. Quando `endDate === today`, o código usa `filteredClients` que vem como **prop do componente**
2. Essa prop `clients` vem da lista de clientes **atualmente carregados** na aplicação
3. **Mas essa lista pode NÃO estar sincronizada com o último histórico importado!**
4. Se o usuário importou CSV hoje mas ainda não fez refresh, a lista `clients` tem dados desatualizados
5. O movimento detectado será **INCORRETO**

**Exemplo do Bug:**
```
Cenário:
- Dia 13/11: Cliente A está em "Crítico" (histórico salvo)
- Dia 17/11 (hoje): Usuário importa CSV onde Cliente A melhorou para "Estável"
- Histórico foi salvo no banco com categoria "Estável"
- Mas a prop `clients` ainda tem Cliente A com dados antigos "Crítico"

Resultado:
- Movement Sankey compara: "Crítico" (dia 13) → "Crítico" (hoje calculado errado)
- Movimento real deveria ser: "Crítico" (dia 13) → "Estável" (histórico do banco)
- ❌ Movimento NÃO É DETECTADO!
```

**Impacto:**
- 🔴 **CRÍTICO**: Movimentos do dia atual NÃO são detectados corretamente
- Usuário não vê mudanças reais que aconteceram hoje
- Decisões de negócio baseadas em dados incorretos

**Solução:**
```typescript
// SEMPRE buscar do histórico, mesmo para hoje
let endHistory: Map<string, HealthScoreHistory>;

if (endDate.getTime() === today.getTime()) {
  // ✅ CORRETO: Buscar histórico de hoje do banco
  // Se não houver histórico de hoje, aí sim usar estado atual como fallback
  const todayHistoryFromDB = await loadClientHistoryForDate(endDate, clientIds);

  if (todayHistoryFromDB.size > 0) {
    // Temos histórico de hoje no banco - usar ele
    endHistory = todayHistoryFromDB;
  } else {
    // Fallback: se não há histórico de hoje, usar estado atual
    endHistory = new Map();
    filteredClients.forEach(client => {
      const score = calculateHealthScore(client);
      endHistory.set(String(client.id), {
        ...
        healthScore: score.score,
        healthCategory: score.category,
        ...
      });
    });
  }
} else {
  endHistory = await loadClientHistoryForDate(endDate, clientIds);
}
```

#### ⚠️ Same Date Detection (linhas 366-379)
```typescript
// Verificar se estamos comparando a mesma data
const isSameDate = startDate.getTime() === endDate.getTime();

if (isSameDate) {
  // Se as datas forem iguais, não há movimento para comparar
  startHistory = new Map();
  console.log('📅 Mesma data selecionada - não há movimento para comparar');
}
```

**Status:** ⚠️ **COMPORTAMENTO QUESTIONÁVEL**

**Problema:**
- Se usuário seleciona "13/11 até 13/11", retorna vazio
- Mas talvez o usuário queira ver o **estado naquele dia**, não necessariamente movimento

**Recomendação:**
- Mostrar mensagem mais clara: "Selecione duas datas diferentes para comparar movimentos"
- Ou permitir visualização do estado naquele dia (snapshot)

#### ✅ Movement Comparison Logic (linhas 435-500)
```typescript
filteredClients.forEach(client => {
  const clientIdStr = String(client.id);
  const startState = startHistory.get(clientIdStr);
  const endState = endHistory.get(clientIdStr);

  // Se não tem estado inicial, considerar como novo cliente
  if (!startState) {
    if (endState) {
      const key = `Novo → ${endState.healthCategory}`;
      ...
    }
    return;
  }

  // Se não tem estado final, considerar como cliente perdido
  if (!endState) {
    const key = `${startState.healthCategory} → Perdido`;
    ...
    return;
  }

  // Comparar categorias e registrar movimento
  if (startState.healthCategory !== endState.healthCategory) {
    const key = `${startState.healthCategory} → ${endState.healthCategory}`;
    ...
  } else {
    // Cliente ficou na mesma categoria (estável)
    const key = `${startState.healthCategory} → ${endState.healthCategory}`;
    ...
  }
});
```

**Status:** ✅ CORRETO
- Lógica de comparação está correta
- Identifica: Novos, Perdidos, Melhorando, Piorando, Estáveis

#### ✅ Trend Analysis (linhas 577-649)
```typescript
const calculateTrendAnalysis = useCallback((movements: MovementData[], clients: Client[]): TrendAnalysis => {
  const categoryRank = { 'Crítico': 1, 'Atenção': 2, 'Estável': 3, 'Ótimo': 4 };

  // Clientes melhorando: mudaram de categoria pior para melhor
  const improvingClients: Client[] = [];
  movements.forEach(movement => {
    if (movement.from === 'Novo' || movement.to === 'Perdido' || movement.from === movement.to) {
      return;
    }
    const fromRank = categoryRank[movement.from as keyof typeof categoryRank] || 0;
    const toRank = categoryRank[movement.to as keyof typeof categoryRank] || 0;
    if (toRank > fromRank) {
      improvingClients.push(...movement.clientObjects);
    }
  });
  ...
}
```

**Status:** ✅ CORRETO
- Usa ranking de categorias para determinar melhora/piora
- Filtra corretamente Novos, Perdidos e Estáveis

---

## 🐛 3. BUGS IDENTIFICADOS - RESUMO

### 🔴 Bug 1: Movement Sankey usa estado atual ao invés de histórico (CRÍTICO)

**Localização:** `MovementSankey.tsx` linhas 382-417
**Severidade:** 🔴 CRÍTICA
**Impacto:** Movimentos do dia atual não são detectados corretamente

**Teste para Reproduzir:**
1. Importar CSV dia 13/11 com Cliente A em "Crítico"
2. Importar CSV dia 17/11 com Cliente A em "Estável"
3. Não fazer refresh da página
4. Ir em Movement Sankey e comparar 13/11 → 17/11
5. **Resultado Esperado:** Cliente A: "Crítico" → "Estável"
6. **Resultado Atual:** Cliente A: "Crítico" → "Crítico" (ou não aparece movimento)

---

### ⚠️ Bug 2: Tendência Portfolio usa cálculo frontend vs backend

**Localização:** `PortfolioMetrics.tsx` linhas 246-256
**Severidade:** ⚠️ MÉDIA
**Impacto:** Tendência pode ser imprecisa se houver divergência frontend/backend

**Teste para Reproduzir:**
1. Criar cliente com NPS cônjuge (herança de NPS)
2. Verificar se cálculo frontend bate com histórico do backend
3. Se divergir, tendência mostrará valor incorreto

---

### ⚠️ Bug 3: Mesma data retorna vazio sem explicação clara

**Localização:** `MovementSankey.tsx` linhas 366-379
**Severidade:** ⚠️ BAIXA
**Impacto:** UX confusa

**Solução:** Adicionar mensagem explicativa na UI

---

## ✅ 4. FUNCIONALIDADES CORRETAS

1. ✅ **Portfolio Health Index** - Cálculo de média está correto
2. ✅ **Risk Concentration** - Conta categorias corretamente
3. ✅ **Volatility Index** - Desvio padrão calculado corretamente
4. ✅ **Planner Risk Data** - Agregação por planejador correta
5. ✅ **Client History Loading** - Busca histórico com filtros corretos
6. ✅ **Movement Comparison Logic** - Lógica de comparação está correta (exceto quando endDate = today)
7. ✅ **Trend Analysis** - Classificação melhora/piora está correta
8. ✅ **Cache System** - Ambos componentes usam cache para performance

---

## 🧪 5. TESTES RECOMENDADOS

### Teste 1: Validar Movement Sankey para data atual
```typescript
// Cenário: Comparar ontem → hoje após importação
// Passos:
// 1. Importar CSV dia 13/11
// 2. Importar CSV dia 17/11 (hoje) com mudanças
// 3. Refresh da página
// 4. Movement Sankey: comparar 13/11 → 17/11
// 5. Verificar se todos os movimentos são detectados corretamente
```

### Teste 2: Validar Tendência Portfolio após importação
```typescript
// Cenário: Verificar se tendência reflete mudanças reais
// Passos:
// 1. Anotar Portfolio Health Index atual
// 2. Importar CSV com clientes melhorados
// 3. Refresh da página
// 4. Verificar se tendência mostra "melhorou +X%"
// 5. Calcular manualmente e comparar
```

### Teste 3: Validar cônjuges no Movement Sankey
```typescript
// Cenário: Cônjuge que herda NPS deve ser detectado corretamente
// Passos:
// 1. Criar cônjuge sem NPS, pagante com NPS 9
// 2. Importar dia 13/11 - cônjuge fica "Ótimo" (herdou NPS)
// 3. Importar dia 17/11 - pagante mudou NPS para 5
// 4. Cônjuge deve mudar para "Crítico"
// 5. Movement Sankey deve detectar: "Ótimo" → "Crítico"
```

### Teste 4: Validar Volatility Index
```typescript
// Cenário: Carteira homogênea vs heterogênea
// Passos:
// 1. Criar 10 clientes com score 60 cada
// 2. Volatility Index deve ser próximo de 0
// 3. Criar 10 clientes com scores variados (10, 20, 30, ..., 100)
// 4. Volatility Index deve ser alto (~30)
```

### Teste 5: Validar clientes Novos e Perdidos
```typescript
// Cenário: Detectar entrada/saída de clientes
// Passos:
// 1. Importar CSV dia 13/11 com 10 clientes
// 2. Importar CSV dia 17/11 com 8 clientes antigos + 3 novos
// 3. Movement Sankey deve mostrar:
//    - 3 clientes "Novo → [Categoria]"
//    - 2 clientes "[Categoria] → Perdido"
```

---

## 📊 6. INTEGRAÇÃO COM BANCO DE DADOS

### Verificações Necessárias:

#### ✅ Temporal Service
```typescript
// src/services/temporalService.ts
// ✅ Usa get_temporal_analysis_asof (corrigida recentemente)
// ✅ Aplica filtros hierárquicos corretamente
// ✅ Usa MIN_HISTORY_DATE para filtrar dados confiáveis
```

#### ✅ Health Score History Table
```sql
-- ✅ Tabela health_score_history tem constraint UNIQUE(client_id, recorded_date)
-- ✅ Trigger clients_health_history_trigger_v3 cria histórico automaticamente
-- ✅ Função record_health_score_history_v3 usa normalize_text para cônjuges
```

#### ⚠️ Consistency Check Needed
```sql
-- Verificar se todos os clientes têm histórico para as datas importadas
SELECT
  recorded_date,
  COUNT(DISTINCT client_id) as unique_clients
FROM health_score_history
WHERE recorded_date >= '2025-11-13'
GROUP BY recorded_date
ORDER BY recorded_date;

-- Comparar com total de clientes na tabela clients
SELECT COUNT(*) as total_clients_now FROM clients WHERE planner <> '0';
```

---

## 🎯 7. RECOMENDAÇÕES PRIORITÁRIAS

### Alta Prioridade (Fazer Agora):

1. **🔴 CORRIGIR BUG CRÍTICO do Movement Sankey**
   - Sempre buscar histórico do banco, mesmo para hoje
   - Adicionar fallback apenas se não houver histórico

2. **🧪 EXECUTAR Teste 1** (Movement Sankey para data atual)
   - Validar se bug existe
   - Validar se correção funciona

### Média Prioridade (Fazer em Seguida):

3. **⚠️ CORRIGIR cálculo de Tendência no Portfolio**
   - Buscar currentScore do histórico ao invés de calcular

4. **🧪 EXECUTAR Teste 2** (Tendência Portfolio)
   - Validar precisão da tendência

5. **📝 ADICIONAR mensagem explicativa** quando mesmas datas são selecionadas

### Baixa Prioridade (Fazer Depois):

6. **🧪 EXECUTAR Testes 3, 4 e 5**
   - Validar edge cases

7. **📊 CRIAR dashboard de consistência**
   - Comparar dados frontend vs backend regularmente

---

## ✅ 8. CONCLUSÃO

### Status Geral: ⚠️ **BOM COM RESSALVAS**

**Pontos Positivos:**
- ✅ Arquitetura bem estruturada com cache e otimizações
- ✅ Uso correto de MIN_HISTORY_DATE para dados confiáveis
- ✅ Lógica de cálculo matemático (volatilidade, médias) está correta
- ✅ Filtros hierárquicos funcionando corretamente

**Pontos de Atenção:**
- 🔴 **BUG CRÍTICO** no Movement Sankey ao usar data atual
- ⚠️ Tendência Portfolio pode ter imprecisão
- ⚠️ UX pode ser melhorada em alguns pontos

**Ações Necessárias:**
1. Corrigir bug crítico do Movement Sankey (URGENTE)
2. Executar testes de validação
3. Corrigir cálculo de tendência Portfolio
4. Documentar comportamento esperado para edge cases

---

**Próximo Passo:** Corrigir bug crítico do Movement Sankey e testar.
