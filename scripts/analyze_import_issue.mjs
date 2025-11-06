import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const supabaseUrl = 'https://pdlyaqxrkoqbqniercpi.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkbHlhcXhya29xYnFuaWVyY3BpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1MTIwMTQsImV4cCI6MjA3MzA4ODAxNH0.iOhMYwCMlRnYvNfg6EJqE0imk4Gn7kvK2PwdqlXu70E';

const supabase = createClient(supabaseUrl, supabaseKey);

async function analyzeImportIssue() {
  try {
    // 1. Ler a planilha CSV
    const csvPath = 'C:\\Users\\User\\Health-Score\\modelo health score brauna v3 06.11.csv';
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvContent.split('\n').slice(1); // Pular cabeçalho

    console.log('📄 Análise da planilha CSV:');
    console.log('Total de linhas (sem cabeçalho):', lines.length);

    // Contar linhas válidas e inválidas
    const validLines = [];
    const invalidLines = [];
    const refLines = [];
    const zeroLines = [];

    for (let i = 0; i < lines.length; i++) {
      const cols = lines[i].split(';');
      const cliente = cols[0] || '';

      if (!cliente || cliente.trim() === '') {
        continue; // Linha vazia
      }

      if (cliente.includes('#REF!')) {
        refLines.push(i + 2); // +2 porque pulamos cabeçalho e índice começa em 0
        invalidLines.push({ line: i + 2, reason: '#REF!', cliente });
      } else if (cliente === '0') {
        zeroLines.push(i + 2);
        invalidLines.push({ line: i + 2, reason: '0', cliente });
      } else {
        validLines.push({
          line: i + 2,
          cliente: cliente.trim(),
          planner: (cols[5] || '').trim(),
          isSpouse: cols[3] && cols[3].trim() !== '' && cols[3].toLowerCase() !== 'não' && !cols[3].toLowerCase().includes('não encontrou')
        });
      }
    }

    console.log('\n📊 Resumo:');
    console.log('Linhas válidas:', validLines.length);
    console.log('Linhas com #REF!:', refLines.length);
    console.log('Linhas com 0:', zeroLines.length);
    console.log('Total de inválidas:', invalidLines.length);

    // Contar cônjuges
    const spouses = validLines.filter(l => l.isSpouse);
    console.log('Cônjuges identificados:', spouses.length);

    // 2. Verificar identity_keys duplicados na planilha
    const identityKeyMap = new Map();
    for (const line of validLines) {
      // Simular a lógica de identity_key do SQL
      const key = `${line.cliente.toLowerCase()}|${line.planner.toLowerCase()}`;
      if (identityKeyMap.has(key)) {
        identityKeyMap.get(key).push(line.line);
      } else {
        identityKeyMap.set(key, [line.line]);
      }
    }

    const duplicates = Array.from(identityKeyMap.entries()).filter(([key, lines]) => lines.length > 1);
    console.log('\n🔑 Identity Keys duplicados na planilha:', duplicates.length);
    if (duplicates.length > 0) {
      console.log('Primeiros 10 duplicados:');
      duplicates.slice(0, 10).forEach(([key, lines]) => {
        console.log(`  ${key}: linhas ${lines.join(', ')}`);
      });
    }

    // 3. Verificar quantos clientes únicos temos
    const uniqueKeys = identityKeyMap.size;
    console.log('\n✅ Total de identity_keys únicos na planilha:', uniqueKeys);

    // 4. Buscar no banco quantos foram realmente inseridos
    const { data: lastDateRows } = await supabase
      .from('clients')
      .select('last_seen_at')
      .not('last_seen_at', 'is', null)
      .order('last_seen_at', { ascending: false })
      .limit(1);
    
    const lastSeenAt = lastDateRows && lastDateRows[0]?.last_seen_at;
    console.log('\n📅 Último snapshot no banco:', lastSeenAt);

    // Buscar todos os clientes do último snapshot
    const { data: clients, error } = await supabase
      .from('clients')
      .select('name, planner, identity_key, is_spouse')
      .eq('last_seen_at', lastSeenAt)
      .neq('name', '0')
      .neq('planner', '0');

    if (error) {
      console.error('❌ Erro ao buscar clientes:', error);
      return;
    }

    console.log('\n📦 Clientes no banco (último snapshot):', clients.length);
    console.log('Cônjuges no banco:', clients.filter(c => c.is_spouse).length);

    // 5. Comparar: quais clientes da planilha não estão no banco?
    const dbKeys = new Set(clients.map(c => `${c.name.toLowerCase()}|${c.planner.toLowerCase()}`));
    const missingInDb = Array.from(identityKeyMap.keys()).filter(key => !dbKeys.has(key));

    console.log('\n❌ Clientes da planilha que NÃO estão no banco:', missingInDb.length);
    if (missingInDb.length > 0) {
      console.log('Primeiros 20 ausentes:');
      missingInDb.slice(0, 20).forEach(key => {
        const lines = identityKeyMap.get(key);
        console.log(`  ${key} (linhas: ${lines.join(', ')})`);
      });
    }

    // 6. Comparar: quais clientes do banco não estão na planilha?
    const csvKeys = new Set(identityKeyMap.keys());
    const missingInCsv = clients.filter(c => {
      const key = `${c.name.toLowerCase()}|${c.planner.toLowerCase()}`;
      return !csvKeys.has(key);
    });

    console.log('\n⚠️ Clientes no banco que NÃO estão na planilha:', missingInCsv.length);
    if (missingInCsv.length > 0) {
      console.log('Primeiros 20:');
      missingInCsv.slice(0, 20).forEach(c => {
        console.log(`  ${c.name} | ${c.planner} (is_spouse: ${c.is_spouse})`);
      });
    }

    // 7. Conclusão
    console.log('\n🎯 CONCLUSÃO:');
    console.log(`Planilha: ${validLines.length} linhas válidas → ${uniqueKeys} identity_keys únicos`);
    console.log(`Banco: ${clients.length} clientes no último snapshot`);
    console.log(`Diferença: ${uniqueKeys - clients.length} clientes a menos no banco`);

    if (uniqueKeys === clients.length) {
      console.log('✅ A quantidade está correta! Todos os clientes únicos foram inseridos.');
    } else if (missingInDb.length > 0) {
      console.log(`❌ ${missingInDb.length} clientes da planilha não foram inseridos no banco.`);
    }

  } catch (error) {
    console.error('❌ Erro:', error);
  }
}

analyzeImportIssue();

