import { readFile } from 'fs/promises';
import Papa from 'papaparse';
import { createHash } from 'crypto';

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

function onlyDigits(value) {
  return value ? value.replace(/\D+/g, '') : '';
}

function normalizePhone(raw) {
  if (!raw) return '';
  const str = raw.toString().trim();
  if (/e\+|,/.test(str)) return '';
  const digits = onlyDigits(str);
  return digits.length >= 9 ? digits : '';
}

function md5(value) {
  return createHash('md5').update(value).digest('hex');
}

function buildIdentityKey(row) {
  const phone = normalizePhone(row['Telefone']);
  if (phone) return phone;

  const email = row['Email']?.toString().trim().toLowerCase() || '';
  if (email && email !== '0') return email;

  const name = row['Clientes']?.toString().trim().toLowerCase() || '';
  const planner = row['Planejador']?.toString().trim().toLowerCase() || '';
  return md5(`${name}|${planner}`);
}

async function main() {
  const csvPath = new URL('../../modelo health score brauna v3 05.11.csv', import.meta.url);
  const content = await readFile(csvPath, 'utf8');

  const { data } = Papa.parse(content, {
    delimiter: ';',
    header: true,
    skipEmptyLines: 'greedy',
  });

  const keys = new Map();
  const duplicates = [];
  let validRows = 0;

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (!row) continue;

    const rawName = row['Clientes']?.toString().trim();
    const rawPlanner = row['Planejador']?.toString().trim();
    const nameNorm = norm(rawName);
    const plannerNorm = norm(rawPlanner);

    if (!rawName || !rawPlanner) continue;
    if (GENERIC_PLACEHOLDERS.has(nameNorm) || GENERIC_PLACEHOLDERS.has(plannerNorm)) continue;

    validRows += 1;
    const key = buildIdentityKey(row);
    if (keys.has(key)) {
      duplicates.push({
        key,
        firstLine: keys.get(key),
        duplicateLine: i + 2,
        name: rawName,
        planner: rawPlanner,
      });
    } else {
      keys.set(key, i + 2);
    }
  }

  console.log('Linhas válidas:', validRows);
  console.log('Identity keys únicas:', keys.size);
  console.log('Duplicatas por identity_key:', duplicates.length);

  if (duplicates.length > 0) {
    console.log('Exemplos (até 10):');
    for (const dup of duplicates.slice(0, 10)) {
      console.log(`- ${dup.name} | ${dup.planner} (primeira linha ${dup.firstLine}, duplicada na linha ${dup.duplicateLine})`);
    }
  }
}

main().catch((err) => {
  console.error('Erro:', err);
  process.exit(1);
});


