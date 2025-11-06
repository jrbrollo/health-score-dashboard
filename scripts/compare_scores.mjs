import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://pdlyaqxrkoqbqniercpi.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkbHlhcXhya29xYnFuaWVyY3BpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1MTIwMTQsImV4cCI6MjA3MzA4ODAxNH0.iOhMYwCMlRnYvNfg6EJqE0imk4Gn7kvK2PwdqlXu70E';

const supabase = createClient(supabaseUrl, supabaseKey);

// Função de cálculo do Health Score v3 (copiada do código)
function calculateHealthScore(client) {
  // NPS (20 pontos)
  let nps = 0;
  if (client.npsScoreV3 !== null && client.npsScoreV3 !== undefined) {
    if (client.npsScoreV3 >= 9) nps = 20;
    else if (client.npsScoreV3 >= 7) nps = 10;
    else nps = 0;
  }

  // Indicação (10 pontos)
  const referral = client.hasNpsReferral ? 10 : 0;

  // Pagamentos (40 pontos)
  let payment = 40;
  if (client.overdueInstallments > 0) {
    if (client.overdueDays > 90) payment = 0;
    else if (client.overdueDays > 60) payment = 10;
    else if (client.overdueDays > 30) payment = 20;
    else payment = 30;
  }

  // Cross Sell (15 pontos)
  let crossSell = 0;
  if (client.crossSellCount >= 3) crossSell = 15;
  else if (client.crossSellCount === 2) crossSell = 10;
  else if (client.crossSellCount === 1) crossSell = 5;

  // Tenure (15 pontos)
  let tenure = 0;
  if (client.monthsSinceClosing !== null && client.monthsSinceClosing !== undefined) {
    if (client.monthsSinceClosing >= 12) tenure = 15;
    else if (client.monthsSinceClosing >= 6) tenure = 10;
    else if (client.monthsSinceClosing >= 3) tenure = 5;
  }

  const score = nps + referral + payment + crossSell + tenure;

  return {
    score,
    breakdown: { nps, referral, payment, crossSell, tenure }
  };
}

async function compareScores() {
  try {
    // 1. Buscar último snapshot de clientes
    const { data: lastDateRows } = await supabase
      .from('clients')
      .select('last_seen_at')
      .not('last_seen_at', 'is', null)
      .order('last_seen_at', { ascending: false })
      .limit(1);
    
    const lastSeenAt = lastDateRows && lastDateRows[0]?.last_seen_at;
    console.log('📅 Último snapshot:', lastSeenAt);

    // 2. Buscar clientes do snapshot
    const { data: clients, error: clientsError } = await supabase
      .from('clients')
      .select('*')
      .eq('last_seen_at', lastSeenAt)
      .neq('name', '0')
      .neq('planner', '0')
      .limit(1000);

    if (clientsError) {
      console.error('❌ Erro ao buscar clientes:', clientsError);
      return;
    }

    console.log('👥 Total de clientes:', clients.length);

    // 3. Calcular scores em tempo real
    const realTimeScores = clients.map(c => {
      const calculated = calculateHealthScore({
        npsScoreV3: c.nps_score_v3,
        hasNpsReferral: c.has_nps_referral,
        overdueInstallments: c.overdue_installments,
        overdueDays: c.overdue_days,
        crossSellCount: c.cross_sell_count,
        monthsSinceClosing: c.months_since_closing
      });
      return {
        name: c.name,
        planner: c.planner,
        calculatedScore: calculated.score,
        breakdown: calculated.breakdown
      };
    });

    const avgRealTime = realTimeScores.reduce((sum, s) => sum + s.calculatedScore, 0) / realTimeScores.length;
    console.log('\n📊 Score médio calculado em tempo real:', Math.round(avgRealTime * 100) / 100);

    // 4. Buscar histórico do mesmo dia
    const snapshotDate = lastSeenAt.split('T')[0];
    const { data: history, error: historyError } = await supabase
      .from('health_score_history')
      .select('*')
      .eq('recorded_date', snapshotDate)
      .limit(1000);

    if (historyError) {
      console.error('❌ Erro ao buscar histórico:', historyError);
      return;
    }

    console.log('📜 Total de registros no histórico:', history.length);

    if (history.length > 0) {
      const avgHistory = history.reduce((sum, h) => sum + (h.health_score || 0), 0) / history.length;
      console.log('📊 Score médio no histórico:', Math.round(avgHistory * 100) / 100);
      console.log('\n🔍 Diferença:', Math.round((avgRealTime - avgHistory) * 100) / 100);
    }

    // 5. Comparar alguns exemplos
    console.log('\n📋 Primeiros 10 clientes - Comparação:');
    for (let i = 0; i < Math.min(10, realTimeScores.length); i++) {
      const rt = realTimeScores[i];
      const hist = history.find(h => h.client_name === rt.name && h.planner === rt.planner);
      
      if (hist) {
        console.log(`\n  ${rt.name} (${rt.planner})`);
        console.log(`    Calculado: ${rt.calculatedScore}`);
        console.log(`    Histórico: ${hist.health_score}`);
        console.log(`    Diferença: ${rt.calculatedScore - hist.health_score}`);
        if (rt.calculatedScore !== hist.health_score) {
          console.log(`    Breakdown calculado:`, rt.breakdown);
          console.log(`    Breakdown histórico: NPS=${hist.nps_score}, Ref=${hist.referral_score}, Pay=${hist.payment_score}, Cross=${hist.cross_sell_score}, Ten=${hist.tenure_score}`);
        }
      }
    }

  } catch (error) {
    console.error('❌ Erro:', error);
  }
}

compareScores();

