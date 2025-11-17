# Correção: Evolução do Health Score no Drawer de Clientes

## Problema Identificado

O gráfico de evolução do Health Score exibido no drawer de detalhes de clientes não estava usando a lógica temporal correta (a mesma que foi corrigida na Análise Temporal). Especificamente:

1. ❌ Não aplicava Forward Filling para dias sem dados (ex: fins de semana)
2. ❌ Não gerava série completa de datas entre `created_at` e `CURRENT_DATE`
3. ❌ Não garantia sincronização com a correção do `last_seen_at`

## Solução Implementada

### Nova Função SQL: `get_client_health_score_evolution`

**Arquivo:** `sql/get_client_health_score_evolution.sql`

**Funcionalidades:**

1. **Geração de Série de Datas:**
   - Gera série completa entre `GREATEST(created_at, MIN_HISTORY_DATE)` e `CURRENT_DATE`
   - Garante que todos os dias do período sejam incluídos

2. **Forward Filling:**
   - Para cada dia sem dados históricos, usa o último Health Score conhecido
   - Mantém consistência visual no gráfico (sem quebras de linha)

3. **Sincronização com Correções:**
   - Respeita `MIN_HISTORY_DATE` (13/11/2025)
   - Filtra apenas dados confiáveis do histórico

4. **Otimização:**
   - Usa `LATERAL JOIN` para buscar o último registro conhecido uma única vez por dia
   - Evita múltiplas subconsultas desnecessárias

**Assinatura:**
```sql
CREATE OR REPLACE FUNCTION get_client_health_score_evolution(
  p_client_id UUID
) RETURNS TABLE (
  recorded_date DATE,
  health_score INTEGER,
  health_category TEXT,
  nps_score_v3_pillar INTEGER,
  referral_pillar INTEGER,
  payment_pillar INTEGER,
  cross_sell_pillar INTEGER,
  tenure_pillar INTEGER,
  client_name TEXT,
  planner TEXT,
  created_at TIMESTAMPTZ,
  is_forward_filled BOOLEAN -- Indica se foi preenchido pelo Forward Filling
)
```

**Exemplo de Uso:**
```sql
-- Buscar evolução completa de um cliente
SELECT * FROM get_client_health_score_evolution('uuid-do-cliente'::UUID);

-- Filtrar apenas dados reais (sem Forward Filling)
SELECT * FROM get_client_health_score_evolution('uuid-do-cliente'::UUID)
WHERE is_forward_filled = FALSE;
```

## Próximos Passos

1. ✅ Criar função SQL `get_client_health_score_evolution` (CONCLUÍDO)
2. ⏳ Aplicar função SQL no banco de dados
3. ⏳ Modificar `temporalService.getClientHistory` para usar a nova função SQL
4. ⏳ Testar gráfico de evolução no drawer de clientes

## Lógica de Forward Filling

A função aplica Forward Filling da seguinte forma:

1. **Gera série de datas:** Entre `start_date` e `end_date` (todos os dias)
2. **Busca histórico real:** Registros existentes em `health_score_history`
3. **Aplica Forward Filling:** Para cada dia sem dados:
   - Busca o último registro histórico antes desta data
   - Usa os valores desse registro para preencher o dia atual
   - Marca `is_forward_filled = TRUE`

**Exemplo:**
- Cliente tem histórico em: 13/11, 14/11, 16/11
- Forward Filling preenche: 15/11 (usa valores de 14/11)
- Resultado: série completa de 13/11 até 16/11 sem quebras

