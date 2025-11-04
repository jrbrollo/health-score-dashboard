// Diff planilha vs snapshot (pares nome|planejador)
// Pré-requisito: existir um arquivo pairs.json no diretório raiz com [{name, planner}] normalizados

import fs from 'fs';
import path from 'path';

// Supabase REST (usar as mesmas credenciais públicas do app)
const SUPABASE_URL = 'https://pdlyaqxrkoqbqniercpi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkbHlhcXhya29xYnFuaWVyY3BpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1MTIwMTQsImV4cCI6MjA3MzA4ODAxNH0.iOhMYwCMlRnYvNfg6EJqE0imk4Gn7kvK2PwdqlXu70E';

async function fetchJson(url, opts = {}) {
  const headers = Object.assign({}, opts.headers || {}, {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  });
  const res = await fetch(url, { ...opts, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

function normStr(s) {
  return String(s || '').trim().toLowerCase();
}

async function main() {
  const root = process.cwd();
  const pairsPath = path.join(root, 'pairs.json');
  if (!fs.existsSync(pairsPath)) {
    console.error('pairs.json não encontrado no diretório raiz. Gere-o antes de rodar este script.');
    process.exit(1);
  }

  const sheetPairs = JSON.parse(fs.readFileSync(pairsPath, 'utf8'));
  console.log('Planilha pares (nome|planejador):', sheetPairs.length);

  // 1) Último last_seen_at
  const lastRows = await fetchJson(
    `${SUPABASE_URL}/rest/v1/clients?select=last_seen_at&last_seen_at=not.is.null&order=last_seen_at.desc&limit=1`
  );
  const lastSeenAt = lastRows?.[0]?.last_seen_at || null;
  if (!lastSeenAt) {
    console.error('Não foi possível obter last_seen_at mais recente.');
    process.exit(1);
  }
  console.log('Último snapshot:', lastSeenAt);

  // 2) Buscar snapshot (filtrando cônjuges e placeholders)
  const params = new URLSearchParams({
    select: 'name,planner,is_spouse,last_seen_at',
    'last_seen_at': `eq.${lastSeenAt}`,
    'or': '(is_spouse.is.null,is_spouse.eq.false)',
    'name': 'neq.0',
    'planner': 'neq.0',
    order: 'created_at.desc',
    limit: '2000',
  });
  const snapRows = await fetchJson(`${SUPABASE_URL}/rest/v1/clients?${params.toString()}`);
  console.log('Snapshot clientes:', snapRows.length);

  const snapSet = new Set(
    snapRows.map(r => `${normStr(r.name)}|${normStr(r.planner)}`)
  );

  const missing = [];
  for (const p of sheetPairs) {
    const key = `${normStr(p.name)}|${normStr(p.planner)}`;
    if (!snapSet.has(key)) missing.push({ name: p.name, planner: p.planner });
  }

  console.log('Ausentes:', missing.length);
  if (missing.length > 0) {
    console.log('Primeiros 10 ausentes:', missing.slice(0, 10));
  }
  const outPath = path.join(root, 'missing_pairs.json');
  fs.writeFileSync(outPath, JSON.stringify(missing, null, 2));
  console.log('Arquivo gerado:', outPath);
}

main().catch(err => {
  console.error('Erro no diff:', err);
  process.exit(1);
});


