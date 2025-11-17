# 🚨 CORREÇÃO CRÍTICA: Temporal AS-OF Query

**Data:** 17/11/2025
**Prioridade:** 🔴 CRÍTICA
**Impacto:** Resolve bug onde histórico muda após novos imports

---

## 📋 O PROBLEMA IDENTIFICADO

### Sintomas
- Após importar planilha do dia 17/11, o score médio do dia 14/11 mudou de 61.8 para 51.25
- Gráfico de "Evolução do Health Score" mostra valores diferentes para dias passados após cada import
- Query AS-OF retorna 1862 clientes para o dia 14/11, mas você só importou 1008 clientes naquele dia

### Causa Raiz

A função `get_temporal_analysis_asof` usa esta lógica:

```sql
WHERE h.recorded_date <= d.day  -- ❌ PROBLEMA
ORDER BY h.client_id, h.recorded_date DESC
```

Isso cria um **"snapshot acumulado"**: pega o registro mais recente de **CADA cliente que existiu até aquele dia**, incluindo:
- Clientes do dia 14/11: 1008
- Clientes do dia 13/11: 1000
- Clientes de outubro: 1454, 1470, 1413...
- **Total acumulado: 1865 clientes únicos**

Quando você importa novo CSV (dia 17), alguns clientes saem da base, outros entram. A query AS-OF **recalcula** o histórico pegando diferentes combinações de clientes, alterando os valores passados.

---

## ✅ A SOLUÇÃO

### Mudança Necessária

**Substituir LATERAL JOIN complexo por um INNER JOIN simples:**

```sql
INNER JOIN health_score_history h
  ON h.recorded_date = d.day  -- ✅ CORRETO: apenas clientes daquele dia
```

Isso mostra **apenas os clientes ativos naquele dia específico**, respeitando o princípio de imutabilidade do histórico.

### Comportamento Após Correção

| Data       | Clientes (ANTES) | Clientes (DEPOIS) | Diferença |
|------------|------------------|-------------------|-----------|
| 2025-11-13 | ~1862            | 1000              | ✅ Correto |
| 2025-11-14 | ~1862            | 1008              | ✅ Correto |
| 2025-11-17 | ~1862            | 1003              | ✅ Correto |

---

## 🎯 PASSO A PASSO DE APLICAÇÃO

### ETAPA 1: Backup (OBRIGATÓRIO)

1. Abra o **Supabase Dashboard**
2. Vá em **Settings → Database → Backups**
3. Clique em **Create Backup**
4. Aguarde confirmação

> ⚠️ **IMPORTANTE:** Faça backup antes de qualquer mudança!

---

### ETAPA 2: Aplicar Correção SQL

**Tempo estimado:** 2 minutos

1. Abra o arquivo `sql/fix_temporal_asof_v2.sql` no projeto
2. Copie **TODO o conteúdo** do arquivo
3. Abra o **Supabase SQL Editor**
4. Cole o conteúdo no editor
5. Clique em **Run** (ou pressione Ctrl+Enter)
6. Verifique mensagem: **"Success. No rows returned"**

---

### ETAPA 3: Validar Correção

Execute esta query no SQL Editor:

```sql
SELECT
  recorded_date,
  total_clients,
  avg_health_score
FROM get_temporal_analysis_asof('2025-11-13', '2025-11-17', 'all')
ORDER BY recorded_date;
```

**Resultado esperado:**

| recorded_date | total_clients | avg_health_score |
|---------------|---------------|------------------|
| 2025-11-13    | 1000          | 51.64            |
| 2025-11-14    | 1008          | 54.61            |
| 2025-11-17    | 1003          | 61.89            |

✅ **Se viu esses números (1000, 1008, 1003), a correção funcionou!**

---

### ETAPA 4: Testar no Dashboard

1. Faça **hard refresh** no navegador: `Ctrl + Shift + R` (Windows) ou `Cmd + Shift + R` (Mac)
2. Vá na seção **"Análise Temporal"**
3. Verifique o gráfico **"Evolução do Health Score"**
4. Anote o valor do dia 14/11

**Agora faça o teste definitivo:**

1. Reimporte a planilha do dia 17/11 novamente
2. Vá novamente no gráfico "Evolução do Health Score"
3. **Verifique se o valor do dia 14/11 NÃO MUDOU**

✅ **Se o valor permaneceu igual, o bug foi resolvido!**

---

## 🔄 ROLLBACK (SE NECESSÁRIO)

Se algo der errado, restaure a versão anterior:

```sql
-- Copie o conteúdo original das linhas 150-268 do arquivo sql/temporal_setup.sql
-- e execute no Supabase SQL Editor para reverter
```

Ou restaure o backup criado na Etapa 1.

---

## ❓ PERGUNTAS FREQUENTES

### 1. "Dias de final de semana aparecem sem dados"

**Resposta:** Isso é esperado! Se você não importou CSV no sábado/domingo, esses dias não terão registros. A correção **NÃO FAZ MAIS FORWARD FILL** automático.

**Solução se quiser forward fill:**
- Use a função antiga para análise de tendências de longo prazo
- Use a função nova para análise diária precisa

---

### 2. "O gráfico ficou com 'buracos' nos finais de semana"

**Resposta:** Correto! Agora o gráfico mostra apenas dias com importações reais.

**Opção:** Se quiser preencher os buracos no frontend, modifique `src/components/TemporalAnalysis.tsx` para fazer interpolação linear entre os dias.

---

### 3. "Posso ter as duas versões da função?"

**Resposta:** SIM! Você pode renomear a função antiga para:
- `get_temporal_analysis_asof_cumulative` (comportamento antigo: snapshot acumulado)
- `get_temporal_analysis_asof` (comportamento novo: apenas clientes do dia)

Assim você escolhe qual usar dependendo da análise.

---

## 📊 IMPACTO DA CORREÇÃO

### Antes ❌
- Histórico **mutável**: valores mudavam após novos imports
- Dados **inflados**: 1862 clientes ao invés de 1008
- **Impossível** confiar no histórico para análises

### Depois ✅
- Histórico **imutável**: valores fixos após importação
- Dados **precisos**: quantidade correta de clientes por dia
- **Confiável** para análises e decisões de negócio

---

## ✨ PRÓXIMOS PASSOS (OPCIONAL)

Se você quiser **forward fill** para preencher finais de semana:

1. Criar função `get_temporal_analysis_with_fill` que:
   - Usa a nova lógica para dias com importação
   - Replica valores do último dia útil para finais de semana

2. Modificar frontend para escolher qual função usar baseado em toggle do usuário

---

## 📝 RESUMO TÉCNICO

**Mudança principal:**
```sql
-- ANTES: LATERAL JOIN com DISTINCT ON
WHERE h.recorded_date <= d.day
ORDER BY h.client_id, h.recorded_date DESC

-- DEPOIS: INNER JOIN simples
WHERE h.recorded_date = d.day
```

**Arquivos afetados:**
- ✅ `sql/fix_temporal_asof_v2.sql` (novo)
- ℹ️ `sql/temporal_setup.sql` (referência original)

**Compatibilidade:**
- ✅ Não quebra APIs existentes (mesma assinatura da função)
- ✅ Frontend continua funcionando sem mudanças
- ✅ Filtros hierárquicos continuam funcionando

---

## ✅ CHECKLIST PÓS-APLICAÇÃO

- [ ] Backup do Supabase criado
- [ ] SQL executado sem erros
- [ ] Query de validação retorna 1008 clientes no dia 14/11
- [ ] Dashboard mostra valores corretos
- [ ] Reimportação de CSV NÃO altera valores históricos

**Se todos os itens estão marcados, a correção está completa! 🎉**

---

**Documentação criada por:** Claude (Anthropic AI Assistant)
**Arquivo SQL:** `sql/fix_temporal_asof_v2.sql`
**Prioridade:** 🔴 CRÍTICA - Aplicar ANTES de próxima importação
