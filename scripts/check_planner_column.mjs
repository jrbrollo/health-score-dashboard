import fs from 'fs';

const csv = fs.readFileSync('C:\\Users\\User\\Health-Score\\modelo health score brauna v3 06.11.csv', 'utf-8');
const lines = csv.split('\n').slice(1); // Pular cabeçalho

let numericPlanners = 0;
let validPlanners = 0;
let emptyPlanners = 0;
const examples = [];

for (const line of lines) {
  const cols = line.split(';');
  const cliente = cols[0] || '';
  const planner = cols[5] || '';
  const leader = cols[6] || '';

  if (!cliente || cliente.includes('#REF!') || cliente === '0') continue;

  const plannerTrim = planner.trim();
  
  if (!plannerTrim || plannerTrim === '') {
    emptyPlanners++;
  } else if (/^\d+$/.test(plannerTrim)) {
    numericPlanners++;
    if (examples.length < 20) {
      examples.push({ cliente, planner: plannerTrim, leader });
    }
  } else {
    validPlanners++;
  }
}

console.log('📊 Análise da coluna Planejador (Coluna F):');
console.log('Planejadores numéricos:', numericPlanners);
console.log('Planejadores válidos (nomes):', validPlanners);
console.log('Planejadores vazios:', emptyPlanners);
console.log('\n📋 Exemplos de planejadores numéricos:');
examples.forEach(e => {
  console.log(`  ${e.cliente}: Planejador="${e.planner}", Líder="${e.leader}"`);
});

