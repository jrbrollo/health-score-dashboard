# Correções para Fluxo de Importação Diária

**Data:** 2025-11-13  
**Status:** ✅ Implementado  
**Objetivo:** Garantir histórico fidedigno com importação diária de planilhas CSV

---

## 🎯 Problemas Identificados e Corrigidos

### 1. ✅ Trigger Automático Desabilitado

**Problema:**
- Trigger registrava histórico automaticamente em INSERT/UPDATE
- Usava `CURRENT_DATE` (data atual) em vez da data da planilha
- Causava registros duplicados ou com data incorreta

**Solução:**
- Trigger `clients_health_history_trigger` foi **desabilitado**
- Histórico agora é registrado apenas durante bulk import com data correta

**Arquivo:** `sql/fix_import_flow.sql`

---

### 2. ✅ `last_seen_at` Usa Data da Planilha com Proteção

**Problema:**
- `last_seen_at` usava data atual (`NOW()`) em vez da data da planilha
- Causava inconsistência: histórico de 15/11 mas `last_seen_at` de 16/11
- Importar planilha antiga podia retroceder o snapshot

**Solução:**
- `last_seen_at` agora usa data da planilha (convertida para TIMESTAMPTZ)
- Proteção com `GREATEST()` para evitar retrocesso:
  ```sql
  last_seen_at = GREATEST(EXCLUDED.last_seen_at, clients.last_seen_at)
  ```
- Só atualiza se nova data for >= data atual

**Arquivos Modificados:**
- `sql/fix_import_flow.sql` - Funções SQL atualizadas
- `src/services/clientService.ts` - Frontend envia data correta

---

### 3. ✅ Validação de Data da Planilha

**Problema:**
- Não havia validação se data da planilha era futura ou muito antiga
- Podia criar histórico incorreto

**Solução:**
- Validação no frontend antes de importar:
  - ❌ Data futura → Erro
  - ❌ Data anterior a 13/11/2025 → Erro
  - ⚠️ Data muito antiga (>7 dias) → Aviso

**Arquivo:** `src/components/BulkImportV3.tsx`

---

### 4. ✅ Proteção Contra Reimportação

**Problema:**
- Reimportar mesma planilha sobrescrevia histórico sem aviso
- Podia perder dados ou criar inconsistências

**Solução:**
- Verificação antes de importar:
  - Busca se já existe histórico para aquela data
  - Se existir, pede confirmação do usuário
  - Usuário pode cancelar ou confirmar

**Arquivo:** `src/components/BulkImportV3.tsx`

---

## 📊 Fluxo Atualizado

### Antes (Problemas):
```
1. Importar CSV de 15/11 em 16/11
   ↓
2. last_seen_at = 16/11 ❌ (data atual)
3. Histórico = 15/11 ✅ (data da planilha)
4. Trigger também registra = 16/11 ❌ (duplicado)
   ↓
RESULTADO: Inconsistência e duplicação
```

### Depois (Corrigido):
```
1. Importar CSV de 15/11 em 16/11
   ↓
2. Validação: Data OK? ✅
3. Verificação: Já existe histórico? ⚠️ (avisa se sim)
4. last_seen_at = 15/11 ✅ (data da planilha, com proteção GREATEST)
5. Histórico = 15/11 ✅ (data da planilha)
6. Trigger desabilitado ✅ (não interfere)
   ↓
RESULTADO: Histórico fidedigno e consistente
```

---

## 🔧 Arquivos Modificados

### SQL:
1. ✅ `sql/fix_import_flow.sql` - **NOVO** (script completo de correções)

### Frontend:
2. ✅ `src/services/clientService.ts` - Usa data da planilha em `seenAt`
3. ✅ `src/components/BulkImportV3.tsx` - Validações e proteção contra reimportação

---

## 📝 Como Aplicar

### 1. Executar Script SQL

Execute no SQL Editor do Supabase:

```sql
-- Copiar e executar o conteúdo de:
sql/fix_import_flow.sql
```

Isso irá:
- Desabilitar o trigger
- Criar/atualizar `bulk_insert_clients_v3`
- Atualizar `bulk_insert_client_v3` com proteção GREATEST

### 2. Verificar Frontend

O frontend já está atualizado. As mudanças incluem:
- Validação de data
- Proteção contra reimportação
- Uso correto da data da planilha

---

## ✅ Garantias

- ✅ **Histórico sempre usa data da planilha** (não data atual)
- ✅ **`last_seen_at` sincronizado com histórico** (mesma data)
- ✅ **Proteção contra retrocesso** (GREATEST)
- ✅ **Validação de datas** (não futura, não muito antiga)
- ✅ **Proteção contra reimportação** (avisa antes de sobrescrever)
- ✅ **Sem duplicação** (trigger desabilitado)

---

## 🧪 Como Testar

1. **Importar planilha de hoje:**
   - ✅ Deve funcionar normalmente
   - ✅ `last_seen_at` = data da planilha
   - ✅ Histórico = data da planilha

2. **Importar planilha futura:**
   - ❌ Deve mostrar erro
   - ❌ Não deve permitir importar

3. **Importar planilha antiga (>7 dias):**
   - ⚠️ Deve mostrar aviso
   - ✅ Deve permitir importar (com confirmação)

4. **Reimportar mesma planilha:**
   - ⚠️ Deve avisar que já existe histórico
   - ✅ Deve pedir confirmação
   - ✅ Se confirmar, atualiza histórico

5. **Importar planilha de ontem depois de hoje:**
   - ✅ `last_seen_at` não retrocede (proteção GREATEST)
   - ✅ Histórico de ontem é registrado corretamente

---

## 🔄 Reversão (Se Necessário)

### Reabilitar Trigger:
```sql
CREATE TRIGGER clients_health_history_trigger
  AFTER INSERT OR UPDATE ON clients
  FOR EACH ROW
  EXECUTE FUNCTION trigger_record_health_history_v3();
```

### Reverter last_seen_at para data atual:
```sql
-- Modificar bulk_insert_client_v3:
last_seen_at = p_seen_at  -- Em vez de seen_at_final
```

---

**Status:** ✅ Pronto para uso - Histórico fidedigno garantido

