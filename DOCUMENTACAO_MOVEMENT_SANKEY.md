# Documentação Técnica: Movement Sankey Diagram

## Visão Geral

O **Movement Sankey Diagram** é uma análise de fluxo que compara o estado dos clientes entre duas datas (Snapshot A e Snapshot B) para identificar transições entre categorias de Health Score (Ótimo, Estável, Atenção, Crítico).

**Arquivo Principal:** `src/components/MovementSankey.tsx`  
**Linhas de Código:** ~1665 linhas  
**Complexidade:** Alta (requer múltiplas queries ao banco, processamento em memória e otimizações de performance)

---

## 1. Fontes de Dados e Funções

### 1.1 Tabela Principal

**Tabela:** `health_score_history` (Supabase)

**Estrutura Relevante:**
```sql
CREATE TABLE health_score_history (
  id UUID PRIMARY KEY,
  client_id UUID NOT NULL,
  recorded_date DATE NOT NULL,
  client_name TEXT,
  planner TEXT,
  health_score INTEGER,
  health_category TEXT, -- 'Ótimo', 'Estável', 'Atenção', 'Crítico'
  -- ... outros campos de breakdown
  UNIQUE(client_id, recorded_date)
);
```

**Índices Críticos:**
- `(client_id, recorded_date)` - Chave única composta
- `recorded_date` - Para filtros temporais eficientes

### 1.2 Função Principal de Busca

**Função:** `loadClientHistoryForDate` (linhas 145-302)

**Localização:** `src/components/MovementSankey.tsx`

**Assinatura:**
```typescript
const loadClientHistoryForDate = useCallback(
  async (targetDate: Date, clientIds: (string | number)[]): Promise<Map<string, HealthScoreHistory>>
)
```

**Lógica de Busca:**

1. **Cache Check** (linhas 154-163):
   - Verifica cache usando chave `{dateStr}-{clientIds.length}`
   - Retorna cache se todos os `clientIds` estiverem presentes

2. **Query ao Banco** (linhas 173-229):
   ```typescript
   // Processamento em lotes para evitar URLs muito longas (erro HTTP 400)
   const batchSize = 500; // Limite seguro para Supabase
   const maxConcurrent = 3; // Processamento paralelo
   
   // Query para cada lote:
   supabase
     .from('health_score_history')
     .select('id, client_id, recorded_date, health_category, health_score, ...')
     .in('client_id', batch)
     .gte('recorded_date', MIN_HISTORY_DATE) // Filtro de data mínima confiável
     .lte('recorded_date', dateStr) // ATÉ a data alvo (inclusive)
     .order('recorded_date', { ascending: false })
     .limit(1000)
   ```

3. **Processamento de Resultados** (linhas 233-278):
   - Agrupa registros por `client_id`
   - **Prioriza registros com data exata** (`exactDateRecords`)
   - Se não houver data exata, usa o registro mais recente até aquela data
   - Converte para formato `HealthScoreHistory`

**Comportamento Crítico:**
- Se não há registro para a data exata, retorna o registro mais recente até aquela data
- Isso significa que se um cliente não tem histórico em 14/11, mas tem em 13/11, o sistema retorna o registro de 13/11

**Exemplo:**
```typescript
// Buscar histórico para 14/11/2025
const history = await loadClientHistoryForDate(
  new Date('2025-11-14'),
  ['client-id-1', 'client-id-2']
);

// Se client-id-1 tem registro em 14/11 → retorna registro de 14/11
// Se client-id-1 não tem registro em 14/11, mas tem em 13/11 → retorna registro de 13/11
```

### 1.3 Funções Auxiliares

**Nenhuma função SQL/RPC específica** - toda a lógica está no frontend TypeScript.

**Dependências:**
- `temporalService.getClientHistory()` - Para histórico individual de clientes (usado no drawer de detalhes)
- `calculateHealthScore()` - Para calcular score atual quando a data final é hoje

---

## 2. Definição do Período de Análise

### 2.1 Interface do Usuário

**Componente:** `DatePickerWithRange` (linhas 897-913)

**Estado:**
```typescript
const [dateRange, setDateRange] = useState(() => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const fromDate = startOfDay(subDays(today, DEFAULT_DAYS)); // DEFAULT_DAYS = 30
  const safeFromDate = clampToMinHistoryDate(fromDate); // Garante que não seja antes de MIN_HISTORY_DATE
  return {
    from: safeFromDate, // Snapshot A (Data Inicial)
    to: today           // Snapshot B (Data Final)
  };
});
```

**Quick Ranges Disponíveis:**
- 30 dias (padrão)
- 60 dias
- 90 dias
- Ano atual

### 2.2 Lógica de Seleção de Snapshots

**Função:** `generateMovementData` (linhas 355-520)

#### Snapshot A (Data Inicial) - Linhas 368-380:

```typescript
const startDate = new Date(dateRange.from);
startDate.setHours(0, 0, 0, 0);

// SEMPRE buscar histórico na data inicial
let startHistory: Map<string, HealthScoreHistory>;
if (isSameDate) {
  // Se as datas forem iguais, não há movimento para comparar
  startHistory = new Map();
} else {
  // Buscar histórico na data inicial (sempre, mesmo que seja 13/11)
  startHistory = await loadClientHistoryForDate(dateRange.from, clientIds);
}
```

**Comportamento:**
- Busca histórico usando `loadClientHistoryForDate(dateRange.from, clientIds)`
- Se não há registro exato para `dateRange.from`, retorna o registro mais recente até aquela data
- **Não usa Forward Filling** - usa apenas o registro mais recente disponível

#### Snapshot B (Data Final) - Linhas 382-419:

```typescript
const endDate = new Date(dateRange.to);
endDate.setHours(0, 0, 0, 0);
const today = new Date();
today.setHours(0, 0, 0, 0);

let endHistory: Map<string, HealthScoreHistory>;

if (endDate.getTime() === today.getTime()) {
  // Se a data final for HOJE, usar estado atual dos clientes (calculado em tempo real)
  endHistory = new Map();
  filteredClients.forEach(client => {
    const score = calculateHealthScore(client); // Cálculo em tempo real
    endHistory.set(String(client.id), {
      clientId: String(client.id),
      recordedDate: today,
      healthCategory: score.category, // Categoria calculada agora
      healthScore: score.score,
      // ... outros campos
    });
  });
} else {
  // Se a data final for PASSADA, buscar histórico
  endHistory = await loadClientHistoryForDate(endDate, clientIds);
}
```

**Comportamento Crítico:**
- **Se Data Final = Hoje:** Usa cálculo em tempo real (`calculateHealthScore`) - **não busca histórico**
- **Se Data Final < Hoje:** Busca histórico usando `loadClientHistoryForDate`
- Se não há registro exato, retorna o registro mais recente até aquela data

**Exemplo Prático:**
```typescript
// Cenário 1: Comparar 13/11 → 14/11 (ambas passadas)
startHistory = await loadClientHistoryForDate('2025-11-13', clientIds);
endHistory = await loadClientHistoryForDate('2025-11-14', clientIds);

// Cenário 2: Comparar 13/11 → Hoje (15/11)
startHistory = await loadClientHistoryForDate('2025-11-13', clientIds);
endHistory = calculateHealthScore() para cada cliente (tempo real);

// Cenário 3: Comparar Hoje → Hoje
startHistory = new Map(); // Vazio
endHistory = calculateHealthScore() para cada cliente;
// Resultado: [] (sem movimentos, pois não há comparação)
```

---

## 3. Lógica do Movimento (O Algoritmo)

### 3.1 Identificação do Cliente

**Campo de Rastreamento:** `client_id` (UUID)

**Garantia de Consistência:**
- O `client_id` é único e imutável
- Usado como chave em `Map<string, HealthScoreHistory>` para lookup rápido
- Conversão para string: `String(client.id)` para garantir compatibilidade

### 3.2 Cálculo da Transição

**Função:** `generateMovementData` (linhas 426-500)

**Algoritmo Passo-a-Passo:**

#### Passo 1: Iterar sobre Clientes Filtrados (linha 435)

```typescript
filteredClients.forEach(client => {
  const clientIdStr = String(client.id);
  const startState = startHistory.get(clientIdStr); // Snapshot A
  const endState = endHistory.get(clientIdStr);     // Snapshot B
```

#### Passo 2: Verificar Casos Especiais

**A. Cliente Novo** (linhas 446-457):
```typescript
if (!startState) {
  // Cliente não existia no Snapshot A
  if (endState) {
    // Mas existe no Snapshot B → NOVO CLIENTE
    const key = `Novo → ${endState.healthCategory}`;
    movementMap.set(key, { 
      from: 'Novo', 
      to: endState.healthCategory, 
      clients: [client] 
    });
  }
  return; // Não processar mais este cliente
}
```

**B. Cliente Perdido** (linhas 459-468):
```typescript
if (!endState) {
  // Cliente existia no Snapshot A, mas não no Snapshot B
  const key = `${startState.healthCategory} → Perdido`;
  movementMap.set(key, { 
    from: startState.healthCategory, 
    to: 'Perdido', 
    clients: [client] 
  });
  return; // Não processar mais este cliente
}
```

**C. Validação de Data Exata** (linhas 470-481):
```typescript
// Verificar se os históricos são da data exata ou do mais recente
const startDateExact = startState ? 
  (new Date(startState.recordedDate).setHours(0, 0, 0) === startDate.getTime()) : false;
const endDateExact = endState ? 
  (new Date(endState.recordedDate).setHours(0, 0, 0) === endDate.getTime()) : false;

if (!endDateExact && endState) {
  const endRecordDate = new Date(endState.recordedDate);
  endRecordDate.setHours(0, 0, 0);
  if (endRecordDate.getTime() < endDate.getTime()) {
    // Log de warning: usando histórico de data anterior
    console.log(`⚠️ Cliente ${client.name} não tem histórico exato para ${endDate}, usando histórico de ${endRecordDate}`);
  }
}
```

#### Passo 3: Comparar Categorias (linhas 483-499)

```typescript
// Comparar categorias e registrar movimento
if (startState.healthCategory !== endState.healthCategory) {
  // Mudou de categoria
  const key = `${startState.healthCategory} → ${endState.healthCategory}`;
  movementMap.set(key, { 
    from: startState.healthCategory, 
    to: endState.healthCategory, 
    clients: [client] 
  });
} else {
  // Ficou na mesma categoria (estável)
  const key = `${startState.healthCategory} → ${endState.healthCategory}`;
  // Mesma lógica, mas from === to
  movementMap.set(key, { 
    from: startState.healthCategory, 
    to: endState.healthCategory, 
    clients: [client] 
  });
}
```

**Observação Importante:**
- Movimentos estáveis (`from === to`) são registrados da mesma forma que movimentos de mudança
- Isso permite contar quantos clientes ficaram estáveis em cada categoria

### 3.3 Agregação

**Conversão para Formato Final** (linhas 502-512):

```typescript
const movementsData: MovementData[] = Array.from(movementMap.entries())
  .filter(([_, movement]) => movement.from !== 'Perdido' && movement.to !== 'Perdido') // Filtrar "Perdido"
  .map(([_, movement]) => ({
    from: movement.from,
    to: movement.to,
    value: movement.clients.length, // Contagem de clientes nesta transição
    clients: movement.clients.map(c => c.name), // Lista de nomes
    clientObjects: movement.clients // Objetos completos para drill-down
  }))
  .filter(m => m.value > 0); // Remover movimentos com 0 clientes
```

**Estrutura de Saída:**
```typescript
interface MovementData {
  from: string;        // Categoria origem: 'Ótimo', 'Estável', 'Atenção', 'Crítico', 'Novo'
  to: string;          // Categoria destino: 'Ótimo', 'Estável', 'Atenção', 'Crítico', 'Perdido'
  value: number;       // Quantidade de clientes nesta transição
  clients: string[];   // Array de nomes dos clientes
  clientObjects: Client[]; // Array completo de objetos Client para drill-down
}
```

**Exemplo de Saída:**
```json
[
  {
    "from": "Estável",
    "to": "Ótimo",
    "value": 5,
    "clients": ["Cliente A", "Cliente B", "Cliente C", "Cliente D", "Cliente E"],
    "clientObjects": [/* objetos Client completos */]
  },
  {
    "from": "Atenção",
    "to": "Estável",
    "value": 3,
    "clients": ["Cliente F", "Cliente G", "Cliente H"],
    "clientObjects": [/* objetos Client completos */]
  },
  {
    "from": "Novo",
    "to": "Ótimo",
    "value": 2,
    "clients": ["Cliente I", "Cliente J"],
    "clientObjects": [/* objetos Client completos */]
  }
]
```

---

## 4. Tratamento de Casos Especiais (Edge Cases)

### 4.1 Cliente Novo

**Definição:** Cliente que aparece no Snapshot B, mas não existia no Snapshot A.

**Lógica** (linhas 446-457):
```typescript
if (!startState) {
  // Não tem estado inicial
  if (endState) {
    // Mas tem estado final → NOVO
    const key = `Novo → ${endState.healthCategory}`;
    movementMap.set(key, { 
      from: 'Novo', 
      to: endState.healthCategory, 
      clients: [client] 
    });
  }
  return;
}
```

**Categorização:**
- Origem: `'Novo'`
- Destino: Categoria do Health Score no Snapshot B
- Exemplo: `"Novo → Ótimo"` significa que um novo cliente entrou diretamente na categoria "Ótimo"

**Casos de Uso:**
- Cliente recém-cadastrado
- Cliente que não tinha histórico na data inicial (mas pode ter sido importado depois)

### 4.2 Cliente Perdido/Inativo

**Definição:** Cliente que existia no Snapshot A, mas não aparece no Snapshot B.

**Lógica** (linhas 459-468):
```typescript
if (!endState) {
  // Tem estado inicial, mas não tem estado final → PERDIDO
  const key = `${startState.healthCategory} → Perdido`;
  movementMap.set(key, { 
    from: startState.healthCategory, 
    to: 'Perdido', 
    clients: [client] 
  });
  return;
}
```

**Categorização:**
- Origem: Categoria do Health Score no Snapshot A
- Destino: `'Perdido'`
- Exemplo: `"Estável → Perdido"` significa que um cliente que estava "Estável" não aparece mais no Snapshot B

**IMPORTANTE:** Movimentos para "Perdido" são **filtrados** na saída final (linha 504):
```typescript
.filter(([_, movement]) => movement.from !== 'Perdido' && movement.to !== 'Perdido')
```

**Razão:** O sistema atual não exibe movimentos para "Perdido" na UI, mas a lógica está implementada para futuras melhorias.

**Casos de Uso:**
- Cliente que não apareceu no CSV mais recente
- Cliente marcado como inativo
- Cliente que não tem histórico na data final (mas pode ainda existir)

### 4.3 Ausência de Registro (Forward Filling)

**Problema:** Se um cliente tem registro na Data A, mas não na Data B (e a Data B não é fim de semana), o sistema utiliza Forward Filling?

**Resposta:** **NÃO** - O Movement Sankey **não usa Forward Filling**.

**Comportamento Atual:**

1. **Busca Histórico** (função `loadClientHistoryForDate`):
   ```typescript
   .lte('recorded_date', dateStr) // Busca até a data alvo (inclusive)
   .order('recorded_date', { ascending: false })
   ```
   - Se não há registro exato, retorna o registro mais recente até aquela data
   - **Não preenche lacunas** - apenas usa o último registro disponível

2. **Validação** (linhas 470-481):
   ```typescript
   if (!endDateExact && endState) {
     const endRecordDate = new Date(endState.recordedDate);
     endRecordDate.setHours(0, 0, 0);
     if (endRecordDate.getTime() < endDate.getTime()) {
       // Log de warning: usando histórico de data anterior
       console.log(`⚠️ Cliente ${client.name} não tem histórico exato para ${endDate}, usando histórico de ${endRecordDate}`);
     }
   }
   ```

**Exemplo Prático:**
```typescript
// Cenário: Comparar 13/11 → 15/11
// Cliente X tem histórico em 13/11 e 14/11, mas não em 15/11

startState = loadClientHistoryForDate('2025-11-13') → retorna registro de 13/11 ✅
endState = loadClientHistoryForDate('2025-11-15') → retorna registro de 14/11 (mais recente até 15/11) ⚠️

// Resultado: Compara 13/11 vs 14/11 (não 13/11 vs 15/11)
// Log: "⚠️ Cliente X não tem histórico exato para 15/11, usando histórico de 14/11"
```

**Diferença com Forward Filling:**
- **Forward Filling** (usado em `TemporalAnalysis`): Preenche todos os dias do período com o último valor conhecido
- **Movement Sankey**: Usa apenas o último registro disponível até a data alvo, mas **não cria registros fictícios** para dias sem histórico

**Recomendação para Melhorias Futuras:**
- Considerar usar Forward Filling para garantir que comparações sejam sempre entre as datas exatas selecionadas
- Ou adicionar validação mais rigorosa que avise quando não há histórico exato

### 4.4 Mesma Data Selecionada

**Caso:** `dateRange.from === dateRange.to`

**Lógica** (linhas 365-375):
```typescript
const isSameDate = startDate.getTime() === endDate.getTime();

if (isSameDate) {
  startHistory = new Map(); // Vazio
  console.log('📅 Mesma data selecionada - não há movimento para comparar');
  return []; // Retorna array vazio
}
```

**Resultado:** Array vazio - não há movimentos para comparar.

---

## 5. Performance e Saída de Dados

### 5.1 Otimizações Implementadas

#### A. Cache de Histórico (linhas 109-110, 154-163):
```typescript
const historyCache = useRef<Map<string, Map<string, HealthScoreHistory>>>(new Map());

// Verificar cache antes de buscar
if (historyCache.current.has(cacheKey)) {
  const cached = historyCache.current.get(cacheKey)!;
  const allCached = clientIds.every(id => cached.has(String(id)));
  if (allCached) {
    return cached; // Retornar do cache
  }
}
```

#### B. Processamento em Lotes (linhas 176-229):
```typescript
const batchSize = 500; // Limite seguro para evitar URLs muito longas
const maxConcurrent = 3; // Processamento paralelo

// Processar em lotes paralelos
for (let i = 0; i < clientIdsStr.length; i += batchSize * maxConcurrent) {
  const batches: Promise<any>[] = [];
  // Criar múltiplos lotes paralelos
  // ...
  const results = await Promise.all(batches);
}
```

#### C. Cache de Health Scores (linhas 113, 526-534):
```typescript
const healthScoreCache = useRef<Map<string, ReturnType<typeof calculateHealthScore>>>(new Map());

// Calcular apenas uma vez por cliente
if (!healthScoreCache.current.has(cacheKey)) {
  healthScoreCache.current.set(cacheKey, calculateHealthScore(client));
}
```

#### D. Cache de Dados Calculados (linhas 116-128, 744-759):
```typescript
const dataCacheRef = useRef<{
  clientsHash: string;
  dateRangeHash: string;
  movementData: MovementData[];
  categoryFlows: CategoryFlow[];
  trendAnalysis: TrendAnalysis | null;
}>({ /* ... */ });

// Verificar se dados já foram calculados
if (
  dataCacheRef.current.clientsHash === clientsHash &&
  dataCacheRef.current.dateRangeHash === dateRangeHash &&
  dataCacheRef.current.movementData.length > 0
) {
  // Usar dados do cache
  setMovementData(dataCacheRef.current.movementData);
  return;
}
```

### 5.2 Formato Final de Saída

#### A. MovementData[] (Movimentos Individuais)

**Estrutura:**
```typescript
interface MovementData {
  from: string;        // Categoria origem
  to: string;         // Categoria destino
  value: number;       // Quantidade de clientes
  clients: string[];   // Nomes dos clientes
  clientObjects: Client[]; // Objetos completos
}
```

**Exemplo JSON:**
```json
[
  {
    "from": "Estável",
    "to": "Ótimo",
    "value": 5,
    "clients": ["Cliente A", "Cliente B", "Cliente C", "Cliente D", "Cliente E"],
    "clientObjects": [
      {
        "id": "uuid-1",
        "name": "Cliente A",
        "planner": "João Silva",
        "healthScore": 85,
        // ... outros campos
      },
      // ... mais 4 clientes
    ]
  },
  {
    "from": "Atenção",
    "to": "Estável",
    "value": 3,
    "clients": ["Cliente F", "Cliente G", "Cliente H"],
    "clientObjects": [/* ... */]
  },
  {
    "from": "Novo",
    "to": "Ótimo",
    "value": 2,
    "clients": ["Cliente I", "Cliente J"],
    "clientObjects": [/* ... */]
  }
]
```

#### B. CategoryFlow[] (Fluxos por Categoria)

**Função:** `calculateCategoryFlows` (linhas 523-573)

**Estrutura:**
```typescript
interface CategoryFlow {
  category: string;      // 'Ótimo', 'Estável', 'Atenção', 'Crítico'
  incoming: number;      // Clientes entrando nesta categoria
  outgoing: number;      // Clientes saindo desta categoria
  netChange: number;     // incoming - outgoing
  clients: string[];     // Nomes de todos os clientes relacionados
  clientObjects: Client[]; // Objetos completos
}
```

**Exemplo JSON:**
```json
[
  {
    "category": "Ótimo",
    "incoming": 7,      // 5 de "Estável" + 2 de "Novo"
    "outgoing": 2,      // 2 para "Estável"
    "netChange": 5,     // +5 clientes líquidos
    "clients": ["Cliente A", "Cliente B", ...],
    "clientObjects": [/* ... */]
  },
  {
    "category": "Estável",
    "incoming": 5,      // 3 de "Atenção" + 2 de "Ótimo"
    "outgoing": 5,      // 5 para "Ótimo"
    "netChange": 0,     // Sem mudança líquida
    "clients": [/* ... */],
    "clientObjects": [/* ... */]
  }
]
```

#### C. TrendAnalysis (Análise de Tendências)

**Função:** `calculateTrendAnalysis` (linhas 576-643)

**Estrutura:**
```typescript
interface TrendAnalysis {
  improving: number;           // Clientes melhorando (categoria pior → melhor)
  declining: number;           // Clientes piorando (categoria melhor → pior)
  stable: number;              // Clientes estáveis (mesma categoria)
  newClients: number;           // Novos clientes
  lostClients: number;          // Clientes perdidos (sempre 0, pois são filtrados)
  improvingClients: Client[];  // Lista de clientes melhorando
  decliningClients: Client[];   // Lista de clientes piorando
  stableClients: Client[];      // Lista de clientes estáveis
  newClientsList: Client[];     // Lista de novos clientes
  lostClientsList: Client[];    // Lista de clientes perdidos (sempre vazia)
}
```

**Lógica de Classificação:**
```typescript
const categoryRank = { 
  'Crítico': 1, 
  'Atenção': 2, 
  'Estável': 3, 
  'Ótimo': 4 
};

// Melhorando: toRank > fromRank
// Piorando: toRank < fromRank
// Estável: fromRank === toRank
```

**Exemplo JSON:**
```json
{
  "improving": 8,
  "declining": 3,
  "stable": 45,
  "newClients": 2,
  "lostClients": 0,
  "improvingClients": [/* 8 clientes */],
  "decliningClients": [/* 3 clientes */],
  "stableClients": [/* 45 clientes */],
  "newClientsList": [/* 2 clientes */],
  "lostClientsList": []
}
```

### 5.3 Trechos de Código Relevantes

#### A. Função Principal de Geração de Movimentos

```typescript:355:520:src/components/MovementSankey.tsx
// Gerar dados de movimento baseados em comparação temporal real
const generateMovementData = async (): Promise<MovementData[]> => {
  const movements: MovementData[] = [];
  
  const clientIds = filteredClients.map(c => String(c.id));
  
  const startDate = new Date(dateRange.from);
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(dateRange.to);
  endDate.setHours(0, 0, 0, 0);
  
  // Verificar se estamos comparando a mesma data
  const isSameDate = startDate.getTime() === endDate.getTime();
  
  // SEMPRE buscar histórico na data inicial, mesmo que seja o primeiro dia
  let startHistory: Map<string, HealthScoreHistory>;
  if (isSameDate) {
    startHistory = new Map();
    console.log('📅 Mesma data selecionada - não há movimento para comparar');
  } else {
    startHistory = await loadClientHistoryForDate(dateRange.from, clientIds);
    console.log(`📅 Histórico inicial (${format(startDate, 'dd/MM/yyyy')}): ${startHistory.size} clientes encontrados`);
  }
  setStartDateHistory(startHistory);
  
  // Para a data final, usar estado atual se for hoje, senão buscar histórico
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  let endHistory: Map<string, HealthScoreHistory>;
  
  if (endDate.getTime() === today.getTime()) {
    // Se a data final for hoje, usar estado atual dos clientes
    endHistory = new Map();
    filteredClients.forEach(client => {
      const score = calculateHealthScore(client);
      endHistory.set(String(client.id), {
        id: '',
        clientId: String(client.id),
        recordedDate: today,
        clientName: client.name,
        planner: client.planner || '',
        healthScore: score.score,
        healthCategory: score.category,
        breakdown: score.breakdown,
        originalData: {
          lastMeeting: client.lastMeeting || null,
          hasScheduledMeeting: client.hasScheduledMeeting || false,
          appUsageStatus: client.appUsage || null,
          paymentStatusDetail: client.paymentStatus || null,
          hasReferrals: client.hasNpsReferral || false,
          npsScoreDetail: client.npsScoreV3 ? String(client.npsScoreV3) : null,
          ecosystemUsage: client.ecosystemUsage || null,
        },
        createdAt: new Date(),
      });
    });
  } else {
    // Buscar histórico na data final
    endHistory = await loadClientHistoryForDate(endDate, clientIds);
  }
  
  setEndDateHistory(endHistory);
  
  console.log(`📊 Comparando histórico:`);
  console.log(`   - Data inicial (${format(startDate, 'dd/MM/yyyy')}): ${startHistory.size} clientes`);
  console.log(`   - Data final (${format(endDate, 'dd/MM/yyyy')}): ${endHistory.size} clientes`);
  console.log(`   - Total de clientes filtrados: ${filteredClients.length}`);

  // Comparar estados e calcular movimentos reais
  const movementMap = new Map<string, { from: string; to: string; clients: Client[] }>();
  
  // Se as datas forem iguais, não há movimento para comparar
  if (isSameDate) {
    console.log('⚠️ Mesma data selecionada - não há movimento para comparar');
    return [];
  }
  
  filteredClients.forEach(client => {
    const clientIdStr = String(client.id);
    const startState = startHistory.get(clientIdStr);
    const endState = endHistory.get(clientIdStr);
    
    // Verificar se os históricos são da data exata ou do mais recente até aquela data
    const startDateExact = startState ? 
      (new Date(startState.recordedDate).setHours(0, 0, 0, 0) === startDate.getTime()) : false;
    const endDateExact = endState ? 
      (new Date(endState.recordedDate).setHours(0, 0, 0, 0) === endDate.getTime()) : false;
    
    // Se não tem estado inicial, considerar como novo cliente
    if (!startState) {
      if (endState) {
        const key = `Novo → ${endState.healthCategory}`;
        if (!movementMap.has(key)) {
          movementMap.set(key, { from: 'Novo', to: endState.healthCategory, clients: [] });
        }
        movementMap.get(key)!.clients.push(client);
      }
      return;
    }
    
    // Se não tem estado final, considerar como cliente perdido
    if (!endState) {
      const key = `${startState.healthCategory} → Perdido`;
      if (!movementMap.has(key)) {
        movementMap.set(key, { from: startState.healthCategory, to: 'Perdido', clients: [] });
      }
      movementMap.get(key)!.clients.push(client);
      return;
    }
    
    // IMPORTANTE: Se o estado final não é da data exata, pode ser que não haja histórico para aquela data
    if (!endDateExact && endState) {
      const endRecordDate = new Date(endState.recordedDate);
      endRecordDate.setHours(0, 0, 0, 0);
      if (endRecordDate.getTime() < endDate.getTime()) {
        console.log(`⚠️ Cliente ${client.name} (${clientIdStr}) não tem histórico exato para ${format(endDate, 'dd/MM/yyyy')}, usando histórico de ${format(endRecordDate, 'dd/MM/yyyy')}`);
      }
    }
    
    // Comparar categorias e registrar movimento
    if (startState.healthCategory !== endState.healthCategory) {
      const key = `${startState.healthCategory} → ${endState.healthCategory}`;
      if (!movementMap.has(key)) {
        movementMap.set(key, { from: startState.healthCategory, to: endState.healthCategory, clients: [] });
      }
      movementMap.get(key)!.clients.push(client);
    } else {
      // Cliente ficou na mesma categoria (estável)
      const key = `${startState.healthCategory} → ${endState.healthCategory}`;
      if (!movementMap.has(key)) {
        movementMap.set(key, { from: startState.healthCategory, to: endState.healthCategory, clients: [] });
      }
      movementMap.get(key)!.clients.push(client);
    }
  });

  // Converter para formato MovementData
  const movementsData: MovementData[] = Array.from(movementMap.entries())
    .filter(([_, movement]) => movement.from !== 'Perdido' && movement.to !== 'Perdido')
    .map(([_, movement]) => ({
      from: movement.from,
      to: movement.to,
      value: movement.clients.length,
      clients: movement.clients.map(c => c.name),
      clientObjects: movement.clients
    }))
    .filter(m => m.value > 0);
  
  console.log(`✅ Movimentos calculados: ${movementsData.length} tipos diferentes`);
  movementsData.forEach(m => {
    console.log(`   - ${m.from} → ${m.to}: ${m.value} clientes`);
  });

  return movementsData;
};
```

#### B. Função de Busca de Histórico

```typescript:145:302:src/components/MovementSankey.tsx
// Buscar histórico de clientes em uma data específica (OTIMIZADO)
const loadClientHistoryForDate = useCallback(async (targetDate: Date, clientIds: (string | number)[]): Promise<Map<string, HealthScoreHistory>> => {
  const historyMap = new Map<string, HealthScoreHistory>();
  
  if (clientIds.length === 0) return historyMap;

  try {
    const dateStr = targetDate.toISOString().split('T')[0];
    const cacheKey = `${dateStr}-${clientIds.length}`;
    
    // Verificar cache primeiro
    if (historyCache.current.has(cacheKey)) {
      const cached = historyCache.current.get(cacheKey)!;
      const allCached = clientIds.every(id => cached.has(String(id)));
      if (allCached) {
        console.log(`✅ Usando cache para ${clientIds.length} clientes até ${dateStr}`);
        return cached;
      }
    }
    
    // Converter IDs para string para garantir compatibilidade
    const clientIdsStr = clientIds.map(id => String(id));
    
    console.log(`🔍 Buscando histórico para ${clientIdsStr.length} clientes até ${dateStr}...`);
    setLoadingProgress(`Buscando histórico para ${clientIdsStr.length} clientes...`);
    
    // OTIMIZAÇÃO: Usar query mais eficiente - buscar apenas o registro mais recente por cliente
    const allRecords: any[] = [];
    const batchSize = 500;
    const totalBatches = Math.ceil(clientIdsStr.length / batchSize);
    
    // Processar em lotes paralelos (reduzido para 3 simultâneos para evitar sobrecarga)
    const maxConcurrent = 3;
    for (let i = 0; i < clientIdsStr.length; i += batchSize * maxConcurrent) {
      const batches: Promise<any>[] = [];
      
      for (let j = 0; j < maxConcurrent && (i + j * batchSize) < clientIdsStr.length; j++) {
        const batchStart = i + j * batchSize;
        const batch = clientIdsStr.slice(batchStart, batchStart + batchSize);
        
        if (batch.length === 0) continue;
        
        const batchPromise = (async () => {
          try {
            const minDateStr = MIN_HISTORY_DATE.toISOString().split('T')[0];
            const { data, error } = await (supabase as any)
              .from('health_score_history')
              .select('id, client_id, recorded_date, client_name, planner, health_score, health_category, ...')
              .in('client_id', batch)
              .gte('recorded_date', minDateStr)
              .lte('recorded_date', dateStr)
              .order('recorded_date', { ascending: false })
              .limit(1000);
        
            if (error) {
              console.error(`Erro ao buscar histórico do lote ${batchStart}-${batchStart + batch.length}:`, error);
              return [];
            }
            
            return data || [];
          } catch (err) {
            console.error(`Erro ao processar lote ${batchStart}-${batchStart + batch.length}:`, err);
            return [];
          }
        })();
        
        batches.push(batchPromise);
      }
      
      const results = await Promise.all(batches);
      results.forEach(data => {
        if (data && data.length > 0) {
          allRecords.push(...data);
        }
      });
      
      const processedBatches = Math.min(Math.ceil((i + batchSize * maxConcurrent) / batchSize), totalBatches);
      setLoadingProgress(`Processando histórico... ${processedBatches}/${totalBatches} lotes`);
    }
    
    console.log(`✅ Encontrados ${allRecords.length} registros históricos`);

    // Processar mais eficientemente - usar Map direto
    const latestByClient = new Map<string, HealthScoreHistory>();
    const recordsByClient = new Map<string, any>();
    const exactDateRecords = new Map<string, any>();
    
    const targetDateNormalized = new Date(targetDate);
    targetDateNormalized.setHours(0, 0, 0, 0);
    
    allRecords.forEach((record: any) => {
      const clientId = String(record.client_id);
      const recordDate = new Date(record.recorded_date);
      recordDate.setHours(0, 0, 0, 0);
      
      if (recordDate.getTime() > targetDateNormalized.getTime()) return;
      
      if (recordDate.getTime() === targetDateNormalized.getTime()) {
        exactDateRecords.set(clientId, record);
      }
      
      const existing = recordsByClient.get(clientId);
      if (!existing) {
        recordsByClient.set(clientId, record);
      } else {
        const existingDate = new Date(existing.recorded_date);
        existingDate.setHours(0, 0, 0, 0);
        const existingTime = existingDate.getTime();
        const currentTime = recordDate.getTime();
        if (currentTime > existingTime) {
          recordsByClient.set(clientId, record);
        }
      }
    });
    
    // Converter para HealthScoreHistory
    recordsByClient.forEach((record, clientId) => {
      const finalRecord = exactDateRecords.has(clientId) 
        ? exactDateRecords.get(clientId)! 
        : record;
      latestByClient.set(clientId, databaseToHealthScoreHistory(finalRecord));
    });
    
    const exactCount = exactDateRecords.size;
    const totalCount = latestByClient.size;
    if (exactCount < totalCount) {
      console.log(`⚠️ Atenção: ${totalCount - exactCount} clientes sem histórico exato para ${dateStr}, usando registro mais recente`);
    }

    // Salvar no cache
    historyCache.current.set(cacheKey, latestByClient);
    
    if (historyCache.current.size > 10) {
      const firstKey = historyCache.current.keys().next().value;
      historyCache.current.delete(firstKey);
    }

    console.log(`✅ Processados ${latestByClient.size} clientes com histórico`);
    return latestByClient;
  } catch (error) {
    console.error('Erro ao carregar histórico:', error);
    return historyMap;
  }
}, []);
```

---

## 6. Resumo Executivo

### 6.1 Fluxo Completo

1. **Usuário seleciona período** → `dateRange.from` e `dateRange.to`
2. **Buscar Snapshot A** → `loadClientHistoryForDate(dateRange.from, clientIds)`
3. **Buscar Snapshot B** → Se hoje: `calculateHealthScore()`, senão: `loadClientHistoryForDate(dateRange.to, clientIds)`
4. **Comparar estados** → Para cada cliente, comparar `startState.healthCategory` vs `endState.healthCategory`
5. **Agregar movimentos** → Agrupar por `from → to` e contar clientes
6. **Calcular fluxos** → `calculateCategoryFlows()` para cada categoria
7. **Calcular tendências** → `calculateTrendAnalysis()` para melhorias/pioras

### 6.2 Pontos Críticos

✅ **Funciona Corretamente:**
- Identificação de clientes novos
- Comparação de categorias entre duas datas
- Cálculo de movimentos estáveis (`from === to`)
- Otimizações de performance (cache, lotes paralelos)

⚠️ **Limitações Atuais:**
- **Não usa Forward Filling** - se não há histórico exato, usa o mais recente disponível
- **Movimentos para "Perdido" são filtrados** - não aparecem na UI
- **Validação de data exata** - apenas loga warning, não bloqueia

🔧 **Melhorias Futuras Recomendadas:**
- Implementar Forward Filling para garantir comparações sempre entre datas exatas
- Adicionar opção para exibir clientes "Perdidos" na UI
- Melhorar validação quando não há histórico exato (avisar usuário)

---

**Documentação gerada em:** 2025-01-XX  
**Versão do código analisada:** Commit `7e42f7f` (após implementação de Forward Filling em TemporalAnalysis)

