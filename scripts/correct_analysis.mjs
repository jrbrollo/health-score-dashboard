import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import Papa from 'papaparse';

const supabaseUrl = 'https://pdlyaqxrkoqbqniercpi.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkbHlhcXhya29xYnFuaWVyY3BpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1MTIwMTQsImV4cCI6MjA3MzA4ODAxNH0.iOhMYwCMlRnYvNfg6EJqE0imk4Gn7kvK2PwdqlXu70E';

const supabase = createClient(supabaseUrl, supabaseKey);

const GENERIC_PLACEHOLDERS = new Set([
  '0', 'n/a', 'na', 'n/d', '#n/d', '#ref!', 'não', 'nao', 
  'não encontrou', 'nao encontrou', '-', '—', '', 'null', 'undefined'
]);

function norm(s) { 
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); 
}

async function correctAnalysis() {
  try {
    // 1. Ler e parsear CSV exatamente como o código real faz
    const csv = fs.readFileSync('C:\\Users\\User\\Health-Score\\modelo health score brauna v3 06.11.csv', 'utf-8');
    
    const parsed = Papa.parse(csv, {
      delimiter: ';',
      header: true,
      quoteChar: '"',
      skipEmptyLines: 'greedy',
      transformHeader: (h) => h.trim(),
    });

    console.log('📄 Total de linhas parseadas:', parsed.data.length);

    // 2. Aplicar a mesma lógica de validação do código real
    const validClients = [];
    const invalidClients = [];

    for (let i = 0; i < parsed.data.length; i++) {
      const row = parsed.data[i];
      const name = (row['Clientes'] || '').toString().trim();
      const planner = (row['Planejador'] || '').toString().trim();
      
      const nameNorm = norm(name);
      const plannerNorm = norm(planner);
      
      if (!name || !planner || GENERIC_PLACEHOLDERS.has(nameNorm) || GENERIC_PLACEHOLDERS.has(plannerNorm)) {
        invalidClients.push({
          linha: i + 2,
          nome: name,
          planejador: planner,
          motivo: !name ? 'nome vazio' : !planner ? 'planejador vazio' : 
                  GENERIC_PLACEHOLDERS.has(nameNorm) ? 'nome placeholder' : 'planejador placeholder'
        });
      } else {
        validClients.push({
          linha: i + 2,
          nome: name,
          planejador: planner,
          key: `${nameNorm}|${plannerNorm}`
        });
      }
    }

    console.log('✅ Clientes válidos:', validClients.length);
    console.log('❌ Clientes inválidos:', invalidClients.length);

    if (invalidClients.length > 0) {
      console.log('\nPrimeiros 20 clientes inválidos:');
      invalidClients.slice(0, 20).forEach(c => {
        console.log(`  Linha ${c.linha}: ${c.nome} | ${c.planejador} (${c.motivo})`);
      });
    }

    // 3. Verificar duplicatas
    const keyCount = new Map();
    validClients.forEach(c => {
      keyCount.set(c.key, (keyCount.get(c.key) || 0) + 1);
    });

    const duplicates = Array.from(keyCount.entries()).filter(([key, count]) => count > 1);
    console.log('\n🔑 Duplicatas (mesmo nome|planejador):', duplicates.length);
    if (duplicates.length > 0) {
      duplicates.forEach(([key, count]) => {
        const clients = validClients.filter(c => c.key === key);
        console.log(`  ${key}: ${count}x (linhas ${clients.map(c => c.linha).join(', ')})`);
      });
    }

    const uniqueClients = validClients.length - duplicates.reduce((sum, [, count]) => sum + (count - 1), 0);
    console.log('\n✨ Clientes únicos esperados:', uniqueClients);

    // 4. Buscar do banco
    const { data: lastDateRows } = await supabase
      .from('clients')
      .select('last_seen_at')
      .not('last_seen_at', 'is', null)
      .order('last_seen_at', { ascending: false })
      .limit(1);
    
    const lastSeenAt = lastDateRows && lastDateRows[0]?.last_seen_at;
    console.log('\n📅 Último snapshot:', lastSeenAt);

    const PAGE_SIZE = 500;
    let offset = 0;
    const dbClients = [];

    while (true) {
      const { data, error } = await supabase
        .from('clients')
        .select('name, planner')
        .eq('last_seen_at', lastSeenAt)
        .neq('name', '0')
        .neq('planner', '0')
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) {
        console.error('❌ Erro:', error);
        break;
      }

      if (data && data.length > 0) {
        dbClients.push(...data);
        console.log(`📦 Página ${Math.floor(offset / PAGE_SIZE) + 1}: ${data.length} clientes`);
      }

      if (!data || data.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    console.log('\n💾 Total no banco:', dbClients.length);
    console.log('\n🎯 Diferença:', uniqueClients, '-', dbClients.length, '=', uniqueClients - dbClients.length);

  } catch (error) {
    console.error('❌ Erro:', error);
  }
}

correctAnalysis();

