# 📧 Guia Completo: Configuração DNS do Resend

## 🎯 Objetivo
Configurar os registros DNS no seu provedor de domínio para que o Resend possa enviar e-mails usando `braunaplanejamento.com.br`.

---

## 📋 Passo 1: Identificar Seu Provedor de Domínio

Primeiro, você precisa descobrir onde o domínio `braunaplanejamento.com.br` está registrado:

### Como descobrir:
1. Acesse: https://registro.br/consulta/
2. Digite: `braunaplanejamento.com.br`
3. Veja o campo **"Titular"** ou **"Registrador"** - esse é quem gerencia seu domínio

**Provedores comuns no Brasil:**
- **Registro.br** (mais comum para .com.br)
- **GoDaddy**
- **Hostinger**
- **Locaweb**
- **UOL Host**

---

## 📋 Passo 2: Acessar o Painel de DNS

### Se for **Registro.br**:
1. Acesse: https://registro.br/
2. Faça login
3. Vá em **"Meus Domínios"**
4. Clique em `braunaplanejamento.com.br`
5. Procure por **"DNS"** ou **"Zona DNS"** ou **"Gerenciar DNS"**

### Se for outro provedor:
- Procure por: **"DNS"**, **"Zona DNS"**, **"Gerenciar DNS"**, **"DNS Records"**, **"Configurações DNS"**

---

## 📋 Passo 3: Coletar Informações do Resend

No painel do Resend, você verá **3 seções** com registros DNS. Vamos pegar cada um:

### ✅ Seção 1: Domain Verification (OBRIGATÓRIO)

**O que fazer:**
1. Na seção **"Domain Verification"**, você verá uma tabela
2. Copie os seguintes valores:

| Campo | Valor a Copiar |
|-------|----------------|
| **Type** | `TXT` |
| **Name** | `resend._domainkey` |
| **Content** | `p=MIGfMAOGCSqGSIb3DQEB...` (texto longo completo) |
| **TTL** | `Auto` ou `3600` |

**⚠️ IMPORTANTE:** Copie o **Content completo**, mesmo que seja muito longo!

---

### ✅ Seção 2: Enable Sending (OBRIGATÓRIO para enviar e-mails)

**O que fazer:**
1. Certifique-se que o toggle **"Enable Sending"** está **LIGADO** (verde)
2. Você verá **3 registros** na tabela. Copie cada um:

#### Registro 1: MX Record
| Campo | Valor a Copiar |
|-------|----------------|
| **Type** | `MX` |
| **Name** | `send` |
| **Content** | `feedback-smtp.sa-east-1.amazonses.com` (ou similar) |
| **TTL** | `Auto` ou `3600` |
| **Priority** | `10` |

#### Registro 2: SPF Record
| Campo | Valor a Copiar |
|-------|----------------|
| **Type** | `TXT` |
| **Name** | `send` |
| **Content** | `v=spf1 include:amazonses.com ~all` (ou similar) |
| **TTL** | `Auto` ou `3600` |
| **Priority** | (vazio) |

#### Registro 3: DMARC Record (OPCIONAL, mas recomendado)
| Campo | Valor a Copiar |
|-------|----------------|
| **Type** | `TXT` |
| **Name** | `_dmarc` |
| **Content** | `v=DMARC1; p=none;` |
| **TTL** | `Auto` ou `3600` |
| **Priority** | (vazio) |

---

### ⚠️ Seção 3: Enable Receiving (OPCIONAL)

**Você pode pular esta seção por enquanto**, a menos que queira receber e-mails também.

Se quiser configurar depois:
- O toggle **"Enable Receiving"** deve estar **DESLIGADO** por enquanto
- Quando quiser ativar, siga o mesmo processo com o registro MX mostrado

---

## 📋 Passo 4: Adicionar Registros no Provedor de Domínio

Agora vamos adicionar cada registro no painel do seu provedor:

### 4.1. Adicionar Domain Verification (TXT)

1. No painel DNS do seu provedor, procure por **"Adicionar Registro"** ou **"Novo Registro"**
2. Preencha os campos:

```
Tipo: TXT
Nome/Host: resend._domainkey
Valor/Conteúdo: [cole o Content completo do Resend]
TTL: 3600 (ou Auto)
```

3. Salve

**💡 Dica:** Alguns provedores pedem apenas o nome sem o domínio. Se pedir `resend._domainkey`, coloque exatamente assim. Se pedir o domínio completo, coloque `resend._domainkey.braunaplanejamento.com.br`.

---

### 4.2. Adicionar MX Record (Enable Sending)

1. Adicione um novo registro:

```
Tipo: MX
Nome/Host: send
Valor/Conteúdo: feedback-smtp.sa-east-1.amazonses.com
Prioridade: 10
TTL: 3600 (ou Auto)
```

2. Salve

**💡 Dica:** Alguns provedores pedem o valor sem o domínio. Se pedir apenas o hostname, coloque `feedback-smtp.sa-east-1.amazonses.com` (sem o domínio).

---

### 4.3. Adicionar SPF Record (Enable Sending)

1. Adicione um novo registro:

```
Tipo: TXT
Nome/Host: send
Valor/Conteúdo: v=spf1 include:amazonses.com ~all
TTL: 3600 (ou Auto)
```

2. Salve

**⚠️ ATENÇÃO:** Se você já tiver um registro SPF existente para `send`, você precisa **combinar** os valores. Mas como é um novo subdomínio, provavelmente não terá conflito.

---

### 4.4. Adicionar DMARC Record (Opcional)

1. Adicione um novo registro:

```
Tipo: TXT
Nome/Host: _dmarc
Valor/Conteúdo: v=DMARC1; p=none;
TTL: 3600 (ou Auto)
```

2. Salve

---

## 📋 Passo 5: Verificar no Resend

Após adicionar todos os registros:

1. **Aguarde 5-15 minutos** (propagação DNS pode levar até 48h, mas geralmente é rápido)
2. Volte no Resend
3. Clique no botão **"I've added the records"** (ou similar)
4. O Resend vai verificar automaticamente

**Status esperado:**
- ✅ **Domain Verification:** Verde (verificado)
- ✅ **Enable Sending:** Verde (verificado)
- ⚠️ **Enable Receiving:** Cinza (desabilitado, está ok)

---

## 🔍 Exemplo Visual: Como Fica no Registro.br

Se você usa **Registro.br**, os registros ficam assim:

```
Tipo: TXT
Nome: resend._domainkey
Valor: p=MIGfMAOGCSqGSIb3DQEB... (texto longo)
TTL: 3600

Tipo: MX
Nome: send
Valor: feedback-smtp.sa-east-1.amazonses.com
Prioridade: 10
TTL: 3600

Tipo: TXT
Nome: send
Valor: v=spf1 include:amazonses.com ~all
TTL: 3600

Tipo: TXT
Nome: _dmarc
Valor: v=DMARC1; p=none;
TTL: 3600
```

---

## ❓ Problemas Comuns

### "Registro já existe"
- Se já existir um registro com o mesmo nome, você precisa **editar** o existente ou **deletar e criar novo**
- Não pode ter dois registros com o mesmo nome e tipo

### "Nome inválido"
- Alguns provedores pedem apenas o subdomínio: `send`
- Outros pedem o domínio completo: `send.braunaplanejamento.com.br`
- Teste ambos se der erro

### "Propagação lenta"
- DNS pode levar até 48h para propagar
- Geralmente leva 15 minutos a 2 horas
- Use ferramentas como https://dnschecker.org/ para verificar

### "Verificação falhou no Resend"
- Verifique se copiou o **Content completo** (pode ser muito longo)
- Verifique se não há espaços extras no início/fim
- Aguarde mais tempo para propagação

---

## ✅ Checklist Final

Antes de clicar em "I've added the records" no Resend, confirme:

- [ ] Adicionei o registro TXT `resend._domainkey` (Domain Verification)
- [ ] Adicionei o registro MX `send` com prioridade 10
- [ ] Adicionei o registro TXT `send` (SPF)
- [ ] Adicionei o registro TXT `_dmarc` (opcional, mas recomendado)
- [ ] Aguardei pelo menos 5-15 minutos após adicionar
- [ ] Verifiquei que os valores estão corretos (sem espaços extras)

---

## 🆘 Precisa de Ajuda?

Se tiver dúvidas sobre:
- **Qual provedor você usa:** Me diga e eu ajudo com os passos específicos
- **Erro ao adicionar registro:** Me mostre a mensagem de erro
- **Verificação não passa:** Vamos verificar juntos os registros

---

**Última atualização:** 14/11/2025

