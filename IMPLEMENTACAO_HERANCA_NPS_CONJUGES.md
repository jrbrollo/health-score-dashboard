# 🔄 Implementação: Herança de NPS do Pagante para Cônjuges

**Data:** 2025-01-XX  
**Status:** ✅ Implementado - Requer Execução de Scripts SQL

---

## 🎯 Objetivo

Implementar lógica para que clientes cônjuges herdem o NPS do cliente pagante vinculado, garantindo que a avaliação do casal seja consistente e não distorcida.

---

## ✅ Alterações Implementadas

### 1. **Banco de Dados**

#### Nova Coluna: `spouse_partner_name`
- ✅ Adicionada coluna `spouse_partner_name TEXT` na tabela `clients`
- ✅ Índice criado para busca rápida
- ✅ Armazena o nome do cliente pagante vinculado ao cônjuge

#### Função SQL: `record_health_score_history_v3`
- ✅ Atualizada para buscar NPS do pagante quando cliente for cônjuge
- ✅ Se cônjuge não tem NPS próprio, busca pelo `spouse_partner_name` + `planner`
- ✅ Se não encontra pagante ou pagante não tem NPS, cônjuge recebe 0 pontos (antes era 10)

#### Funções de Bulk Insert
- ✅ `bulk_insert_client_v3` atualizada para incluir `spouse_partner_name` no INSERT/UPDATE

### 2. **Frontend - TypeScript**

#### `src/types/client.ts`
- ✅ Adicionado campo `spousePartnerName?: string` na interface `Client`

#### `src/services/clientService.ts`
- ✅ Atualizado `clientToDatabase` para incluir `spouse_partner_name`
- ✅ Atualizado `databaseToClient` para ler `spouse_partner_name`

#### `src/utils/healthScore.ts`
- ✅ Função `calculateNPS` atualizada para aceitar mapa opcional de NPS do pagante
- ✅ Se cliente é cônjuge sem NPS próprio, busca no mapa do pagante
- ✅ Cônjuge sem NPS (próprio nem do pagante) = 0 pontos
- ✅ Função `createPayerNpsMap` criada para construir mapa de NPS dos pagantes
- ✅ Função `calculateHealthScore` atualizada para aceitar mapa opcional

#### `src/components/BulkImportV3.tsx`
- ✅ Atualizado para preencher `spousePartnerName` durante importação
- ✅ Usa nome do pagante encontrado ou nome raw da planilha

### 3. **Scripts SQL**

#### `sql/recreate_history_13_11_with_inherited_nps.sql` (NOVO)
- ✅ Script para recriar históricos do dia 13/11 com nova lógica
- ✅ Deleta históricos existentes do dia 13/11
- ✅ Recria usando função atualizada que herda NPS

---

## 📋 AÇÕES NECESSÁRIAS

### ⚠️ IMPORTANTE: Execute os Scripts SQL no Supabase

Para que as mudanças tenham efeito completo, você precisa executar os scripts SQL no banco de dados:

#### 1️⃣ Executar Script de Recriação de Históricos

**Arquivo:** `sql/recreate_history_13_11_with_inherited_nps.sql`

**O que faz:** Recria todos os históricos do dia 13/11/2025 com a nova lógica de NPS herdado.

**Como executar:**
1. Acesse o [Dashboard do Supabase](https://app.supabase.com)
2. Selecione seu projeto
3. Vá em **SQL Editor**
4. Abra o arquivo `sql/recreate_history_13_11_with_inherited_nps.sql`
5. Copie todo o conteúdo
6. Cole no SQL Editor
7. Clique em **Run** (ou pressione Ctrl+Enter)

**⚠️ ATENÇÃO:** Este script vai DELETAR e RECRIAR todos os históricos do dia 13/11. Certifique-se de que:
- A função `record_health_score_history_v3` já foi atualizada (já foi executada anteriormente)
- Você tem backup dos dados se necessário

**Tempo estimado:** 5-15 minutos (dependendo da quantidade de clientes)

---

## 🔍 Como Funciona

### Lógica de Herança de NPS

1. **Cliente Cônjuge com NPS Próprio:**
   - Usa seu próprio NPS (não herda do pagante)

2. **Cliente Cônjuge SEM NPS Próprio:**
   - Busca o cliente pagante usando `spouse_partner_name` + `planner`
   - Se encontra pagante E pagante tem NPS:
     - Herda o NPS do pagante
   - Se não encontra pagante OU pagante não tem NPS:
     - Recebe 0 pontos (antes era 10 pontos neutro)

3. **Cliente Não-Cônjuge:**
   - Funciona normalmente (sem mudanças)
   - Se não tem NPS = 10 pontos (neutro)

### Exemplo Prático

**Cenário 1: Cônjuge herda NPS bom**
- Cliente Pagante: NPS 10 → 20 pontos
- Cônjuge: Sem NPS próprio → Herda NPS 10 → 20 pontos
- **Resultado:** Casal tem avaliação consistente (ambos 20 pontos)

**Cenário 2: Cônjuge herda NPS ruim**
- Cliente Pagante: NPS 5 → -10 pontos
- Cônjuge: Sem NPS próprio → Herda NPS 5 → -10 pontos
- **Resultado:** Casal tem avaliação consistente (ambos -10 pontos)

**Cenário 3: Cônjuge sem pagante encontrado**
- Cônjuge: Sem NPS próprio → Não encontra pagante → 0 pontos
- **Resultado:** Não distorce a avaliação (0 pontos neutro)

---

## ✅ Verificação

Após executar os scripts, verifique:

1. **Históricos recriados:**
```sql
SELECT COUNT(*) 
FROM health_score_history 
WHERE recorded_date = '2025-11-13';
```

2. **Cônjuges com NPS herdado:**
```sql
SELECT 
  h.client_name,
  h.nps_score_v3,
  h.nps_score_v3_pillar,
  c.spouse_partner_name
FROM health_score_history h
JOIN clients c ON h.client_id = c.id
WHERE h.recorded_date = '2025-11-13'
  AND h.is_spouse = true
  AND h.nps_score_v3 IS NOT NULL
LIMIT 10;
```

3. **Média de scores:**
```sql
SELECT 
  AVG(health_score) as media_score,
  AVG(nps_score_v3_pillar) as media_nps_pillar
FROM health_score_history
WHERE recorded_date = '2025-11-13';
```

---

## 🚀 Próximos Passos

1. ✅ Executar script de recriação de históricos
2. ✅ Verificar se históricos foram recriados corretamente
3. ✅ Testar importação de nova planilha (deve preencher `spouse_partner_name`)
4. ✅ Verificar se gráficos de cônjuges mostram scores corretos

---

## 📝 Notas Técnicas

- A herança de NPS funciona tanto no backend (SQL) quanto no frontend (TypeScript)
- O frontend usa um mapa de NPS dos pagantes para evitar múltiplas queries
- A busca do pagante é feita por nome normalizado + planner para garantir precisão
- Cônjuges sem vínculo claro recebem 0 pontos (não distorcem a avaliação)

---

**Última atualização:** 2025-01-XX



