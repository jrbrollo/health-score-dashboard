-- Extensão para análise temporal do Health Score Dashboard
-- Execute este script APÓS o setup.sql principal

-- Criar tabela para histórico de Health Score
CREATE TABLE IF NOT EXISTS health_score_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  recorded_date DATE NOT NULL,
  
  -- Dados do cliente no momento do registro
  client_name TEXT NOT NULL,
  planner TEXT NOT NULL,
  
  -- Cálculos do Health Score
  health_score INTEGER NOT NULL,
  health_category TEXT NOT NULL,
  
  -- Breakdown detalhado do score
  meeting_engagement INTEGER NOT NULL,
  app_usage INTEGER NOT NULL,
  payment_status INTEGER NOT NULL,
  ecosystem_engagement INTEGER NOT NULL,
  nps_score INTEGER NOT NULL,
  
  -- Dados originais para referência
  last_meeting TEXT NOT NULL,
  has_scheduled_meeting BOOLEAN NOT NULL,
  app_usage_status TEXT NOT NULL,
  payment_status_detail TEXT NOT NULL,
  has_referrals BOOLEAN NOT NULL,
  nps_score_detail TEXT NOT NULL,
  ecosystem_usage TEXT NOT NULL,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraint para evitar duplicatas por cliente por dia
  CONSTRAINT unique_client_date UNIQUE(client_id, recorded_date)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_health_history_client ON health_score_history(client_id);
CREATE INDEX IF NOT EXISTS idx_health_history_date ON health_score_history(recorded_date);
CREATE INDEX IF NOT EXISTS idx_health_history_planner ON health_score_history(planner);
CREATE INDEX IF NOT EXISTS idx_health_history_client_date ON health_score_history(client_id, recorded_date);

-- Função para calcular Health Score (replicada do frontend)
CREATE OR REPLACE FUNCTION calculate_health_score(
  p_last_meeting TEXT,
  p_has_scheduled_meeting BOOLEAN,
  p_app_usage TEXT,
  p_payment_status TEXT,
  p_has_referrals BOOLEAN,
  p_nps_score TEXT,
  p_ecosystem_usage TEXT
) RETURNS JSON AS $$
DECLARE
  meeting_score INTEGER := 0;
  app_score INTEGER := 0;
  payment_score INTEGER := 0;
  ecosystem_score INTEGER := 0;
  nps_score_val INTEGER := 0;
  total_score INTEGER := 0;
  category TEXT := '';
BEGIN
  -- Override rule: 3+ parcelas em atraso = 0
  IF p_payment_status = '3+ parcelas em atraso' THEN
    RETURN json_build_object(
      'total', 0,
      'category', 'Crítico',
      'meeting_engagement', 0,
      'app_usage', 0,
      'payment_status', 0,
      'ecosystem_engagement', 0,
      'nps_score', 0
    );
  END IF;

  -- Cálculo Meeting Engagement (40 pontos máx)
  CASE p_last_meeting
    WHEN '< 30 dias' THEN meeting_score := 30;
    WHEN '31-60 dias' THEN meeting_score := 15;
    WHEN '> 60 dias' THEN meeting_score := -10;
    ELSE meeting_score := 0;
  END CASE;
  
  IF p_has_scheduled_meeting THEN
    meeting_score := meeting_score + 10;
  END IF;

  -- Cálculo App Usage (30 pontos máx)
  CASE p_app_usage
    WHEN 'Acessou e categorizou (15 dias)' THEN app_score := 30;
    WHEN 'Acessou, sem categorização' THEN app_score := 15;
    WHEN 'Sem acesso/categorização (30+ dias)' THEN app_score := -10;
    ELSE app_score := 0;
  END CASE;

  -- Cálculo Payment Status (30 pontos máx)
  CASE p_payment_status
    WHEN 'Pagamento em dia' THEN payment_score := 30;
    WHEN '1 parcela em atraso' THEN payment_score := -5;
    WHEN '2 parcelas em atraso' THEN payment_score := -15;
    ELSE payment_score := 0;
  END CASE;

  -- Cálculo Ecosystem Engagement (15 pontos máx)
  CASE p_ecosystem_usage
    WHEN 'Usou 2+ áreas' THEN ecosystem_score := 10;
    WHEN 'Usou 1 área' THEN ecosystem_score := 5;
    WHEN 'Não usou' THEN ecosystem_score := 0;
    ELSE ecosystem_score := 0;
  END CASE;
  
  IF p_has_referrals THEN
    ecosystem_score := ecosystem_score + 5;
  END IF;

  -- Cálculo NPS (15 pontos máx)
  CASE p_nps_score
    WHEN 'Promotor (9-10)' THEN nps_score_val := 15;
    WHEN 'Neutro (7-8)' THEN nps_score_val := 0;
    WHEN 'Detrator (0-6)' THEN nps_score_val := -15;
    ELSE nps_score_val := 0;
  END CASE;

  -- Total
  total_score := meeting_score + app_score + payment_score + ecosystem_score + nps_score_val;

  -- Categoria
  IF total_score >= 100 THEN category := 'Ótimo';
  ELSIF total_score >= 60 THEN category := 'Estável';
  ELSIF total_score >= 35 THEN category := 'Atenção';
  ELSE category := 'Crítico';
  END IF;

  RETURN json_build_object(
    'total', total_score,
    'category', category,
    'meeting_engagement', meeting_score,
    'app_usage', app_score,
    'payment_status', payment_score,
    'ecosystem_engagement', ecosystem_score,
    'nps_score', nps_score_val
  );
END;
$$ LANGUAGE plpgsql;

-- Função AS-OF: série temporal diária usando o último estado conhecido até cada data
CREATE OR REPLACE FUNCTION get_temporal_analysis_asof(
  start_date DATE,
  end_date DATE,
  planner_filter TEXT DEFAULT 'all',
  managers TEXT[] DEFAULT NULL,
  mediators TEXT[] DEFAULT NULL,
  leaders TEXT[] DEFAULT NULL,
  include_null_manager BOOLEAN DEFAULT FALSE,
  include_null_mediator BOOLEAN DEFAULT FALSE,
  include_null_leader BOOLEAN DEFAULT FALSE
) RETURNS TABLE (
  recorded_date DATE,
  planner TEXT,
  total_clients BIGINT,
  avg_health_score NUMERIC,
  excellent_count BIGINT,
  stable_count BIGINT,
  warning_count BIGINT,
  critical_count BIGINT,
  avg_meeting_engagement NUMERIC,
  avg_app_usage NUMERIC,
  avg_payment_status NUMERIC,
  avg_ecosystem_engagement NUMERIC,
  avg_nps_score NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH dates AS (
    SELECT generate_series(start_date, end_date, interval '1 day')::date AS day
  ),
  last_snapshots AS (
    SELECT 
      d.day AS recorded_date,
      s.planner,
      s.manager,
      s.mediator,
      s.leader,
      s.health_score,
      s.health_category,
      s.meeting_engagement,
      s.app_usage,
      s.payment_status,
      s.ecosystem_engagement,
      s.nps_score
    FROM dates d
    JOIN LATERAL (
      SELECT DISTINCT ON (h.client_id)
        h.client_id,
        h.planner,
        h.manager,
        h.mediator,
        h.leader,
        h.health_score,
        h.health_category,
        h.meeting_engagement,
        h.app_usage,
        h.payment_status,
        h.ecosystem_engagement,
        h.nps_score,
        h.recorded_date
      FROM health_score_history h
      WHERE h.recorded_date <= d.day
      ORDER BY h.client_id, h.recorded_date DESC
    ) s ON true
    WHERE (planner_filter = 'all' OR s.planner = planner_filter)
      AND s.planner <> '0'
      AND (
        managers IS NULL 
        OR s.manager = ANY(managers)
        OR (include_null_manager AND s.manager IS NULL)
      )
      AND (
        mediators IS NULL 
        OR s.mediator = ANY(mediators)
        OR (include_null_mediator AND s.mediator IS NULL)
      )
      AND (
        leaders IS NULL 
        OR s.leader = ANY(leaders)
        OR (include_null_leader AND s.leader IS NULL)
      )
  )
  SELECT 
    recorded_date,
    CASE WHEN planner_filter = 'all' THEN 'all' ELSE planner END AS planner,
    COUNT(*) AS total_clients,
    ROUND(AVG(health_score), 2) AS avg_health_score,
    COUNT(CASE WHEN health_category = 'Ótimo' THEN 1 END) AS excellent_count,
    COUNT(CASE WHEN health_category = 'Estável' THEN 1 END) AS stable_count,
    COUNT(CASE WHEN health_category = 'Atenção' THEN 1 END) AS warning_count,
    COUNT(CASE WHEN health_category = 'Crítico' THEN 1 END) AS critical_count,
    ROUND(AVG(meeting_engagement), 2) AS avg_meeting_engagement,
    ROUND(AVG(app_usage), 2) AS avg_app_usage,
    ROUND(AVG(payment_status), 2) AS avg_payment_status,
    ROUND(AVG(ecosystem_engagement), 2) AS avg_ecosystem_engagement,
    ROUND(AVG(nps_score), 2) AS avg_nps_score
  FROM last_snapshots
  GROUP BY recorded_date, CASE WHEN planner_filter = 'all' THEN 'all' ELSE planner END
  ORDER BY recorded_date;
END;
$$ LANGUAGE plpgsql;

-- Função para registrar Health Score histórico
CREATE OR REPLACE FUNCTION record_health_score_history(client_row clients)
RETURNS VOID AS $$
DECLARE
  health_calc JSON;
  record_date DATE := CURRENT_DATE;
BEGIN
  -- Calcular Health Score
  health_calc := calculate_health_score(
    client_row.last_meeting,
    client_row.has_scheduled_meeting,
    client_row.app_usage,
    client_row.payment_status,
    client_row.has_referrals,
    client_row.nps_score,
    client_row.ecosystem_usage
  );

  -- Inserir ou atualizar registro histórico (upsert)
  INSERT INTO health_score_history (
    client_id,
    recorded_date,
    client_name,
    planner,
    health_score,
    health_category,
    meeting_engagement,
    app_usage,
    payment_status,
    ecosystem_engagement,
    nps_score,
    last_meeting,
    has_scheduled_meeting,
    app_usage_status,
    payment_status_detail,
    has_referrals,
    nps_score_detail,
    ecosystem_usage
  ) VALUES (
    client_row.id,
    record_date,
    client_row.name,
    client_row.planner,
    (health_calc->>'total')::INTEGER,
    health_calc->>'category',
    (health_calc->>'meeting_engagement')::INTEGER,
    (health_calc->>'app_usage')::INTEGER,
    (health_calc->>'payment_status')::INTEGER,
    (health_calc->>'ecosystem_engagement')::INTEGER,
    (health_calc->>'nps_score')::INTEGER,
    client_row.last_meeting,
    client_row.has_scheduled_meeting,
    client_row.app_usage,
    client_row.payment_status,
    client_row.has_referrals,
    client_row.nps_score,
    client_row.ecosystem_usage
  )
  ON CONFLICT (client_id, recorded_date) 
  DO UPDATE SET
    client_name = EXCLUDED.client_name,
    planner = EXCLUDED.planner,
    health_score = EXCLUDED.health_score,
    health_category = EXCLUDED.health_category,
    meeting_engagement = EXCLUDED.meeting_engagement,
    app_usage = EXCLUDED.app_usage,
    payment_status = EXCLUDED.payment_status,
    ecosystem_engagement = EXCLUDED.ecosystem_engagement,
    nps_score = EXCLUDED.nps_score,
    last_meeting = EXCLUDED.last_meeting,
    has_scheduled_meeting = EXCLUDED.has_scheduled_meeting,
    app_usage_status = EXCLUDED.app_usage_status,
    payment_status_detail = EXCLUDED.payment_status_detail,
    has_referrals = EXCLUDED.has_referrals,
    nps_score_detail = EXCLUDED.nps_score_detail,
    ecosystem_usage = EXCLUDED.ecosystem_usage,
    created_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Trigger para registrar histórico automaticamente
CREATE OR REPLACE FUNCTION trigger_record_health_history()
RETURNS TRIGGER AS $$
BEGIN
  -- Registrar para INSERT e UPDATE
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    PERFORM record_health_score_history(NEW);
    RETURN NEW;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Criar trigger
DROP TRIGGER IF EXISTS clients_health_history_trigger ON clients;
CREATE TRIGGER clients_health_history_trigger
  AFTER INSERT OR UPDATE ON clients
  FOR EACH ROW
  EXECUTE FUNCTION trigger_record_health_history();

-- Habilitar RLS na nova tabela
ALTER TABLE health_score_history ENABLE ROW LEVEL SECURITY;

-- Política para permitir operações (idempotente)
DROP POLICY IF EXISTS "Enable all operations for health_score_history" ON health_score_history;
CREATE POLICY "Enable all operations for health_score_history" ON health_score_history
FOR ALL USING (true);

-- View para facilitar consultas de análise temporal
CREATE OR REPLACE VIEW temporal_health_analysis AS
SELECT 
  recorded_date,
  planner,
  COUNT(*) as total_clients,
  ROUND(AVG(health_score), 2) as avg_health_score,
  COUNT(CASE WHEN health_category = 'Ótimo' THEN 1 END) as excellent_count,
  COUNT(CASE WHEN health_category = 'Estável' THEN 1 END) as stable_count,
  COUNT(CASE WHEN health_category = 'Atenção' THEN 1 END) as warning_count,
  COUNT(CASE WHEN health_category = 'Crítico' THEN 1 END) as critical_count,
  ROUND(AVG(meeting_engagement), 2) as avg_meeting_engagement,
  ROUND(AVG(app_usage), 2) as avg_app_usage,
  ROUND(AVG(payment_status), 2) as avg_payment_status,
  ROUND(AVG(ecosystem_engagement), 2) as avg_ecosystem_engagement,
  ROUND(AVG(nps_score), 2) as avg_nps_score
FROM health_score_history
WHERE planner <> '0' AND client_name <> '0'
GROUP BY recorded_date, planner
ORDER BY recorded_date DESC, planner;

-- Função para análise temporal agregada (todos os planejadores)
CREATE OR REPLACE FUNCTION get_aggregated_temporal_analysis(
  start_date DATE,
  end_date DATE
) RETURNS TABLE (
  recorded_date DATE,
  total_clients BIGINT,
  avg_health_score NUMERIC,
  excellent_count BIGINT,
  stable_count BIGINT,
  warning_count BIGINT,
  critical_count BIGINT,
  avg_meeting_engagement NUMERIC,
  avg_app_usage NUMERIC,
  avg_payment_status NUMERIC,
  avg_ecosystem_engagement NUMERIC,
  avg_nps_score NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    h.recorded_date,
    COUNT(*) as total_clients,
    ROUND(AVG(h.health_score), 2) as avg_health_score,
    COUNT(CASE WHEN h.health_category = 'Ótimo' THEN 1 END) as excellent_count,
    COUNT(CASE WHEN h.health_category = 'Estável' THEN 1 END) as stable_count,
    COUNT(CASE WHEN h.health_category = 'Atenção' THEN 1 END) as warning_count,
    COUNT(CASE WHEN h.health_category = 'Crítico' THEN 1 END) as critical_count,
    ROUND(AVG(h.meeting_engagement), 2) as avg_meeting_engagement,
    ROUND(AVG(h.app_usage), 2) as avg_app_usage,
    ROUND(AVG(h.payment_status), 2) as avg_payment_status,
    ROUND(AVG(h.ecosystem_engagement), 2) as avg_ecosystem_engagement,
    ROUND(AVG(h.nps_score), 2) as avg_nps_score
  FROM health_score_history h
  WHERE h.recorded_date >= start_date AND h.recorded_date <= end_date
    AND h.planner <> '0' AND h.client_name <> '0'
  GROUP BY h.recorded_date
  ORDER BY h.recorded_date;
END;
$$ LANGUAGE plpgsql;

-- Função para popular histórico de clientes existentes
CREATE OR REPLACE FUNCTION backfill_health_score_history()
RETURNS INTEGER AS $$
DECLARE
  client_record clients%ROWTYPE;
  records_created INTEGER := 0;
BEGIN
  -- Iterar sobre todos os clientes existentes
  FOR client_record IN SELECT * FROM clients LOOP
    -- Registrar histórico para cada cliente
    PERFORM record_health_score_history(client_record);
    records_created := records_created + 1;
  END LOOP;
  
  RETURN records_created;
END;
$$ LANGUAGE plpgsql;

-- Verificar se tudo foi criado
SELECT 
  'Tables' as type, 
  table_name 
FROM information_schema.tables 
WHERE table_name IN ('health_score_history')
UNION ALL
SELECT 
  'Views' as type,
  table_name
FROM information_schema.views
WHERE table_name IN ('temporal_health_analysis')
UNION ALL
SELECT 
  'Functions' as type,
  routine_name
FROM information_schema.routines
WHERE routine_name IN (
  'calculate_health_score', 
  'record_health_score_history', 
  'trigger_record_health_history',
  'get_aggregated_temporal_analysis',
  'backfill_health_score_history'
);
