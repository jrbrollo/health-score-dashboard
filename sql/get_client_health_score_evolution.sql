-- ============================================
-- FUNÇÃO: get_client_health_score_evolution
-- ============================================
-- DESCRIÇÃO:
-- Retorna a evolução do Health Score de um cliente específico com Forward Filling.
-- Gera uma série completa de datas entre a data inicial (created_at do cliente ou MIN_HISTORY_DATE)
-- e a data atual, preenchendo lacunas com o último Health Score conhecido.
--
-- PARÂMETROS:
--   p_client_id: UUID do cliente
--
-- RETORNO:
--   Tabela com recorded_date, health_score, health_category e outros campos relevantes
--   Ordenada por data crescente, com Forward Filling aplicado
--
-- USO:
--   SELECT * FROM get_client_health_score_evolution('uuid-do-cliente'::UUID);

CREATE OR REPLACE FUNCTION get_client_health_score_evolution(
  p_client_id UUID
) RETURNS TABLE (
  recorded_date DATE,
  health_score INTEGER,
  health_category TEXT,
  nps_score_v3_pillar INTEGER,
  referral_pillar INTEGER,
  payment_pillar INTEGER,
  cross_sell_pillar INTEGER,
  tenure_pillar INTEGER,
  client_name TEXT,
  planner TEXT,
  created_at TIMESTAMPTZ,
  is_forward_filled BOOLEAN -- Indica se o registro foi preenchido pelo Forward Filling
) AS $$
DECLARE
  v_client_created_at DATE;
  v_client_last_seen_at DATE;
  v_start_date DATE;
  v_end_date DATE;
  v_min_history_date DATE := '2025-11-13'::DATE; -- Data mínima confiável
BEGIN
  -- Validar que cliente existe
  SELECT 
    DATE(c.created_at),
    DATE(c.last_seen_at)
  INTO 
    v_client_created_at,
    v_client_last_seen_at
  FROM clients c
  WHERE c.id = p_client_id;
  
  IF v_client_created_at IS NULL THEN
    RAISE EXCEPTION 'Cliente não encontrado: %', p_client_id;
  END IF;
  
  -- Determinar data inicial: usar a mais recente entre created_at e MIN_HISTORY_DATE
  -- Se o cliente foi criado antes de MIN_HISTORY_DATE, começar de MIN_HISTORY_DATE
  v_start_date := GREATEST(v_client_created_at, v_min_history_date);
  
  -- Data final: SEMPRE usar CURRENT_DATE (não permitir datas futuras)
  v_end_date := CURRENT_DATE;
  
  -- Validar que start_date <= end_date
  IF v_start_date > v_end_date THEN
    RETURN;
  END IF;
  
  RETURN QUERY
  WITH 
  -- Gerar série de datas entre start_date e CURRENT_DATE (limitar para evitar datas futuras)
  dates_series AS (
    SELECT generate_series(v_start_date, CURRENT_DATE, interval '1 day')::date AS day
  ),
  -- Calcular score em tempo real para CURRENT_DATE usando função centralizada
  -- CORREÇÃO: Usar calculate_health_score_v3() em vez de código duplicado (~150 linhas eliminadas)
  current_day_calculated AS (
    SELECT 
      CURRENT_DATE AS recorded_date,
      (score_json->>'health_score')::INTEGER AS health_score,
      (score_json->>'health_category')::TEXT AS health_category,
      (score_json->>'nps_score_v3_pillar')::INTEGER AS nps_score_v3_pillar,
      (score_json->>'referral_pillar')::INTEGER AS referral_pillar,
      (score_json->>'payment_pillar')::INTEGER AS payment_pillar,
      (score_json->>'cross_sell_pillar')::INTEGER AS cross_sell_pillar,
      (score_json->>'tenure_pillar')::INTEGER AS tenure_pillar,
      c.name AS client_name,
      c.planner,
      CURRENT_TIMESTAMP AS created_at,
      FALSE AS is_forward_filled
    FROM clients c
    CROSS JOIN LATERAL calculate_health_score_v3(c.id) AS score_json
    WHERE c.id = p_client_id
  ),
  -- Buscar histórico real do cliente (apenas registros existentes, EXCETO CURRENT_DATE)
  -- CURRENT_DATE será calculado em tempo real pela CTE current_day_calculated
  real_history AS (
    SELECT 
      h.recorded_date,
      h.health_score,
      h.health_category,
      h.nps_score_v3_pillar,
      h.referral_pillar,
      h.payment_pillar,
      h.cross_sell_pillar,
      h.tenure_pillar,
      h.client_name,
      h.planner,
      h.created_at,
      FALSE AS is_forward_filled
    FROM health_score_history h
    WHERE h.client_id = p_client_id
      AND h.recorded_date >= v_start_date
      AND h.recorded_date < CURRENT_DATE -- ✅ EXCLUIR CURRENT_DATE (será calculado em tempo real)
      AND h.recorded_date >= v_min_history_date -- Garantir que não usa dados anteriores à data mínima
    ORDER BY h.recorded_date ASC
  ),
  -- Aplicar Forward Filling: para cada dia sem dados, usar o último Health Score conhecido
  -- OTIMIZAÇÃO: Usar LATERAL JOIN para buscar o último registro conhecido uma única vez por dia
  -- CORREÇÃO: Para CURRENT_DATE, usar score calculado em tempo real (não histórico)
  filled_history AS (
    SELECT 
      d.day AS recorded_date,
      -- Para CURRENT_DATE, usar score calculado em tempo real; senão usar histórico ou Forward Fill
      CASE 
        WHEN d.day = CURRENT_DATE THEN cdc.health_score
        ELSE COALESCE(
          rh.health_score,
          last_known.health_score
        )
      END AS health_score,
      CASE 
        WHEN d.day = CURRENT_DATE THEN cdc.health_category
        ELSE COALESCE(
          rh.health_category,
          last_known.health_category
        )
      END AS health_category,
      CASE 
        WHEN d.day = CURRENT_DATE THEN cdc.nps_score_v3_pillar
        ELSE COALESCE(
          rh.nps_score_v3_pillar,
          last_known.nps_score_v3_pillar
        )
      END AS nps_score_v3_pillar,
      CASE 
        WHEN d.day = CURRENT_DATE THEN cdc.referral_pillar
        ELSE COALESCE(
          rh.referral_pillar,
          last_known.referral_pillar
        )
      END AS referral_pillar,
      CASE 
        WHEN d.day = CURRENT_DATE THEN cdc.payment_pillar
        ELSE COALESCE(
          rh.payment_pillar,
          last_known.payment_pillar
        )
      END AS payment_pillar,
      CASE 
        WHEN d.day = CURRENT_DATE THEN cdc.cross_sell_pillar
        ELSE COALESCE(
          rh.cross_sell_pillar,
          last_known.cross_sell_pillar
        )
      END AS cross_sell_pillar,
      CASE 
        WHEN d.day = CURRENT_DATE THEN cdc.tenure_pillar
        ELSE COALESCE(
          rh.tenure_pillar,
          last_known.tenure_pillar
        )
      END AS tenure_pillar,
      CASE 
        WHEN d.day = CURRENT_DATE THEN cdc.client_name
        ELSE COALESCE(
          rh.client_name,
          last_known.client_name,
          (SELECT c1.name FROM clients c1 WHERE c1.id = p_client_id)
        )
      END AS client_name,
      CASE 
        WHEN d.day = CURRENT_DATE THEN cdc.planner
        ELSE COALESCE(
          rh.planner,
          last_known.planner,
          (SELECT c2.planner FROM clients c2 WHERE c2.id = p_client_id)
        )
      END AS planner,
      CASE 
        WHEN d.day = CURRENT_DATE THEN cdc.created_at
        ELSE COALESCE(
          rh.created_at,
          last_known.created_at,
          CURRENT_TIMESTAMP
        )
      END AS created_at,
      -- Marcar se foi preenchido pelo Forward Filling (não para CURRENT_DATE calculado)
      CASE 
        WHEN d.day = CURRENT_DATE THEN FALSE
        ELSE (rh.recorded_date IS NULL)
      END AS is_forward_filled
    FROM dates_series d
    LEFT JOIN real_history rh ON rh.recorded_date = d.day
    LEFT JOIN current_day_calculated cdc ON d.day = CURRENT_DATE -- JOIN para CURRENT_DATE calculado
    -- LATERAL JOIN: buscar o último registro conhecido antes desta data (apenas se não houver registro exato)
    LEFT JOIN LATERAL (
      SELECT 
        h2.health_score,
        h2.health_category,
        h2.nps_score_v3_pillar,
        h2.referral_pillar,
        h2.payment_pillar,
        h2.cross_sell_pillar,
        h2.tenure_pillar,
        h2.client_name,
        h2.planner,
        h2.created_at
      FROM health_score_history h2
      WHERE h2.client_id = p_client_id
        AND h2.recorded_date < d.day
        AND h2.recorded_date >= v_min_history_date
      ORDER BY h2.recorded_date DESC, h2.created_at DESC
      LIMIT 1
    ) last_known ON rh.recorded_date IS NULL AND d.day < CURRENT_DATE -- Apenas buscar se não houver registro exato E não for CURRENT_DATE
  )
  SELECT
    fh.recorded_date,
    fh.health_score,
    fh.health_category,
    fh.nps_score_v3_pillar,
    fh.referral_pillar,
    fh.payment_pillar,
    fh.cross_sell_pillar,
    fh.tenure_pillar,
    fh.client_name,
    fh.planner,
    fh.created_at,
    fh.is_forward_filled
  FROM filled_history fh
  -- Filtrar apenas registros que têm pelo menos um valor válido (não são completamente NULL)
  -- E limitar até CURRENT_DATE para evitar datas futuras
  WHERE (fh.health_score IS NOT NULL OR fh.health_category IS NOT NULL)
    AND fh.recorded_date <= CURRENT_DATE -- ✅ FILTRO CRÍTICO: evitar datas futuras
  ORDER BY fh.recorded_date ASC;
END;
$$ LANGUAGE plpgsql;

