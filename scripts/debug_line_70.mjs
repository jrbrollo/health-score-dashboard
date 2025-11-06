import fs from 'fs';
import Papa from 'papaparse';

const csv = fs.readFileSync('C:\\Users\\User\\Health-Score\\modelo health score brauna v3 06.11.csv', 'utf-8');

// Usar PapaParse como o código real faz
const parsed = Papa.parse(csv, {
  delimiter: ';',
  header: true,
  quoteChar: '"',
  skipEmptyLines: 'greedy',
  transformHeader: (h) => h.trim(),
});

console.log('📋 Headers encontrados:');
console.log(parsed.meta.fields);

console.log('\n🔍 Linha 70 (Andrea Calegari) - índice 69:');
const row69 = parsed.data[69];
if (row69) {
  console.log('Clientes:', row69['Clientes']);
  console.log('Email:', row69['Email']);
  console.log('Telefone:', row69['Telefone']);
  console.log('Cônjuge:', row69['Cônjuge'] || row69['Conjuge']);
  console.log('Meses do Fechamento:', row69['Meses do Fechamento']);
  console.log('Planejador:', row69['Planejador']);
  console.log('Líder em Formação:', row69['Líder em Formação']);
  console.log('Mediador:', row69['Mediador']);
  console.log('Gerente:', row69['Gerente']);
} else {
  console.log('Linha 69 não encontrada');
}

// Buscar Andrea Calegari
console.log('\n🔎 Procurando Andrea Calegari em todas as linhas:');
const andreaRows = parsed.data.filter((row, idx) => {
  const nome = row['Clientes'] || '';
  if (nome.toLowerCase().includes('andrea calegari')) {
    console.log(`  Índice ${idx} (linha ${idx + 2}):`, nome, '|', row['Planejador']);
    return true;
  }
  return false;
});

console.log('\n📊 Total de linhas parseadas:', parsed.data.length);

