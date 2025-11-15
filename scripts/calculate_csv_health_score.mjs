import fs from 'fs';
import path from 'path';

// Ler o arquivo CSV
const csvPath = path.join(process.cwd(), '..', 'modelo health score brauna v3 14.11.csv');
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

console.log(`📊 Total de registros no CSV: ${records.length}\n`);

// Mapear valores de NPS da planilha para número
function parseNPS(npsValue) {
  if (!npsValue || npsValue === 'Não Recebeu' || npsValue === 'Não Respondeu' || npsValue === 'Não Encontrou') {
    return null;
  }
  const num = parseInt(npsValue);
  if (isNaN(num)) return null;
  return num;
}

// Mapear indicação NPS
function parseHasReferral(referralValue) {
  if (!referralValue) return false;
  const lower = referralValue.toLowerCase().trim();
  return lower === 'sim' || lower === 's' || lower === 'true' || lower === '1' || lower === 'x' || lower === 'yes' || lower === 'y' || lower === 'indicou' || lower === 'indicação';
}

// Mapear inadimplência
function parseOverdueInstallments(value) {
  if (!value || value === 'Adimplente') return 0;
  const num = parseInt(value);
  if (isNaN(num)) return 0;
  return num;
}

function parseOverdueDays(value) {
  if (!value || value === 'Adimplente') return 0;
  const num = parseInt(value);
  if (isNaN(num)) return 0;
  return num;
}

// Mapear cross sell
function parseCrossSell(value) {
  if (!value) return 0;
  const num = parseInt(value);
  if (isNaN(num)) return 0;
  return num;
}

// Mapear meses do fechamento
function parseMonthsSinceClosing(value) {
  if (!value || value === '#N/D') return null;
  const num = parseInt(value);
  if (isNaN(num)) return null;
  return num;
}

// Verificar se é cônjuge
function isSpouse(conjugeValue) {
  if (!conjugeValue) return false;
  const lower = conjugeValue.toLowerCase().trim();
  return lower !== 'não' && lower !== 'nao' && lower !== 'no' && lower !== '0' && lower !== '';
}

// Calcular Health Score v3 (mesma lógica da ferramenta)
function calculateHealthScore(client, payerNpsMap) {
  // Override: 3+ parcelas = score 0
  if (client.overdueInstallments >= 3) {
    return {
      score: 0,
      category: 'Crítico',
      breakdown: { nps: 0, referral: 0, payment: 0, crossSell: 0, tenure: 0 }
    };
  }

  // 1. NPS Pillar (-10 a 20)
  let npsPillar = 10; // Default para null (neutro)
  
  if (client.isSpouse && !client.npsScoreV3 && client.spousePartnerName) {
    // Cônjuge: tentar herdar NPS do pagante
    const payerNps = payerNpsMap.get(client.spousePartnerName);
    if (payerNps !== undefined && payerNps !== null) {
      if (payerNps >= 9) npsPillar = 20;
      else if (payerNps >= 7) npsPillar = 10;
      else npsPillar = -10;
    } else {
      npsPillar = 0; // Cônjuge sem NPS próprio e sem pagante = 0
    }
  } else if (client.npsScoreV3 !== null && client.npsScoreV3 !== undefined) {
    // Não-cônjuge ou cônjuge com NPS próprio
    if (client.npsScoreV3 >= 9) npsPillar = 20;
    else if (client.npsScoreV3 >= 7) npsPillar = 10;
    else npsPillar = -10;
  } else if (client.isSpouse) {
    npsPillar = 0; // Cônjuge sem NPS próprio e sem pagante = 0
  }

  // 2. Referral Pillar (10 pontos)
  const referralPillar = client.hasNpsReferral ? 10 : 0;

  // 3. Payment Pillar (-20 a 40)
  let paymentPillar = 40; // Adimplente
  
  if (client.overdueInstallments === 1) {
    if (client.overdueDays <= 7) paymentPillar = 25;
    else if (client.overdueDays <= 15) paymentPillar = 15;
    else if (client.overdueDays <= 30) paymentPillar = 5;
    else if (client.overdueDays <= 60) paymentPillar = 0;
    else paymentPillar = -10;
  } else if (client.overdueInstallments === 2) {
    if (client.overdueDays >= 30) paymentPillar = -20;
    else paymentPillar = -10;
  }

  // 4. Cross Sell Pillar (15 pontos)
  let crossSellPillar = 0;
  if (client.crossSellCount >= 3) crossSellPillar = 15;
  else if (client.crossSellCount === 2) crossSellPillar = 10;
  else if (client.crossSellCount === 1) crossSellPillar = 5;

  // 5. Tenure Pillar (15 pontos)
  let tenurePillar = 0;
  if (client.monthsSinceClosing !== null && client.monthsSinceClosing !== undefined && client.monthsSinceClosing >= 0) {
    if (client.monthsSinceClosing >= 25) tenurePillar = 15;
    else if (client.monthsSinceClosing >= 13) tenurePillar = 15;
    else if (client.monthsSinceClosing >= 9) tenurePillar = 15;
    else if (client.monthsSinceClosing >= 5) tenurePillar = 10;
    else if (client.monthsSinceClosing >= 0) tenurePillar = 5;
  }

  // Calcular total
  let totalScore = npsPillar + referralPillar + paymentPillar + crossSellPillar + tenurePillar;
  
  // Score mínimo = 0
  if (totalScore < 0) totalScore = 0;

  // Categoria
  let category = 'Crítico';
  if (totalScore >= 75) category = 'Ótimo';
  else if (totalScore >= 50) category = 'Estável';
  else if (totalScore >= 30) category = 'Atenção';

  return {
    score: totalScore,
    category,
    breakdown: {
      nps: npsPillar,
      referral: referralPillar,
      payment: paymentPillar,
      crossSell: crossSellPillar,
      tenure: tenurePillar
    }
  };
}

// Processar registros
const clients = [];
const payerNpsMap = new Map(); // Para herança de NPS de cônjuges

// Primeira passada: criar mapa de NPS dos pagantes
for (const record of records) {
  const isSpouseClient = isSpouse(record['Cônjuge']);
  const nps = parseNPS(record['NPS']);
  
  if (!isSpouseClient && nps !== null) {
    const key = `${record['Clientes']}|${record['Planejador']}`;
    payerNpsMap.set(key, nps);
  }
}

// Segunda passada: processar todos os clientes
for (const record of records) {
  const isSpouseClient = isSpouse(record['Cônjuge']);
  const spousePartnerName = isSpouseClient ? record['Cônjuge'] : null;
  
  const client = {
    name: record['Clientes'],
    planner: record['Planejador'],
    isSpouse: isSpouseClient,
    spousePartnerName: spousePartnerName,
    npsScoreV3: parseNPS(record['NPS']),
    hasNpsReferral: parseHasReferral(record['Indicação NPS']),
    overdueInstallments: parseOverdueInstallments(record['Inadimplência Parcelas']),
    overdueDays: parseOverdueDays(record['Inadimplência Dias ']),
    crossSellCount: parseCrossSell(record['Cross Sell']),
    monthsSinceClosing: parseMonthsSinceClosing(record['Meses do Fechamento'])
  };

  // Calcular Health Score
  const healthScore = calculateHealthScore(client, payerNpsMap);
  
  clients.push({
    ...client,
    healthScore: healthScore.score,
    category: healthScore.category,
    breakdown: healthScore.breakdown
  });
}

// Calcular estatísticas
const totalClients = clients.length;
const scores = clients.map(c => c.healthScore);
const avgScore = scores.reduce((a, b) => a + b, 0) / totalClients;

// Distribuição por categoria
const categoryCounts = {
  'Ótimo': clients.filter(c => c.category === 'Ótimo').length,
  'Estável': clients.filter(c => c.category === 'Estável').length,
  'Atenção': clients.filter(c => c.category === 'Atenção').length,
  'Crítico': clients.filter(c => c.category === 'Crítico').length
};

// Médias dos pilares
const avgBreakdown = {
  nps: clients.reduce((sum, c) => sum + c.breakdown.nps, 0) / totalClients,
  referral: clients.reduce((sum, c) => sum + c.breakdown.referral, 0) / totalClients,
  payment: clients.reduce((sum, c) => sum + c.breakdown.payment, 0) / totalClients,
  crossSell: clients.reduce((sum, c) => sum + c.breakdown.crossSell, 0) / totalClients,
  tenure: clients.reduce((sum, c) => sum + c.breakdown.tenure, 0) / totalClients
};

// Estatísticas adicionais
const minScore = Math.min(...scores);
const maxScore = Math.max(...scores);
const medianScore = scores.sort((a, b) => a - b)[Math.floor(totalClients / 2)];

// Contar cônjuges
const spouseCount = clients.filter(c => c.isSpouse).length;
const nonSpouseCount = totalClients - spouseCount;

console.log('📊 RESULTADOS DO CÁLCULO DE HEALTH SCORE\n');
console.log('═'.repeat(60));
console.log(`Total de Clientes: ${totalClients}`);
console.log(`  - Pagantes: ${nonSpouseCount}`);
console.log(`  - Cônjuges: ${spouseCount}`);
console.log('═'.repeat(60));
console.log(`\n🎯 HEALTH SCORE MÉDIO: ${avgScore.toFixed(2)}`);
console.log(`   Mínimo: ${minScore}`);
console.log(`   Máximo: ${maxScore}`);
console.log(`   Mediana: ${medianScore}`);
console.log('\n📈 DISTRIBUIÇÃO POR CATEGORIA:');
console.log(`   Ótimo (≥75): ${categoryCounts['Ótimo']} (${(categoryCounts['Ótimo']/totalClients*100).toFixed(1)}%)`);
console.log(`   Estável (50-74): ${categoryCounts['Estável']} (${(categoryCounts['Estável']/totalClients*100).toFixed(1)}%)`);
console.log(`   Atenção (30-49): ${categoryCounts['Atenção']} (${(categoryCounts['Atenção']/totalClients*100).toFixed(1)}%)`);
console.log(`   Crítico (<30): ${categoryCounts['Crítico']} (${(categoryCounts['Crítico']/totalClients*100).toFixed(1)}%)`);
console.log('\n🔍 MÉDIA DOS PILARES:');
console.log(`   NPS: ${avgBreakdown.nps.toFixed(2)}`);
console.log(`   Indicação: ${avgBreakdown.referral.toFixed(2)}`);
console.log(`   Inadimplência: ${avgBreakdown.payment.toFixed(2)}`);
console.log(`   Cross Sell: ${avgBreakdown.crossSell.toFixed(2)}`);
console.log(`   Meses Relacionamento: ${avgBreakdown.tenure.toFixed(2)}`);
console.log(`   TOTAL: ${(avgBreakdown.nps + avgBreakdown.referral + avgBreakdown.payment + avgBreakdown.crossSell + avgBreakdown.tenure).toFixed(2)}`);

// Salvar resultados detalhados
const results = {
  summary: {
    totalClients,
    nonSpouseCount,
    spouseCount,
    avgScore: parseFloat(avgScore.toFixed(2)),
    minScore,
    maxScore,
    medianScore,
    categoryCounts,
    avgBreakdown: Object.fromEntries(
      Object.entries(avgBreakdown).map(([k, v]) => [k, parseFloat(v.toFixed(2))])
    )
  },
  clients: clients.map(c => ({
    name: c.name,
    planner: c.planner,
    isSpouse: c.isSpouse,
    healthScore: c.healthScore,
    category: c.category,
    breakdown: c.breakdown
  }))
};

fs.writeFileSync('health_score_calculation_results.json', JSON.stringify(results, null, 2));
console.log('\n✅ Resultados detalhados salvos em: health_score_calculation_results.json');

