# 📧 Análise de Viabilidade: Notificações por E-mail

## ✅ **RESPOSTA CURTA: SIM, É TOTALMENTE POSSÍVEL!**

A implementação de notificações por e-mail sobre mudanças no Health Score é **viável e relativamente simples** de implementar, especialmente porque você já tem toda a infraestrutura necessária.

---

## 🏗️ **ARQUITETURA NECESSÁRIA**

### **1. Componentes Existentes (Já Temos!)**

✅ **Tabela `health_score_history`** - Já armazena histórico diário de todos os clientes  
✅ **Tabela `user_profiles`** - Já tem emails dos usuários  
✅ **Sistema de hierarquia** - Já identifica quais clientes pertencem a cada usuário  
✅ **Cálculo de Health Score** - Já funciona e é registrado diariamente  

### **2. Componentes que Precisam ser Criados**

#### **A. Tabela de Notificações (Novo)**
```sql
CREATE TABLE email_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES user_profiles(id),
  notification_date DATE NOT NULL,
  email_sent BOOLEAN DEFAULT FALSE,
  email_sent_at TIMESTAMP,
  email_subject TEXT,
  email_body TEXT,
  -- Dados do resumo
  current_health_score INTEGER,
  previous_health_score INTEGER,
  score_change INTEGER,
  -- Mudanças de categoria
  clients_improved JSONB, -- [{name: "Fulano", from: "Estável", to: "Ótimo"}]
  clients_declined JSONB, -- [{name: "João", from: "Atenção", to: "Crítico"}]
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### **B. Função SQL para Detectar Mudanças (Novo)**
```sql
-- Função que compara histórico de hoje vs ontem
CREATE OR REPLACE FUNCTION detect_health_score_changes(
  p_user_id UUID,
  p_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  current_score INTEGER,
  previous_score INTEGER,
  score_change INTEGER,
  clients_improved JSONB,
  clients_declined JSONB
) AS $$
-- Lógica para comparar histórico de hoje vs ontem
-- Identificar mudanças de categoria
-- Calcular score médio atual vs anterior
$$;
```

#### **C. Serviço de E-mail (Novo)**
⚠️ **IMPORTANTE**: O Supabase **NÃO tem serviço de e-mail nativo**. Você precisa usar:
- **Supabase Edge Functions** (gratuito) + **Serviço de e-mail externo** (pago ou gratuito)

**Opções de Serviço de E-mail:**
- **Opção 1: Resend** (Recomendado - API moderna e simples)
  - Free: 3.000 emails/mês (gratuito)
  - Pro: $20/mês para 50.000 emails
  - O que é: Serviço moderno de e-mail transacional, focado em desenvolvedores
  - Como funciona: Você chama a API deles via Edge Function do Supabase
  
- **Opção 2: SendGrid** (Alternativa tradicional)
  - Free: 100 emails/dia (gratuito)
  - Essentials: $15/mês para 40.000 emails
  - O que é: Serviço tradicional de e-mail, muito confiável
  
- **Opção 3: AWS SES** (Mais barato)
  - Custo: $0.10 por 1.000 emails
  - Exemplo: 30 usuários × 30 dias = 900 emails/mês = **$0.09/mês**
  - O que é: Serviço de e-mail da Amazon, muito barato mas configuração mais complexa

**Como funciona na prática:**
1. Edge Function do Supabase (gratuito) recebe os dados
2. Edge Function chama a API do Resend/SendGrid/SES
3. Serviço externo envia o e-mail
4. Você paga apenas pelo serviço de e-mail escolhido

#### **D. Job Agendado (Novo)**
- **Opção 1: Supabase Cron Jobs** (pg_cron - Requer extensão)
- **Opção 2: GitHub Actions** (Gratuito - Executa diariamente)
- **Opção 3: Vercel Cron Jobs** (Gratuito - Se hospedar no Vercel)
- **Opção 4: Node-cron em servidor separado**

---

## 🔄 **FLUXO DE FUNCIONAMENTO**

### **Cenário: Importação Diária de Planilha**

1. **Importação da Planilha** (Você já faz isso)
   - Dados são inseridos/atualizados na tabela `clients`
   - Trigger automático registra histórico em `health_score_history`

2. **Job Agendado Executa** (Novo - Diariamente às 8h, por exemplo)
   ```sql
   -- Para cada usuário ativo:
   FOR user IN (SELECT * FROM user_profiles WHERE role IN ('manager', 'planner'))
   LOOP
     -- Detectar mudanças
     changes := detect_health_score_changes(user.id, CURRENT_DATE);
     
     -- Se houver mudanças significativas:
     IF changes.score_change != 0 OR changes.clients_improved IS NOT NULL THEN
       -- Criar registro de notificação
       INSERT INTO email_notifications (...);
       
       -- Enviar e-mail via Edge Function
       PERFORM send_email_notification(user.id, changes);
     END IF;
   END LOOP;
   ```

3. **Edge Function Envia E-mail** (Novo)
   - Recebe dados da notificação
   - Gera HTML do e-mail com template
   - Envia via Resend/SendGrid/SES
   - Atualiza `email_sent = TRUE`

---

## 📊 **DETECÇÃO DE MUDANÇAS**

### **Como Identificar Mudanças de Categoria?**

```sql
-- Exemplo de query para detectar mudanças
WITH today_scores AS (
  SELECT 
    client_id,
    client_name,
    planner,
    health_score,
    health_category
  FROM health_score_history
  WHERE recorded_date = CURRENT_DATE
),
yesterday_scores AS (
  SELECT 
    client_id,
    client_name,
    health_category
  FROM health_score_history
  WHERE recorded_date = CURRENT_DATE - INTERVAL '1 day'
)
SELECT 
  t.client_name,
  y.health_category AS previous_category,
  t.health_category AS current_category
FROM today_scores t
JOIN yesterday_scores y ON t.client_id = y.client_id
WHERE t.health_category != y.health_category
  AND t.planner = 'Nome do Planejador'; -- Filtrar por usuário
```

### **Como Calcular Score Médio do Usuário?**

```sql
-- Para um manager/planner específico
SELECT 
  AVG(health_score) as avg_score,
  COUNT(*) FILTER (WHERE health_category = 'Ótimo') as otimos,
  COUNT(*) FILTER (WHERE health_category = 'Estável') as estaveis,
  COUNT(*) FILTER (WHERE health_category = 'Atenção') as atencao,
  COUNT(*) FILTER (WHERE health_category = 'Crítico') as criticos
FROM health_score_history h
JOIN clients c ON h.client_id = c.id
WHERE h.recorded_date = CURRENT_DATE
  AND (
    c.planner = (SELECT hierarchy_name FROM user_profiles WHERE id = p_user_id AND role = 'planner')
    OR c.manager = (SELECT hierarchy_name FROM user_profiles WHERE id = p_user_id AND role = 'manager')
    -- ... outros roles
  );
```

---

## 💰 **CUSTOS ESTIMADOS - EXPLICAÇÃO DETALHADA**

### **❓ Posso usar o Supabase para enviar e-mails?**

**NÃO diretamente.** O Supabase não tem serviço de e-mail nativo. Você precisa:

1. **Supabase Edge Functions** (GRATUITO)
   - Função serverless que roda no Supabase
   - Até 500.000 invocações/mês grátis
   - Você escreve código TypeScript/JavaScript
   - Esta função vai **chamar** um serviço de e-mail externo

2. **Serviço de E-mail Externo** (PAGO ou GRATUITO)
   - Você escolhe um dos serviços abaixo
   - A Edge Function chama a API deles
   - Eles enviam o e-mail de verdade

### **Opção 1: Resend (Recomendado para começar)**

**O que é Resend?**
- Serviço moderno de e-mail transacional
- Criado especificamente para desenvolvedores
- API muito simples de usar
- Templates HTML bonitos prontos

**Custos:**
- **Free**: 3.000 emails/mês (gratuito)
  - Exemplo: 30 usuários × 30 dias = 900 emails/mês ✅ Cabe no free!
- **Pro**: $20/mês para 50.000 emails
  - Se crescer muito, pode precisar deste plano

**Como funciona:**
```typescript
// Dentro da Edge Function do Supabase
const response = await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${RESEND_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    from: 'noreply@seudominio.com',
    to: user.email,
    subject: 'Seu Health Score hoje: 61',
    html: '<h1>Olá!</h1>...'
  })
});
```

**Vantagens:**
- ✅ API muito simples
- ✅ Templates HTML bonitos
- ✅ Analytics de abertura
- ✅ Excelente deliverability (e-mails não vão para spam)
- ✅ Documentação excelente

### **Opção 2: SendGrid (Alternativa tradicional)**

**O que é SendGrid?**
- Serviço tradicional de e-mail, muito usado
- Confiável e estável
- Mais antigo que Resend, mas muito testado

**Custos:**
- **Free**: 100 emails/dia (3.000/mês - gratuito)
- **Essentials**: $15/mês para 40.000 emails

**Vantagens:**
- ✅ Muito confiável
- ✅ Boa documentação
- ✅ Suporte bom

### **Opção 3: AWS SES (Mais barato para volume alto)**

**O que é AWS SES?**
- Serviço de e-mail da Amazon
- Muito barato para grandes volumes
- Parte do ecossistema AWS

**Custos:**
- **$0.10 por 1.000 emails**
- Exemplo: 30 usuários × 30 dias = 900 emails/mês = **$0.09/mês** 🎉

**Vantagens:**
- ✅ Muito barato
- ✅ Escalável
- ✅ Integra bem com outros serviços AWS

**Desvantagens:**
- ❌ Configuração mais complexa
- ❌ Requer verificação de domínio
- ❌ Pode ter "sandbox mode" inicial (só envia para emails verificados)

### **Resumo de Custos**

| Serviço | Plano Free | Plano Pago | Melhor Para |
|---------|-----------|------------|-------------|
| **Resend** | 3.000/mês | $20/mês (50k) | Começar (recomendado) |
| **SendGrid** | 3.000/mês | $15/mês (40k) | Alternativa confiável |
| **AWS SES** | N/A | $0.10/1k | Volume alto |

**Recomendação:** Comece com **Resend Free** (3.000 emails/mês grátis). Se crescer, migre para o plano pago ou AWS SES.

---

## ⚙️ **CONFIGURAÇÃO DO RESEND**

### **O que eu faço vs o que você precisa fazer:**

#### **✅ O que EU faço (código):**
- Criar a Edge Function do Supabase
- Escrever o código que chama a API do Resend
- Criar os templates HTML dos e-mails
- Integrar com o banco de dados
- Criar as funções SQL de detecção de mudanças

#### **🔧 O que VOCÊ precisa fazer (configuração):**
1. **Criar conta no Resend** (5 minutos)
   - Acesse: https://resend.com
   - Crie uma conta gratuita
   - Vá em "API Keys" e crie uma chave de API

2. **Configurar domínio** (15-30 minutos)
   - No Resend, vá em "Domains"
   - Adicione seu domínio (ex: `seudominio.com`)
   - O Resend vai te dar registros DNS para adicionar
   - Você adiciona esses registros no seu provedor de domínio (GoDaddy, Registro.br, etc.)
   - Aguarda verificação (pode levar algumas horas)

3. **Adicionar variável de ambiente no Supabase**
   - No Supabase Dashboard, vá em "Edge Functions" > "Secrets"
   - Adicione: `RESEND_API_KEY` = sua chave do Resend

**Nota:** Se você não tiver domínio próprio, pode usar o domínio de teste do Resend inicialmente, mas os e-mails podem ir para spam. Para produção, é recomendado ter domínio próprio.

**Posso te guiar passo a passo quando for configurar!** 🚀

---

## 🛠️ **IMPLEMENTAÇÃO PASSO A PASSO**

### **Fase 1: Preparação (1-2 dias)**
1. Criar tabela `email_notifications`
2. Criar função SQL `detect_health_score_changes`
3. Criar função SQL para calcular score médio por usuário

### **Fase 2: Serviço de E-mail (2-3 dias)**
1. Escolher provedor (Recomendo Resend)
2. Criar conta e configurar domínio
3. Criar Supabase Edge Function para envio
4. Criar template HTML do e-mail

### **Fase 3: Job Agendado (1-2 dias)**
1. Configurar cron job (GitHub Actions ou Vercel Cron)
2. Criar função que executa diariamente
3. Integrar detecção de mudanças + envio de e-mail

### **Fase 4: Testes e Ajustes (1-2 dias)**
1. Testar com usuários reais
2. Ajustar templates
3. Configurar filtros (ex: só enviar se mudança > X pontos)

---

## 📧 **EXEMPLOS DE E-MAIL COM DETALHAMENTO HIERÁRQUICO**

### **Exemplo 1: E-mail para Planner (Simples)**

```
Assunto: Seu Health Score hoje: 61 (+3 pontos)

Olá João Silva,

Aqui está o resumo das mudanças na sua carteira de clientes hoje:

📊 Health Score Atual: 61 pontos (+3 em relação a ontem)

📈 MELHORIAS:
• 2 clientes foram de Estável para Ótimo:
  - Fulano da Silva
  - Siclana Santos

⚠️ ATENÇÃO:
• 1 cliente foi de Atenção para Crítico:
  - Maria Santos

📋 RESUMO DA SUA CARTEIRA:
• Ótimos: 15 clientes (+2)
• Estáveis: 30 clientes (-1)
• Atenção: 10 clientes (-1)
• Críticos: 5 clientes (+1)

Acesse o dashboard: [Link]
```

---

### **Exemplo 2: E-mail para Líder (Com Detalhamento por Planejador)**

```
Assunto: Health Score do seu Time hoje: 65 (+2 pontos)

Olá Carlos (Líder),

Aqui está o resumo das mudanças no seu time hoje:

📊 Health Score do Time: 65 pontos (+2 em relação a ontem)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📈 MELHORIAS NO TIME:

• Planejador João Silva:
  - 2 clientes melhoraram:
    ✓ Fulano da Silva: Estável → Ótimo
    ✓ Siclana Santos: Atenção → Estável
  - Score: 68 (+3 pontos)

• Planejador Maria Santos:
  - 1 cliente melhorou:
    ✓ Pedro Oliveira: Estável → Ótimo
  - Score: 65 (+1 ponto)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ ATENÇÃO NO TIME:

• Planejador João Silva:
  - 1 cliente piorou:
    ⚠ Ana Costa: Estável → Atenção
  - Score: 68 (+3 pontos)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 RESUMO DO TIME:
• Ótimos: 45 clientes (+3)
• Estáveis: 60 clientes (-2)
• Atenção: 20 clientes (-1)
• Críticos: 10 clientes (+0)

Acesse o dashboard: [Link]
```

---

### **Exemplo 3: E-mail para Mediador (Com Detalhamento por Líder → Planejador)**

```
Assunto: Health Score da sua Região hoje: 63 (+1 ponto)

Olá Paulo (Mediador),

Aqui está o resumo das mudanças na sua região hoje:

📊 Health Score da Região: 63 pontos (+1 em relação a ontem)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📈 MELHORIAS NA REGIÃO:

• Líder Carlos:
  - Score: 65 (+2 pontos)
  
  Planejador João Silva:
    ✓ 2 clientes melhoraram (Fulano, Siclana)
  
  Planejador Maria Santos:
    ✓ 1 cliente melhorou (Pedro)

• Líder Ana:
  - Score: 61 (sem mudança)
  
  Planejador Pedro:
    ✓ 1 cliente melhorou (Lucas)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ ATENÇÃO NA REGIÃO:

• Líder Carlos:
  - Score: 65 (+2 pontos)
  
  Planejador João Silva:
    ⚠ 1 cliente piorou (Ana)

• Líder Paulo:
  - Score: 60 (-2 pontos)
  
  Planejador Lucas:
    ⚠ 2 clientes pioraram (Roberto, Juliana)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 RESUMO DA REGIÃO:
• Ótimos: 120 clientes (+4)
• Estáveis: 180 clientes (-3)
• Atenção: 60 clientes (-1)
• Críticos: 40 clientes (+2)

Acesse o dashboard: [Link]
```

---

### **Exemplo 4: E-mail para Gerente (Detalhamento Completo)**

```
Assunto: Health Score Geral hoje: 64 (+1 ponto)

Olá Administrador,

Aqui está o resumo das mudanças gerais hoje:

📊 Health Score Geral: 64 pontos (+1 em relação a ontem)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📈 MELHORIAS GERAIS:

• Mediador Região Sul:
  - Score: 65 (+2 pontos)
  
  Líder Carlos:
    - Score: 65 (+2)
    - Planejador João: 2 melhorias
    - Planejador Maria: 1 melhoria
  
  Líder Ana:
    - Score: 61 (sem mudança)
    - Planejador Pedro: 1 melhoria

• Mediador Região Norte:
  - Score: 62 (-1 ponto)
  
  Líder Paulo:
    - Score: 60 (-2)
    - Planejador Lucas: 1 melhoria, 2 pioras

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ ATENÇÃO GERAL:

• Mediador Região Sul:
  - Líder Carlos:
    - Planejador João: 1 piora

• Mediador Região Norte:
  - Líder Paulo:
    - Planejador Lucas: 2 pioras

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 RESUMO GERAL:
• Ótimos: 300 clientes (+8)
• Estáveis: 450 clientes (-5)
• Atenção: 150 clientes (-3)
• Críticos: 100 clientes (+2)

Acesse o dashboard: [Link]
```

---

## ⚙️ **CONFIGURAÇÕES AVANÇADAS**

### **Filtros Opcionais**
- ✅ Só enviar se mudança > 5 pontos
- ✅ Só enviar se houver mudança de categoria
- ✅ Permitir usuário desabilitar notificações
- ✅ Frequência configurável (diário, semanal, etc.)

### **Personalização por Role com Detalhamento Hierárquico**

**IMPORTANTE**: Usuários com estrutura comercial abaixo deles (Manager, Mediator, Leader) precisam ver o detalhamento separado por pessoa, não apenas o total agregado.

#### **Estrutura Hierárquica:**
```
Manager (vê tudo)
  └── Mediator 1
      └── Leader 1
          └── Planner 1 (clientes)
          └── Planner 2 (clientes)
      └── Leader 2
          └── Planner 3 (clientes)
  └── Mediator 2
      └── Leader 3
          └── Planner 4 (clientes)
```

#### **Como Funciona no E-mail:**

**Para Planner:**
- Vê apenas seus próprios clientes
- E-mail simples: "Seus clientes mudaram..."

**Para Líder:**
- Vê mudanças agregadas do time
- **MAS TAMBÉM** vê detalhamento por cada Planejador abaixo dele:
  ```
  📊 Health Score do Time: 65 (+2 pontos)
  
  📈 MELHORIAS NO TIME:
  • Planejador João Silva: 2 clientes melhoraram
    - Fulano: Estável → Ótimo
    - Siclana: Atenção → Estável
  • Planejador Maria Santos: 1 cliente melhorou
    - Pedro: Estável → Ótimo
  
  ⚠️ ATENÇÃO NO TIME:
  • Planejador João Silva: 1 cliente piorou
    - Ana: Estável → Atenção
  ```

**Para Mediador:**
- Vê mudanças agregadas de todos os Líderes abaixo dele
- **E TAMBÉM** detalhamento por Líder:
  ```
  📊 Health Score da Região: 63 (+1 ponto)
  
  Por Líder:
  • Líder Carlos: Score 65 (+2)
    - Planejador João: 2 melhorias, 1 piora
    - Planejador Maria: 1 melhoria
  • Líder Ana: Score 61 (-1)
    - Planejador Pedro: 1 piora
  ```

**Para Gerente:**
- Vê tudo agregado
- **E TAMBÉM** detalhamento completo por Mediador → Líder → Planejador:
  ```
  📊 Health Score Geral: 64 (+1 ponto)
  
  Por Mediador:
  • Mediador Região Sul: Score 65 (+2)
    - Líder Carlos: 3 melhorias
      - Planejador João: 2 melhorias
      - Planejador Maria: 1 melhoria
    - Líder Ana: 1 piora
      - Planejador Pedro: 1 piora
  • Mediador Região Norte: Score 62 (-1)
    - Líder Paulo: 2 pioras
      - Planejador Lucas: 2 pioras
  ```

#### **Implementação no SQL:**

```sql
-- Função que retorna mudanças hierárquicas
CREATE OR REPLACE FUNCTION get_hierarchical_changes(
  p_user_id UUID,
  p_date DATE
)
RETURNS JSONB AS $$
DECLARE
  v_user_role TEXT;
  v_hierarchy_name TEXT;
  v_result JSONB;
BEGIN
  -- Buscar role e nome do usuário
  SELECT role, hierarchy_name INTO v_user_role, v_hierarchy_name
  FROM user_profiles WHERE id = p_user_id;
  
  CASE v_user_role
    WHEN 'planner' THEN
      -- Apenas seus clientes
      SELECT jsonb_build_object(
        'summary', ...,
        'details', ...
      ) INTO v_result;
    
    WHEN 'leader' THEN
      -- Agregado + detalhamento por planejador
      SELECT jsonb_build_object(
        'summary', ...,
        'by_planner', (
          SELECT jsonb_agg(jsonb_build_object(
            'planner_name', planner,
            'changes', ...
          ))
          FROM ...
          GROUP BY planner
        )
      ) INTO v_result;
    
    WHEN 'mediator' THEN
      -- Agregado + detalhamento por líder → planejador
      SELECT jsonb_build_object(
        'summary', ...,
        'by_leader', (
          SELECT jsonb_agg(jsonb_build_object(
            'leader_name', leader,
            'summary', ...,
            'by_planner', ...
          ))
          FROM ...
          GROUP BY leader
        )
      ) INTO v_result;
    
    WHEN 'manager' THEN
      -- Agregado + detalhamento completo
      SELECT jsonb_build_object(
        'summary', ...,
        'by_mediator', (
          SELECT jsonb_agg(jsonb_build_object(
            'mediator_name', mediator,
            'summary', ...,
            'by_leader', ...
          ))
          FROM ...
          GROUP BY mediator
        )
      ) INTO v_result;
  END CASE;
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;
```

---

## 🚨 **PONTOS DE ATENÇÃO**

1. **Privacidade**: Garantir que cada usuário só veja seus próprios dados
2. **Performance**: Job pode demorar se houver muitos usuários (otimizar com índices)
3. **Spam**: Não enviar e-mails desnecessários (filtrar mudanças mínimas)
4. **Backup**: Manter histórico de e-mails enviados
5. **Testes**: Sempre testar em ambiente de desenvolvimento primeiro

---

## ✅ **RECOMENDAÇÃO FINAL**

**É totalmente viável e recomendado!** A implementação é relativamente simples porque:

1. ✅ Você já tem toda a infraestrutura de dados
2. ✅ O histórico já é registrado automaticamente
3. ✅ Os emails dos usuários já estão no banco
4. ✅ A hierarquia já identifica quem vê o quê

**Estimativa de Tempo**: 5-7 dias de desenvolvimento  
**Custo Mensal**: $0-20 (dependendo do volume)  
**Complexidade**: Média (não é trivial, mas é factível)

---

## 🎯 **PRÓXIMOS PASSOS (Se decidir implementar)**

1. Decidir qual serviço de e-mail usar (Recomendo Resend)
2. Criar tabela de notificações
3. Criar função SQL de detecção de mudanças
4. Criar Edge Function para envio
5. Configurar job agendado
6. Testar com 1-2 usuários
7. Expandir para todos

---

**Quer que eu comece a implementar? Posso criar os scripts SQL e a estrutura básica!** 🚀

