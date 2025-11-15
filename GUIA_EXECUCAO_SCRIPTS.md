# 📋 GUIA DE EXECUÇÃO DOS SCRIPTS SQL

## ⚠️ IMPORTANTE: LEIA ANTES DE EXECUTAR

1. **Faça backup do banco de dados ANTES de executar qualquer script**
2. **Teste primeiro em ambiente de desenvolvimento**
3. **Execute os scripts na ordem indicada abaixo**

---

## 🚀 OPÇÃO RÁPIDA: Script Consolidado

**Se você quer aplicar todas as correções de uma vez:**

1. **Se houver dados existentes:** Execute primeiro `sql/migrate_identity_key_to_text.sql`
2. **Execute:** `sql/APLICAR_TODAS_CORRECOES.sql` (contém todas as funções atualizadas)

**Pronto!** Todas as correções serão aplicadas.

---

## 📝 ORDEM DETALHADA (Se preferir executar individualmente)

### PASSO 1: Verificar formato atual do `identity_key` (OPCIONAL mas recomendado)

Execute esta query no Supabase SQL Editor para verificar se seus dados usam MD5 ou texto:

```sql
-- Verificar formato atual do identity_key
SELECT 
  COUNT(*) FILTER (WHERE identity_key ~ '^[0-9a-f]{32}$') as formato_md5,
  COUNT(*) FILTER (WHERE identity_key LIKE '%|%') as formato_texto,
  COUNT(*) FILTER (WHERE identity_key IS NULL) as sem_identity_key,
  COUNT(*) as total
FROM clients;
```

**Resultado esperado:**
- Se `formato_md5 > 0`: Você precisa executar o script de migração (PASSO 2)
- Se `formato_texto > 0` e `formato_md5 = 0`: Pode pular o PASSO 2

---

### PASSO 2: Migrar `identity_key` de MD5 para texto (SE NECESSÁRIO)

**Arquivo:** `sql/migrate_identity_key_to_text.sql`

**Quando executar:**
- ✅ Se você tem dados existentes no banco
- ✅ Se a query do PASSO 1 mostrou `formato_md5 > 0`
- ❌ Se o banco está vazio ou já usa formato texto

**Como executar:**
1. Abra o Supabase Dashboard
2. Vá em SQL Editor
3. Copie e cole o conteúdo de `sql/migrate_identity_key_to_text.sql`
4. Execute o script
5. Verifique os resultados (deve mostrar estatísticas)

**Tempo estimado:** Depende da quantidade de registros (pode demorar alguns minutos)

---

### PASSO 3: Aplicar correções nas funções SQL

**OPÇÃO A - Script Consolidado (RECOMENDADO):**
- Execute: `sql/APLICAR_TODAS_CORRECOES.sql` (contém todas as funções)

**OPÇÃO B - Arquivos Individuais:**

#### 3.1. Atualizar `record_health_score_history_v3`
**Arquivo:** `sql/record_health_score_history_v3_fixed.sql`

**O que faz:**
- Remove RETURN para cônjuges
- Implementa herança de NPS
- Adiciona validações de data e `last_seen_at`

**Como executar:**
1. Abra o Supabase SQL Editor
2. Copie TODO o conteúdo de `sql/record_health_score_history_v3_fixed.sql`
3. Execute
4. Verifique se não há erros

---

#### 3.2. Atualizar `bulk_insert_client_v3`
**Arquivo:** `sql/bulk_insert_client_v3.sql`

**O que faz:**
- Adiciona `spouse_partner_name` no INSERT/UPDATE
- Altera `identity_key` para texto normalizado

**Como executar:**
1. Abra o Supabase SQL Editor
2. Copie TODO o conteúdo de `sql/bulk_insert_client_v3.sql`
3. Execute
4. Verifique se não há erros

---

#### 3.3. Atualizar `bulk_insert_clients_v3`
**Arquivo:** `sql/fix_import_flow.sql`

**O que faz:**
- Adiciona transação explícita com tratamento de erros
- Adiciona `spouse_partner_name` no INSERT/UPDATE
- Altera `identity_key` para texto normalizado

**Como executar:**
1. Abra o Supabase SQL Editor
2. Copie TODO o conteúdo de `sql/fix_import_flow.sql`
3. Execute
4. Verifique se não há erros

---

## ✅ VERIFICAÇÃO PÓS-EXECUÇÃO

Execute estas queries para verificar se tudo foi aplicado corretamente:

```sql
-- 1. Verificar se funções existem
SELECT proname, prosrc 
FROM pg_proc 
WHERE proname IN ('record_health_score_history_v3', 'bulk_insert_client_v3', 'bulk_insert_clients_v3');

-- 2. Verificar se coluna spouse_partner_name existe
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'clients' 
  AND column_name = 'spouse_partner_name';

-- 3. Verificar formato do identity_key (deve ser texto, não MD5)
SELECT 
  identity_key,
  CASE 
    WHEN identity_key ~ '^[0-9a-f]{32}$' THEN 'MD5 (precisa migrar)'
    WHEN identity_key LIKE '%|%' THEN 'Texto (correto)'
    ELSE 'Outro formato'
  END as formato
FROM clients
LIMIT 10;
```

---

## 🧪 TESTES RECOMENDADOS

Após executar os scripts, teste:

### Teste 1: Importação com cônjuge
1. Importe um CSV que contenha cônjuge
2. Verifique que `spouse_partner_name` foi salvo
3. Verifique que histórico foi criado para o cônjuge

### Teste 2: Herança de NPS
1. Verifique um cônjuge sem NPS próprio
2. Verifique que o histórico mostra NPS herdado do pagante

### Teste 3: Transação
1. Tente importar CSV com cliente inválido
2. Verifique que nenhum cliente foi inserido (rollback)

---

## 🚨 PROBLEMAS COMUNS

### Erro: "column spouse_partner_name does not exist"
**Solução:** Execute primeiro:
```sql
ALTER TABLE clients ADD COLUMN IF NOT EXISTS spouse_partner_name TEXT;
```

### Erro: "constraint clients_identity_key_key already exists"
**Solução:** Ignore o erro ou remova a constraint antiga:
```sql
ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_identity_key_key;
ALTER TABLE clients ADD CONSTRAINT clients_identity_key_key UNIQUE (identity_key);
```

### Erro: "function already exists"
**Solução:** Normal - as funções são criadas com `CREATE OR REPLACE`, então isso é esperado.

---

## 📞 SUPORTE

Se encontrar problemas:
1. Verifique os logs do Supabase
2. Execute as queries de verificação acima
3. Consulte `CORRECOES_CRITICAS_APLICADAS.md` para detalhes técnicos

---

## 📊 RESUMO RÁPIDO

```
1. Backup do banco ✅
2. Verificar formato identity_key (query acima)
3. Se MD5: Executar migrate_identity_key_to_text.sql
4. Executar record_health_score_history_v3_fixed.sql
5. Executar bulk_insert_client_v3.sql
6. Executar fix_import_flow.sql
7. Verificar com queries de validação
8. Testar importação
```

---

**Boa sorte! 🚀**

