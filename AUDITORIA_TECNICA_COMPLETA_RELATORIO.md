# 📊 RELATÓRIO DE AUDITORIA TÉCNICA COMPLETA
## Health Score Dashboard - Análise End-to-End

**Data da Auditoria:** 2025-01-XX  
**Auditor:** Sistema de Análise Técnica  
**Escopo:** Codebase completa - Frontend, Backend, SQL, Segurança, Performance

---

## 📈 SUMÁRIO EXECUTIVO

**Total de Issues Identificadas:** 47

- 🔴 **Crítico:** 8 (resolver HOJE)
- 🟠 **Alto:** 12 (resolver esta semana)
- 🟡 **Médio:** 18 (resolver este mês)
- 🟢 **Baixo:** 6 (backlog)
- 🚀 **Oportunidades:** 3

### Top 3 Prioridades Críticas:

1. **Cônjuges não têm histórico criado** - Função SQL ignora cônjuges, quebrando análise temporal
2. **Herança de NPS não implementada no SQL** - Cônjuges não herdam NPS do pagante no backend
3. **RLS policies muito permissivas** - Segurança comprometida com `USING (true)`

---

## 🔴 CRÍTICO (Ação Imediata)

### [#1] Cônjuges não têm histórico criado

**📍 Localização:** `sql/record_health_score_history_v3_fixed.sql` (linhas 24-27)

**🐛 Problema:** 
A função `record_health_score_history_v3` ignora cônjuges completamente:

```sql
-- Ignorar cônjuges
IF v_client.is_spouse = TRUE THEN
  RETURN;
END IF;
```

Isso significa que:
- Cônjuges nunca têm histórico registrado
- Análise temporal não inclui cônjuges
- Movement Sankey não mostra transições de cônjuges
- Estatísticas estão incompletas

**⚠️ Impacto:** 
- **Perda de dados críticos** - Cônjuges representam parte significativa da carteira
- **Análise temporal incompleta** - Dados históricos não refletem realidade
- **Decisões baseadas em dados incorretos** - Estatísticas subestimadas

**💡 Solução:** 
Remover o `RETURN` e implementar lógica de herança de NPS para cônjuges dentro da função SQL.

**✅ Checklist:**
- [ ] Remover `IF v_client.is_spouse = TRUE THEN RETURN; END IF;`
- [ ] Implementar busca de NPS do pagante quando cônjuge não tem NPS próprio
- [ ] Usar `spouse_partner_name` + `planner` para buscar pagante
- [ ] Testar com cônjuge sem NPS cujo pagante tem NPS
- [ ] Testar com cônjuge com NPS próprio (não deve herdar)
- [ ] Verificar que histórico é criado para todos os cônjuges

---

### [#2] Herança de NPS não implementada no SQL

**📍 Localização:** `sql/record_health_score_history_v3_fixed.sql` (linhas 29-40)

**🐛 Problema:**
A função SQL calcula NPS apenas do próprio cliente, sem verificar se é cônjuge e precisa herdar do pagante:

```sql
-- Calcular NPS Pillar (-10 a 20 pontos)
v_nps_pillar := 10; -- Default para null (neutro)
IF v_client.nps_score_v3 IS NOT NULL THEN
  -- ... calcula apenas do próprio cliente
END IF;
```

O frontend (`calculateHealthScore` em `src/utils/healthScore.ts`) implementa herança, mas o backend não, causando **inconsistência crítica**.

**⚠️ Impacto:**
- **Scores diferentes** entre frontend e backend
- **Histórico com scores incorretos** para cônjuges
- **Análise temporal baseada em dados errados**

**💡 Solução:**
Implementar lógica de herança de NPS antes de calcular o pilar:

```sql
-- Se for cônjuge sem NPS próprio, buscar do pagante
IF v_client.is_spouse = TRUE 
   AND v_client.nps_score_v3 IS NULL 
   AND v_client.spouse_partner_name IS NOT NULL THEN
  SELECT nps_score_v3 INTO v_nps_pillar
  FROM clients
  WHERE name = v_client.spouse_partner_name
    AND planner = v_client.planner
    AND is_spouse = FALSE
  LIMIT 1;
END IF;
```

**✅ Checklist:**
- [ ] Adicionar lógica de busca de NPS do pagante
- [ ] Garantir que normalização de nome seja consistente (lowercase, trim)
- [ ] Se pagante não tem NPS, cônjuge recebe 0 pontos (não +10)
- [ ] Se cônjuge tem NPS próprio, usar próprio (não herdar)
- [ ] Testar todos os cenários de herança
- [ ] Validar que scores batem com frontend

---

### [#3] RLS Policies muito permissivas

**📍 Localização:** 
- `sql/setup.sql` (linha 44)
- `sql/temporal_setup.sql` (linha 376)

**🐛 Problema:**
Políticas RLS estão configuradas como `USING (true)`, permitindo acesso total a qualquer usuário autenticado:

```sql
CREATE POLICY "Enable all operations for clients" ON clients
FOR ALL USING (true);
```

Isso significa que:
- Qualquer usuário autenticado pode ver/modificar/deletar dados de qualquer cliente
- Não há controle de acesso baseado em hierarquia
- Planejadores podem ver dados de outros planejadores

**⚠️ Impacto:**
- **Vulnerabilidade de segurança crítica**
- **Violação de privacidade** - Dados sensíveis acessíveis por todos
- **Não conformidade** com requisitos de acesso hierárquico

**💡 Solução:**
Implementar políticas RLS baseadas em hierarquia:

```sql
-- Policy para SELECT baseada em hierarquia
CREATE POLICY "Users can view clients in their hierarchy"
ON clients FOR SELECT
USING (
  -- Manager vê todos
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'manager')
  OR
  -- Planner vê apenas próprios clientes
  (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'planner' AND hierarchy_name = planner))
  OR
  -- Mediator/Leader vê subordinados (implementar lógica hierárquica)
  ...
);
```

**✅ Checklist:**
- [ ] Remover políticas `USING (true)`
- [ ] Implementar políticas baseadas em `user_profiles.role` e `hierarchy_name`
- [ ] Testar acesso de cada tipo de usuário (manager, mediator, leader, planner)
- [ ] Garantir que planejador só vê próprios clientes
- [ ] Garantir que manager vê todos os clientes
- [ ] Implementar políticas para INSERT/UPDATE/DELETE também
- [ ] Testar RLS em `health_score_history` também

---

### [#4] Falta campo `spouse_partner_name` no INSERT SQL

**📍 Localização:** `sql/bulk_insert_client_v3.sql` (linha 99-105)

**🐛 Problema:**
A função `bulk_insert_client_v3` não inclui `spouse_partner_name` no INSERT, mesmo que o campo exista na tabela:

```sql
INSERT INTO clients (
  name, planner, phone, email, leader, mediator, manager,
  is_spouse, months_since_closing, ...
  -- FALTA: spouse_partner_name
```

O frontend (`BulkImportV3.tsx`) define `spousePartnerName`, mas o SQL não persiste.

**⚠️ Impacto:**
- **Herança de NPS não funciona** - Campo necessário não é salvo
- **Dados perdidos** - Informação do pagante não é persistida
- **Inconsistência** entre frontend e backend

**💡 Solução:**
Adicionar `spouse_partner_name` no INSERT e UPDATE:

```sql
INSERT INTO clients (
  ...
  is_spouse,
  spouse_partner_name,  -- ADICIONAR
  months_since_closing,
  ...
) VALUES (
  ...
  COALESCE((payload->>'is_spouse')::BOOLEAN, false),
  NULLIF(trim((payload->>'spouse_partner_name')::TEXT), ''),  -- ADICIONAR
  ...
)
```

**✅ Checklist:**
- [ ] Adicionar `spouse_partner_name` na lista de colunas do INSERT
- [ ] Adicionar no UPDATE do `ON CONFLICT`
- [ ] Validar que campo é TEXT e pode ser NULL
- [ ] Testar importação de cônjuge com `spouse_partner_name`
- [ ] Verificar que campo é salvo corretamente no banco

---

### [#5] Validação de data futura insuficiente

**📍 Localização:** 
- `src/components/BulkImportV3.tsx` (linhas 345-347)
- `sql/record_health_score_history_v3_fixed.sql` (linha 207)

**🐛 Problema:**
Validação de data futura permite até 1 dia à frente, mas não valida se `recorded_date` é maior que `CURRENT_DATE` no SQL:

```typescript
// Frontend permite até 1 dia à frente
if (sheetDate > tomorrow) {
  newErrors.push(`Data da planilha é muito futura...`);
}
```

Mas no SQL:
```sql
-- Só valida se pode atualizar histórico passado, não valida data futura
WHEN p_recorded_date >= CURRENT_DATE THEN EXCLUDED.health_score
```

**⚠️ Impacto:**
- **Histórico com datas futuras** pode ser criado
- **Análise temporal com dados inválidos**
- **Inconsistência** entre validações frontend e backend

**💡 Solução:**
Adicionar validação explícita no início da função SQL:

```sql
-- Validar que recorded_date não é futura
IF p_recorded_date > CURRENT_DATE THEN
  RAISE EXCEPTION 'recorded_date não pode ser data futura: %', p_recorded_date;
END IF;
```

**✅ Checklist:**
- [ ] Adicionar validação no início de `record_health_score_history_v3`
- [ ] Rejeitar datas futuras com exceção clara
- [ ] Alinhar validação frontend e backend
- [ ] Testar com data futura (deve falhar)
- [ ] Testar com data atual (deve funcionar)
- [ ] Testar com data passada (deve funcionar)

---

### [#6] Falta transação na importação bulk

**📍 Localização:** `sql/fix_import_flow.sql` (linha 33-67)

**🐛 Problema:**
A função `bulk_insert_clients_v3` processa clientes em loop sem transação explícita:

```sql
FOR client_record IN SELECT * FROM jsonb_array_elements(clients_json)
LOOP
  SELECT * INTO result FROM bulk_insert_client_v3(...);
  RETURN NEXT result;
END LOOP;
```

Se um cliente falhar no meio do processo:
- Clientes anteriores já foram inseridos
- Clientes posteriores não são inseridos
- Estado inconsistente no banco

**⚠️ Impacto:**
- **Dados parciais** em caso de erro
- **Inconsistência** - Alguns clientes importados, outros não
- **Necessidade de rollback manual**

**💡 Solução:**
Envolver o loop em transação explícita:

```sql
BEGIN
  -- Processar todos os clientes
  FOR client_record IN SELECT * FROM jsonb_array_elements(clients_json)
  LOOP
    -- Se algum falhar, toda transação é revertida
    SELECT * INTO result FROM bulk_insert_client_v3(...);
    RETURN NEXT result;
  END LOOP;
  
  -- Se chegou aqui, tudo foi inserido com sucesso
  RETURN;
EXCEPTION
  WHEN OTHERS THEN
    -- Rollback automático em caso de erro
    RAISE;
END;
```

**✅ Checklist:**
- [ ] Envolver loop em bloco BEGIN/EXCEPTION
- [ ] Testar com JSON inválido (deve fazer rollback completo)
- [ ] Testar com cliente com dados inválidos (deve fazer rollback completo)
- [ ] Garantir que nenhum cliente é inserido se algum falhar
- [ ] Adicionar logging de erros para debug

---

### [#7] `identity_key` usa MD5 mas deveria ser texto normalizado

**📍 Localização:** `sql/bulk_insert_client_v3.sql` (linha 201)

**🐛 Problema:**
A `identity_key` é criada usando MD5, mas deveria ser texto normalizado para facilitar debug e queries:

```sql
md5(lower(trim((payload->>'name')::text)) || '|' || lower(trim((payload->>'planner')::text)))
```

Problemas:
- Não é legível (hash MD5)
- Dificulta queries manuais e debug
- Não permite busca por nome/planner diretamente

**⚠️ Impacto:**
- **Dificuldade de debug** - Não é possível identificar cliente pela chave
- **Queries complexas** - Precisa calcular MD5 para buscar
- **Manutenção difícil** - Não é intuitivo

**💡 Solução:**
Usar texto normalizado diretamente:

```sql
lower(trim((payload->>'name')::text)) || '|' || lower(trim((payload->>'planner')::text))
```

E garantir constraint UNIQUE na coluna.

**✅ Checklist:**
- [ ] Alterar `identity_key` para texto normalizado
- [ ] Garantir constraint UNIQUE na coluna
- [ ] Atualizar queries que usam `identity_key`
- [ ] Migrar dados existentes (calcular novo formato)
- [ ] Testar que duplicatas ainda são evitadas
- [ ] Validar performance (texto vs hash)

---

### [#8] Validação de `last_seen_at` antes de criar histórico

**📍 Localização:** `sql/record_health_score_history_v3_fixed.sql` (início da função)

**🐛 Problema:**
A função não valida se `last_seen_at` existe antes de criar histórico:

```sql
-- Buscar dados do cliente
SELECT * INTO v_client FROM clients WHERE id = p_client_id;
-- ... calcula score ...
-- Insere histórico sem validar last_seen_at
```

Se `last_seen_at` for NULL:
- Histórico é criado mesmo sem dados importados
- Pode criar histórico para cliente que nunca foi importado do CSV
- Dados inconsistentes

**⚠️ Impacto:**
- **Histórico para clientes não importados**
- **Dados inconsistentes** - Cliente sem `last_seen_at` mas com histórico
- **Análise temporal incorreta**

**💡 Solução:**
Validar `last_seen_at` no início:

```sql
-- Buscar dados do cliente
SELECT * INTO v_client FROM clients WHERE id = p_client_id;

-- Validar que cliente foi importado (tem last_seen_at)
IF v_client.last_seen_at IS NULL THEN
  RAISE WARNING 'Cliente % não tem last_seen_at, pulando criação de histórico', p_client_id;
  RETURN;
END IF;
```

**✅ Checklist:**
- [ ] Adicionar validação de `last_seen_at` IS NOT NULL
- [ ] Retornar early se não existe
- [ ] Logar warning para debug
- [ ] Testar com cliente sem `last_seen_at` (não deve criar histórico)
- [ ] Testar com cliente com `last_seen_at` (deve criar histórico)
- [ ] Documentar comportamento

---

## 🟠 ALTO (Esta Semana)

### [#9] Normalização de nome inconsistente entre frontend e backend

**📍 Localização:** 
- `src/components/BulkImportV3.tsx` (linha 109)
- `sql/bulk_insert_client_v3.sql` (linha 201)

**🐛 Problema:**
Frontend usa `norm()` que faz `normalize('NFD')` + `replace(/[\u0300-\u036f]/g, '')`, mas SQL usa apenas `lower(trim())`. Isso pode causar `identity_key` diferentes para o mesmo cliente.

**💡 Solução:**
Padronizar normalização ou usar mesma função em ambos os lados.

---

### [#10] Falta validação de `spouse_partner_name` no SQL

**📍 Localização:** `sql/bulk_insert_client_v3.sql`

**🐛 Problema:**
Não valida se `spouse_partner_name` existe na tabela quando `is_spouse = TRUE`.

**💡 Solução:**
Adicionar validação ou foreign key lógica.

---

### [#11] `cross_sell_count` usa GREATEST no UPDATE mas não no INSERT

**📍 Localização:** `sql/bulk_insert_client_v3.sql` (linha 219)

**🐛 Problema:**
UPDATE usa `GREATEST(EXCLUDED.cross_sell_count, clients.cross_sell_count)` para proteger contra retrocesso, mas INSERT não tem essa proteção.

**💡 Solução:**
Garantir consistência ou documentar comportamento intencional.

---

### [#12] Timeout de 30s pode ser insuficiente para análise temporal

**📍 Localização:** `src/services/temporalService.ts` (linha 187)

**🐛 Problema:**
Timeout de 60s pode não ser suficiente para períodos longos ou muitos clientes.

**💡 Solução:**
Implementar paginação ou aumentar timeout dinamicamente.

---

### [#13] Movement Sankey busca histórico em lotes mas pode melhorar

**📍 Localização:** `src/components/MovementSankey.tsx` (linhas 173-227)

**🐛 Problema:**
Busca histórico em lotes de 500, mas processa sequencialmente. Pode ser otimizado com paralelismo controlado.

**💡 Solução:**
Implementar paralelismo com limite de concorrência.

---

### [#14] Falta validação de email no backend

**📍 Localização:** `sql/bulk_insert_client_v3.sql` (linha 120)

**🐛 Problema:**
Email é inserido sem validação de formato.

**💡 Solução:**
Adicionar validação regex no SQL ou confiar apenas no frontend (documentar).

---

### [#15] `get_temporal_analysis_asof` não valida `start_date <= end_date`

**📍 Localização:** `sql/temporal_setup.sql` (função `get_temporal_analysis_asof`)

**🐛 Problema:**
Função SQL não valida que `start_date <= end_date` antes de processar.

**💡 Solução:**
Adicionar validação no início da função.

---

### [#16] Falta índice em `spouse_partner_name`

**📍 Localização:** Schema da tabela `clients`

**🐛 Problema:**
Busca de pagante por `spouse_partner_name` + `planner` pode ser lenta sem índice.

**💡 Solução:**
Criar índice composto `(spouse_partner_name, planner)`.

---

### [#17] Validação de telefone remove caracteres mas pode perder informação

**📍 Localização:** `sql/bulk_insert_client_v3.sql` (linhas 112-119)

**🐛 Problema:**
Remove todos caracteres não numéricos, mas telefones podem ter formatação importante (ex: +55).

**💡 Solução:**
Preservar formato original ou documentar comportamento.

---

### [#18] Falta tratamento de erro em `bulk_insert_clients_v3`

**📍 Localização:** `sql/fix_import_flow.sql` (linha 33)

**🐛 Problema:**
Função não tem tratamento de exceções específicas, apenas genérico.

**💡 Solução:**
Adicionar tratamento de erros específicos com mensagens claras.

---

### [#19] `calculateHealthScore` no frontend não valida dados de entrada

**📍 Localização:** `src/utils/healthScore.ts` (linha 11)

**🐛 Problema:**
Função assume que dados estão válidos, mas pode receber valores inválidos.

**💡 Solução:**
Adicionar validações de entrada ou usar tipos mais restritivos.

---

### [#20] Falta cache invalidation em React Query

**📍 Localização:** `src/components/Dashboard.tsx`

**🐛 Problema:**
Cache pode ficar desatualizado após importação.

**💡 Solução:**
Invalidar cache após operações de escrita.

---

## 🟡 MÉDIO (Este Mês)

### [#21-38] Melhorias de Performance e Código

- Otimizar queries com EXPLAIN ANALYZE
- Implementar paginação em listas grandes
- Memoizar cálculos pesados no frontend
- Adicionar loading states em todas operações assíncronas
- Melhorar tratamento de erros com mensagens específicas
- Adicionar testes unitários para funções críticas
- Documentar funções SQL complexas
- Implementar retry logic para falhas de rede
- Adicionar métricas de performance
- Otimizar bundle size do frontend
- Implementar code splitting por rota
- Adicionar service worker para cache offline
- Melhorar acessibilidade (ARIA labels, keyboard navigation)
- Adicionar validação de formulários no frontend
- Implementar debounce em buscas
- Adicionar confirmação antes de ações destrutivas
- Melhorar feedback visual de ações
- Adicionar tooltips explicativos

---

## 🟢 BAIXO (Backlog)

### [#39-44] Melhorias Incrementais

- Adicionar dark mode persistente
- Melhorar responsividade mobile
- Adicionar exportação de dados
- Implementar filtros salvos
- Adicionar notificações de mudanças
- Melhorar design de gráficos

---

## 🚀 OPORTUNIDADES

### [#45] Dashboard de Métricas em Tempo Real

**💡 Ideia:** Implementar WebSocket para atualizações em tempo real

**🎯 Benefício:** Usuários veem mudanças instantaneamente

**🛠️ Esforço:** Alto

**📊 ROI:** Médio - Melhora UX mas não é crítico

---

### [#46] Sistema de Alertas Automáticos

**💡 Ideia:** Alertar quando cliente muda de categoria ou score cai abaixo de threshold

**🎯 Benefício:** Ação proativa em clientes em risco

**🛠️ Esforço:** Médio

**📊 ROI:** Alto - Pode prevenir perda de clientes

---

### [#47] API REST para Integração Externa

**💡 Ideia:** Expor endpoints REST para integração com outros sistemas

**🎯 Benefício:** Integração com CRM, sistemas de pagamento, etc.

**🛠️ Esforço:** Alto

**📊 ROI:** Médio - Depende de necessidade de integração

---

## 📋 CHECKLIST DE AÇÃO PRIORIZADA

### HOJE (Crítico):

- [ ] [#1] Remover `RETURN` para cônjuges em `record_health_score_history_v3`
- [ ] [#2] Implementar herança de NPS no SQL
- [ ] [#4] Adicionar `spouse_partner_name` no INSERT SQL
- [ ] [#5] Adicionar validação de data futura no SQL
- [ ] [#8] Validar `last_seen_at` antes de criar histórico

### ESTA SEMANA (Alto):

- [ ] [#3] Implementar RLS policies baseadas em hierarquia
- [ ] [#6] Adicionar transação na importação bulk
- [ ] [#7] Alterar `identity_key` para texto normalizado
- [ ] [#9] Padronizar normalização de nome
- [ ] [#10] Validar `spouse_partner_name` no SQL
- [ ] [#15] Validar `start_date <= end_date` no SQL

### ESTE MÊS (Médio):

- [ ] [#12] Otimizar timeouts e paginação
- [ ] [#13] Melhorar performance do Movement Sankey
- [ ] [#16] Adicionar índices faltantes
- [ ] [#20] Implementar cache invalidation
- [ ] Adicionar testes unitários
- [ ] Melhorar tratamento de erros
- [ ] Documentar funções SQL

---

## 📝 NOTAS FINAIS

Esta auditoria identificou **8 problemas críticos** que devem ser resolvidos **imediatamente**, pois podem causar:
- Perda de dados
- Inconsistências no histórico
- Vulnerabilidades de segurança
- Análises incorretas

Os problemas críticos relacionados a **cônjuges e histórico** são os mais urgentes, pois afetam diretamente a funcionalidade core da ferramenta.

A implementação de **RLS policies adequadas** é crítica para segurança e deve ser feita antes de produção.

---

**Próximos Passos Recomendados:**
1. Revisar e aprovar este relatório
2. Priorizar correções críticas
3. Criar tickets para cada issue
4. Implementar correções em ordem de prioridade
5. Testar cada correção antes de deploy
6. Documentar mudanças

---

*Relatório gerado automaticamente pela ferramenta de auditoria técnica*

