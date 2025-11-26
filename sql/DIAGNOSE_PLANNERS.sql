-- DIAGNÓSTICO DE PLANNERS
-- Objetivo: Entender a distribuição de clientes por planejador para explicar a diferença de 850 clientes.

SELECT
  CASE 
    WHEN planner IS NULL OR planner = '' THEN '(Vazio)'
    WHEN planner ~ '^[0-9]+$' THEN '(Numérico)'
    ELSE planner 
  END AS planner_group,
  COUNT(*) as total_clientes
FROM clients
WHERE is_active IS NOT FALSE
GROUP BY 1
ORDER BY 2 DESC;
