import fs from 'fs';

// Ler resultados da análise anterior
const analysis = JSON.parse(fs.readFileSync('gustavo_machado_analysis.json', 'utf-8'));

console.log('🔍 ANÁLISE DETALHADA: GUSTAVO MACHADO\n');
console.log('═'.repeat(70));

// Agrupar clientes por categoria no CSV
const csvByCategory = {
  'Ótimo': analysis.clients.filter(c => c.category === 'Ótimo'),
  'Estável': analysis.clients.filter(c => c.category === 'Estável'),
  'Atenção': analysis.clients.filter(c => c.category === 'Atenção'),
  'Crítico': analysis.clients.filter(c => c.category === 'Crítico')
};

// Estatísticas por categoria
console.log('\n📊 ESTATÍSTICAS POR CATEGORIA (CSV):');
console.log('═'.repeat(70));

Object.entries(csvByCategory).forEach(([category, clients]) => {
  if (clients.length > 0) {
    const scores = clients.map(c => c.healthScore);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    
    console.log(`\n${category} (${clients.length} clientes):`);
    console.log(`   Score médio: ${avg.toFixed(2)}`);
    console.log(`   Range: ${min} - ${max}`);
    
    // Contar cônjuges
    const spouses = clients.filter(c => c.isSpouse).length;
    console.log(`   Cônjuges: ${spouses} (${(spouses/clients.length*100).toFixed(1)}%)`);
    
    // Contar com NPS
    const withNps = clients.filter(c => c.npsScoreV3 !== null).length;
    console.log(`   Com NPS: ${withNps} (${(withNps/clients.length*100).toFixed(1)}%)`);
    
    // Contar inadimplentes
    const overdue = clients.filter(c => c.overdueInstallments > 0).length;
    console.log(`   Inadimplentes: ${overdue} (${(overdue/clients.length*100).toFixed(1)}%)`);
  }
});

// Análise de diferenças
console.log('\n\n🔍 ANÁLISE DE DIFERENÇAS:');
console.log('═'.repeat(70));

console.log('\n📈 Distribuição:');
console.log(`   CSV tem ${analysis.differences.categoryCounts['Atenção']} clientes a MAIS em "Atenção"`);
console.log(`   CSV tem ${Math.abs(analysis.differences.categoryCounts['Ótimo'])} clientes a MENOS em "Ótimo"`);
console.log(`   CSV tem ${Math.abs(analysis.differences.categoryCounts['Estável'])} clientes a MENOS em "Estável"`);

// Identificar clientes que estão na categoria errada
console.log('\n\n🔍 CLIENTES QUE PODEM ESTAR MAL CLASSIFICADOS:');
console.log('═'.repeat(70));

// Clientes em "Atenção" no CSV que deveriam estar em "Estável" (score 50-59)
const atencaoQueDeveSerEstavel = csvByCategory['Atenção'].filter(c => c.healthScore >= 50 && c.healthScore < 60);
if (atencaoQueDeveSerEstavel.length > 0) {
  console.log(`\n⚠️  ${atencaoQueDeveSerEstavel.length} clientes em "Atenção" com score 50-59 (deveriam ser "Estável"):`);
  atencaoQueDeveSerEstavel.forEach(c => {
    console.log(`   - ${c.name}: Score ${c.healthScore} | NPS: ${c.npsScoreV3 ?? 'null'} | Cônjuge: ${c.isSpouse ? 'Sim' : 'Não'}`);
  });
}

// Clientes em "Estável" no CSV que deveriam estar em "Ótimo" (score 75+)
const estavelQueDeveSerOtimo = csvByCategory['Estável'].filter(c => c.healthScore >= 75);
if (estavelQueDeveSerOtimo.length > 0) {
  console.log(`\n⚠️  ${estavelQueDeveSerOtimo.length} clientes em "Estável" com score 75+ (deveriam ser "Ótimo"):`);
  estavelQueDeveSerOtimo.forEach(c => {
    console.log(`   - ${c.name}: Score ${c.healthScore} | NPS: ${c.npsScoreV3 ?? 'null'} | Cônjuge: ${c.isSpouse ? 'Sim' : 'Não'}`);
  });
}

// Clientes em "Estável" no CSV que deveriam estar em "Atenção" (score 30-49)
const estavelQueDeveSerAtencao = csvByCategory['Estável'].filter(c => c.healthScore >= 30 && c.healthScore < 50);
if (estavelQueDeveSerAtencao.length > 0) {
  console.log(`\n⚠️  ${estavelQueDeveSerAtencao.length} clientes em "Estável" com score 30-49 (deveriam ser "Atenção"):`);
  estavelQueDeveSerAtencao.forEach(c => {
    console.log(`   - ${c.name}: Score ${c.healthScore} | NPS: ${c.npsScoreV3 ?? 'null'} | Cônjuge: ${c.isSpouse ? 'Sim' : 'Não'}`);
  });
}

// Análise de cônjuges
console.log('\n\n👥 ANÁLISE DE CÔNJUGES:');
console.log('═'.repeat(70));
const allSpouses = analysis.clients.filter(c => c.isSpouse);
console.log(`\nTotal de cônjuges: ${allSpouses.length}`);
console.log(`Score médio dos cônjuges: ${(allSpouses.reduce((sum, c) => sum + c.healthScore, 0) / allSpouses.length).toFixed(2)}`);

const spousesWithNps = allSpouses.filter(c => c.npsScoreV3 !== null);
const spousesWithoutNps = allSpouses.filter(c => c.npsScoreV3 === null);

console.log(`\nCônjuges com NPS próprio: ${spousesWithNps.length}`);
console.log(`Cônjuges sem NPS próprio: ${spousesWithoutNps.length}`);

if (spousesWithoutNps.length > 0) {
  console.log(`\nScore médio dos cônjuges SEM NPS próprio: ${(spousesWithoutNps.reduce((sum, c) => sum + c.healthScore, 0) / spousesWithoutNps.length).toFixed(2)}`);
  console.log(`\nDistribuição por categoria (cônjuges sem NPS):`);
  const spousesByCategory = {
    'Ótimo': spousesWithoutNps.filter(c => c.category === 'Ótimo').length,
    'Estável': spousesWithoutNps.filter(c => c.category === 'Estável').length,
    'Atenção': spousesWithoutNps.filter(c => c.category === 'Atenção').length,
    'Crítico': spousesWithoutNps.filter(c => c.category === 'Crítico').length
  };
  Object.entries(spousesByCategory).forEach(([cat, count]) => {
    console.log(`   ${cat}: ${count}`);
  });
}

// Resumo final
console.log('\n\n📋 RESUMO FINAL:');
console.log('═'.repeat(70));
console.log(`
✅ Total de clientes: IGUAL (115 vs 115)
⚠️  Score médio: Diferença de ${Math.abs(analysis.differences.avgScore).toFixed(2)} pontos
   - CSV: ${analysis.csv.avgScore}
   - Ferramenta: ${analysis.tool.avgScore}

📊 Distribuição:
   - CSV tem ${analysis.differences.categoryCounts['Atenção']} clientes a MAIS em "Atenção"
   - CSV tem ${Math.abs(analysis.differences.categoryCounts['Ótimo'])} clientes a MENOS em "Ótimo"
   - CSV tem ${Math.abs(analysis.differences.categoryCounts['Estável'])} clientes a MENOS em "Estável"

💡 POSSÍVEIS CAUSAS:
   1. Diferença na herança de NPS para cônjuges
   2. Diferença no cálculo de algum pilar específico
   3. Arredondamento (ferramenta arredonda para inteiro)
   4. Diferença na lógica de categorização (limites 30, 50, 75)
`);

