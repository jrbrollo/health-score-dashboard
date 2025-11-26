# Correção de Normalização de Filtros Hierárquicos

## Problema Identificado

As funções SQL `get_temporal_analysis_asof` e `get_sankey_snapshot` faziam comparações case-sensitive e sem normalização de diacríticos nos filtros hierárquicos (planner, manager, mediator, leader).

### Exemplo do Bug

- Frontend envia: `'abraao lima velozo'` (normalizado: lowercase, sem acentos)
- Banco de dados tem: `'Abraão Lima Velozo'` (original: uppercase, com acentos)
- Comparação SQL: `s.planner = 'abraao lima velozo'` ❌ **FALHA**
- Resultado: 0 registros retornados

## Solução Implementada

### 1. Função auxiliar `normalize_text()`

Criada função para normalizar texto (lowercase + sem acentos):

```sql
CREATE OR REPLACE FUNCTION normalize_text(text_value TEXT)
RETURNS TEXT AS $$
BEGIN
  IF text_value IS NULL OR TRIM(text_value) = '' THEN
    RETURN NULL;
  END IF;
  RETURN LOWER(TRIM(unaccent(text_value)));
END;
$$ LANGUAGE plpgsql IMMUTABLE;
```

### 2. Alterações em `get_temporal_analysis_asof`

**ANTES:**
```sql
WHERE (planner_filter = 'all' OR s.planner = planner_filter)
  AND (managers IS NULL OR s.manager = ANY(managers))
  AND (mediators IS NULL OR s.mediator = ANY(mediators))
  AND (leaders IS NULL OR s.leader = ANY(leaders))
```

**DEPOIS:**
```sql
DECLARE
  normalized_planner TEXT;
  normalized_managers TEXT[];
  normalized_mediators TEXT[];
  normalized_leaders TEXT[];
BEGIN
  -- Normalizar filtros
  normalized_planner := CASE
    WHEN planner_filter = 'all' THEN 'all'
    ELSE normalize_text(planner_filter)
  END;

  -- (normalizar arrays...)

  -- Comparação flexível com LIKE
  WHERE (
      normalized_planner = 'all'
      OR normalize_text(s.planner) = normalized_planner
      OR normalize_text(s.planner) LIKE normalized_planner || '%'
      OR normalized_planner LIKE normalize_text(s.planner) || '%'
    )
    AND (
      normalized_managers IS NULL
      OR EXISTS (
        SELECT 1 FROM UNNEST(normalized_managers) AS nm
        WHERE normalize_text(s.manager) = nm
           OR normalize_text(s.manager) LIKE nm || '%'
           OR nm LIKE normalize_text(s.manager) || '%'
      )
    )
    -- (mesmo para mediators e leaders...)
END;
```

### 3. Alterações em `get_sankey_snapshot`

As mesmas alterações precisam ser aplicadas em `get_sankey_snapshot`:

**Linhas a alterar:**
- Linha 109: `AND (p_planner_filter = 'all' OR c.planner = p_planner_filter)`
- Linha 112: `OR c.manager = ANY(p_managers)`
- Linha 117: `OR c.mediator = ANY(p_mediators)`
- Linha 122: `OR c.leader = ANY(p_leaders)`
- Linha 159: `AND (p_planner_filter = 'all' OR h.planner = p_planner_filter)`
- Linha 162: `OR h.manager = ANY(p_managers)`
- Linha 167: `OR h.mediator = ANY(p_mediators)`
- Linha 172: `OR h.leader = ANY(p_leaders)`

## Como Aplicar a Correção

### Passo 1: Executar script de normalização

Execute o arquivo `fix_temporal_analysis_normalization.sql` no Supabase SQL Editor:

```bash
# No Supabase SQL Editor, execute:
\i sql/fix_temporal_analysis_normalization.sql
```

Ou copie e cole o conteúdo do arquivo.

### Passo 2: Atualizar get_sankey_snapshot

Aplique as mesmas mudanças manualmente em `get_sankey_snapshot` seguindo o padrão de `get_temporal_analysis_asof`.

### Passo 3: Verificar outras funções

Verifique se há outras funções SQL que usam filtros hierárquicos:
- `get_sankey_movement`
- `get_portfolio_metrics` (se existir)
- Qualquer função custom que receba `planner`, `managers`, `mediators`, `leaders`

## Resultado Esperado

Após aplicar a correção:
- ✅ Filtros funcionam com qualquer capitalização
- ✅ Filtros funcionam com/sem diacríticos
- ✅ Comparações flexíveis permitem "Abraão" encontrar "Abraão Lima Velozo"
- ✅ Leaders/mediators/managers podem filtrar corretamente na UI

## Testes

Para testar a correção:

```sql
-- Deve retornar dados
SELECT * FROM get_temporal_analysis_asof(
  '2025-11-13'::DATE,
  '2025-11-26'::DATE,
  'abraao lima velozo',  -- lowercase, sem acentos
  NULL,
  NULL,
  ARRAY['helio brollo junior']  -- leader filter
);

-- Deve retornar os mesmos dados
SELECT * FROM get_temporal_analysis_asof(
  '2025-11-13'::DATE,
  '2025-11-26'::DATE,
  'Abraão Lima Velozo',  -- original
  NULL,
  NULL,
  ARRAY['Hélio Brollo Junior']
);
```

## Arquivos Afetados

- `sql/fix_temporal_analysis_normalization.sql` (novo)
- `sql/get_sankey_snapshot.sql` (precisa ser atualizado)
- `sql/temporal_setup.sql` (substituído por fix acima)
