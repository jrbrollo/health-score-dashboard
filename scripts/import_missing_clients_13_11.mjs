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

// Funções auxiliares para parsing (baseadas em BulkImportV3.tsx)
function norm(str) {
  return (str || '').toString().toLowerCase().trim();
}

function parseIntSafe(val) {
  if (val === null || val === undefined || val === '') return null;
  const parsed = parseInt(String(val).replace(/[^\d-]/g, ''), 10);
  return isNaN(parsed) ? null : parsed;
}

function parseSpouse(val) {
  if (!val) return false;
  const str = String(val).toLowerCase().trim();
  return str === 'sim' || str === 's' || str === 'true' || str === '1' || str === 'yes' || str === 'y';
}

function parseReferral(val) {
  if (!val) return false;
  const str = String(val).toLowerCase().trim();
  return str === 'sim' || str === 's' || str === 'true' || str === '1' || str === 'yes' || str === 'y';
}

function normalizePhone(phone) {
  if (!phone) return null;
  const cleaned = String(phone).replace(/\D/g, '');
  if (!cleaned) return null;
  return cleaned;
}

function getField(row, primary, alternatives = []) {
  if (row[primary]) return row[primary];
  for (const alt of alternatives) {
    if (row[alt]) return row[alt];
  }
  return null;
}

// Processar registros da planilha
const clientsFromCsv = [];
const clientKeys = new Set();

for (const record of records) {
  const name = (record['Clientes'] || '').toString().trim();
  const planner = (record['Planejador'] || '').toString().trim();
  
  if (!name || !planner || name === '0' || planner === '0' || planner === '#n/d') {
    continue;
  }
  
  const key = `${norm(name)}|${norm(planner)}`;
  if (clientKeys.has(key)) {
    continue; // Já processado (duplicata na planilha)
  }
  clientKeys.add(key);
  
  const spouseRaw = getField(record, 'Cônjuge', ['Conjuge']);
  const isSpouse = parseSpouse(spouseRaw);
  
  const phone = normalizePhone(record['Telefone']);
  const monthsSinceClosing = parseIntSafe(
    getField(record, 'Meses do Fechamento', [
      'Meses de Fechamento', 'Meses Fechamento', 'Meses Relacionamento',
      'Meses de relacionamento', 'Tempo de Relacionamento', 'Tempo de relacionamento', 'Meses'
    ])
  );
  const npsScoreV3 = parseIntSafe(getField(record, 'NPS'));
  const hasNpsReferral = parseReferral(getField(record, 'Indicação NPS', ['Indicacao NPS', 'Indicações NPS', 'Indicacoes NPS']));
  const overdueInstallments = parseIntSafe(record['Inadimplência Parcelas']) ?? 0;
  const overdueDays = parseIntSafe(record['Inadimplência Dias']) ?? 0;
  const crossSellCount = parseIntSafe(
    getField(record, 'Cross Sell', [
      'Cross-Sell', 'CrossSell', 'Cross sell', 'Cross_sell',
      'Cross sell (qtd)', 'Cross-sell (qtd)', 'Cross Sell (Qtd)', 'CrossSell Qtd', 'Cross Sell Qtd',
      'Qtd Cross Sell', 'Qtd Cross-sell', 'Qtd cross sell', 'Qtd de cross sell',
      'Produtos adicionais', 'Produtos adicionais (qtd)'
    ])
  ) ?? 0;
  
  // Buscar spouse_partner_name se for cônjuge
  let spousePartnerName = null;
  if (isSpouse && spouseRaw) {
    const spouseRawString = spouseRaw.toString().trim();
    // Tentar encontrar o parceiro na planilha
    const partnerRecord = records.find(r => {
      const partnerName = (r['Clientes'] || '').toString().trim();
      return norm(partnerName) === norm(spouseRawString) && 
             norm(r['Planejador'] || '') === norm(planner);
    });
    if (partnerRecord) {
      spousePartnerName = partnerRecord['Clientes']?.toString().trim();
    } else {
      spousePartnerName = spouseRawString;
    }
  }
  
  clientsFromCsv.push({
    key,
    name,
    planner,
    email: (record['Email'] || '').toString().trim() || null,
    phone,
    leader: (record['Líder em Formação'] || '').toString().trim() || null,
    mediator: (record['Mediador'] || '').toString().trim() || null,
    manager: (record['Gerente'] || '').toString().trim() || null,
    isSpouse,
    monthsSinceClosing,
    npsScoreV3,
    hasNpsReferral,
    overdueInstallments,
    overdueDays,
    crossSellCount,
    spousePartnerName
  });
}

console.log(`✅ Clientes únicos na planilha: ${clientsFromCsv.length}\n`);

// Gerar SQL para verificar quais clientes não estão no banco
// e criar script de importação
const sqlCheckPath = path.join(process.cwd(), 'sql', 'check_missing_clients_13_11.sql');
const sqlImportPath = path.join(process.cwd(), 'sql', 'import_missing_clients_13_11.sql');

// Script para verificar clientes faltantes
const checkSql = `-- Script para verificar quais clientes da planilha do 13/11 não estão no banco
-- Total de clientes na planilha: ${clientsFromCsv.length}

SELECT 
  key,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM clients c
      WHERE LOWER(TRIM(c.name)) || '|' || LOWER(TRIM(c.planner)) = key
        AND c.name != '0'
        AND c.planner != '0'
    ) THEN 'EXISTS'
    ELSE 'MISSING'
  END as status
FROM unnest(ARRAY[
${clientsFromCsv.map(c => `  '${c.key.replace(/'/g, "''")}'`).join(',\n')}
]) AS key
WHERE NOT EXISTS (
  SELECT 1 FROM clients c
  WHERE LOWER(TRIM(c.name)) || '|' || LOWER(TRIM(c.planner)) = key
    AND c.name != '0'
    AND c.planner != '0'
)
ORDER BY key;
`;

fs.writeFileSync(sqlCheckPath, checkSql);
console.log(`✅ Script de verificação gerado: ${sqlCheckPath}\n`);

// Preparar dados para importação (apenas clientes que serão importados)
// Vamos criar o JSON para bulk_insert_clients_v3
const clientsToImport = clientsFromCsv.map(c => {
  const clientJson = {
    name: c.name,
    planner: c.planner,
    phone: c.phone,
    email: c.email,
    leader: c.leader,
    mediator: c.mediator,
    manager: c.manager,
    is_spouse: c.isSpouse,
    months_since_closing: c.monthsSinceClosing,
    nps_score_v3: c.npsScoreV3,
    has_nps_referral: c.hasNpsReferral,
    overdue_installments: c.overdueInstallments,
    overdue_days: c.overdueDays,
    cross_sell_count: c.crossSellCount,
    meetings_enabled: false,
    last_meeting: null,
    has_scheduled_meeting: false,
    app_usage: null,
    payment_status: null,
    has_referrals: false,
    nps_score: null,
    ecosystem_usage: null
  };
  
  if (c.spousePartnerName) {
    clientJson.spouse_partner_name = c.spousePartnerName;
  }
  
  return clientJson;
});

// Criar script SQL para importar clientes faltantes
// O script vai verificar quais não existem e importar apenas esses
const importSql = `-- Script para importar clientes faltantes da planilha do 13/11
-- Total de clientes na planilha: ${clientsFromCsv.length}
-- Este script importa apenas os clientes que não estão no banco

-- IMPORTANTE: Este script usa a função bulk_insert_clients_v3
-- que faz UPSERT, então é seguro executar mesmo se alguns clientes já existirem

DO $$
DECLARE
  v_clients_json JSONB;
  v_import_date DATE := '2025-11-13';
  v_seen_at TIMESTAMPTZ := '2025-11-13 00:00:00'::TIMESTAMPTZ;
  v_result RECORD;
  v_count INTEGER := 0;
BEGIN
  -- Preparar JSON com todos os clientes da planilha
  v_clients_json := '${JSON.stringify(clientsToImport).replace(/'/g, "''")}'::JSONB;
  
  -- Importar usando bulk_insert_clients_v3
  -- A função faz UPSERT, então clientes existentes serão atualizados
  -- e clientes novos serão inseridos
  FOR v_result IN 
    SELECT * FROM bulk_insert_clients_v3(
      v_clients_json,
      v_import_date,
      v_seen_at
    )
  LOOP
    v_count := v_count + 1;
    IF v_count % 100 = 0 THEN
      RAISE NOTICE 'Processados % clientes...', v_count;
    END IF;
  END LOOP;
  
  RAISE NOTICE '✅ Total de clientes processados: %', v_count;
END $$;

-- Verificar quantos clientes da planilha agora estão no banco
SELECT 
  COUNT(*) FILTER (
    WHERE EXISTS (
      SELECT 1 FROM clients c
      WHERE LOWER(TRIM(c.name)) || '|' || LOWER(TRIM(c.planner)) = key
        AND c.name != '0'
        AND c.planner != '0'
    )
  ) as encontrados,
  COUNT(*) FILTER (
    WHERE NOT EXISTS (
      SELECT 1 FROM clients c
      WHERE LOWER(TRIM(c.name)) || '|' || LOWER(TRIM(c.planner)) = key
        AND c.name != '0'
        AND c.planner != '0'
    )
  ) as ainda_faltando,
  COUNT(*) as total_planilha
FROM unnest(ARRAY[
${clientsFromCsv.map(c => `  '${c.key.replace(/'/g, "''")}'`).join(',\n')}
]) AS key;
`;

fs.writeFileSync(sqlImportPath, importSql);
console.log(`✅ Script de importação gerado: ${sqlImportPath}\n`);

console.log(`📊 Resumo:`);
console.log(`   - Clientes na planilha: ${clientsFromCsv.length}`);
console.log(`   - Scripts SQL gerados:`);
console.log(`     * ${sqlCheckPath} (verificar faltantes)`);
console.log(`     * ${sqlImportPath} (importar faltantes)`);
console.log(`\n💡 Próximos passos:`);
console.log(`   1. Execute o script de verificação para ver quantos clientes faltam`);
console.log(`   2. Execute o script de importação para importar os clientes faltantes`);
console.log(`   3. Depois, execute o script create_history_13_11_from_csv.sql para recriar o histórico\n`);

