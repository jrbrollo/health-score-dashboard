# 📚 DOCUMENTAÇÃO DAS FUNÇÕES SQL CRÍTICAS

**Data:** 2025-01-XX  
**Versão:** v3

---

## 🔧 FUNÇÕES PRINCIPAIS

### 1. `bulk_insert_client_v3`

**Localização:** `sql/bulk_insert_client_v3.sql`

**Propósito:**  
Insere ou atualiza um único cliente na tabela `clients` com validações e normalizações.

**Parâmetros:**
- `p_name` (TEXT): Nome do cliente
- `p_planner` (TEXT): Nome do planejador
- `p_manager` (TEXT, opcional): Nome do gerente
- `p_mediator` (TEXT, opcional): Nome do mediador
- `p_leader` (TEXT, opcional): Nome do líder
- `p_phone` (TEXT, opcional): Telefone (normalizado)
- `p_email` (TEXT, opcional): Email (validado)
- `p_last_meeting` (DATE, opcional): Data da última reunião
- `p_has_scheduled_meeting` (BOOLEAN): Se tem reunião agendada
- `p_app_usage` (TEXT, opcional): Status de uso do app
- `p_payment_status` (TEXT, opcional): Status de pagamento
- `p_has_referrals` (BOOLEAN): Se tem indicações
- `p_nps_score` (INTEGER, opcional): Score NPS v2 (legado)
- `p_ecosystem_usage` (TEXT, opcional): Uso do ecossistema
- `p_nps_score_v3` (INTEGER, opcional): Score NPS v3 (0-10)
- `p_has_nps_referral` (BOOLEAN): Se tem indicação NPS
- `p_overdue_installments` (INTEGER): Parcelas em atraso
- `p_overdue_days` (INTEGER): Dias de inadimplência
- `p_cross_sell_count` (INTEGER): Contagem de produtos cross-sell
- `p_months_since_closing` (INTEGER, opcional): Meses desde fechamento
- `p_is_spouse` (BOOLEAN): Se é cônjuge
- `p_spouse_partner_name` (TEXT, opcional): Nome do pagante (se cônjuge)
- `p_sheet_date` (DATE): Data do snapshot (CSV)

**Comportamento:**
- Gera `identity_key` normalizado: `normalize_text(name) || '|' || normalize_text(planner)`
- Usa `UPSERT` baseado em `identity_key`
- Valida email com `is_valid_email()`
- Normaliza telefone (remove caracteres não numéricos)
- Protege `cross_sell_count` com `GREATEST` no UPDATE (evita retrocesso)
- Atualiza `last_seen_at` com `GREATEST` (evita retrocesso)
- Sanitiza todos os campos de texto

**Retorna:**  
Cliente inserido/atualizado ou NULL em caso de erro

**Exemplo:**
```sql
SELECT * FROM bulk_insert_client_v3(
  'João Silva',
  'Maria Santos',
  'Gerente A',
  'Mediador B',
  'Líder C',
  '(11) 98765-4321',
  'joao@email.com',
  '2025-01-15',
  true,
  'ativo',
  'em dia',
  true,
  NULL,
  'ativo',
  8,
  true,
  0,
  0,
  2,
  12,
  false,
  NULL,
  '2025-01-15'
);
```

---

### 2. `bulk_insert_clients_v3`

**Localização:** `sql/fix_import_flow.sql`

**Propósito:**  
Processa múltiplos clientes em lote, chamando `bulk_insert_client_v3` para cada um.

**Parâmetros:**
- `p_clients` (JSONB): Array de objetos cliente no formato do payload

**Comportamento:**
- Processa cada cliente em loop
- Envolvido em transação (atomicidade)
- Tratamento de erros específico por cliente
- Chama `record_health_score_history_v3` após cada cliente inserido/atualizado
- Desabilita trigger automático (histórico é criado explicitamente)

**Retorna:**  
Número de clientes processados com sucesso

**Exemplo:**
```sql
SELECT bulk_insert_clients_v3('[
  {
    "name": "João Silva",
    "planner": "Maria Santos",
    "npsScoreV3": 8,
    "hasNpsReferral": true,
    "overdueInstallments": 0,
    "crossSellCount": 2,
    "monthsSinceClosing": 12,
    "sheetDate": "2025-01-15"
  }
]'::jsonb);
```

---

### 3. `record_health_score_history_v3`

**Localização:** `sql/record_health_score_history_v3_fixed.sql`

**Propósito:**  
Calcula o Health Score v3 de um cliente e registra no histórico temporal.

**Parâmetros:**
- `p_client_id` (UUID): ID do cliente
- `p_recorded_date` (DATE): Data do registro (geralmente data do snapshot)

**Validações:**
- Rejeita `p_recorded_date` futura
- Verifica se cliente existe e tem `last_seen_at` válido
- Não cria histórico para clientes sem importação válida

**Comportamento:**
- **Cônjuges:** Agora são processados (não ignorados)
- **Herança de NPS:** Se cônjuge sem NPS próprio, busca do pagante usando `spouse_partner_name` + `planner`
- **Cálculo de Pilares:**
  - NPS: -10 a 20 pontos (baseado em `nps_score_v3`)
  - Indicação: 0 ou 10 pontos (`has_nps_referral`)
  - Pagamento: 0 a -30 pontos (baseado em `overdue_installments`)
  - Cross Sell: 0 a 20 pontos (baseado em `cross_sell_count`)
  - Tenure: 0 a 30 pontos (baseado em `months_since_closing`)
- **Health Score:** Soma dos pilares (0-100)
- **Health Category:** 
  - Ótimo: 100+
  - Estável: 60-99
  - Atenção: 35-59
  - Crítico: 0-34
- **Proteção de Histórico:** Não sobrescreve histórico de datas passadas (apenas atualiza se `p_recorded_date >= CURRENT_DATE`)

**Retorna:**  
Void (histórico é inserido na tabela `health_score_history`)

**Exemplo:**
```sql
SELECT record_health_score_history_v3(
  '123e4567-e89b-12d3-a456-426614174000'::uuid,
  '2025-01-15'::date
);
```

---

### 4. `get_temporal_analysis_asof`

**Localização:** `sql/temporal_setup.sql`

**Propósito:**  
Obtém análise temporal agregada AS-OF (point-in-time) para um período específico.

**Parâmetros:**
- `start_date` (DATE): Data inicial
- `end_date` (DATE): Data final
- `planner_filter` (TEXT): Filtro de planejador ('all' ou nome específico)
- `managers` (TEXT[], opcional): Array de gerentes
- `mediators` (TEXT[], opcional): Array de mediadores
- `leaders` (TEXT[], opcional): Array de líderes
- `include_null_manager` (BOOLEAN): Incluir clientes sem gerente
- `include_null_mediator` (BOOLEAN): Incluir clientes sem mediador
- `include_null_leader` (BOOLEAN): Incluir clientes sem líder

**Validações:**
- Verifica que `start_date <= end_date`

**Comportamento:**
- Busca histórico AS-OF para cada data no período
- Agrega por planejador e data
- Calcula médias e contagens por categoria
- Filtra por hierarquia se especificado

**Retorna:**  
Array de objetos com:
- `recorded_date`: Data do registro
- `planner`: Nome do planejador
- `total_clients`: Total de clientes
- `avg_health_score`: Score médio
- `excellent_count`, `stable_count`, `warning_count`, `critical_count`: Contagens por categoria
- Médias de pilares e métricas v2 (legado)

**Exemplo:**
```sql
SELECT * FROM get_temporal_analysis_asof(
  '2025-01-01'::date,
  '2025-01-31'::date,
  'all',
  NULL,
  NULL,
  NULL,
  false,
  false,
  false
);
```

---

### 5. `check_user_access_to_client`

**Localização:** Criada dinamicamente via MCP

**Propósito:**  
Verifica se o usuário atual tem acesso a um cliente específico baseado em sua role e hierarquia.

**Parâmetros:**
- `p_manager` (TEXT): Gerente do cliente
- `p_mediator` (TEXT): Mediador do cliente
- `p_leader` (TEXT): Líder do cliente
- `p_planner` (TEXT): Planejador do cliente

**Comportamento:**
- Executa como `SECURITY DEFINER` (bypassa RLS)
- Busca role e `hierarchy_name` do usuário atual em `user_profiles`
- **Manager:** Acesso total (retorna TRUE)
- **Planner:** Acesso apenas aos próprios clientes
- **Leader:** Acesso a clientes onde `leader` OU `planner` = seu nome
- **Mediator:** Acesso a clientes onde `mediator` OU `leader` OU `planner` = seu nome

**Retorna:**  
BOOLEAN (TRUE se tem acesso, FALSE caso contrário)

**Uso:**  
Usada em políticas RLS para evitar recursão infinita

---

## 🔐 FUNÇÕES AUXILIARES

### `normalize_text(text)`

**Propósito:**  
Normaliza texto removendo diacríticos, convertendo para minúsculas e removendo espaços.

**Uso:**  
Geração de `identity_key` e comparações de nomes

---

### `is_valid_email(text)`

**Propósito:**  
Valida formato de email usando regex.

**Retorna:**  
BOOLEAN

---

## 📋 NOTAS IMPORTANTES

1. **Transações:** `bulk_insert_clients_v3` usa transação explícita para garantir atomicidade
2. **Imutabilidade:** Histórico de datas passadas não pode ser modificado
3. **Herança de NPS:** Implementada apenas para cônjuges sem NPS próprio
4. **Proteção de Dados:** `cross_sell_count` e `last_seen_at` usam `GREATEST` para evitar retrocesso
5. **Segurança:** Funções RLS usam `SECURITY DEFINER` para evitar recursão

---

## ⚠️ CUIDADOS

- Não modificar histórico de datas passadas
- Sempre validar `p_recorded_date` não seja futura
- Verificar `last_seen_at` antes de criar histórico
- Usar `normalize_text()` para consistência em comparações
- Manter sincronização entre frontend e backend para cálculo de Health Score

---

**Última atualização:** 2025-01-XX

