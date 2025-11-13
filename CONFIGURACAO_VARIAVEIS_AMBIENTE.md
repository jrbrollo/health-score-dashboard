# 🔐 Configuração de Variáveis de Ambiente

## 📋 Visão Geral

As credenciais do Supabase agora são configuradas através de variáveis de ambiente, seguindo as melhores práticas de segurança.

---

## 🚀 Configuração Inicial

### Passo 1: Criar arquivo `.env`

Na raiz do projeto (`health-score-dashboard/`), crie um arquivo chamado `.env`:

```bash
# Windows (PowerShell)
New-Item -Path .env -ItemType File

# Linux/Mac
touch .env
```

### Passo 2: Copiar template

Copie o conteúdo do arquivo `.env.example` para o `.env`:

```bash
# Windows (PowerShell)
Copy-Item .env.example .env

# Linux/Mac
cp .env.example .env
```

### Passo 3: Preencher credenciais

Abra o arquivo `.env` e preencha com suas credenciais reais do Supabase:

```env
# Supabase Configuration
VITE_SUPABASE_URL=https://pdlyaqxrkoqbqniercpi.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anon-aqui
```

**Onde encontrar as credenciais:**
1. Acesse o [Dashboard do Supabase](https://app.supabase.com)
2. Selecione seu projeto
3. Vá em **Settings** → **API**
4. Copie:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon/public key** → `VITE_SUPABASE_ANON_KEY`

---

## ✅ Verificação

Após configurar, reinicie o servidor de desenvolvimento:

```bash
npm run dev
```

Se tudo estiver correto, a aplicação funcionará normalmente. Se as variáveis não estiverem configuradas, você verá avisos no console (apenas em desenvolvimento).

---

## 🔒 Segurança

### ✅ O que está protegido:

- ✅ Arquivo `.env` está no `.gitignore` (não vai para o Git)
- ✅ Credenciais não estão mais hardcoded no código
- ✅ Template `.env.example` serve como referência (sem valores reais)

### ⚠️ Importante:

- **NUNCA** commite o arquivo `.env` no Git
- **NUNCA** compartilhe suas credenciais
- **SEMPRE** use `.env.example` como template para outros desenvolvedores

---

## 🌍 Ambientes Diferentes

### Desenvolvimento Local

Arquivo: `.env.local` (opcional, tem prioridade sobre `.env`)

```env
VITE_SUPABASE_URL=https://seu-projeto-dev.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-dev
```

### Produção

Para produção (Vercel, Netlify, etc.), configure as variáveis de ambiente no painel do serviço:

**Vercel:**
1. Vá em **Settings** → **Environment Variables**
2. Adicione:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

**Netlify:**
1. Vá em **Site settings** → **Environment variables**
2. Adicione as mesmas variáveis

---

## 🔄 Compatibilidade

O código mantém **compatibilidade retroativa**: se as variáveis de ambiente não estiverem configuradas, usa os valores padrão (hardcoded). Isso garante que a aplicação continue funcionando mesmo sem configuração.

**Recomendação:** Configure as variáveis de ambiente mesmo assim para seguir as melhores práticas.

---

## 🐛 Troubleshooting

### Problema: "Variáveis não encontradas"

**Solução:**
1. Verifique se o arquivo `.env` existe na raiz do projeto
2. Verifique se as variáveis começam com `VITE_`
3. Reinicie o servidor de desenvolvimento (`npm run dev`)

### Problema: "Aplicação não conecta ao Supabase"

**Solução:**
1. Verifique se as credenciais estão corretas no `.env`
2. Verifique se não há espaços extras nas variáveis
3. Verifique o console do navegador para erros

### Problema: "Avisos no console em desenvolvimento"

**Solução:**
- Isso é normal se você não configurou o `.env`
- A aplicação continuará funcionando com valores padrão
- Para remover os avisos, configure o `.env` conforme instruções acima

---

## 📝 Notas Técnicas

- **Vite** requer que variáveis de ambiente comecem com `VITE_` para serem expostas ao frontend
- Variáveis são acessadas via `import.meta.env.VITE_*`
- O arquivo `.env` é carregado automaticamente pelo Vite
- Variáveis são substituídas em tempo de build

---

**Última atualização:** 2025-01-XX

