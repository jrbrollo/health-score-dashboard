# 🚀 Configuração de Variáveis de Ambiente para Deploy

## ⚠️ IMPORTANTE PARA DEPLOY

Após o push, você precisa configurar as variáveis de ambiente no serviço de deploy (Vercel, Netlify, etc.).

---

## 📋 Variáveis Necessárias

Configure estas variáveis no painel do seu serviço de deploy:

```
VITE_SUPABASE_URL=https://pdlyaqxrkoqbqniercpi.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkbHlhcXhya29xYnFuaWVyY3BpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1MTIwMTQsImV4cCI6MjA3MzA4ODAxNH0.iOhMYwCMlRnYvNfg6EJqE0imk4Gn7kvK2PwdqlXu70E
```

---

## 🔧 Como Configurar

### Vercel

1. Acesse o [Dashboard do Vercel](https://vercel.com/dashboard)
2. Selecione seu projeto
3. Vá em **Settings** → **Environment Variables**
4. Adicione cada variável:
   - **Key:** `VITE_SUPABASE_URL`
   - **Value:** `https://pdlyaqxrkoqbqniercpi.supabase.co`
   - **Environment:** Production, Preview, Development (marque todos)
5. Repita para `VITE_SUPABASE_ANON_KEY`
6. **Redeploy** o projeto (ou aguarde o deploy automático)

### Netlify

1. Acesse o [Dashboard do Netlify](https://app.netlify.com)
2. Selecione seu site
3. Vá em **Site settings** → **Environment variables**
4. Clique em **Add a variable**
5. Adicione cada variável:
   - **Key:** `VITE_SUPABASE_URL`
   - **Value:** `https://pdlyaqxrkoqbqniercpi.supabase.co`
6. Repita para `VITE_SUPABASE_ANON_KEY`
7. **Trigger deploy** (ou aguarde o deploy automático)

### Outros Serviços

Configure as variáveis de ambiente conforme a documentação do seu serviço de deploy.

---

## ✅ Verificação

Após configurar as variáveis e fazer o deploy:

1. Acesse a aplicação online
2. Verifique se funciona normalmente
3. Verifique o console do navegador (não deve haver erros sobre variáveis não configuradas)

---

## 🐛 Troubleshooting

### Problema: Aplicação não conecta ao Supabase

**Solução:**
- Verifique se as variáveis foram configuradas corretamente
- Verifique se os nomes das variáveis estão corretos (devem começar com `VITE_`)
- Faça um redeploy após configurar as variáveis

### Problema: Erro "VITE_SUPABASE_URL não configurada"

**Solução:**
- As variáveis de ambiente não foram configuradas no serviço de deploy
- Configure conforme instruções acima
- Faça um redeploy

---

**Última atualização:** 2025-01-XX

