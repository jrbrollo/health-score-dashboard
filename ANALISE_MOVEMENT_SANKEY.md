# Análise Profunda: Movement Sankey Diagram

## Data de Análise: Comparação 13/11/2025 → 14/11/2025

### Problemas Identificados

#### 1. **Lógica de Busca de Histórico**

**Função `loadClientHistoryForDate` (linha 145-282):**
- Busca registros com `lte('recorded_date', dateStr)` - correto ✅
- Processa e mantém apenas o registro mais recente de cada cliente até a data alvo - correto ✅
- **PROBLEMA POTENCIAL**: Se não houver histórico para 14/11, retorna o registro mais recente até 14/11 (que seria 13/11)

**Impacto**: Clientes que não têm histórico em 14/11 vão aparecer como "Estáveis" (mesma categoria de 13/11), quando na verdade deveriam ser tratados de forma diferente.

#### 2. **Lógica de Comparação Temporal**

**Função `generateMovementData` (linha 335-481):**

**Linha 415-430**: Clientes sem estado inicial
```typescript
if (!startState) {
  if (endState) {
    // Considera como "Novo"
  }
}
```
✅ **CORRETO**: Cliente que não existia em 13/11 mas existe em 14/11 = Novo

**Linha 433-442**: Clientes sem estado final
```typescript
if (!endState) {
  // Considera como "Perdido"
}
```
⚠️ **PROBLEMA**: Se um cliente tem histórico em 13/11 mas não em 14/11, pode ser:
- Cliente realmente perdido (não está mais ativo)
- Cliente que ainda existe mas não teve histórico registrado em 14/11

**Linha 444-460**: Comparação de categorias
```typescript
if (startState.healthCategory !== endState.healthCategory) {
  // Mudou de categoria
} else {
  // Ficou na mesma categoria (estável)
}
```
⚠️ **PROBLEMA CRÍTICO**: Se `loadClientHistoryForDate` retornar o registro de 13/11 para clientes sem histórico em 14/11, todos vão aparecer como "Estáveis" mesmo que não tenham histórico em 14/11.

#### 3. **Lógica de Estado Final**

**Linha 368-397**: Determinação do estado final
```typescript
if (endDate.getTime() === today.getTime()) {
  // Usa estado atual dos clientes
} else {
  // Busca histórico na data final
  endHistory = await loadClientHistoryForDate(endDate, clientIds);
}
```

✅ **CORRETO**: Se a data final for hoje, usa estado atual. Senão, busca histórico.

**MAS**: `loadClientHistoryForDate` pode retornar registros de 13/11 se não houver registros de 14/11, causando falsos "Estáveis".

### Validação Necessária

#### Query 1: Verificar se há histórico para 14/11
```sql
SELECT COUNT(*) as total_registros_14_11
FROM health_score_history
WHERE recorded_date = '2025-11-14';
```

#### Query 2: Verificar clientes que têm histórico em 13/11 mas não em 14/11
```sql
SELECT COUNT(DISTINCT h13.client_id) as clientes_sem_historico_14_11
FROM health_score_history h13
WHERE h13.recorded_date = '2025-11-13'
  AND NOT EXISTS (
    SELECT 1 FROM health_score_history h14
    WHERE h14.client_id = h13.client_id
      AND h14.recorded_date = '2025-11-14'
  );
```

#### Query 3: Verificar se há duplicatas na mesma data
```sql
SELECT recorded_date, client_id, COUNT(*) as duplicatas
FROM health_score_history
WHERE recorded_date IN ('2025-11-13', '2025-11-14')
GROUP BY recorded_date, client_id
HAVING COUNT(*) > 1;
```

### Correções Necessárias

#### Correção 1: Distinguir entre "sem histórico" e "mesma categoria"

A função `loadClientHistoryForDate` deve retornar apenas registros que existem **exatamente** na data alvo, não o mais recente até aquela data.

**Solução**: Modificar a query para buscar apenas registros com `recorded_date = dateStr`, não `lte('recorded_date', dateStr)`.

**MAS CUIDADO**: Isso pode causar problemas se não houver histórico exato para a data. Precisamos de uma estratégia diferente:

1. **Opção A**: Buscar histórico exato primeiro, se não houver, usar o mais recente até aquela data, mas marcar como "sem histórico exato"
2. **Opção B**: Sempre buscar histórico exato e tratar ausência como "sem dados"

#### Correção 2: Tratamento de clientes sem histórico na data final

Se um cliente não tem histórico em 14/11, devemos:
- Se ele existe na base atual: usar estado atual (se data final for hoje) ou marcar como "sem dados"
- Se ele não existe mais: marcar como "Perdido"

### Análise dos Dados Mostrados

Das imagens fornecidas:
- **Melhorando**: 318 clientes
- **Piorando**: 0 clientes
- **Estáveis**: 606 clientes
- **Novos**: 84 clientes
- **Perdidos**: 0 clientes

**Total**: 1008 clientes

**Fluxos observados**:
- Novo → Estável: 62
- Novo → Atenção: 3
- Atenção → Estável: 279
- Estável → Estável: 449
- Novo → Ótimo: 19
- Ótimo → Ótimo: 110
- Estável → Ótimo: 29
- Crítico → Atenção: 10
- Atenção → Atenção: 23
- Crítico → Crítico: 24

**Verificação matemática**:
- Novos: 62 + 3 + 19 = 84 ✅
- Melhorando: Atenção→Estável (279) + Estável→Ótimo (29) + Crítico→Atenção (10) = 318 ✅
- Estáveis: Estável→Estável (449) + Ótimo→Ótimo (110) + Atenção→Atenção (23) + Crítico→Crítico (24) = 606 ✅

**Total**: 84 + 318 + 606 = 1008 ✅

### Próximos Passos

1. ✅ Executar queries de validação no banco
2. ✅ Verificar se há histórico para 14/11
3. ✅ Verificar se há duplicatas
4. ✅ Corrigir lógica se necessário
5. ✅ Validar resultados com dados reais

