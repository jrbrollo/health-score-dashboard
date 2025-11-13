# 🔧 Guia: Adicionar Variáveis de Ambiente no Vercel

## 📍 Passo a Passo

### 1. Acesse o Dashboard do Vercel
- Vá para [https://vercel.com/dashboard](https://vercel.com/dashboard)
- Faça login se necessário

### 2. Selecione seu Projeto
- Clique no projeto **health-score-dashboard** (ou o nome do seu projeto)

### 3. Acesse as Configurações
- No menu superior, clique em **Settings** (Configurações)

### 4. Vá para Environment Variables
- No menu lateral esquerdo, role até encontrar **"Environment Variables"**
- Clique em **"Environment Variables"**

### 5. Adicione as Variáveis

Você precisa adicionar **2 variáveis**:

#### Variável 1: VITE_SUPABASE_URL
1. Clique no botão **"Add New"** ou **"Add"**
2. No campo **"Key"**, digite: `VITE_SUPABASE_URL`
3. No campo **"Value"**, cole: `https://pdlyaqxrkoqbqniercpi.supabase.co`
4. Marque as opções:
   - ✅ **Production**
   - ✅ **Preview**
   - ✅ **Development**
5. Clique em **"Save"**

#### Variável 2: VITE_SUPABASE_ANON_KEY
1. Clique novamente em **"Add New"** ou **"Add"**
2. No campo **"Key"**, digite: `VITE_SUPABASE_ANON_KEY`
3. No campo **"Value"**, cole: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkbHlhcXhya29xYnFuaWVyY3BpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1MTIwMTQsImV4cCI6MjA3MzA4ODAxNH0.iOhMYwCMlRnYvNfg6EJqE0imk4Gn7kvK2PwdqlXu70E`
4. Marque as opções:
   - ✅ **Production**
   - ✅ **Preview**
   - ✅ **Development**
5. Clique em **"Save"**

### 6. Redeploy (Importante!)
Após adicionar as variáveis, você precisa fazer um redeploy:

**Opção 1: Redeploy Manual**
1. Vá para a aba **"Deployments"** (no topo)
2. Encontre o último deployment
3. Clique nos **3 pontinhos** (⋯) ao lado
4. Selecione **"Redeploy"**
5. Confirme o redeploy

**Opção 2: Trigger Automático**
- Se você fez push recentemente, o Vercel pode fazer deploy automático
- Mas é recomendado fazer redeploy manual para garantir que as variáveis sejam carregadas

---

## ✅ Verificação

Após o redeploy:

1. Acesse sua aplicação online
2. Abra o console do navegador (F12)
3. Verifique se **NÃO** há erros sobre variáveis não configuradas
4. Teste se a aplicação conecta ao Supabase normalmente

---

## 🎯 Resumo Visual

```
Vercel Dashboard
  └── Seu Projeto
      └── Settings (menu superior)
          └── Environment Variables (menu lateral)
              └── Add New
                  ├── Key: VITE_SUPABASE_URL
                  ├── Value: https://pdlyaqxrkoqbqniercpi.supabase.co
                  └── Marcar: Production, Preview, Development
              └── Add New
                  ├── Key: VITE_SUPABASE_ANON_KEY
                  ├── Value: eyJhbGc...
                  └── Marcar: Production, Preview, Development
          └── Deployments
              └── Redeploy (último deployment)
```

---

## ⚠️ Dicas Importantes

1. **Nomes das variáveis:** Devem começar com `VITE_` (obrigatório para Vite)
2. **Valores:** Cole exatamente como estão (sem espaços extras)
3. **Ambientes:** Marque todos (Production, Preview, Development) para funcionar em todos
4. **Redeploy:** Sempre faça redeploy após adicionar/modificar variáveis

---

**Pronto!** Após seguir esses passos, sua aplicação online funcionará normalmente. 🚀

