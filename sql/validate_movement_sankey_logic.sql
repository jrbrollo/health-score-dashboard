-- Script para validar a lógica do Movement Sankey Diagram
-- Comparação entre 13/11/2025 e 14/11/2025

-- 1. Verificar quantos registros existem para cada data
SELECT 
  recorded_date,
  COUNT(*) as total_registros,
  COUNT(DISTINCT client_id) as clientes_unicos,
  COUNT(CASE WHEN health_category = 'Ótimo' THEN 1 END) as otimos,
  COUNT(CASE WHEN health_category = 'Estável' THEN 1 END) as estaveis,
  COUNT(CASE WHEN health_category = 'Atenção' THEN 1 END) as atencao,
  COUNT(CASE WHEN health_category = 'Crítico' THEN 1 END) as criticos,
  ROUND(AVG(health_score), 2) as media_score
FROM health_score_history
WHERE recorded_date IN ('2025-11-13', '2025-11-14')
GROUP BY recorded_date
ORDER BY recorded_date;

-- 2. Verificar quantos clientes têm histórico em ambas as datas
WITH clientes_13 AS (
  SELECT DISTINCT client_id, health_category as categoria_13, health_score as score_13
  FROM health_score_history
  WHERE recorded_date = '2025-11-13'
),
clientes_14 AS (
  SELECT DISTINCT client_id, health_category as categoria_14, health_score as score_14
  FROM health_score_history
  WHERE recorded_date = '2025-11-14'
)
SELECT 
  COUNT(*) as total_comparacao,
  COUNT(CASE WHEN c13.categoria_13 = c14.categoria_14 THEN 1 END) as mantiveram_categoria,
  COUNT(CASE WHEN c13.categoria_13 != c14.categoria_14 THEN 1 END) as mudaram_categoria,
  COUNT(CASE WHEN c13.categoria_13 IS NULL THEN 1 END) as novos_em_14,
  COUNT(CASE WHEN c14.categoria_14 IS NULL THEN 1 END) as perdidos_em_14
FROM clientes_13 c13
FULL OUTER JOIN clientes_14 c14 ON c13.client_id = c14.client_id;

-- 3. Detalhar movimentos entre categorias
WITH clientes_13 AS (
  SELECT DISTINCT ON (client_id) 
    client_id, 
    health_category as categoria_13,
    health_score as score_13
  FROM health_score_history
  WHERE recorded_date = '2025-11-13'
  ORDER BY client_id, recorded_date DESC
),
clientes_14 AS (
  SELECT DISTINCT ON (client_id) 
    client_id, 
    health_category as categoria_14,
    health_score as score_14
  FROM health_score_history
  WHERE recorded_date = '2025-11-14'
  ORDER BY client_id, recorded_date DESC
)
SELECT 
  COALESCE(c13.categoria_13, 'Novo') as categoria_inicial,
  COALESCE(c14.categoria_14, 'Perdido') as categoria_final,
  COUNT(*) as quantidade_clientes
FROM clientes_13 c13
FULL OUTER JOIN clientes_14 c14 ON c13.client_id = c14.client_id
GROUP BY COALESCE(c13.categoria_13, 'Novo'), COALESCE(c14.categoria_14, 'Perdido')
ORDER BY 
  CASE COALESCE(c13.categoria_13, 'Novo')
    WHEN 'Crítico' THEN 1
    WHEN 'Atenção' THEN 2
    WHEN 'Estável' THEN 3
    WHEN 'Ótimo' THEN 4
    WHEN 'Novo' THEN 5
    ELSE 6
  END,
  CASE COALESCE(c14.categoria_14, 'Perdido')
    WHEN 'Crítico' THEN 1
    WHEN 'Atenção' THEN 2
    WHEN 'Estável' THEN 3
    WHEN 'Ótimo' THEN 4
    WHEN 'Perdido' THEN 5
    ELSE 6
  END;

-- 4. Verificar se há clientes que aparecem múltiplas vezes na mesma data (problema de duplicação)
SELECT 
  recorded_date,
  client_id,
  COUNT(*) as registros_duplicados
FROM health_score_history
WHERE recorded_date IN ('2025-11-13', '2025-11-14')
GROUP BY recorded_date, client_id
HAVING COUNT(*) > 1
ORDER BY recorded_date, registros_duplicados DESC
LIMIT 20;

-- 5. Verificar clientes que estão na base atual mas não têm histórico em 13/11 ou 14/11
SELECT 
  c.id,
  c.name,
  c.planner,
  CASE 
    WHEN h13.client_id IS NULL THEN 'Sem histórico 13/11'
    WHEN h14.client_id IS NULL THEN 'Sem histórico 14/11'
    ELSE 'OK'
  END as status_historico
FROM clients c
LEFT JOIN (
  SELECT DISTINCT client_id 
  FROM health_score_history 
  WHERE recorded_date = '2025-11-13'
) h13 ON c.id = h13.client_id
LEFT JOIN (
  SELECT DISTINCT client_id 
  FROM health_score_history 
  WHERE recorded_date = '2025-11-14'
) h14 ON c.id = h14.client_id
WHERE (h13.client_id IS NULL OR h14.client_id IS NULL)
  AND c.is_active = true
LIMIT 50;

-- 6. Calcular estatísticas de melhoria/piora (comparando rankings)
WITH clientes_13 AS (
  SELECT DISTINCT ON (client_id) 
    client_id, 
    health_category as categoria_13
  FROM health_score_history
  WHERE recorded_date = '2025-11-13'
  ORDER BY client_id, recorded_date DESC
),
clientes_14 AS (
  SELECT DISTINCT ON (client_id) 
    client_id, 
    health_category as categoria_14
  FROM health_score_history
  WHERE recorded_date = '2025-11-14'
  ORDER BY client_id, recorded_date DESC
),
movimentos AS (
  SELECT 
    c13.client_id,
    c13.categoria_13,
    c14.categoria_14,
    CASE 
      WHEN c13.categoria_13 IS NULL THEN 'Novo'
      WHEN c14.categoria_14 IS NULL THEN 'Perdido'
      WHEN c13.categoria_13 = c14.categoria_14 THEN 'Estável'
      WHEN (c13.categoria_13 = 'Crítico' AND c14.categoria_14 IN ('Atenção', 'Estável', 'Ótimo')) THEN 'Melhorando'
      WHEN (c13.categoria_13 = 'Atenção' AND c14.categoria_14 IN ('Estável', 'Ótimo')) THEN 'Melhorando'
      WHEN (c13.categoria_13 = 'Estável' AND c14.categoria_14 = 'Ótimo') THEN 'Melhorando'
      WHEN (c13.categoria_13 = 'Ótimo' AND c14.categoria_14 IN ('Estável', 'Atenção', 'Crítico')) THEN 'Piorando'
      WHEN (c13.categoria_13 = 'Estável' AND c14.categoria_14 IN ('Atenção', 'Crítico')) THEN 'Piorando'
      WHEN (c13.categoria_13 = 'Atenção' AND c14.categoria_14 = 'Crítico') THEN 'Piorando'
      ELSE 'Estável'
    END as tipo_movimento
  FROM clientes_13 c13
  FULL OUTER JOIN clientes_14 c14 ON c13.client_id = c14.client_id
)
SELECT 
  tipo_movimento,
  COUNT(*) as quantidade
FROM movimentos
GROUP BY tipo_movimento
ORDER BY 
  CASE tipo_movimento
    WHEN 'Melhorando' THEN 1
    WHEN 'Estável' THEN 2
    WHEN 'Novo' THEN 3
    WHEN 'Piorando' THEN 4
    WHEN 'Perdido' THEN 5
    ELSE 6
  END;

