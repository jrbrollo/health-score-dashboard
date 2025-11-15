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

// Valores inválidos (mesmos da função SQL)
const INVALID_VALUES = new Set(['0', '#n/d', 'n/d', 'na', 'n/a', '-', '—', '', '#ref!']);

function isValidNameOrPlanner(value) {
  if (!value) return false;
  const normalized = norm(value);
  return !INVALID_VALUES.has(normalized) && normalized.length > 0;
}

// Processar registros da planilha
const clientsFromCsv = [];
const clientKeys = new Set();

for (const record of records) {
  const name = (record['Clientes'] || '').toString().trim();
  const planner = (record['Planejador'] || '').toString().trim();
  
  // Validação rigorosa (mesma da função SQL)
  if (!isValidNameOrPlanner(name) || !isValidNameOrPlanner(planner)) {
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

// Preparar dados para importação
const clientsToImport = clientsFromCsv
  .filter(c => {
    // Validação final antes de gerar JSON
    return isValidNameOrPlanner(c.name) && isValidNameOrPlanner(c.planner);
  })
  .map(c => {
    const clientJson = {
      name: String(c.name).trim(),
      planner: String(c.planner).trim(),
      phone: c.phone ? String(c.phone) : null, // Garantir que phone seja sempre string ou null
      email: c.email ? String(c.email).trim() : null,
      leader: c.leader ? String(c.leader).trim() : null,
      mediator: c.mediator ? String(c.mediator).trim() : null,
      manager: c.manager ? String(c.manager).trim() : null,
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
    clientJson.spouse_partner_name = String(c.spousePartnerName).trim();
  }
  
  return clientJson;
});

// Dividir em lotes de 200 clientes
const BATCH_SIZE = 200;
const batches = [];
for (let i = 0; i < clientsToImport.length; i += BATCH_SIZE) {
  batches.push(clientsToImport.slice(i, i + BATCH_SIZE));
}

console.log(`📦 Total de lotes: ${batches.length} (${BATCH_SIZE} clientes por lote)\n`);

// Criar script SQL que importa em lotes
const sqlImportPath = path.join(process.cwd(), 'sql', 'import_missing_clients_13_11_batched.sql');

const importSql = `-- Script para importar TODOS os clientes da planilha do 13/11
-- Total de clientes na planilha: ${clientsFromCsv.length}
-- Dividido em ${batches.length} lotes de até ${BATCH_SIZE} clientes cada
-- IMPORTANTE: A função bulk_insert_clients_v3 faz UPSERT, então é seguro executar

DO $$
DECLARE
  v_import_date DATE := '2025-11-13';
  v_seen_at TIMESTAMPTZ := '2025-11-13 00:00:00'::TIMESTAMPTZ;
  v_result RECORD;
  v_total_count INTEGER := 0;
  v_batch_num INTEGER := 0;
BEGIN
${batches.map((batch, idx) => {
  // CRÍTICO: Garantir que phone seja sempre string no JSON (nunca número)
  // Usar replacer que força phone a ser sempre string com aspas no JSON
  const batchJson = JSON.stringify(batch, (key, value) => {
    if (key === 'phone') {
      if (value === null || value === undefined) {
        return null;
      }
      // SEMPRE retornar como string, mesmo se for número
      // Adicionar prefixo temporário para forçar string no JSON
      return 'STR_' + String(value);
    }
    return value;
  }, 0)
  // Remover prefixo temporário, mantendo como string no JSON
  .replace(/"phone"\s*:\s*"STR_(\d+)"/g, '"phone":"$1"')
  .replace(/'/g, "''");
  return `  -- Lote ${idx + 1} de ${batches.length} (${batch.length} clientes)
  v_batch_num := ${idx + 1};
  RAISE NOTICE 'Processando lote % de %...', v_batch_num, ${batches.length};
  
  FOR v_result IN 
    SELECT * FROM bulk_insert_clients_v3(
      '${batchJson}'::JSONB,
      v_import_date,
      v_seen_at
    )
  LOOP
    v_total_count := v_total_count + 1;
  END LOOP;
  
  RAISE NOTICE 'Lote % processado. Total acumulado: %', v_batch_num, v_total_count;`;
}).join('\n\n')}
  
  RAISE NOTICE '✅ Importação concluída! Total de clientes processados: %', v_total_count;
END $$;

-- Verificar resultado final
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
console.log(`✅ Script de importação em lotes gerado: ${sqlImportPath}\n`);

console.log(`📊 Resumo:`);
console.log(`   - Clientes na planilha: ${clientsFromCsv.length}`);
console.log(`   - Lotes: ${batches.length} (${BATCH_SIZE} clientes por lote)`);
console.log(`\n💡 Próximos passos:`);
console.log(`   1. Execute o script import_missing_clients_13_11_batched.sql para importar todos os clientes`);
console.log(`   2. Depois, execute o script create_history_13_11_from_csv.sql para recriar o histórico\n`);

