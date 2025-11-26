-- DIAGNÓSTICO DE FILTROS DE CLIENTES
-- Objetivo: Entender por que o frontend mostra 1009 clientes e o banco tem 1859 "ativos".

WITH invalid_tokens AS (
  SELECT unnest(ARRAY['#n/d', 'n/d', 'na', 'n/a', '0', '-', '—', '', '#ref!']) AS token
),
client_analysis AS (
  SELECT
    id,
    name,
    planner,
    is_active,
    -- Checa se nome é inválido
    (name IS NULL OR lower(trim(name)) IN (SELECT token FROM invalid_tokens)) AS is_name_invalid,
    -- Checa se planner é inválido (frontend filtra planner '0' ou nulo em algumas views)
    (planner IS NULL OR planner = '0' OR lower(trim(planner)) IN (SELECT token FROM invalid_tokens)) AS is_planner_invalid
  FROM clients
)
SELECT
  COUNT(*) AS total_geral,
  COUNT(*) FILTER (WHERE is_active IS TRUE) AS ativos_true,
  COUNT(*) FILTER (WHERE is_active IS NULL) AS ativos_null,
  COUNT(*) FILTER (WHERE is_active IS FALSE) AS inativos_false,
  
  -- Quantos "ativos" (true/null) seriam filtrados por nome inválido?
  COUNT(*) FILTER (WHERE (is_active IS NOT FALSE) AND is_name_invalid) AS ativos_com_nome_invalido,
  
  -- Quantos "ativos" (true/null) seriam filtrados por planner inválido?
  COUNT(*) FILTER (WHERE (is_active IS NOT FALSE) AND is_planner_invalid) AS ativos_com_planner_invalido,
  
  -- Simulação do filtro do Dashboard (Ativos + Nome Válido + Planner Válido)
  COUNT(*) FILTER (
    WHERE (is_active IS NOT FALSE) 
      AND NOT is_name_invalid 
      AND NOT is_planner_invalid
  ) AS simulacao_dashboard_planner_valido,

  -- Simulação do filtro do Dashboard (Ativos + Nome Válido apenas)
  COUNT(*) FILTER (
    WHERE (is_active IS NOT FALSE) 
      AND NOT is_name_invalid 
  ) AS simulacao_dashboard_apenas_nome_valido

FROM client_analysis;
