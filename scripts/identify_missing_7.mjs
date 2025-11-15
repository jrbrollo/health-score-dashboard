import fs from 'fs';
import path from 'path';

// Ler o arquivo CSV do dia 13/11
const csvPath = path.join(process.cwd(), '..', 'modelo health score brauna v3 13.11.csv');
const csvContent = fs.readFileSync(csvPath, 'utf-8');

// Parse manual do CSV
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

function norm(str) {
  return (str || '').toString().toLowerCase().trim();
}

// Criar lista de clientes da planilha
const clientKeys = new Set();
records.forEach(client => {
  const name = client['Clientes'] || client['Nome Completo do Cliente'] || '';
  const planner = client['Planejador'] || '';
  if (name && planner && name !== '0' && planner !== '0' && planner !== '#n/d') {
    clientKeys.add(`${norm(name)}|${norm(planner)}`);
  }
});

console.log(`📊 Total de clientes na planilha: ${clientKeys.size}\n`);

// Gerar query SQL para identificar os faltantes
const clientKeysArray = Array.from(clientKeys).sort();

const sqlQuery = `-- Identificar os 7 clientes que ainda faltam no banco
SELECT 
  key as client_key,
  split_part(key, '|', 1) as nome,
  split_part(key, '|', 2) as planner
FROM unnest(ARRAY[
${clientKeysArray.map(k => `  '${k.replace(/'/g, "''")}'`).join(',\n')}
]) AS key
WHERE NOT EXISTS (
  SELECT 1 FROM clients c
  WHERE LOWER(TRIM(c.name)) || '|' || LOWER(TRIM(c.planner)) = key
    AND c.name != '0'
    AND c.planner != '0'
)
ORDER BY key;`;

// Salvar query SQL
const outputPath = path.join(process.cwd(), 'sql', 'identify_missing_7.sql');
fs.writeFileSync(outputPath, sqlQuery);

console.log(`✅ Query SQL gerada: ${outputPath}`);
console.log(`\n💡 Execute esta query no Supabase para identificar os 7 clientes faltantes\n`);

