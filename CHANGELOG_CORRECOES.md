# Changelog de Correções - Health Score Dashboard

**Data:** 2025-11-13  
**Objetivo:** Corrigir inconsistências críticas sem quebrar funcionalidade existente  
**Status:** Em progresso

---

## 📋 Resumo das Mudanças

Este documento registra todas as correções aplicadas para garantir confiabilidade e exatidão dos dados, mantendo a funcionalidade existente intacta.

---

## ✅ Correções Aplicadas

### 1. Script `compare_scores.mjs` - CORRIGIDO ✅

**Problema Identificado:**
- Script usava lógica desatualizada do Health Score v2
- NPS: Detratores retornavam 0 em vez de -10
- Payment: Lógica completamente diferente do frontend
- Tenure: Ranges antigos (0-3, 4-6, 7-12 em vez de 0-4, 5-8, 9-12)

**Correção Aplicada:**
- ✅ Reescrita completa da função `calculateHealthScore()` para alinhar com `healthScore.ts`
- ✅ NPS: Detrator (0-6) agora retorna -10, Null retorna 10
- ✅ Payment: Lógica reescrita para considerar dias de atraso (0-7d=25, 8-15d=15, 16-30d=5, 31-60d=0, 61+d=-10)
- ✅ Payment: 2 parcelas com 30+ dias agora retorna -20
- ✅ Tenure: Ranges atualizados (0-4=5, 5-8=10, 9-12=15, 13-24=15, 25+=15)
- ✅ Adicionado override para 3+ parcelas = score 0
- ✅ Adicionada garantia de score mínimo = 0
- ✅ Melhorada análise de divergências com breakdown detalhado
- ✅ Adicionada paginação para grandes volumes de dados

**Arquivo Modificado:**
- `health-score-dashboard/scripts/compare_scores.mjs`

**Impacto:**
- ✅ Scripts de validação agora retornam resultados corretos
- ✅ Não afeta a aplicação em produção (script apenas para testes)
- ✅ Permite detectar divergências reais entre cálculo e histórico

**Como Reverter:**
```bash
git checkout HEAD -- health-score-dashboard/scripts/compare_scores.mjs
```

---

### 2. Melhoria no Tratamento de Erros - `clientService.ts` ✅

**Problema Identificado:**
- Erros eram logados mas sem detalhes suficientes para debug
- Stack trace não era capturado

**Correção Aplicada:**
- ✅ Adicionado log detalhado com stack trace quando disponível
- ✅ Mantido comportamento de retornar array vazio (não quebra aplicação)
- ✅ Melhor rastreabilidade de erros para debug

**Arquivo Modificado:**
- `health-score-dashboard/src/services/clientService.ts`

**Impacto:**
- ✅ Melhor debugging sem quebrar funcionalidade
- ✅ Comportamento existente mantido (seguro)

---

## 📝 Documentações Criadas

### 3. Documentação de Função SQL Legada

**Problema Identificado:**
- Função `calculate_health_score` v2 ainda existe em `temporal_setup.sql`
- Usa campos v2 (last_meeting, app_usage, etc.) que não existem mais
- Pode causar confusão se chamada acidentalmente

**Status:**
- ⚠️ **NÃO REMOVIDA** - Verificação necessária antes de remover
- Função pode estar sendo usada em algum lugar do sistema
- Requer análise de dependências

**Localização:**
- `health-score-dashboard/sql/temporal_setup.sql` (linhas 48-147)

**Recomendação:**
- Verificar se função está sendo chamada em algum lugar
- Se não estiver em uso, renomear para `calculate_health_score_v2_deprecated`
- Ou remover após confirmar que não há dependências

**Como Verificar:**
```sql
-- No Supabase SQL Editor, executar:
SELECT 
  routine_name, 
  routine_definition 
FROM information_schema.routines 
WHERE routine_name LIKE '%calculate_health_score%';
```

---

### 4. Script de Validação de Integridade - CRIADO ✅

**Objetivo:**
Criar script READ-ONLY que valida integridade sem modificar dados

**Funcionalidades:**
- ✅ Valida ranges de dados (NPS 0-10, meses não negativos, etc.)
- ✅ Valida consistência entre scores calculados vs histórico
- ✅ Gera relatório de problemas encontrados
- ✅ Não modifica dados (100% seguro)

**Arquivo Criado:**
- `health-score-dashboard/scripts/validate_integrity.mjs`

**Como usar:**
```bash
cd health-score-dashboard
node scripts/validate_integrity.mjs
```

**Impacto:**
- ✅ Permite detectar problemas de integridade
- ✅ Não afeta produção (read-only)
- ✅ Útil para validação antes de apresentação

---

## ⚠️ Observações Importantes

### Funções SQL Existentes

O sistema possui múltiplas funções SQL relacionadas ao Health Score:

1. **`calculate_health_score`** (v2 - LEGADA)
   - Localização: `sql/temporal_setup.sql`
   - Status: ⚠️ Pode estar em uso
   - Usa campos v2 (deprecated)

2. **`calculate_health_score_v3`** (v3 - ATUAL)
   - Localização: `sql/setup_v3.sql`
   - Status: ✅ Em uso
   - Usa campos v3 (atual)

3. **`record_health_score_history_v3`** (v3 - ATUAL)
   - Localização: `sql/record_health_score_history_v3_fixed.sql`
   - Status: ✅ Em uso
   - Registra histórico usando lógica v3

**Recomendação:** Verificar qual função está sendo chamada pelos triggers e RPCs.

---

## 🚀 Próximos Passos (Opcional)

1. **Verificar uso da função SQL legada**
   - Buscar referências no código
   - Verificar triggers e RPCs
   - Documentar ou remover se não estiver em uso

2. **Melhorar tratamento de erros**
   - Padronizar retorno de erros em todos os serviços
   - Adicionar retry automático onde necessário
   - Melhorar mensagens de erro para usuário

3. **Otimizar queries**
   - Adicionar índices no Supabase (se necessário)
   - Otimizar queries com muitos JOINs
   - Implementar cache onde apropriado

---

## 📊 Testes Recomendados

Após as correções, recomenda-se executar:

1. **Script de validação de integridade (RECOMENDADO PRIMEIRO):**
```bash
cd health-score-dashboard
node scripts/validate_integrity.mjs
```
Este script é READ-ONLY e não modifica nada. Use para verificar se há problemas.

2. **Script de comparação de scores:**
```bash
cd health-score-dashboard
node scripts/compare_scores.mjs
```
Este script compara scores calculados vs histórico e mostra divergências.

3. **Verificar se não há erros no console:**
- Abrir aplicação no navegador
- Abrir DevTools (F12) e verificar console
- Navegar por todas as telas
- Verificar se cálculos estão corretos

4. **Validar importação:**
- Importar CSV de teste
- Verificar se scores calculados estão corretos
- Comparar com histórico usando script de comparação

---

## 🔄 Reversão de Mudanças

Se algo quebrar, use os seguintes comandos para reverter:

```bash
# Reverter script de comparação
git checkout HEAD -- health-score-dashboard/scripts/compare_scores.mjs

# Ver histórico de mudanças
git log --oneline --all
```

---

## 📞 Suporte

Em caso de problemas:
1. Verificar logs do console do navegador
2. Verificar logs do Supabase
3. Executar script de comparação para validar dados
4. Revisar este changelog para entender mudanças

---

**Última Atualização:** 2025-11-13  
**Versão:** 1.0.0

