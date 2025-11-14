# 📋 Instruções: Remover Restrições de Cônjuges

## ✅ O QUE JÁ FOI FEITO (Código Frontend)

Todas as alterações no código frontend já foram implementadas:
- ✅ `temporalService.ts` - Simplificado, não trata cônjuges diferente
- ✅ `clientService.ts` - Comentário atualizado
- ✅ Todos os drawers - Filtro de data aplicado igualmente
- ✅ Cálculo de health score - Funciona para cônjuges

---

## ⚠️ O QUE PRECISA SER FEITO (Banco de Dados)

Você precisa executar **3 scripts SQL** no Supabase para atualizar as funções do banco:

### 1️⃣ Executar `sql/fix_remove_spouse_restrictions.sql`

**O que faz:** Atualiza a função `record_health_score_history_v3` para não ignorar cônjuges.

**Como executar:**
1. Acesse o [Dashboard do Supabase](https://app.supabase.com)
2. Selecione seu projeto
3. Vá em **SQL Editor**
4. Abra o arquivo `sql/fix_remove_spouse_restrictions.sql`
5. Copie todo o conteúdo
6. Cole no SQL Editor
7. Clique em **Run** (ou pressione Ctrl+Enter)

**Verificação:**
```sql
-- Execute este comando para verificar:
SELECT 
  CASE 
    WHEN pg_get_functiondef(oid) LIKE '%is_spouse%RETURN%' THEN '❌ AINDA IGNORA CÔNJUGES'
    ELSE '✅ OK - NÃO IGNORA CÔNJUGES'
  END as status
FROM pg_proc
WHERE proname = 'record_health_score_history_v3'
  AND pronargs = 2;
```

---

### 2️⃣ Executar `sql/fix_import_flow.sql` (completo)

**O que faz:** Atualiza a função `bulk_insert_client_v3` para criar histórico de cônjuges durante importação.

**Como executar:**
1. No SQL Editor do Supabase
2. Abra o arquivo `sql/fix_import_flow.sql`
3. Copie todo o conteúdo
4. Cole no SQL Editor
5. Clique em **Run**

**O que mudou:**
- Linha 237: Removido `IF result.is_spouse IS NULL OR result.is_spouse = FALSE THEN`
- Agora sempre cria histórico: `PERFORM record_health_score_history_v3(result.id, p_import_date);`

---

### 3️⃣ Executar `sql/create_bulk_insert_function.sql` (completo)

**O que faz:** Atualiza a função `create_bulk_insert_client_v3` para criar histórico de cônjuges.

**Como executar:**
1. No SQL Editor do Supabase
2. Abra o arquivo `sql/create_bulk_insert_function.sql`
3. Copie todo o conteúdo
4. Cole no SQL Editor
5. Clique em **Run**

**O que mudou:**
- Linha 360: Removido `IF result.is_spouse IS NULL OR result.is_spouse = FALSE THEN`
- Agora sempre cria histórico: `PERFORM record_health_score_history_v3(result.id, p_import_date);`

---

## 🧪 TESTE APÓS EXECUTAR

1. **Teste com cliente cônjuge:**
   - Abra o drawer da "Daniela Bianchini Rosso"
   - O gráfico deve aparecer automaticamente
   - Verifique o console para logs

2. **Teste de importação:**
   - Importe um CSV com cônjuges
   - Verifique se o histórico é criado para cônjuges

3. **Verificar histórico no banco:**
```sql
-- Verificar se cônjuges têm histórico
SELECT 
  COUNT(*) as total_historico,
  COUNT(*) FILTER (WHERE is_spouse = true) as conjuges_com_historico
FROM health_score_history
WHERE recorded_date >= '2025-11-13';
```

---

## 📊 RESUMO DAS MUDANÇAS

### Funções SQL Atualizadas:
1. ✅ `record_health_score_history_v3` - Não ignora mais cônjuges
2. ✅ `bulk_insert_client_v3` - Cria histórico para cônjuges
3. ✅ `create_bulk_insert_client_v3` - Cria histórico para cônjuges

### Código Frontend:
1. ✅ `temporalService.ts` - Simplificado
2. ✅ `clientService.ts` - Comentário atualizado
3. ✅ Todos os drawers - Filtro de data aplicado

---

## ⚠️ IMPORTANTE

- **Execute os 3 scripts SQL na ordem acima**
- **Após executar, teste com um cliente cônjuge**
- **Se algo não funcionar, verifique os logs no console**

---

**Status:** ✅ Código pronto - Aguardando execução dos scripts SQL

