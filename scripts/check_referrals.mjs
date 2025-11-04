const SUPABASE_URL = 'https://pdlyaqxrkoqbqniercpi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkbHlhcXhya29xYnFuaWVyY3BpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1MTIwMTQsImV4cCI6MjA3MzA4ODAxNH0.iOhMYwCMlRnYvNfg6EJqE0imk4Gn7kvK2PwdqlXu70E';

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

function encode(value) {
  return encodeURIComponent(value);
}

async function main() {
  const latest = await fetchJson(
    `${SUPABASE_URL}/rest/v1/clients?select=last_seen_at&last_seen_at=not.is.null&order=last_seen_at.desc&limit=1`
  );
  const lastSeenAt = latest?.[0]?.last_seen_at;
  console.log('last_seen_at:', lastSeenAt);
  if (!lastSeenAt) return;

  const baseParams = `last_seen_at=eq.${encode(lastSeenAt)}&or=(is_spouse.is.null,is_spouse.eq.false)`;

  const trueRows = await fetchJson(
    `${SUPABASE_URL}/rest/v1/clients?select=id&has_nps_referral=eq.true&${baseParams}`
  );
  console.log('Clientes com indicação (has_nps_referral=true):', trueRows.length);

  const allRows = await fetchJson(
    `${SUPABASE_URL}/rest/v1/clients?select=id,has_nps_referral&${baseParams}`
  );
  const counts = allRows.reduce((acc, row) => {
    const key = row.has_nps_referral ? 'true' : 'false';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  console.log('Distribuição:', counts);

  if (trueRows.length > 0) {
    const sample = await fetchJson(
      `${SUPABASE_URL}/rest/v1/clients?select=name,planner,has_nps_referral,overdue_installments&has_nps_referral=eq.true&${baseParams}&limit=5`
    );
    console.log('Exemplo de clientes com indicação true:', sample);
  }
}

main().catch(err => {
  console.error('Erro ao consultar Supabase:', err);
  process.exit(1);
});

