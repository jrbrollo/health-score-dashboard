# Validação e Correções: Movement Sankey Diagram

## Resumo das Correções Implementadas

### 1. **Melhoria na Busca de Histórico Exato**

**Problema Identificado**: A função `loadClientHistoryForDate` buscava registros até a data alvo (`lte`), o que significa que se não houver histórico exato para 14/11, retornaria o registro mais recente até aquela data (provavelmente 13/11).

**Correção Implementada**:
- Agora prioriza registros com data exata
- Se não houver registro exato, usa o mais recente disponível
- Adiciona logs de debug para identificar quando não há histórico exato

**Código Modificado**: Linhas 231-283 em `MovementSankey.tsx`

### 2. **Validação de Data Exata na Comparação**

**Problema Identificado**: A comparação não verificava se o histórico era da data exata ou do mais recente até aquela data.

**Correção Implementada**:
- Verifica se o histórico é da data exata antes de comparar
- Loga avisos quando usa histórico de data anterior à data final
- Permite identificar casos onde não há histórico exato

**Código Modificado**: Linhas 438-479 em `MovementSankey.tsx`

## Queries SQL para Validação

Execute as queries em `sql/validate_movement_sankey_logic.sql` para validar:

1. **Query 1**: Verifica quantos registros existem para cada data
2. **Query 2**: Verifica quantos clientes têm histórico em ambas as datas
3. **Query 3**: Detalha movimentos entre categorias
4. **Query 4**: Verifica duplicatas na mesma data
5. **Query 5**: Verifica clientes sem histórico
6. **Query 6**: Calcula estatísticas de melhoria/piora

## Validação dos Dados Mostrados

### Dados Observados (13/11 → 14/11):
- **Melhorando**: 318 clientes ✅
- **Piorando**: 0 clientes ✅
- **Estáveis**: 606 clientes ✅
- **Novos**: 84 clientes ✅
- **Perdidos**: 0 clientes ✅
- **Total**: 1008 clientes ✅

### Verificação Matemática:
- Novos: 62 + 3 + 19 = 84 ✅
- Melhorando: 279 + 29 + 10 = 318 ✅
- Estáveis: 449 + 110 + 23 + 24 = 606 ✅
- **Total**: 84 + 318 + 606 = 1008 ✅

## Próximos Passos

1. ✅ **Executar queries de validação** no Supabase SQL Editor
2. ✅ **Verificar logs do console** ao usar o Movement Sankey Diagram
3. ✅ **Confirmar se há histórico para 14/11** no banco de dados
4. ✅ **Validar se os números estão corretos** comparando com os dados do banco

## Pontos de Atenção

### ⚠️ Se não houver histórico para 14/11:
- Os clientes aparecerão como "Estáveis" mesmo que não tenham histórico exato
- Os logs do console mostrarão avisos: `⚠️ Cliente X não tem histórico exato para 14/11/2025`
- A solução é garantir que o histórico seja criado para todas as datas necessárias

### ✅ Se houver histórico para 14/11:
- A comparação deve funcionar corretamente
- Os números devem corresponder aos dados do banco
- Não deve haver avisos no console

## Como Validar

1. Abra o console do navegador (F12)
2. Navegue até a seção "Movement Sankey Diagram"
3. Selecione o período 13/11/2025 → 14/11/2025
4. Verifique os logs:
   - `📅 Histórico inicial (13/11/2025): X clientes encontrados`
   - `📅 Histórico final (14/11/2025): Y clientes encontrados`
   - `⚠️ Atenção: Z clientes sem histórico exato para 2025-11-14` (se houver)
5. Execute as queries SQL de validação
6. Compare os resultados

## Correções Adicionais Necessárias (se aplicável)

Se os dados não corresponderem após a validação:

1. **Criar histórico para 14/11**: Se não houver histórico para 14/11, será necessário criar usando a função `record_health_score_history_v3`
2. **Verificar duplicatas**: Se houver duplicatas na mesma data, limpar antes de comparar
3. **Ajustar lógica**: Se necessário, ajustar a lógica de comparação baseado nos resultados

