# 🚀 Guia de Deploy - Health Score Dashboard

**Data:** 2025-11-13  
**Plataforma:** Vercel (via GitHub)

---

## 📋 Checklist Antes do Deploy

### ✅ 1. Verificar Mudanças

Você tem as seguintes mudanças para commitar:

**Arquivos Modificados:**
- `scripts/compare_scores.mjs`
- `src/components/BulkImportV3.tsx`
- `src/components/Dashboard.tsx`
- `src/components/MovementSankey.tsx`
- `src/components/TemporalAnalysis.tsx`
- `src/components/ui/date-range-picker.tsx`
- `src/services/clientService.ts`
- `src/services/temporalService.ts`

**Arquivos Novos:**
- `ANALISE_FUNCOES_SQL.md`
- `CHANGELOG_CORRECOES.md`
- `CORRECOES_IMPORTACAO_DIARIA.md`
- `DATA_MINIMA_HISTORICO.md`
- `OTIMIZACOES_MOVEMENT_SANKEY.md`
- `RESUMO_CORRECOES.md`
- `RESUMO_DATA_MINIMA.md`
- `scripts/validate_integrity.mjs`
- `sql/fix_import_flow.sql` ⚠️ **IMPORTANTE: Executar no Supabase antes do deploy**
- `src/lib/constants.ts`

---

## 🔧 Passo 1: Executar Script SQL no Supabase

**⚠️ CRÍTICO:** Antes de fazer deploy, você precisa executar o script SQL:

1. Acesse o **Supabase Dashboard**
2. Vá em **SQL Editor**
3. Copie e execute o conteúdo de: `sql/fix_import_flow.sql`
4. Verifique se não houve erros

Este script:
- Desabilita o trigger automático
- Atualiza funções SQL para usar data da planilha
- Adiciona proteção GREATEST em `last_seen_at`

---

## 📦 Passo 2: Adicionar Arquivos ao Git

Execute no terminal (dentro de `health-score-dashboard`):

```powershell
# Adicionar todos os arquivos modificados e novos
git add .

# Ou adicionar seletivamente (recomendado):
git add scripts/compare_scores.mjs
git add src/components/BulkImportV3.tsx
git add src/components/Dashboard.tsx
git add src/components/MovementSankey.tsx
git add src/components/TemporalAnalysis.tsx
git add src/components/ui/date-range-picker.tsx
git add src/services/clientService.ts
git add src/services/temporalService.ts
git add src/lib/constants.ts
git add sql/fix_import_flow.sql
git add *.md
git add scripts/validate_integrity.mjs
```

---

## 💬 Passo 3: Fazer Commit

```powershell
git commit -m "feat: Correções para fluxo de importação diária e otimizações

- Desabilita trigger automático (não há edição manual)
- Usa data da planilha em last_seen_at com proteção GREATEST
- Adiciona validação de data da planilha
- Proteção contra reimportação
- Data mínima do histórico: 13/11/2025
- Otimizações de performance no MovementSankey
- Corrige exibição de data na Visão Geral (usa lastSeenAt)
- Adiciona constantes centralizadas
- Documentação completa das correções"
```

---

## 🚀 Passo 4: Fazer Push para GitHub

```powershell
git push origin main
```

---

## ✅ Passo 5: Verificar Deploy no Vercel

Se o Vercel estiver conectado ao GitHub:

1. O deploy será **automático** após o push
2. Acesse o **Vercel Dashboard**
3. Verifique se o deploy foi iniciado
4. Aguarde a conclusão (geralmente 2-5 minutos)

Se não estiver conectado:

1. Acesse [vercel.com](https://vercel.com)
2. Conecte o repositório `health-score-dashboard`
3. Configure:
   - **Framework Preset:** Vite
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
   - **Install Command:** `npm install`

---

## 🧪 Passo 6: Testar em Produção

Após o deploy, teste:

1. ✅ **Importação CSV:**
   - Fazer upload de planilha
   - Verificar se data da planilha é usada corretamente
   - Verificar proteção contra reimportação

2. ✅ **Visão Geral:**
   - Verificar se data exibida é `lastSeenAt` (data da planilha)
   - Verificar se não mostra dados anteriores a 13/11/2025

3. ✅ **Análise Temporal:**
   - Verificar se date picker não permite datas antes de 13/11/2025
   - Verificar se queries filtram corretamente

4. ✅ **Movement Sankey:**
   - Verificar se carrega mais rápido
   - Verificar se não mostra dados anteriores a 13/11/2025

---

## ⚠️ Problemas Comuns

### Deploy falha no build

**Solução:**
```powershell
# Testar build localmente primeiro
npm run build

# Se funcionar localmente, o problema pode ser:
# - Variáveis de ambiente não configuradas no Vercel
# - Dependências faltando
```

### Variáveis de ambiente

Verifique se estas variáveis estão configuradas no Vercel:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

**Como configurar:**
1. Vercel Dashboard → Seu Projeto → Settings → Environment Variables
2. Adicione as variáveis
3. Faça novo deploy

---

## 📝 Resumo dos Comandos

```powershell
# 1. Executar SQL no Supabase (manualmente)
# sql/fix_import_flow.sql

# 2. Adicionar arquivos
git add .

# 3. Commit
git commit -m "feat: Correções para fluxo de importação diária e otimizações"

# 4. Push
git push origin main

# 5. Verificar deploy no Vercel (automaticamente)
```

---

## ✅ Status Final

Após seguir estes passos:
- ✅ Código atualizado no GitHub
- ✅ Deploy automático no Vercel
- ✅ Script SQL executado no Supabase
- ✅ Aplicação funcionando em produção

---

**Última Atualização:** 2025-11-13

