const SUPABASE_URL = 'https://pdlyaqxrkoqbqniercpi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkbHlhcXhya29xYnFuaWVyY3BpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1MTIwMTQsImV4cCI6MjA3MzA4ODAxNH0.iOhMYwCMlRnYvNfg6EJqE0imk4Gn7kvK2PwdqlXu70E';

function encode(value) {
  return encodeURIComponent(value);
}

async function fetchJson(path) {
  const url = `${SUPABASE_URL}${path}`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'count=exact',
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status} for ${url}: ${body}`);
  }

  const text = await res.text();
  if (!text) return [];
  try {
    return JSON.parse(text);
  } catch (err) {
    console.error('Falha ao interpretar resposta JSON:', text);
    throw err;
  }
}

async function main() {
  const latest = await fetchJson('/rest/v1/clients?select=last_seen_at&last_seen_at=not.is.null&order=last_seen_at.desc&limit=1');
  const lastSeenAt = latest?.[0]?.last_seen_at;
  console.log('Último snapshot (last_seen_at):', lastSeenAt);

  if (!lastSeenAt) {
    console.log('Nenhum snapshot encontrado.');
    return;
  }

  const snapshot = await fetchJson(`/rest/v1/clients?select=id,name,planner,is_active,is_spouse,last_seen_at&last_seen_at=eq.${encode(lastSeenAt)}&limit=2000`);
  console.log('Total de registros retornados para o snapshot:', snapshot.length);

  const inactive = snapshot.filter(row => row.is_active === false);
  console.log('Clientes com is_active = false:', inactive.length);

  const missingHierarchy = snapshot.filter(row => !row.planner || row.planner.trim() === '' || ['#N/D', 'N/D', 'NA', 'N/A', '0', '-', '—', '#REF!'].includes(row.planner.trim().toUpperCase()));
  console.log('Clientes com planner inválido:', missingHierarchy.length);

  const spouseCount = snapshot.filter(row => row.is_spouse === true).length;
  console.log('Total de cônjuges:', spouseCount);
}

main().catch(err => {
  console.error('Erro ao consultar Supabase:', err);
  process.exit(1);
});


