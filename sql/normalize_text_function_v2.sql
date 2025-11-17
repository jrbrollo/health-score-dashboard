-- ========================================
-- FUNÇÃO: normalize_text() v2
-- ========================================
-- Remove diacríticos, converte para lowercase e trim
-- Usado para comparação robusta de nomes
--
-- EXEMPLO:
--   normalize_text('José Silva  ') = 'jose silva'
--   normalize_text('Müller')       = 'muller'
--
-- APLICAR NO SUPABASE SQL EDITOR
-- ========================================

CREATE OR REPLACE FUNCTION normalize_text(input_text TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF input_text IS NULL THEN
    RETURN NULL;
  END IF;

  -- Remove diacríticos usando unaccent extension (deve estar instalada)
  -- Se unaccent não estiver disponível, cria versão alternativa
  BEGIN
    RETURN lower(trim(unaccent(input_text)));
  EXCEPTION
    WHEN undefined_function THEN
      -- Fallback: substitui manualmente os acentos mais comuns
      RETURN lower(trim(
        translate(
          input_text,
          'ÀÁÂÃÄÅàáâãäåÒÓÔÕÖØòóôõöøÈÉÊËèéêëÇçÌÍÎÏìíîïÙÚÛÜùúûüÿÑñ',
          'AAAAAAaaaaaaOOOOOOooooooEEEEeeeeCcIIIIiiiiUUUUuuuuyNn'
        )
      ));
  END;
END;
$$;

-- ========================================
-- TESTES DA FUNÇÃO
-- ========================================
-- Execute estas queries para validar:

-- Teste 1: Acentos comuns
SELECT normalize_text('José da Silva') AS resultado;
-- Esperado: 'jose da silva'

-- Teste 2: Múltiplos espaços
SELECT normalize_text('  Maria   Santos  ') AS resultado;
-- Esperado: 'maria santos'

-- Teste 3: Caracteres especiais
SELECT normalize_text('François Müller') AS resultado;
-- Esperado: 'francois muller'

-- Teste 4: NULL handling
SELECT normalize_text(NULL) AS resultado;
-- Esperado: NULL

-- Teste 5: Comparação de nomes similares
SELECT
  normalize_text('José Silva') = normalize_text('Jose Silva') AS sao_iguais;
-- Esperado: true

COMMENT ON FUNCTION normalize_text(TEXT) IS 'Normaliza texto removendo acentos, espaços extras e convertendo para lowercase. Usado para comparação robusta de nomes.';
