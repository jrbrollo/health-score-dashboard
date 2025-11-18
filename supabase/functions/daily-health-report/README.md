# Edge Function: Daily Health Report

Envia relatórios diários de Health Score por email para liderança (managers, mediators, leaders).

## Deploy

### Opção 1: Via Supabase CLI (Recomendado)

```bash
# Instalar Supabase CLI se necessário
npm install -g supabase

# Login
supabase login

# Link ao projeto
supabase link --project-ref <seu-project-ref>

# Deploy da função
supabase functions deploy daily-health-report
```

### Opção 2: Via Supabase Dashboard

1. Acesse: https://supabase.com/dashboard/project/YOUR_PROJECT/functions
2. Clique em "Create a new function"
3. Nome: `daily-health-report`
4. Cole o conteúdo de `index.ts`
5. Deploy

## Secrets necessários

Certifique-se que os seguintes secrets estão configurados:

```bash
supabase secrets set RESEND_API_KEY=re_xxxxxxxxxx
```

Os outros secrets (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) já estão disponíveis automaticamente.

## Teste manual

Após o deploy, teste enviando um POST request:

```bash
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/daily-health-report \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

Ou acesse o dashboard e clique em "Invoke function"

## Automação

Para enviar emails diariamente às 18:00, configure um Vercel Cron Job que chama esta função.
