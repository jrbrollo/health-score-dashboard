# 📋 Resumo - Data Mínima do Histórico (13/11/2025)

**Data:** 2025-11-13  
**Status:** ✅ Implementado  
**Decisão:** Histórico começa apenas a partir de 13/11/2025

---

## ✅ O Que Foi Feito

### 1. Constante Centralizada Criada
- ✅ `src/lib/constants.ts` - Nova constante `MIN_HISTORY_DATE = 13/11/2025`
- ✅ Funções auxiliares: `isValidHistoryDate()` e `clampToMinHistoryDate()`

### 2. Filtros Aplicados em Todos os Serviços
- ✅ `temporalService.ts` - Todas as funções filtram datas antes de buscar
- ✅ `MovementSankey.tsx` - Query SQL inclui `.gte('recorded_date', '2025-11-13')`
- ✅ Date pickers ajustados para não permitir datas anteriores

### 3. Componentes Atualizados
- ✅ `MovementSankey.tsx` - Date picker com `minDate={MIN_HISTORY_DATE}`
- ✅ `TemporalAnalysis.tsx` - Date picker com `minDate={MIN_HISTORY_DATE}`
- ✅ `DatePickerWithRange` - Suporte a prop `minDate`
- ✅ Quick ranges ajustados para respeitar data mínima

---

## 🎯 Resultado

### Antes:
- ❌ Histórico incluía dados de versões antigas (v2)
- ❌ Possibilidade de inconsistências
- ❌ Usuário podia selecionar períodos sem dados confiáveis

### Depois:
- ✅ Histórico contém apenas dados confiáveis (v3 a partir de 13/11/2025)
- ✅ Garantia de consistência
- ✅ Interface impede seleção de datas inválidas
- ✅ Queries otimizadas (filtro no banco)

---

## 📊 Arquivos Modificados

1. ✅ `src/lib/constants.ts` - **CRIADO** (nova constante)
2. ✅ `src/services/temporalService.ts` - Filtros aplicados
3. ✅ `src/components/MovementSankey.tsx` - Filtros e date picker
4. ✅ `src/components/TemporalAnalysis.tsx` - Filtros e date picker
5. ✅ `src/components/ui/date-range-picker.tsx` - Suporte a minDate
6. ✅ `DATA_MINIMA_HISTORICO.md` - Documentação completa

---

## 🧪 Como Testar

1. **Date Pickers:**
   - Abrir MovementSankey ou TemporalAnalysis
   - Tentar selecionar data anterior a 13/11/2024
   - ✅ Deve estar desabilitada (cinza, não clicável)

2. **Quick Ranges:**
   - Selecionar "30 dias", "60 dias", etc.
   - ✅ Se calcular data anterior a 13/11, deve ajustar para 13/11

3. **Queries:**
   - Abrir DevTools → Network
   - Filtrar por "health_score_history"
   - ✅ Queries devem incluir filtro de data mínima (2025-11-13)

---

## ⚠️ Observações

- ✅ **Dados antigos não são deletados** (apenas não consultados)
- ✅ **Nenhuma funcionalidade foi quebrada**
- ✅ **Todas as mudanças são reversíveis**
- ✅ **Filtro aplicado automaticamente** em todas as queries

---

## 🔄 Reversão

Se precisar remover a data mínima:

```bash
# Opção 1: Alterar data mínima
# Editar src/lib/constants.ts e mudar MIN_HISTORY_DATE

# Opção 2: Reverter tudo
git checkout HEAD -- health-score-dashboard/src/lib/constants.ts
git checkout HEAD -- health-score-dashboard/src/services/temporalService.ts
git checkout HEAD -- health-score-dashboard/src/components/MovementSankey.tsx
git checkout HEAD -- health-score-dashboard/src/components/TemporalAnalysis.tsx
git checkout HEAD -- health-score-dashboard/src/components/ui/date-range-picker.tsx
```

---

**Status Final:** ✅ Pronto para uso - Histórico começa em 13/11/2025

