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

// Funções auxiliares
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
    continue;
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
  
  let spousePartnerName = null;
  if (isSpouse && spouseRaw) {
    const spouseRawString = spouseRaw.toString().trim();
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
    name,
    planner,
    email: (record['Email'] || '').toString().trim() || null,
    phone,
    leader: (record['Líder em Formação'] || '').toString().trim() || null,
    mediator: (record['Mediador'] || '').toString().trim() || null,
    manager: (record['Gerente'] || '').toString().trim() || null,
    is_spouse: isSpouse,
    months_since_closing: monthsSinceClosing,
    nps_score_v3: npsScoreV3,
    has_nps_referral: hasNpsReferral,
    overdue_installments: overdueInstallments,
    overdue_days: overdueDays,
    cross_sell_count: crossSellCount,
    meetings_enabled: false,
    last_meeting: null,
    has_scheduled_meeting: false,
    app_usage: null,
    payment_status: null,
    has_referrals: false,
    nps_score: null,
    ecosystem_usage: null,
    spouse_partner_name: spousePartnerName
  });
}

console.log(`📊 Total de clientes únicos na planilha: ${clientsFromCsv.length}\n`);

// Dividir em lotes de 200
const BATCH_SIZE = 200;
const batches = [];
for (let i = 0; i < clientsFromCsv.length; i += BATCH_SIZE) {
  batches.push(clientsFromCsv.slice(i, i + BATCH_SIZE));
}

console.log(`📦 Dividido em ${batches.length} lotes de até ${BATCH_SIZE} clientes cada\n`);

// Gerar SQL para cada lote
const sqlBatches = batches.map((batch, idx) => {
  const batchJson = JSON.stringify(batch);
  return {
    batchNum: idx + 1,
    totalBatches: batches.length,
    sql: `-- Lote ${idx + 1} de ${batches.length} (${batch.length} clientes)
DO $$
DECLARE
  v_import_date DATE := '2025-11-13';
  v_seen_at TIMESTAMPTZ := '2025-11-13 00:00:00'::TIMESTAMPTZ;
  v_result RECORD;
  v_count INTEGER := 0;
BEGIN
  RAISE NOTICE 'Processando lote ${idx + 1} de ${batches.length}...';
  
  FOR v_result IN 
    SELECT * FROM bulk_insert_clients_v3(
      '${batchJson.replace(/'/g, "''")}'::JSONB,
      v_import_date,
      v_seen_at
    )
  LOOP
    v_count := v_count + 1;
  END LOOP;
  
  RAISE NOTICE '✅ Lote ${idx + 1} concluído. Total: % clientes', v_count;
END $$;`
  };
});

// Salvar cada lote em um arquivo separado
sqlBatches.forEach(({ batchNum, sql }) => {
  const filePath = path.join(process.cwd(), 'sql', `import_batch_${batchNum}_of_${batches.length}.sql`);
  fs.writeFileSync(filePath, sql);
  console.log(`✅ Lote ${batchNum} salvo: ${filePath}`);
});

console.log(`\n📝 ${batches.length} arquivos SQL gerados. Execute-os em ordem no Supabase.\n`);

