-- ========================================
-- FUNÇÃO: get_daily_health_report (CORRIGIDA)
-- ========================================
-- Gera relatório diário de Health Score para um usuário, respeitando hierarquia
-- CORREÇÃO: Todos os CTEs agora são acessados em uma única query

DROP FUNCTION IF EXISTS get_daily_health_report(TEXT, DATE);

CREATE OR REPLACE FUNCTION get_daily_health_report(
  p_user_email TEXT,
  p_target_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSON
SECURITY DEFINER
AS $$
DECLARE
  v_user_name TEXT;
  v_user_role TEXT;
  v_result JSON;
BEGIN
  -- 1. Buscar usuário e suas credenciais
  SELECT hierarchy_name, role
  INTO v_user_name, v_user_role
  FROM user_profiles
  WHERE email = p_user_email
  LIMIT 1;

  IF v_user_name IS NULL THEN
    RAISE EXCEPTION 'Usuário não encontrado: %', p_user_email;
  END IF;

  -- 2. Gerar relatório completo em uma única query com CTEs
  WITH clients_today AS (
    -- Clientes do dia atual (filtrados por hierarquia)
    SELECT
      h.client_id,
      h.client_name,
      h.health_score,
      h.health_category,
      h.planner
    FROM health_score_history h
    WHERE h.recorded_date = p_target_date
      AND h.planner != '0'
      AND (
        (v_user_role = 'leader' AND h.leader = v_user_name)
        OR (v_user_role = 'mediator' AND (h.mediator = v_user_name OR h.planner = v_user_name))
        OR (v_user_role = 'manager' AND (h.manager = v_user_name OR h.planner = v_user_name))
      )
  ),
  clients_yesterday AS (
    -- Clientes do dia anterior (para comparação)
    SELECT
      h.client_id,
      h.health_score,
      h.health_category
    FROM health_score_history h
    WHERE h.recorded_date = p_target_date - INTERVAL '1 day'
      AND h.planner != '0'
      AND (
        (v_user_role = 'leader' AND h.leader = v_user_name)
        OR (v_user_role = 'mediator' AND (h.mediator = v_user_name OR h.planner = v_user_name))
        OR (v_user_role = 'manager' AND (h.manager = v_user_name OR h.planner = v_user_name))
      )
  ),
  changes AS (
    -- Mudanças entre ontem e hoje
    SELECT
      t.client_id,
      t.client_name,
      t.health_score AS score_today,
      t.health_category AS category_today,
      y.health_score AS score_yesterday,
      y.health_category AS category_yesterday,
      t.planner,
      (t.health_score - COALESCE(y.health_score, t.health_score)) AS score_change,
      CASE
        WHEN y.health_category IS NULL THEN 'new'
        WHEN t.health_category != y.health_category THEN 'category_change'
        WHEN t.health_score != y.health_score THEN 'score_change'
        ELSE 'no_change'
      END AS change_type
    FROM clients_today t
    LEFT JOIN clients_yesterday y ON t.client_id = y.client_id
  ),
  summary_data AS (
    -- Resumo estatístico
    SELECT
      COUNT(*) AS total_clients,
      ROUND(AVG(health_score), 1) AS avg_score,
      COUNT(*) FILTER (WHERE health_category = 'Ótimo') AS count_otimo,
      COUNT(*) FILTER (WHERE health_category = 'Estável') AS count_estavel,
      COUNT(*) FILTER (WHERE health_category = 'Atenção') AS count_atencao,
      COUNT(*) FILTER (WHERE health_category = 'Crítico') AS count_critico
    FROM clients_today
  ),
  alert_data AS (
    -- Alertas importantes
    SELECT
      COUNT(*) FILTER (WHERE change_type = 'new') AS new_clients,
      COUNT(*) FILTER (WHERE change_type = 'category_change' AND category_today IN ('Crítico', 'Atenção')) AS new_alerts,
      COUNT(*) FILTER (WHERE score_change > 0) AS improvements,
      COUNT(*) FILTER (WHERE score_change < 0) AS declines,
      COUNT(*) FILTER (WHERE category_yesterday IN ('Crítico', 'Atenção') AND category_today IN ('Ótimo', 'Estável')) AS resolved
    FROM changes
  ),
  priority_clients AS (
    -- Top 5 piores scores (prioridades)
    SELECT
      json_agg(
        json_build_object(
          'client_name', client_name,
          'health_score', score_today,
          'health_category', category_today,
          'planner', planner,
          'score_change', score_change
        )
        ORDER BY score_today ASC, score_change ASC
      ) AS priorities
    FROM (
      SELECT * FROM changes
      ORDER BY score_today ASC, score_change ASC
      LIMIT 5
    ) top5
  )
  -- QUERY FINAL: Combinar tudo em um único JSON
  SELECT json_build_object(
    'user_email', p_user_email,
    'user_name', v_user_name,
    'user_role', v_user_role,
    'report_date', p_target_date,
    'summary', json_build_object(
      'total_clients', s.total_clients,
      'avg_score', s.avg_score,
      'distribution', json_build_object(
        'otimo', s.count_otimo,
        'estavel', s.count_estavel,
        'atencao', s.count_atencao,
        'critico', s.count_critico
      )
    ),
    'alerts', json_build_object(
      'new_clients', a.new_clients,
      'new_alerts', a.new_alerts,
      'improvements', a.improvements,
      'declines', a.declines,
      'resolved', a.resolved
    ),
    'priorities', COALESCE(p.priorities, '[]'::json)
  )
  INTO v_result
  FROM summary_data s
  CROSS JOIN alert_data a
  CROSS JOIN priority_clients p;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_daily_health_report(TEXT, DATE) IS
'Gera relatório diário de Health Score para um usuário, respeitando hierarquia organizacional. Retorna JSON com summary, alerts e priorities.';
