import { readFile } from 'fs/promises';
import Papa from 'papaparse';

const GENERIC_PLACEHOLDERS = new Set(['', 'nao', 'não', 'na', 'n/a', 'n/d', '#n/d', '0', '-', '—', 'nao encontrou', 'não encontrou', '#ref!']);

function norm(value) {
  if (!value) return '';
  return value
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

async function main() {
  const csvPath = new URL('../../modelo health score brauna v3 05.11.csv', import.meta.url);
  const content = await readFile(csvPath, 'utf8');

  const { data, meta } = Papa.parse(content, {
    delimiter: ';',
    header: true,
    skipEmptyLines: 'greedy',
  });

  console.log('Total de linhas (com header):', data.length);
  const expected = ['Clientes', 'Planejador'];
  for (const header of expected) {
    if (!meta.fields?.includes(header)) {
      console.warn(`Aviso: header "${header}" ausente.`);
    }
  }

  const seen = new Map();
  const duplicates = [];
  let validRows = 0;

  for (let index = 0; index < data.length; index++) {
    const row = data[index];
    if (!row) continue;

    const rawName = (row['Clientes'] ?? '').toString().trim();
    const rawPlanner = (row['Planejador'] ?? '').toString().trim();
    const nameNorm = norm(rawName);
    const plannerNorm = norm(rawPlanner);

    if (!rawName || !rawPlanner) continue;
    if (GENERIC_PLACEHOLDERS.has(nameNorm) || GENERIC_PLACEHOLDERS.has(plannerNorm)) continue;

    validRows += 1;
    const key = `${nameNorm}|${plannerNorm}`;
    if (seen.has(key)) {
      duplicates.push({
        key,
        firstLine: seen.get(key),
        duplicateLine: index + 2, // +2 to account for header and 0-based index
        name: rawName,
        planner: rawPlanner,
      });
    } else {
      seen.set(key, index + 2);
    }
  }

  console.log('Linhas válidas (nome + planejador preenchidos):', validRows);
  console.log('Chaves únicas (nome|planejador):', seen.size);
  console.log('Duplicados detectados:', duplicates.length);

  if (duplicates.length > 0) {
    console.log('Exemplos de duplicados (até 10):');
    for (const dup of duplicates.slice(0, 10)) {
      console.log(`- ${dup.name} | ${dup.planner} (primeira ocorrência: linha ${dup.firstLine}, duplicada na linha ${dup.duplicateLine})`);
    }
  }
}

main().catch((err) => {
  console.error('Erro ao analisar CSV:', err);
  process.exit(1);
});


