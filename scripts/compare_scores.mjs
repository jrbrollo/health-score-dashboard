import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://pdlyaqxrkoqbqniercpi.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkbHlhcXhya29xYnFuaWVyY3BpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1MTIwMTQsImV4cCI6MjA3MzA4ODAxNH0.iOhMYwCMlRnYvNfg6EJqE0imk4Gn7kvK2PwdqlXu70E';

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * CORRIGIDO: Função de cálculo do Health Score v3 - ALINHADA COM healthScore.ts
 * 
 * MUDANÇAS APLICADAS:
 * - NPS: Detrator (0-6) agora retorna -10 (antes era 0)
 * - NPS: Null agora retorna 10 (neutro padrão)
 * - Payment: Lógica completamente reescrita para considerar dias de atraso corretamente
 * - Tenure: Ranges atualizados (0-4=5, 5-8=10, 9-12=15, 13-24=15, 25+=15)
 * - Adicionado override para 3+ parcelas = score 0
 * - Adicionado garantia de score mínimo = 0
 */
function calculateHealthScore(client) {
  // Override rule: 3+ parcelas em atraso = Health Score = 0
  if (client.overdueInstallments !== undefined && client.overdueInstallments >= 3) {
    return {
      score: 0,
      category: 'Crítico',
      breakdown: {
        nps: 0,
        referral: 0,
        payment: 0,
        crossSell: 0,
        tenure: 0,
      },
    };
  }

  // 1. NPS (-10 a 20 pontos)
  // CORRIGIDO: Detrator agora retorna -10, Null retorna 10
  let nps = 10; // Default para null (neutro)
  if (client.npsScoreV3 !== null && client.npsScoreV3 !== undefined) {
    if (client.npsScoreV3 >= 9) {
      nps = 20; // Promotor (9-10)
    } else if (client.npsScoreV3 >= 7) {
      nps = 10; // Neutro (7-8)
    } else {
      nps = -10; // Detrator (0-6) - CORRIGIDO: era 0, agora -10
    }
  }

  // 2. Indicação (10 pontos)
  const referral = client.hasNpsReferral ? 10 : 0;

  // 3. Inadimplência (-20 a 40 pontos) - CORRIGIDO: lógica completamente reescrita
  let payment = 40; // Adimplente
  const installments = client.overdueInstallments ?? 0;
  const days = client.overdueDays ?? 0;

  if (installments === 1) {
    // 1 parcela atrasada - penalizar por dias
    if (days <= 7) payment = 25;
    else if (days <= 15) payment = 15;
    else if (days <= 30) payment = 5;
    else if (days <= 60) payment = 0;
    else payment = -10; // 61+ dias
  } else if (installments === 2) {
    // 2 parcelas atrasadas
    if (days >= 30) {
      payment = -20; // 2 parcelas + 30+ dias
    } else {
      payment = -10; // 2 parcelas com menos de 30 dias
    }
  }
  // 3+ parcelas já é tratado no override acima

  // 4. Cross Sell (15 pontos máx)
  let crossSell = 0;
  const crossSellCount = client.crossSellCount ?? 0;
  if (crossSellCount >= 3) crossSell = 15;
  else if (crossSellCount === 2) crossSell = 10;
  else if (crossSellCount === 1) crossSell = 5;

  // 5. Tenure (15 pontos máx) - CORRIGIDO: ranges atualizados
  let tenure = 0;
  const months = client.monthsSinceClosing;
  if (months !== null && months !== undefined && months >= 0) {
    if (months <= 4) tenure = 5;   // CORRIGIDO: era 0-3, agora 0-4
    else if (months <= 8) tenure = 10;  // CORRIGIDO: era 4-6, agora 5-8
    else if (months <= 12) tenure = 15; // CORRIGIDO: era 7-12, agora 9-12
    else if (months <= 24) tenure = 15; // CORRIGIDO: era 12, agora 15
    else tenure = 15; // 25+ meses
  }

  let totalScore = nps + referral + payment + crossSell + tenure;
  
  // Garantir que não fica negativo (score mínimo = 0)
  if (totalScore < 0) {
    totalScore = 0;
  }

  // Determinar categoria (escala 0-100)
  let category = 'Crítico';
  if (totalScore >= 75) category = 'Ótimo';
  else if (totalScore >= 50) category = 'Estável';
  else if (totalScore >= 30) category = 'Atenção';

  return {
    score: totalScore,
    category,
    breakdown: { nps, referral, payment, crossSell, tenure }
  };
}

async function compareScores() {
  try {
    console.log('🔍 Iniciando comparação de scores (v3 corrigido)...\n');

    // 1. Buscar último snapshot de clientes
    const { data: lastDateRows, error: lastDateError } = await supabase
      .from('clients')
      .select('last_seen_at')
      .not('last_seen_at', 'is', null)
      .order('last_seen_at', { ascending: false })
      .limit(1);
    
    if (lastDateError) {
      console.error('❌ Erro ao buscar último snapshot:', lastDateError);
      return;
    }

    const lastSeenAt = lastDateRows && lastDateRows[0]?.last_seen_at;
    if (!lastSeenAt) {
      console.error('❌ Nenhum snapshot encontrado');
      return;
    }

    console.log('📅 Último snapshot:', lastSeenAt);

    // 2. Buscar clientes do snapshot (com paginação)
    const PAGE_SIZE = 500;
    let offset = 0;
    const allClients = [];

    while (true) {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('last_seen_at', lastSeenAt)
        .neq('name', '0')
        .neq('planner', '0')
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) {
        console.error('❌ Erro ao buscar clientes:', error);
        break;
      }

      if (data && data.length > 0) {
        allClients.push(...data);
        console.log(`📦 Página ${Math.floor(offset / PAGE_SIZE) + 1}: ${data.length} clientes`);
      }

      if (!data || data.length < PAGE_SIZE) {
        break;
      }

      offset += PAGE_SIZE;
    }

    console.log(`👥 Total de clientes: ${allClients.length}\n`);

    if (allClients.length === 0) {
      console.error('❌ Nenhum cliente encontrado');
      return;
    }

    // 3. Calcular scores em tempo real usando lógica v3 corrigida
    const realTimeScores = allClients.map(c => {
      const calculated = calculateHealthScore({
        npsScoreV3: c.nps_score_v3,
        hasNpsReferral: c.has_nps_referral,
        overdueInstallments: c.overdue_installments,
        overdueDays: c.overdue_days,
        crossSellCount: c.cross_sell_count,
        monthsSinceClosing: c.months_since_closing
      });
      return {
        id: c.id,
        name: c.name,
        planner: c.planner,
        calculatedScore: calculated.score,
        calculatedCategory: calculated.category,
        breakdown: calculated.breakdown
      };
    });

    const avgRealTime = realTimeScores.reduce((sum, s) => sum + s.calculatedScore, 0) / realTimeScores.length;
    console.log('📊 Score médio calculado (v3 corrigido):', Math.round(avgRealTime * 100) / 100);

    // 4. Buscar histórico do mesmo dia
    const snapshotDate = lastSeenAt.split('T')[0];
    const { data: history, error: historyError } = await supabase
      .from('health_score_history')
      .select('*')
      .eq('recorded_date', snapshotDate)
      .limit(5000); // Aumentado para pegar mais registros

    if (historyError) {
      console.error('❌ Erro ao buscar histórico:', historyError);
      return;
    }

    console.log('📜 Total de registros no histórico:', history.length);

    if (history.length > 0) {
      const avgHistory = history.reduce((sum, h) => sum + (h.health_score || 0), 0) / history.length;
      console.log('📊 Score médio no histórico:', Math.round(avgHistory * 100) / 100);
      console.log('🔍 Diferença média:', Math.round((avgRealTime - avgHistory) * 100) / 100);
    }

    // 5. Comparar exemplos e encontrar divergências
    console.log('\n📋 Análise de divergências:');
    const divergences = [];
    
    for (const rt of realTimeScores) {
      const hist = history.find(h => 
        (h.client_id === rt.id) || 
        (h.client_name === rt.name && h.planner === rt.planner)
      );
      
      if (hist) {
        const diff = rt.calculatedScore - hist.health_score;
        if (Math.abs(diff) > 0.5) { // Tolerância de 0.5 pontos
          divergences.push({
            name: rt.name,
            planner: rt.planner,
            calculated: rt.calculatedScore,
            historical: hist.health_score,
            difference: diff,
            calculatedBreakdown: rt.breakdown,
            historicalBreakdown: {
              nps: hist.nps_score_v3_pillar ?? hist.meeting_engagement ?? 0,
              referral: hist.referral_pillar ?? 0,
              payment: hist.payment_pillar ?? hist.payment_status ?? 0,
              crossSell: hist.cross_sell_pillar ?? 0,
              tenure: hist.tenure_pillar ?? 0,
            }
          });
        }
      }
    }

    if (divergences.length > 0) {
      console.log(`\n⚠️  Encontradas ${divergences.length} divergências significativas (>0.5 pontos):`);
      divergences.slice(0, 10).forEach((d, i) => {
        console.log(`\n  ${i + 1}. ${d.name} (${d.planner})`);
        console.log(`     Calculado: ${d.calculated} | Histórico: ${d.historical} | Diferença: ${d.difference.toFixed(2)}`);
        console.log(`     Breakdown Calculado:`, d.calculatedBreakdown);
        console.log(`     Breakdown Histórico:`, d.historicalBreakdown);
      });
      
      if (divergences.length > 10) {
        console.log(`\n  ... e mais ${divergences.length - 10} divergências`);
      }
    } else {
      console.log('\n✅ Nenhuma divergência significativa encontrada!');
    }

    // 6. Estatísticas por categoria
    console.log('\n📊 Distribuição por categoria (calculado):');
    const categories = {
      'Ótimo': 0,
      'Estável': 0,
      'Atenção': 0,
      'Crítico': 0
    };
    realTimeScores.forEach(s => {
      categories[s.calculatedCategory] = (categories[s.calculatedCategory] || 0) + 1;
    });
    Object.entries(categories).forEach(([cat, count]) => {
      const pct = ((count / realTimeScores.length) * 100).toFixed(1);
      console.log(`  ${cat}: ${count} (${pct}%)`);
    });

  } catch (error) {
    console.error('❌ Erro:', error);
  }
}

compareScores();
