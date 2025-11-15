import fs from 'fs';
import path from 'path';

// Ler resultados do cálculo do CSV
const csvResults = JSON.parse(fs.readFileSync('health_score_calculation_results.json', 'utf-8'));

console.log('📊 COMPARAÇÃO: CSV vs FERRAMENTA\n');
console.log('═'.repeat(70));

// Resultados do CSV
console.log('\n📋 RESULTADOS DO CSV (Cálculo Manual):');
console.log(`   Total de Clientes: ${csvResults.summary.totalClients}`);
console.log(`   - Pagantes: ${csvResults.summary.nonSpouseCount}`);
console.log(`   - Cônjuges: ${csvResults.summary.spouseCount}`);
console.log(`   Health Score Médio: ${csvResults.summary.avgScore}`);
console.log(`   Ótimos: ${csvResults.summary.categoryCounts['Ótimo']} (${(csvResults.summary.categoryCounts['Ótimo']/csvResults.summary.totalClients*100).toFixed(1)}%)`);
console.log(`   Estáveis: ${csvResults.summary.categoryCounts['Estável']} (${(csvResults.summary.categoryCounts['Estável']/csvResults.summary.totalClients*100).toFixed(1)}%)`);
console.log(`   Atenção: ${csvResults.summary.categoryCounts['Atenção']} (${(csvResults.summary.categoryCounts['Atenção']/csvResults.summary.totalClients*100).toFixed(1)}%)`);
console.log(`   Críticos: ${csvResults.summary.categoryCounts['Crítico']} (${(csvResults.summary.categoryCounts['Crítico']/csvResults.summary.totalClients*100).toFixed(1)}%)`);

// Resultados da Ferramenta (do print do usuário)
console.log('\n🖥️  RESULTADOS DA FERRAMENTA:');
console.log(`   Total de Clientes: 1008`);
console.log(`   Health Score Médio: 61`);
console.log(`   Ótimos: 158`);
console.log(`   Estáveis: 766`);
console.log(`   Atenção: 60`);
console.log(`   Críticos: 24`);

// Diferenças
console.log('\n🔍 ANÁLISE DE DIFERENÇAS:');
console.log('═'.repeat(70));

const diffTotal = csvResults.summary.totalClients - 1008;
const diffScore = csvResults.summary.avgScore - 61;
const diffOtimos = csvResults.summary.categoryCounts['Ótimo'] - 158;
const diffEstaveis = csvResults.summary.categoryCounts['Estável'] - 766;
const diffAtencao = csvResults.summary.categoryCounts['Atenção'] - 60;
const diffCriticos = csvResults.summary.categoryCounts['Crítico'] - 24;

console.log(`\n📊 Total de Clientes:`);
console.log(`   CSV: ${csvResults.summary.totalClients} | Ferramenta: 1008 | Diferença: ${diffTotal} clientes`);
if (diffTotal > 0) {
  console.log(`   ⚠️  ${diffTotal} clientes do CSV não aparecem na ferramenta`);
  console.log(`   Possíveis causas:`);
  console.log(`   - Clientes inativos (isActive = false)`);
  console.log(`   - Filtros de hierarquia aplicados`);
  console.log(`   - Clientes não importados ainda`);
  console.log(`   - Clientes com planner = '0' ou name = '0' (filtrados)`);
}

console.log(`\n🎯 Health Score Médio:`);
console.log(`   CSV: ${csvResults.summary.avgScore} | Ferramenta: 61 | Diferença: ${diffScore.toFixed(2)} pontos`);
if (Math.abs(diffScore) > 1) {
  console.log(`   ⚠️  Diferença significativa de ${Math.abs(diffScore).toFixed(2)} pontos`);
  console.log(`   Possíveis causas:`);
  console.log(`   - Diferentes clientes sendo contados (filtros)`);
  console.log(`   - Diferença na lógica de cálculo`);
  console.log(`   - Diferença na herança de NPS para cônjuges`);
}

console.log(`\n📈 Distribuição por Categoria:`);
console.log(`   Ótimos: CSV ${csvResults.summary.categoryCounts['Ótimo']} vs Ferramenta 158 (dif: ${diffOtimos})`);
console.log(`   Estáveis: CSV ${csvResults.summary.categoryCounts['Estável']} vs Ferramenta 766 (dif: ${diffEstaveis})`);
console.log(`   Atenção: CSV ${csvResults.summary.categoryCounts['Atenção']} vs Ferramenta 60 (dif: ${diffAtencao})`);
console.log(`   Críticos: CSV ${csvResults.summary.categoryCounts['Crítico']} vs Ferramenta 24 (dif: ${diffCriticos})`);

// Análise de possíveis causas
console.log('\n💡 POSSÍVEIS CAUSAS DAS DIFERENÇAS:');
console.log('═'.repeat(70));
console.log(`
1. **Clientes Filtrados (${diffTotal} clientes):**
   - A ferramenta filtra clientes com isActive = false
   - A ferramenta pode aplicar filtros de hierarquia (authFilters)
   - Clientes com planner = '0' ou name = '0' são filtrados

2. **Diferença no Score Médio (${diffScore.toFixed(2)} pontos):**
   - Se ${diffTotal} clientes com score mais baixo foram filtrados, isso explicaria o score médio maior na ferramenta
   - Score médio maior = clientes com score baixo foram removidos

3. **Verificações Necessárias:**
   - Quantos clientes do CSV têm isActive = false?
   - Há filtros de hierarquia aplicados na ferramenta?
   - Todos os clientes do CSV foram importados?
   - Há clientes com planner = '0' ou name = '0' no CSV?
`);

// Calcular score médio se removermos os clientes "faltantes"
if (diffTotal > 0) {
  console.log('\n🧮 SIMULAÇÃO: Se removermos os clientes "faltantes":');
  console.log('═'.repeat(70));
  
  // Ordenar clientes por score (menor primeiro)
  const sortedClients = [...csvResults.clients].sort((a, b) => a.healthScore - b.healthScore);
  
  // Remover os N clientes com menor score
  const removedClients = sortedClients.slice(0, diffTotal);
  const remainingClients = sortedClients.slice(diffTotal);
  
  const avgScoreRemaining = remainingClients.reduce((sum, c) => sum + c.healthScore, 0) / remainingClients.length;
  
  console.log(`   Se removermos os ${diffTotal} clientes com menor score:`);
  console.log(`   - Score médio dos removidos: ${(removedClients.reduce((sum, c) => sum + c.healthScore, 0) / diffTotal).toFixed(2)}`);
  console.log(`   - Score médio dos restantes: ${avgScoreRemaining.toFixed(2)}`);
  console.log(`   - Score médio na ferramenta: 61`);
  console.log(`   - Diferença: ${Math.abs(avgScoreRemaining - 61).toFixed(2)} pontos`);
}

console.log('\n✅ Análise completa!');

