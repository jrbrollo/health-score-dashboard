import fs from 'fs';

const csv = fs.readFileSync('C:\\Users\\User\\Health-Score\\modelo health score brauna v3 06.11.csv', 'utf-8');

// Tentar diferentes separadores de linha
let lines;
if (csv.includes('\r\n')) {
  lines = csv.split('\r\n');
} else if (csv.includes('\n')) {
  lines = csv.split('\n');
} else if (csv.includes('\r')) {
  lines = csv.split('\r');
} else {
  lines = [csv];
}

console.log('📄 Análise da planilha:');
console.log('Total de linhas no arquivo:', lines.length);
console.log('Primeira linha (cabeçalho):', lines[0].substring(0, 100) + '...');

if (lines.length > 1) {
  console.log('\nLinha 2 (primeiro cliente):');
  const firstClient = lines[1].split(';');
  console.log('  Nome:', firstClient[0]);
  console.log('  Planejador:', firstClient[5]);
}

if (lines.length > 1062) {
  console.log('\nLinha 1063 (último cliente esperado):');
  const lastClient = lines[1062].split(';');
  console.log('  Nome:', lastClient[0]);
  console.log('  Planejador:', lastClient[5]);
}

// Contar clientes válidos
const validClients = [];
const invalidClients = [];
const refClients = [];
const zeroClients = [];

for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  if (!line || line.trim() === '') continue;
  
  const cols = line.split(';');
  const cliente = cols[0] || '';
  
  if (cliente.includes('#REF!')) {
    refClients.push(i + 1);
  } else if (cliente === '0') {
    zeroClients.push(i + 1);
  } else if (cliente && cliente.trim() !== '') {
    validClients.push({
      linha: i + 1,
      nome: cliente,
      planejador: cols[5] || ''
    });
  }
}

console.log('\n📊 Resumo:');
console.log('Clientes válidos:', validClients.length);
console.log('Linhas com #REF!:', refClients.length);
console.log('Linhas com 0:', zeroClients.length);
console.log('Total de linhas processadas:', lines.length - 1);

console.log('\n✅ Primeiro cliente válido:');
if (validClients.length > 0) {
  console.log(`  Linha ${validClients[0].linha}: ${validClients[0].nome} (${validClients[0].planejador})`);
}

console.log('\n✅ Último cliente válido:');
if (validClients.length > 0) {
  const last = validClients[validClients.length - 1];
  console.log(`  Linha ${last.linha}: ${last.nome} (${last.planejador})`);
}

// Verificar se há cônjuges
const spouses = validClients.filter((c, idx) => {
  const line = lines[c.linha - 1];
  const cols = line.split(';');
  const conjuge = cols[3] || '';
  return conjuge && conjuge.trim() !== '' && conjuge.toLowerCase() !== 'não' && !conjuge.toLowerCase().includes('não encontrou');
});

console.log('\n👥 Cônjuges identificados:', spouses.length);

