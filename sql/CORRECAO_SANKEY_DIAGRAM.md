# Correção do Sankey Diagram - Movimentos Fantasmas

## Problema Identificado

O Sankey Diagram está mostrando movimentos "fantasmas" porque está usando dados da tabela `health_score_history` **sem aplicar o filtro crítico** `last_seen_at = max_last_seen_at` que foi implementado na análise temporal.

### Query SQL Atual (INCORRETA)

**Localização:** `src/components/MovementSankey.tsx`, linhas 195-202

```typescript
const { data, error } = await supabase
  .from('health_score_history')
  .select('id, client_id, recorded_date, client_name, planner, health_score, health_category, ...')
  .in('client_id', batch)
  .gte('recorded_date', minDateStr)
  .lte('recorded_date', dateStr)  // ❌ PROBLEMA: Busca registros até dateStr, mas não filtra por last_seen_at
  .order('recorded_date', { ascending: false })
  .limit(1000);
```

**Problemas:**
1. ❌ Não aplica filtro `last_seen_at = max_last_seen_at` (apenas última importação)
2. ❌ Usa scores gravados no histórico que podem estar desatualizados
3. ❌ Para 14/11, pode retornar scores antigos (54.61) em vez do score correto (61.44)

### Comportamento Esperado

Para comparar **14/11 → 16/11**, o Sankey deve:
1. **14/11 (Snapshot A):** Usar dados calculados em tempo real da tabela `clients` com filtro `last_seen_at = max_last_seen_at` e `DATE(last_seen_at) = '2025-11-14'`
2. **16/11 (Snapshot B):** Se for hoje, usar estado atual dos clientes. Se for passado, usar a mesma lógica para 16/11.

## Solução Implementada

### Nova Função SQL: `get_sankey_snapshot`

**Arquivo:** `sql/get_sankey_snapshot.sql`

**Lógica:**
1. **Para dias com dados exatos** (ex: 14/11):
   - Calcula Health Score em tempo real da tabela `clients`
   - Aplica filtro `last_seen_at = max_last_seen_at`
   - Filtra apenas clientes com `DATE(last_seen_at) = snapshot_date`
   - Usa a mesma lógica de cálculo do Dashboard

2. **Para dias sem dados exatos** (ex: 15/11, 16/11 se não houver importação):
   - Usa lógica AS-OF do histórico (`health_score_history`)
   - Aplica mesmo filtro `last_seen_at = max_last_seen_at`
   - Seleciona registro mais recente até aquela data

**Assinatura:**
```sql
CREATE OR REPLACE FUNCTION get_sankey_snapshot(
  p_snapshot_date DATE,
  p_client_ids UUID[] DEFAULT NULL,
  p_planner_filter TEXT DEFAULT 'all',
  p_managers TEXT[] DEFAULT NULL,
  p_mediators TEXT[] DEFAULT NULL,
  p_leaders TEXT[] DEFAULT NULL,
  include_null_manager BOOLEAN DEFAULT FALSE,
  include_null_mediator BOOLEAN DEFAULT FALSE,
  include_null_leader BOOLEAN DEFAULT FALSE
) RETURNS TABLE (
  client_id UUID,
  client_name TEXT,
  planner TEXT,
  manager TEXT,
  mediator TEXT,
  leader TEXT,
  health_score INTEGER,
  health_category TEXT,
  nps_score_v3_pillar INTEGER,
  referral_pillar INTEGER,
  payment_pillar INTEGER,
  cross_sell_pillar INTEGER,
  tenure_pillar INTEGER,
  recorded_date DATE,
  created_at TIMESTAMPTZ
)
```

**Exemplo de Uso:**
```sql
-- Buscar snapshot de 14/11 para todos os clientes
SELECT * FROM get_sankey_snapshot('2025-11-14'::DATE);

-- Buscar snapshot de 14/11 para clientes específicos
SELECT * FROM get_sankey_snapshot(
  '2025-11-14'::DATE,
  ARRAY['uuid1', 'uuid2']::UUID[]
);

-- Buscar snapshot de 16/11 com filtros de hierarquia
SELECT * FROM get_sankey_snapshot(
  '2025-11-16'::DATE,
  NULL,
  'all',
  ARRAY['Manager1', 'Manager2'],
  NULL,
  NULL
);
```

## Próximos Passos

1. ✅ Criar função SQL `get_sankey_snapshot` (CONCLUÍDO)
2. ⏳ Aplicar função SQL no banco de dados
3. ⏳ Modificar `MovementSankey.tsx` para usar a nova função SQL em vez da query direta
4. ⏳ Testar comparação 14/11 → 16/11

