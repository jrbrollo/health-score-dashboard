-- ============================================
-- FUNÇÃO: get_sankey_snapshot
-- ============================================
-- DESCRIÇÃO:
-- Retorna o snapshot de Health Score para uma data específica, usando a mesma lógica
-- corrigida da análise temporal. Para dias com dados exatos, calcula scores em tempo real
-- da tabela clients (aplicando filtro last_seen_at = max_last_seen_at).
-- Para dias sem dados exatos, usa lógica AS-OF do histórico.
--
-- PARÂMETROS:
--   p_snapshot_date: Data do snapshot desejado
--   p_client_ids: Array de IDs de clientes (opcional, se NULL retorna todos)
--   p_planner_filter: Filtro de planejador ('all' ou nome específico)
--   p_managers: Array de nomes de gerentes (opcional)
--   p_mediators: Array de nomes de mediadores (opcional)
--   p_leaders: Array de nomes de líderes (opcional)
--
-- RETORNO:
--   Tabela com client_id, health_score, health_category e outros campos relevantes
--
-- USO:
--   SELECT * FROM get_sankey_snapshot('2025-11-14'::DATE, NULL, 'all', NULL, NULL, NULL);
--   SELECT * FROM get_sankey_snapshot('2025-11-14'::DATE, ARRAY['uuid1', 'uuid2'], 'all', NULL, NULL, NULL);

CREATE OR REPLACE FUNCTION get_sankey_snapshot(
  p_snapshot_date DATE,
  p_client_ids UUID[] DEFAULT NULL,
  p_planner_filter TEXT DEFAULT 'all',
  p_managers TEXT[] DEFAULT NULL,
  p_mediators TEXT[] DEFAULT NULL,
  p_leaders TEXT[] DEFAULT NULL,
  include_null_manager BOOLEAN DEFAULT FALSE,
  include_null_mediator BOOLEAN DEFAULT FALSE,
  include_null_leader BOOLEAN DEFAULT FALSE
) RETURNS TABLE (
  client_id UUID,
  client_name TEXT,
  planner TEXT,
  manager TEXT,
  mediator TEXT,
  leader TEXT,
  health_score INTEGER,
  health_category TEXT,
  nps_score_v3_pillar INTEGER,
  referral_pillar INTEGER,
  payment_pillar INTEGER,
  cross_sell_pillar INTEGER,
  tenure_pillar INTEGER,
  recorded_date DATE,
  created_at TIMESTAMPTZ
) AS $$
DECLARE
  max_historical_date DATE;
BEGIN
  -- Validar que snapshot_date não é futura
  IF p_snapshot_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'snapshot_date não pode ser data futura: %. Use CURRENT_DATE ou uma data passada.', p_snapshot_date;
  END IF;

  -- Obter última data histórica disponível
  SELECT MAX(h.recorded_date) INTO max_historical_date
  FROM health_score_history h;
  
  IF max_historical_date IS NULL THEN
    RETURN;
  END IF;
  
  -- Se snapshot_date for depois da última data histórica, usar última data disponível
  IF p_snapshot_date > max_historical_date THEN
    p_snapshot_date := max_historical_date;
  END IF;
  
  RETURN QUERY
  WITH 
  -- Obter o last_seen_at mais recente (filtro usado pelo Dashboard)
  max_last_seen_at AS (
    SELECT MAX(last_seen_at) AS max_timestamp
    FROM clients
    WHERE last_seen_at IS NOT NULL
  ),
  -- CORREÇÃO CRÍTICA: Para dias com dados exatos, calcular scores em tempo real
  -- usando função centralizada calculate_health_score_v3() em vez de código duplicado
  -- FILTRO CRÍTICO: Apenas clientes com last_seen_at = max_last_seen_at
  -- CORREÇÃO: Eliminadas ~150 linhas de código duplicado
  exact_day_calculated AS (
    SELECT 
      c.id AS client_id,
      c.name AS client_name,
      c.planner,
      c.manager,
      c.mediator,
      c.leader,
      (score_json->>'health_score')::INTEGER AS health_score,
      (score_json->>'health_category')::TEXT AS health_category,
      (score_json->>'nps_score_v3_pillar')::INTEGER AS nps_score_v3_pillar,
      (score_json->>'referral_pillar')::INTEGER AS referral_pillar,
      (score_json->>'payment_pillar')::INTEGER AS payment_pillar,
      (score_json->>'cross_sell_pillar')::INTEGER AS cross_sell_pillar,
      (score_json->>'tenure_pillar')::INTEGER AS tenure_pillar,
      p_snapshot_date AS recorded_date,
      CURRENT_TIMESTAMP AS created_at
    FROM max_last_seen_at mlsa
    INNER JOIN clients c ON c.last_seen_at = mlsa.max_timestamp  -- ✅ FILTRO CRÍTICO: apenas última importação
    CROSS JOIN LATERAL calculate_health_score_v3(c.id) AS score_json
    WHERE DATE(c.last_seen_at) = p_snapshot_date  -- ✅ Filtrar apenas clientes importados neste dia
      AND c.planner IS NOT NULL
      AND c.planner <> '0'
      AND (p_client_ids IS NULL OR c.id = ANY(p_client_ids))
      AND (p_planner_filter = 'all' OR c.planner = p_planner_filter)
      AND (
        p_managers IS NULL 
        OR c.manager = ANY(p_managers)
        OR (include_null_manager AND c.manager IS NULL)
      )
      AND (
        p_mediators IS NULL 
        OR c.mediator = ANY(p_mediators)
        OR (include_null_mediator AND c.mediator IS NULL)
      )
      AND (
        p_leaders IS NULL 
        OR c.leader = ANY(p_leaders)
        OR (include_null_leader AND c.leader IS NULL)
      )
  ),
  -- Verificar se há dados exatos para este dia
  has_exact_data AS (
    SELECT COUNT(*) > 0 AS has_data FROM exact_day_calculated
  ),
  -- Para dias sem dados exatos, usar lógica AS-OF do histórico
  -- FILTRO CRÍTICO: Aplicar mesmo filtro de last_seen_at
  asof_data AS (
    SELECT 
      h.client_id,
      h.client_name,
      h.planner,
      h.manager,
      h.mediator,
      h.leader,
      h.health_score,
      h.health_category,
      h.nps_score_v3_pillar,
      h.referral_pillar,
      h.payment_pillar,
      h.cross_sell_pillar,
      h.tenure_pillar,
      p_snapshot_date AS recorded_date,
      h.created_at
    FROM health_score_history h
    INNER JOIN clients c ON c.id = h.client_id  -- ✅ Qualificado: c.id e h.client_id
    CROSS JOIN max_last_seen_at mlsa
    CROSS JOIN has_exact_data hed
    WHERE hed.has_data = FALSE  -- ✅ Apenas se não houver dados exatos
      AND h.recorded_date < p_snapshot_date
      AND c.last_seen_at = mlsa.max_timestamp  -- ✅ FILTRO CRÍTICO: apenas última importação
      AND h.planner IS NOT NULL
      AND h.planner <> '0'
      AND (p_client_ids IS NULL OR h.client_id = ANY(p_client_ids))
      AND (p_planner_filter = 'all' OR h.planner = p_planner_filter)
      AND (
        p_managers IS NULL 
        OR h.manager = ANY(p_managers)
        OR (include_null_manager AND h.manager IS NULL)
      )
      AND (
        p_mediators IS NULL 
        OR h.mediator = ANY(p_mediators)
        OR (include_null_mediator AND h.mediator IS NULL)
      )
      AND (
        p_leaders IS NULL 
        OR h.leader = ANY(p_leaders)
        OR (include_null_leader AND h.leader IS NULL)
      )
      AND h.recorded_date >= '2025-11-13'::DATE  -- ✅ Filtrar apenas a partir da data mínima confiável
  ),
  -- Para dados AS-OF, garantir que seja usado o registro mais recente quando há múltiplos
  asof_latest AS (
    SELECT DISTINCT ON (ad.client_id)
      ad.client_id,
      ad.client_name,
      ad.planner,
      ad.manager,
      ad.mediator,
      ad.leader,
      ad.health_score,
      ad.health_category,
      ad.nps_score_v3_pillar,
      ad.referral_pillar,
      ad.payment_pillar,
      ad.cross_sell_pillar,
      ad.tenure_pillar,
      ad.recorded_date,
      ad.created_at
    FROM asof_data ad
    ORDER BY ad.client_id, ad.recorded_date DESC, ad.created_at DESC
  ),
  -- Combinar dados exatos (calculados) e AS-OF (histórico), priorizando dados exatos
  combined_data AS (
    SELECT * FROM exact_day_calculated
    UNION ALL
    SELECT * FROM asof_latest
  )
  SELECT
    cd.client_id,
    cd.client_name,
    cd.planner,
    cd.manager,
    cd.mediator,
    cd.leader,
    cd.health_score,
    cd.health_category,
    cd.nps_score_v3_pillar,
    cd.referral_pillar,
    cd.payment_pillar,
    cd.cross_sell_pillar,
    cd.tenure_pillar,
    cd.recorded_date,
    cd.created_at
  FROM combined_data cd
  ORDER BY cd.client_id;
END;
$$ LANGUAGE plpgsql;

