import fs from 'fs';
import path from 'path';

// Ler o arquivo CSV do dia 13/11
const csvPath = path.join(process.cwd(), '..', 'modelo health score brauna v3 13.11.csv');
const csvContent = fs.readFileSync(csvPath, 'utf-8');

// Parse manual do CSV (delimitador ;)
const lines = csvContent.split('\n').filter(line => line.trim());
const headers = lines[0].split(';').map(h => h.trim());
const records = [];

for (let i = 1; i < lines.length; i++) {
  const values = lines[i].split(';');
  const record = {};
  headers.forEach((header, index) => {
    record[header] = values[index] ? values[index].trim() : '';
  });
  records.push(record);
}

console.log(`📊 Total de registros na planilha do 13/11: ${records.length}\n`);

// Criar lista de clientes da planilha (nome + planejador como chave única)
const clientsFromCsv = new Set();
const clientDetails = [];

for (const record of records) {
  const name = record['Clientes']?.trim();
  const planner = record['Planejador']?.trim();
  
  if (name && name !== '0' && planner && planner !== '0') {
    const key = `${name.toLowerCase()}|${planner.toLowerCase()}`;
    clientsFromCsv.add(key);
    clientDetails.push({ name, planner, key });
  }
}

console.log(`✅ Clientes únicos na planilha: ${clientsFromCsv.size}\n`);

// Gerar SQL para buscar IDs dos clientes no banco
console.log('📝 Gerando script SQL para criar histórico...\n');

// Criar arquivo SQL
const sqlContent = `-- Script para criar histórico do 13/11 APENAS para clientes da planilha
-- Total de clientes na planilha: ${clientsFromCsv.size}
-- Gerado automaticamente a partir da planilha CSV

-- Deletar histórico atual do 13/11
DELETE FROM health_score_history
WHERE recorded_date = '2025-11-13';

-- Criar histórico apenas para clientes da planilha
DO $$
DECLARE
  v_client RECORD;
  v_count INTEGER := 0;
  v_not_found INTEGER := 0;
  v_client_keys TEXT[] := ARRAY[
${clientDetails.map(c => `    '${c.key.replace(/'/g, "''")}'`).join(',\n')}
  ];
BEGIN
  -- Buscar clientes que estão na planilha
  FOR v_client IN 
    SELECT DISTINCT c.id
    FROM clients c
    WHERE LOWER(TRIM(c.name)) || '|' || LOWER(TRIM(c.planner)) = ANY(v_client_keys)
      AND c.name != '0'
      AND c.planner != '0'
  LOOP
    -- Criar histórico
    PERFORM record_health_score_history_v3(v_client.id, '2025-11-13'::DATE);
    v_count := v_count + 1;
    
    IF v_count % 100 = 0 THEN
      RAISE NOTICE 'Processados % clientes...', v_count;
    END IF;
  END LOOP;
  
  -- Verificar quantos não foram encontrados
  SELECT COUNT(*) INTO v_not_found
  FROM unnest(v_client_keys) AS key
  WHERE NOT EXISTS (
    SELECT 1 FROM clients c
    WHERE LOWER(TRIM(c.name)) || '|' || LOWER(TRIM(c.planner)) = key
      AND c.name != '0'
      AND c.planner != '0'
  );
  
  RAISE NOTICE '✅ Total de históricos criados: %', v_count;
  IF v_not_found > 0 THEN
    RAISE NOTICE '⚠️  % clientes da planilha não foram encontrados no banco', v_not_found;
  END IF;
END $$;

-- Verificar resultado
SELECT 
  COUNT(*) as total_historicos,
  COUNT(*) FILTER (WHERE is_spouse = true) as conjuges,
  COUNT(*) FILTER (WHERE is_spouse = false OR is_spouse IS NULL) as nao_conjuges,
  ROUND(AVG(health_score), 2) as media_score,
  COUNT(CASE WHEN health_category = 'Ótimo' THEN 1 END) as otimos,
  COUNT(CASE WHEN health_category = 'Estável' THEN 1 END) as estaveis,
  COUNT(CASE WHEN health_category = 'Atenção' THEN 1 END) as atencao,
  COUNT(CASE WHEN health_category = 'Crítico' THEN 1 END) as criticos
FROM health_score_history
WHERE recorded_date = '2025-11-13';
`;

// Salvar arquivo SQL
const sqlPath = path.join(process.cwd(), 'sql', 'create_history_13_11_from_csv.sql');
fs.writeFileSync(sqlPath, sqlContent);

console.log(`✅ Script SQL gerado: ${sqlPath}`);
console.log(`\n📊 Resumo:`);
console.log(`   - Clientes na planilha: ${clientsFromCsv.size}`);
console.log(`   - Script SQL pronto para execução\n`);

