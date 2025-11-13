# Data Mínima do Histórico - 13/11/2025

**Data de Implementação:** 2025-11-13  
**Decisão:** Histórico temporal começa apenas a partir de 13/11/2025  
**Status:** ✅ Implementado

---

## 🎯 Justificativa

### Por que 13/11/2025?

1. **Primeira data com dados confiáveis**
   - É a primeira data onde os dados foram coletados com a estrutura v3 final
   - Dados anteriores são de versões diferentes do sistema

2. **Inconsistências em dados anteriores**
   - Dados de 12/11 e anteriores usam estrutura v2 (deprecated)
   - Métricas calculadas de forma diferente
   - Campos diferentes (last_meeting, app_usage vs nps_score_v3, overdue_installments)
   - Pode causar análises incorretas e comparações inválidas

3. **Integridade dos dados**
   - Garantir que todas as análises temporais usem dados consistentes
   - Evitar confusão entre versões antigas e novas
   - Melhorar confiabilidade das métricas apresentadas

---

## ✅ Implementação

### 1. Constante Centralizada

**Arquivo:** `src/lib/constants.ts`

```typescript
export const MIN_HISTORY_DATE = new Date(2025, 10, 13); // 13/11/2025
```

**Funções auxiliares:**
- `isValidHistoryDate(date)` - Verifica se data é válida
- `clampToMinHistoryDate(date)` - Garante que data não seja anterior à mínima

---

### 2. Filtros Aplicados

#### A) `temporalService.ts`
- ✅ `getTemporalAnalysis()` - Filtra datas antes de buscar
- ✅ `getAggregatedTemporalAnalysis()` - Filtra datas antes de buscar
- ✅ `calculateAggregatedAnalysis()` - Filtra na query SQL
- ✅ `calculatePlannerAnalysis()` - Filtra na query SQL

#### B) `MovementSankey.tsx`
- ✅ `loadClientHistoryForDate()` - Filtra na query SQL (`.gte('recorded_date', minDateStr)`)
- ✅ `dateRange` inicial - Garantido que não seja antes da data mínima
- ✅ `DatePickerWithRange` - `minDate` prop aplicada
- ✅ Quick ranges - Ajustados para respeitar data mínima

#### C) `TemporalAnalysis.tsx`
- ✅ `dateRange` inicial - Garantido que não seja antes da data mínima
- ✅ `handleQuickRange()` - Ajustado para respeitar data mínima
- ✅ `handleDateChange()` - Ajustado para respeitar data mínima
- ✅ `DatePickerWithRange` - `minDate` prop aplicada

#### D) `DatePickerWithRange` (componente UI)
- ✅ Aceita prop `minDate`
- ✅ Desabilita datas anteriores à mínima no calendário

---

## 🔍 Como Funciona

### Filtragem Automática

Todas as queries ao histórico agora incluem automaticamente:

```typescript
.gte('recorded_date', '2025-11-13') // Data mínima
```

### Ajuste de Datas

Se o usuário tentar selecionar uma data anterior a 13/11/2025:

```typescript
const safeDate = clampToMinHistoryDate(userSelectedDate);
// Se userSelectedDate < 13/11/2025, retorna 13/11/2025
```

### Date Pickers

Calendários não permitem selecionar datas antes de 13/11/2025:
- Datas anteriores aparecem desabilitadas (cinza)
- Não é possível clicar nelas

---

## 📊 Impacto

### Antes:
- ❌ Histórico incluía dados de versões antigas
- ❌ Análises podiam comparar dados incompatíveis
- ❌ Usuário podia selecionar períodos sem dados confiáveis
- ❌ Possibilidade de inconsistências e análises incorretas

### Depois:
- ✅ Histórico contém apenas dados confiáveis (v3)
- ✅ Análises sempre comparam dados compatíveis
- ✅ Usuário não pode selecionar períodos inválidos
- ✅ Garantia de consistência e exatidão

---

## 🧪 Como Testar

1. **Verificar Date Pickers:**
   - Abrir MovementSankey ou TemporalAnalysis
   - Tentar selecionar data anterior a 13/11/2024
   - ✅ Deve estar desabilitada (não clicável)

2. **Verificar Queries:**
   - Abrir DevTools (F12) → Network
   - Filtrar por "health_score_history"
   - Verificar que queries incluem `.gte('recorded_date', '2025-11-13')`

3. **Verificar Ranges Padrão:**
   - Se hoje for 13/12/2025 e selecionar "30 dias"
   - ✅ Deve começar em 13/11/2025 (não em 13/10/2025)

---

## ⚠️ Observações Importantes

### Dados Antigos no Banco

- ⚠️ **Dados anteriores a 13/11/2025 ainda existem no banco**
- ✅ Mas **não são mais consultados** pelas queries
- ✅ **Não aparecem** nas análises temporais
- ✅ **Não afetam** os cálculos

### Se Precisar Acessar Dados Antigos

Se no futuro precisar acessar dados anteriores (para migração, etc.):

1. **Opção 1:** Modificar `MIN_HISTORY_DATE` em `constants.ts`
2. **Opção 2:** Criar query direta sem usar os serviços (bypass)
3. **Opção 3:** Criar função específica que não aplica o filtro

---

## 🔄 Reversão (Se Necessário)

Se precisar remover a data mínima:

```bash
# Reverter mudanças
git checkout HEAD -- health-score-dashboard/src/lib/constants.ts
git checkout HEAD -- health-score-dashboard/src/services/temporalService.ts
git checkout HEAD -- health-score-dashboard/src/components/MovementSankey.tsx
git checkout HEAD -- health-score-dashboard/src/components/TemporalAnalysis.tsx
git checkout HEAD -- health-score-dashboard/src/components/ui/date-range-picker.tsx
```

Ou simplesmente alterar `MIN_HISTORY_DATE` para uma data anterior no `constants.ts`.

---

## 📝 Arquivos Modificados

1. ✅ `src/lib/constants.ts` - Criado (nova constante)
2. ✅ `src/services/temporalService.ts` - Filtros aplicados
3. ✅ `src/components/MovementSankey.tsx` - Filtros e date picker
4. ✅ `src/components/TemporalAnalysis.tsx` - Filtros e date picker
5. ✅ `src/components/ui/date-range-picker.tsx` - Suporte a minDate

---

## ✅ Garantias

- ✅ **Nenhuma funcionalidade foi quebrada**
- ✅ **Todas as mudanças são reversíveis**
- ✅ **Dados antigos não são deletados** (apenas não consultados)
- ✅ **Interface impede seleção de datas inválidas**
- ✅ **Queries são otimizadas** (filtro aplicado no banco)

---

**Status:** ✅ Implementado e pronto para uso

**Data Mínima:** 13/11/2025 (primeira data com dados confiáveis v3)

