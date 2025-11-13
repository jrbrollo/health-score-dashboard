# Análise de Funções SQL - Health Score

**Data:** 2025-11-13  
**Objetivo:** Documentar funções SQL existentes e suas dependências

---

## 🔍 Funções SQL Identificadas

### 1. `calculate_health_score` (v2 - LEGADA)

**Localização:** `sql/temporal_setup.sql` (linhas 48-147)

**Status:** ⚠️ **PODE ESTAR EM USO**

**Características:**
- Usa campos v2 (deprecated): `last_meeting`, `app_usage`, `payment_status`, etc.
- Lógica antiga do Health Score v2
- Retorna JSON com estrutura v2

**Onde é chamada:**
- `record_health_score_history()` em `temporal_setup.sql` (linha 278)
- Esta função pode estar sendo chamada por triggers antigos

**Recomendação:**
- ⚠️ **NÃO REMOVER** sem verificar dependências
- Verificar se triggers ainda usam esta função
- Se não estiver em uso, renomear para `calculate_health_score_v2_deprecated`

**Como verificar se está em uso:**
```sql
-- No Supabase SQL Editor:
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE action_statement LIKE '%calculate_health_score%'
   OR action_statement LIKE '%record_health_score_history%';
```

---

### 2. `calculate_health_score_v3` (v3 - ATUAL)

**Localização:** `sql/setup_v3.sql` (linha 119)

**Status:** ✅ **EM USO**

**Características:**
- Usa campos v3: `nps_score_v3`, `overdue_installments`, `overdue_days`, etc.
- Lógica atual do Health Score v3
- Alinhada com `healthScore.ts` do frontend

**Onde é chamada:**
- `record_health_score_history_v3()` (verificar)
- Triggers v3 (verificar)

---

### 3. `record_health_score_history` (v2 - LEGADA)

**Localização:** `sql/temporal_setup.sql` (linhas 271-330)

**Status:** ⚠️ **PODE ESTAR EM USO**

**Características:**
- Chama `calculate_health_score` v2
- Usa campos v2
- Pode estar sendo chamada por triggers antigos

**Recomendação:**
- Verificar se triggers ainda referenciam esta função
- Se não estiver em uso, pode ser removida

---

### 4. `record_health_score_history_v3` (v3 - ATUAL)

**Localização:** `sql/record_health_score_history_v3_fixed.sql`

**Status:** ✅ **EM USO (PRESUMIDO)**

**Características:**
- Usa lógica v3 correta
- Alinhada com frontend
- Calcula pilares v3 corretamente

**Onde é chamada:**
- Triggers v3 (verificar)
- RPC `bulk_insert_clients_v3` (verificar)

---

## 🔧 Triggers Identificados

### Verificar no Supabase:

```sql
-- Listar todos os triggers relacionados a health_score
SELECT 
  trigger_name,
  event_object_table,
  action_timing,
  event_manipulation,
  action_statement
FROM information_schema.triggers
WHERE event_object_table IN ('clients', 'health_score_history')
ORDER BY trigger_name;
```

---

## 📋 Checklist de Verificação

Antes de remover qualquer função legada:

- [ ] Verificar triggers que usam `calculate_health_score` v2
- [ ] Verificar triggers que usam `record_health_score_history` v2
- [ ] Verificar RPCs que podem chamar funções v2
- [ ] Testar importação de CSV para garantir que usa v3
- [ ] Verificar logs do Supabase para chamadas a funções v2
- [ ] Confirmar que histórico está sendo gerado com v3

---

## ⚠️ Ação Recomendada (NÃO EXECUTAR AINDA)

### Opção 1: Renomear funções legadas (SEGURA)

```sql
-- Renomear função v2 para indicar que está deprecated
ALTER FUNCTION calculate_health_score RENAME TO calculate_health_score_v2_deprecated;
ALTER FUNCTION record_health_score_history RENAME TO record_health_score_history_v2_deprecated;
```

### Opção 2: Remover funções legadas (APENAS SE CONFIRMADO QUE NÃO ESTÃO EM USO)

```sql
-- ⚠️ CUIDADO: Só executar após confirmar que não estão em uso
DROP FUNCTION IF EXISTS calculate_health_score CASCADE;
DROP FUNCTION IF EXISTS record_health_score_history CASCADE;
```

---

## 📝 Notas Importantes

1. **Não remover funções sem verificação completa**
   - Pode quebrar triggers existentes
   - Pode quebrar RPCs que dependem delas

2. **Sistema pode estar em transição v2 → v3**
   - Alguns dados antigos podem ainda usar v2
   - Histórico antigo pode ter sido gerado com v2

3. **Recomendação para apresentação:**
   - ✅ Deixar funções legadas como estão (não quebra nada)
   - ✅ Focar em garantir que novas operações usam v3
   - ✅ Documentar para limpeza futura

---

**Status:** Análise completa, aguardando verificação de dependências antes de qualquer remoção.

