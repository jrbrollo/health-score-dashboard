# 📧 E-mail para Time de TI - Configuração DNS Resend

---

**Assunto:** Solicitação de Configuração DNS - Integração Resend para Envio de E-mails Transacionais

---

Prezados,

Gostaria de solicitar a configuração de 4 registros DNS no domínio `braunaplanejamento.com.br` para habilitar o envio de e-mails transacionais através do serviço Resend.

## 📋 Contexto

Estamos implementando um sistema de notificações por e-mail para a ferramenta Health Score, que enviará atualizações diárias sobre mudanças no Health Score dos clientes para os usuários da plataforma. Para isso, precisamos configurar o serviço Resend, que requer a adição de registros DNS específicos no nosso domínio para autenticação e garantia de entregabilidade dos e-mails.

## 🔧 Registros DNS Solicitados

Seguem os 4 registros que precisam ser adicionados na zona DNS do domínio `braunaplanejamento.com.br`:

### **Registro 1: Domain Verification (TXT)**
```
Tipo: TXT
Nome/Host: resend._domainkey
Valor/Conteúdo: p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDioqurZjgBCmHuSlIKkylng5E2r2kcbZXFNLsLLS9PG0Wo/mkd/AZnqh2v65cu4uJLGNOZ0ImxyYUf13lOtqSkIdeqyRjtXaUBwvS9uIcJ6qQr+eYprzM1ZpNpw34fxYlas6aDd+j8qY61M+2MsjjTNHkx+jWOXyKaDCypTkEFBQIDAQAB
TTL: 3600 (ou Auto)
```

**Finalidade:** Verificação de propriedade do domínio pelo Resend (chave DKIM pública).

---

### **Registro 2: MX Record (Envio de E-mails)**
```
Tipo: MX
Nome/Host: send
Valor/Conteúdo: feedback-smtp.sa-east-1.amazonses.com
Prioridade: 10
TTL: 3600 (ou Auto)
```

**Finalidade:** Configuração do servidor de envio de e-mails para o subdomínio `send@braunaplanejamento.com.br`.

---

### **Registro 3: SPF Record (TXT)**
```
Tipo: TXT
Nome/Host: send
Valor/Conteúdo: v=spf1 include:amazonses.com ~all
TTL: 3600 (ou Auto)
```

**Finalidade:** Autorização do servidor Amazon SES (usado pelo Resend) para enviar e-mails em nome do subdomínio `send`, prevenindo falsificação de e-mails (spoofing).

---

### **Registro 4: DMARC Record (TXT - Opcional, mas Recomendado)**
```
Tipo: TXT
Nome/Host: _dmarc
Valor/Conteúdo: v=DMARC1; p=none;
TTL: 3600 (ou Auto)
```

**Finalidade:** Política de autenticação de e-mail para melhorar a entregabilidade e prevenir phishing usando nosso domínio.

---

## ⚠️ Observações Importantes

1. **Subdomínio `send`:** Os registros 2 e 3 são para o subdomínio `send`, não para o domínio raiz. Isso significa que os e-mails serão enviados de `noreply@send.braunaplanejamento.com.br` ou similar.

2. **Não conflita com registros existentes:** Estes registros são específicos para o subdomínio `send` e não devem conflitar com configurações DNS existentes do domínio principal.

3. **Propagação DNS:** Após a configuração, pode levar de 15 minutos a 48 horas para propagação completa. Geralmente ocorre em 1-2 horas.

4. **Segurança:** Estes registros são padrão da indústria e melhoram a segurança do domínio, prevenindo falsificação de e-mails e phishing.

## ✅ Validação

Após a configuração, o Resend verificará automaticamente os registros. Posso fornecer acesso ao painel do Resend para acompanhamento da verificação, se necessário.

## 📅 Prazo

Seria possível realizar esta configuração até [DATA]? Não há urgência crítica, mas gostaríamos de avançar com os testes da funcionalidade de e-mail.

## ❓ Dúvidas

Caso tenham alguma dúvida técnica ou precisem de mais informações sobre os registros, estou à disposição para esclarecer.

Agradeço desde já pela atenção.

Atenciosamente,
[Seu Nome]

---

**Anexos/Referências:**
- Documentação Resend: https://resend.com/docs
- Guia de configuração DNS: [link interno se houver]

