import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const supabaseUrl = 'https://pdlyaqxrkoqbqniercpi.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkbHlhcXhya29xYnFuaWVyY3BpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1MTIwMTQsImV4cCI6MjA3MzA4ODAxNH0.iOhMYwCMlRnYvNfg6EJqE0imk4Gn7kvK2PwdqlXu70E';

const supabase = createClient(supabaseUrl, supabaseKey);

async function findMissingClient() {
  try {
    // 1. Ler planilha
    const csv = fs.readFileSync('C:\\Users\\User\\Health-Score\\modelo health score brauna v3 06.11.csv', 'utf-8');
    let lines;
    if (csv.includes('\r\n')) {
      lines = csv.split('\r\n');
    } else if (csv.includes('\n')) {
      lines = csv.split('\n');
    } else {
      lines = csv.split('\r');
    }

    // 2. Extrair clientes válidos da planilha
    const csvClients = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line || line.trim() === '') continue;
      
      const cols = line.split(';');
      const cliente = cols[0] || '';
      const planejador = cols[5] || '';
      
      if (cliente && cliente.trim() !== '' && cliente !== '0' && !cliente.includes('#REF!')) {
        csvClients.push({
          linha: i + 1,
          nome: cliente.trim(),
          planejador: planejador.trim(),
          key: `${cliente.toLowerCase().trim()}|${planejador.toLowerCase().trim()}`
        });
      }
    }

    console.log('📄 Clientes na planilha:', csvClients.length);

    // 3. Buscar clientes do banco
    const { data: lastDateRows } = await supabase
      .from('clients')
      .select('last_seen_at')
      .not('last_seen_at', 'is', null)
      .order('last_seen_at', { ascending: false })
      .limit(1);
    
    const lastSeenAt = lastDateRows && lastDateRows[0]?.last_seen_at;
    console.log('📅 Último snapshot:', lastSeenAt);

    // Buscar TODOS os clientes do snapshot (com paginação)
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
        dbClients.push(...data.map(c => ({
          nome: c.name,
          planejador: c.planner,
          key: `${c.name.toLowerCase().trim()}|${c.planner.toLowerCase().trim()}`
        })));
        console.log(`📦 Página ${Math.floor(offset / PAGE_SIZE) + 1}: ${data.length} clientes (total: ${dbClients.length})`);
      }

      if (!data || data.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    console.log('\n💾 Clientes no banco:', dbClients.length);

    // 4. Encontrar diferenças
    const dbKeys = new Set(dbClients.map(c => c.key));
    const csvKeys = new Set(csvClients.map(c => c.key));

    const missingInDb = csvClients.filter(c => !dbKeys.has(c.key));
    const extraInDb = dbClients.filter(c => !csvKeys.has(c.key));

    console.log('\n❌ Clientes da planilha que NÃO estão no banco:', missingInDb.length);
    if (missingInDb.length > 0) {
      console.log('\nPrimeiros 20:');
      missingInDb.slice(0, 20).forEach(c => {
        console.log(`  Linha ${c.linha}: ${c.nome} | ${c.planejador}`);
      });
    }

    console.log('\n⚠️ Clientes no banco que NÃO estão na planilha:', extraInDb.length);
    if (extraInDb.length > 0) {
      console.log('\nPrimeiros 20:');
      extraInDb.slice(0, 20).forEach(c => {
        console.log(`  ${c.nome} | ${c.planejador}`);
      });
    }

    // 5. Verificar duplicatas na planilha
    const keyCount = new Map();
    csvClients.forEach(c => {
      keyCount.set(c.key, (keyCount.get(c.key) || 0) + 1);
    });

    const duplicates = Array.from(keyCount.entries()).filter(([key, count]) => count > 1);
    console.log('\n🔑 Duplicatas na planilha (mesmo nome|planejador):', duplicates.length);
    if (duplicates.length > 0) {
      duplicates.forEach(([key, count]) => {
        const clients = csvClients.filter(c => c.key === key);
        console.log(`  ${key}: ${count}x (linhas ${clients.map(c => c.linha).join(', ')})`);
      });
    }

  } catch (error) {
    console.error('❌ Erro:', error);
  }
}

findMissingClient();

