import fs from 'fs';

// Ler resultados da análise anterior
const analysis = JSON.parse(fs.readFileSync('gustavo_machado_analysis.json', 'utf-8'));

console.log('👥 ANÁLISE DETALHADA: CÔNJUGES DO GUSTAVO MACHADO\n');
console.log('═'.repeat(70));

const allSpouses = analysis.clients.filter(c => c.isSpouse);
const allNonSpouses = analysis.clients.filter(c => !c.isSpouse);

console.log(`Total de cônjuges: ${allSpouses.length}`);
console.log(`Total de pagantes: ${allNonSpouses.length}\n`);

// Analisar cônjuges por categoria
console.log('📊 CÔNJUGES POR CATEGORIA:');
console.log('═'.repeat(70));

const spousesByCategory = {
  'Ótimo': allSpouses.filter(c => c.category === 'Ótimo'),
  'Estável': allSpouses.filter(c => c.category === 'Estável'),
  'Atenção': allSpouses.filter(c => c.category === 'Atenção'),
  'Crítico': allSpouses.filter(c => c.category === 'Crítico')
};

Object.entries(spousesByCategory).forEach(([category, spouses]) => {
  if (spouses.length > 0) {
    console.log(`\n${category} (${spouses.length} cônjuges):`);
    const scores = spouses.map(c => c.healthScore);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    console.log(`   Score médio: ${avg.toFixed(2)}`);
    console.log(`   Range: ${Math.min(...scores)} - ${Math.max(...scores)}`);
    
    // Detalhes dos pilares
    const avgNps = spouses.reduce((sum, c) => sum + c.breakdown.nps, 0) / spouses.length;
    const avgReferral = spouses.reduce((sum, c) => sum + c.breakdown.referral, 0) / spouses.length;
    const avgPayment = spouses.reduce((sum, c) => sum + c.breakdown.payment, 0) / spouses.length;
    const avgCrossSell = spouses.reduce((sum, c) => sum + c.breakdown.crossSell, 0) / spouses.length;
    const avgTenure = spouses.reduce((sum, c) => sum + c.breakdown.tenure, 0) / spouses.length;
    
    console.log(`   Pilares médios:`);
    console.log(`     NPS: ${avgNps.toFixed(2)}`);
    console.log(`     Indicação: ${avgReferral.toFixed(2)}`);
    console.log(`     Inadimplência: ${avgPayment.toFixed(2)}`);
    console.log(`     Cross Sell: ${avgCrossSell.toFixed(2)}`);
    console.log(`     Tenure: ${avgTenure.toFixed(2)}`);
    
    // Listar cônjuges
    console.log(`\n   Lista de cônjuges:`);
    spouses.forEach((c, i) => {
      console.log(`     ${i+1}. ${c.name} | Score: ${c.healthScore} | Par: ${c.spousePartnerName || 'N/A'}`);
      console.log(`        Pilares: NPS=${c.breakdown.nps} Ref=${c.breakdown.referral} Pay=${c.breakdown.payment} CS=${c.breakdown.crossSell} Ten=${c.breakdown.tenure}`);
    });
  }
});

// Verificar herança de NPS
console.log('\n\n🔍 VERIFICAÇÃO DE HERANÇA DE NPS:');
console.log('═'.repeat(70));

// Criar mapa de NPS dos pagantes
const payerNpsMap = new Map();
allNonSpouses.forEach(payer => {
  const key = `${payer.name}|${payer.planner}`;
  payerNpsMap.set(key, payer.npsScoreV3);
});

console.log(`\nTotal de pagantes com NPS: ${allNonSpouses.filter(p => p.npsScoreV3 !== null).length}`);

// Verificar quais cônjuges têm parceiro com NPS
const spousesWithPayerNps = [];
const spousesWithoutPayerNps = [];

allSpouses.forEach(spouse => {
  if (spouse.spousePartnerName) {
    const payerKey = `${spouse.spousePartnerName}|${spouse.planner}`;
    const payerNps = payerNpsMap.get(payerKey);
    
    if (payerNps !== undefined && payerNps !== null) {
      spousesWithPayerNps.push({ spouse, payerNps });
    } else {
      spousesWithoutPayerNps.push(spouse);
    }
  } else {
    spousesWithoutPayerNps.push(spouse);
  }
});

console.log(`\nCônjuges com parceiro que TEM NPS: ${spousesWithPayerNps.length}`);
console.log(`Cônjuges com parceiro que NÃO TEM NPS ou sem parceiro: ${spousesWithoutPayerNps.length}`);

if (spousesWithPayerNps.length > 0) {
  console.log(`\n📋 Cônjuges que DEVERIAM herdar NPS do parceiro:`);
  spousesWithPayerNps.forEach(({ spouse, payerNps }) => {
    const expectedNpsPillar = payerNps >= 9 ? 20 : payerNps >= 7 ? 10 : -10;
    const currentNpsPillar = spouse.breakdown.nps;
    const scoreDiff = expectedNpsPillar - currentNpsPillar;
    
    console.log(`\n   ${spouse.name}:`);
    console.log(`     Parceiro: ${spouse.spousePartnerName} (NPS: ${payerNps})`);
    console.log(`     NPS Pillar atual: ${currentNpsPillar}`);
    console.log(`     NPS Pillar esperado (herdado): ${expectedNpsPillar}`);
    console.log(`     Score atual: ${spouse.healthScore}`);
    console.log(`     Score se herdasse NPS: ${spouse.healthScore + scoreDiff}`);
    console.log(`     Categoria atual: ${spouse.category}`);
    
    const newScore = spouse.healthScore + scoreDiff;
    let newCategory = 'Crítico';
    if (newScore >= 75) newCategory = 'Ótimo';
    else if (newScore >= 50) newCategory = 'Estável';
    else if (newScore >= 30) newCategory = 'Atenção';
    
    if (newCategory !== spouse.category) {
      console.log(`     ⚠️  Categoria mudaria para: ${newCategory}`);
    }
  });
}

// Calcular impacto se cônjuges herdassem NPS
console.log('\n\n🧮 SIMULAÇÃO: Se cônjuges herdassem NPS corretamente:');
console.log('═'.repeat(70));

let totalScoreIncrease = 0;
let categoryChanges = {
  'Ótimo': 0,
  'Estável': 0,
  'Atenção': 0,
  'Crítico': 0
};

spousesWithPayerNps.forEach(({ spouse, payerNps }) => {
  const expectedNpsPillar = payerNps >= 9 ? 20 : payerNps >= 7 ? 10 : -10;
  const currentNpsPillar = spouse.breakdown.nps;
  const scoreDiff = expectedNpsPillar - currentNpsPillar;
  
  totalScoreIncrease += scoreDiff;
  
  const newScore = spouse.healthScore + scoreDiff;
  let newCategory = 'Crítico';
  if (newScore >= 75) newCategory = 'Ótimo';
  else if (newScore >= 50) newCategory = 'Estável';
  else if (newScore >= 30) newCategory = 'Atenção';
  
  if (newCategory !== spouse.category) {
    categoryChanges[newCategory]++;
    categoryChanges[spouse.category]--;
  }
});

const newAvgScore = (analysis.csv.avgScore * analysis.csv.totalClients + totalScoreIncrease) / analysis.csv.totalClients;

console.log(`\nAumento total de score se herdassem NPS: ${totalScoreIncrease} pontos`);
console.log(`Score médio atual: ${analysis.csv.avgScore}`);
console.log(`Score médio se herdassem NPS: ${newAvgScore.toFixed(2)}`);
console.log(`Score médio na ferramenta: ${analysis.tool.avgScore}`);
console.log(`\nDiferença após herança: ${Math.abs(newAvgScore - analysis.tool.avgScore).toFixed(2)} pontos`);

console.log(`\nMudanças de categoria:`);
Object.entries(categoryChanges).forEach(([cat, change]) => {
  if (change !== 0) {
    console.log(`   ${cat}: ${change > 0 ? '+' : ''}${change}`);
  }
});

console.log('\n✅ Análise completa!');

