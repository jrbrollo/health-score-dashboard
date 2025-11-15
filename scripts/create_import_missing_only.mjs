import fs from 'fs';
import path from 'path';

// Este script cria um SQL que primeiro verifica quais clientes faltam
// e depois importa apenas esses, usando dados da planilha

const csvPath = path.join(process.cwd(), '..', 'modelo health score brauna v3 13.11.csv');
const csvContent = fs.readFileSync(csvPath, 'utf-8');

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

// Funções auxiliares (mesmas do script anterior)
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

// Processar registros
const clientsMap = new Map();

for (const record of records) {
  const name = (record['Clientes'] || '').toString().trim();
  const planner = (record['Planejador'] || '').toString().trim();
  
  if (!name || !planner || name === '0' || planner === '0' || planner === '#n/d') {
    continue;
  }
  
  const key = `${norm(name)}|${norm(planner)}`;
  if (clientsMap.has(key)) {
    continue;
  }
  
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
  
  clientsMap.set(key, {
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

console.log(`✅ Clientes únicos na planilha: ${clientsMap.size}\n`);

// Criar script SQL que importa todos os clientes (a função faz UPSERT, então é seguro)
const clientsArray = Array.from(clientsMap.values());
const BATCH_SIZE = 200;
const batches = [];
for (let i = 0; i < clientsArray.length; i += BATCH_SIZE) {
  batches.push(clientsArray.slice(i, i + BATCH_SIZE));
}

const sqlPath = path.join(process.cwd(), 'sql', 'import_all_clients_13_11_final.sql');

const sql = `-- Script para importar TODOS os clientes da planilha do 13/11
-- Total: ${clientsArray.length} clientes em ${batches.length} lotes
-- A função bulk_insert_clients_v3 faz UPSERT, então é seguro executar

DO $$
DECLARE
  v_import_date DATE := '2025-11-13';
  v_seen_at TIMESTAMPTZ := '2025-11-13 00:00:00'::TIMESTAMPTZ;
  v_result RECORD;
  v_total_count INTEGER := 0;
BEGIN
${batches.map((batch, idx) => {
  const batchJson = batch.map(c => {
    const obj = {
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
      obj.spouse_partner_name = c.spousePartnerName;
    }
    return obj;
  });
  const jsonStr = JSON.stringify(batchJson).replace(/'/g, "''");
  return `  -- Lote ${idx + 1}/${batches.length} (${batch.length} clientes)
  RAISE NOTICE 'Processando lote ${idx + 1} de ${batches.length}...';
  FOR v_result IN 
    SELECT * FROM bulk_insert_clients_v3(
      '${jsonStr}'::JSONB,
      v_import_date,
      v_seen_at
    )
  LOOP
    v_total_count := v_total_count + 1;
  END LOOP;
  RAISE NOTICE 'Lote ${idx + 1} concluído. Total: %', v_total_count;`;
}).join('\n\n')}
  
  RAISE NOTICE '✅ Importação concluída! Total: % clientes', v_total_count;
END $$;
`;

fs.writeFileSync(sqlPath, sql);
console.log(`✅ Script gerado: ${sqlPath}`);
console.log(`   - Total de clientes: ${clientsArray.length}`);
console.log(`   - Lotes: ${batches.length}\n`);

