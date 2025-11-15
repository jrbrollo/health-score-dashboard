# 📋 Instruções: Importar Planilha do Dia 13/11

## ⚠️ PROBLEMA IDENTIFICADO

O histórico do dia 13/11 no banco de dados contém **1.813 clientes**, mas a planilha do 13/11 tem apenas **1.176 clientes**.

**Causa:** O histórico foi criado manualmente incluindo TODOS os clientes que existiam no banco até 14/11, não apenas os que estavam na planilha do 13/11.

## ✅ SOLUÇÃO

### Passo 1: Importar a Planilha do 13/11

1. Acesse a ferramenta Health Score
2. Vá em "Importar Clientes"
3. Selecione o arquivo: `modelo health score brauna v3 13.11.csv`
4. **IMPORTANTE:** Na data da planilha, selecione **13/11/2025**
5. Clique em "Importar"

Isso criará/atualizará os clientes com `last_seen_at = '2025-11-13'`.

### Passo 2: Recriar o Histórico do 13/11

Após a importação, execute o script SQL:

```sql
-- Arquivo: sql/fix_history_13_11_only_csv_clients.sql
```

Ou execute via MCP Supabase:

O script irá:
1. Deletar o histórico atual do 13/11 (se houver)
2. Recriar o histórico APENAS para clientes com `last_seen_at = '2025-11-13'`
3. Isso garantirá que apenas os 1.176 clientes da planilha estejam no histórico

## 📊 Resultado Esperado

Após a importação e execução do script:
- **Total de clientes no histórico do 13/11:** ~1.176 (igual à planilha)
- **Score médio:** ~56.00 (calculado da planilha)
- **Distribuição:** Igual à planilha

## 🔍 Verificação

Após executar, verifique:

```sql
SELECT 
  COUNT(*) as total_historicos,
  ROUND(AVG(health_score), 2) as media_score
FROM health_score_history
WHERE recorded_date = '2025-11-13';
```

Deve retornar:
- `total_historicos`: ~1.176
- `media_score`: ~56.00

