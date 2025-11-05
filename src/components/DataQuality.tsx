import { useMemo, useState } from 'react'
import Papa from 'papaparse'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, FileUp, ListChecks } from 'lucide-react'

type CsvRow = Record<string, string>

type MissingItem = { name: string; planner: string; reason: string }

function normalize(str: string | null | undefined): string {
  return String(str ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function extractDigits(s: string): string {
  return (s || '').replace(/[^0-9]+/g, '')
}

function isValidEmail(email: string): boolean {
  const e = (email || '').trim()
  if (!e) return false
  // Validação simples
  return /.+@.+\..+/.test(e)
}

export default function DataQuality({ isDarkMode = false }: { isDarkMode?: boolean }) {
  const [sheetCount, setSheetCount] = useState<number>(0)
  const [snapshotCount, setSnapshotCount] = useState<number | null>(null)
  const [missing, setMissing] = useState<MissingItem[]>([])
  const [loading, setLoading] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)

  const reasonsCount = useMemo(() => {
    const acc: Record<string, number> = {}
    for (const m of missing) acc[m.reason] = (acc[m.reason] || 0) + 1
    return acc
  }, [missing])

  async function handleFile(file: File) {
    setLoading(true)
    setFileName(file.name)
    try {
      const text = await file.text()
      const parsed = Papa.parse<CsvRow>(text, { header: true, delimiter: ';', skipEmptyLines: true })
      const rows: CsvRow[] = (parsed.data as any[]).filter(Boolean)

      // Mapear cabeçalhos
      const headerNorm = Object.keys(rows[0] || {}).reduce((acc, key) => {
        acc[normalize(key)] = key
        return acc
      }, {} as Record<string, string>)

      const nameKey = headerNorm['clientes'] || headerNorm['cliente'] || headerNorm['nome']
      const plannerKey = headerNorm['planejador'] || headerNorm['planner']
      const spouseKey = headerNorm['conjuge'] || headerNorm['cônjuge'] || headerNorm['e conjuge'] || headerNorm['é cônjuge']
      const phoneKey = headerNorm['telefone']
      const emailKey = headerNorm['email']

      const pairs: { name: string; planner: string }[] = []
      const byKey = new Map<string, CsvRow>()
      const sheetItems: Array<{
        key: string
        name: string
        planner: string
        plannerRaw: string
        spouseRaw: string
        spouseVal: string
        phoneRaw: string
        emailRaw: string
        candidateKey: string
      }> = []
      const candidateGroups = new Map<string, { pairKeys: string[] }>()

      const placeholders = new Set(['#n/d','n/d','na','n/a','0','-','—','', '#ref!'])
      const spousePlaceholders = new Set(['', 'nao', 'não', '#n/d', 'n/d', 'na', 'n/a', '0', '-', '—', 'nao encontrou', 'não encontrou', '#ref!'])

      for (const r of rows) {
        const name = (r[nameKey] || '').trim()
        const planner = (r[plannerKey] || '').trim()
        if (!name || !planner) continue
        const spouseRaw = spouseKey ? (r[spouseKey] || '').trim() : ''
        const spouseVal = normalize(spouseRaw)
        const isSpouse = spouseVal && !spousePlaceholders.has(spouseVal)
        if (normalize(name) === '0' || normalize(planner) === '0') continue
        const key = `${normalize(name)}|${normalize(planner)}`
        const phoneRaw = phoneKey ? String(r[phoneKey] || '') : ''
        const emailRaw = emailKey ? String(r[emailKey] || '') : ''
        const phoneDigits = extractDigits(phoneRaw)
        const phoneBadFormat = /[eE]\+|,/.test(phoneRaw)
        let candidateKey = ''
        if (!phoneBadFormat && phoneDigits.length >= 9) candidateKey = `tel:${phoneDigits}`
        else if (isValidEmail(emailRaw)) candidateKey = `eml:${normalize(emailRaw)}`
        else candidateKey = `hash:${normalize(name)}|${normalize(planner)}`

        pairs.push({ name: normalize(name), planner: normalize(planner) })
        byKey.set(key, r)
        sheetItems.push({
          key,
          name: normalize(name),
          planner: normalize(planner),
          plannerRaw: planner,
          spouseRaw,
          spouseVal,
          phoneRaw,
          emailRaw,
          candidateKey,
        })
        const grp = candidateGroups.get(candidateKey) || { pairKeys: [] }
        grp.pairKeys.push(key)
        candidateGroups.set(candidateKey, grp)
      }

      setSheetCount(pairs.length)

      // Buscar snapshot count e diff
      const { data: lastRows, error: lastErr } = await supabase
        .from('clients')
        .select('last_seen_at')
        .not('last_seen_at', 'is', null)
        .order('last_seen_at', { ascending: false })
        .limit(1)
      if (lastErr) throw lastErr
      const lastTs: string | undefined = lastRows?.[0]?.last_seen_at

      // Snapshot count
      if (lastTs) {
        const { count, error: cntErr } = await supabase
          .from('clients')
          .select('*', { count: 'exact', head: true })
          .neq('name', '0')
          .neq('planner', '0')
          .eq('last_seen_at', lastTs)
        if (cntErr) throw cntErr
        setSnapshotCount(count ?? 0)
      } else {
        setSnapshotCount(0)
      }

      // Buscar snapshot para classificação detalhada
      const PAGE = 1000
      let offset = 0
      const snapAll: any[] = []
      while (true) {
        let q = supabase
          .from('clients')
          .select('name, planner, phone, email')
          .neq('name', '0')
          .neq('planner', '0')
          .order('created_at', { ascending: false })
          .range(offset, offset + PAGE - 1)
        if (lastTs) q = q.eq('last_seen_at', lastTs)
        const { data, error } = await q
        if (error) break
        if (data && data.length) snapAll.push(...data)
        if (!data || data.length < PAGE) break
        offset += PAGE
      }
      const snapSet = new Set(snapAll.map(r => `${normalize(r.name)}|${normalize(r.planner)}`))
      const nameToPlanners = new Map<string, Set<string>>()
      for (const r of snapAll) {
        const n = normalize(r.name)
        const p = normalize(r.planner)
        const set = nameToPlanners.get(n) || new Set<string>()
        set.add(p)
        nameToPlanners.set(n, set)
      }

      // Diff baseado no snapshot carregado
      const diff = pairs.filter(p => !snapSet.has(`${p.name}|${p.planner}`))

      // Mapear presença por grupo de candidateKey
      const presentByPairKey = new Set<string>(pairs
        .filter(p => snapSet.has(`${p.name}|${p.planner}`))
        .map(p => `${p.name}|${p.planner}`))
      const groupHasPresent = new Map<string, boolean>()
      for (const [cand, grp] of candidateGroups.entries()) {
        groupHasPresent.set(cand, grp.pairKeys.some(k => presentByPairKey.has(k)))
      }

      // Classificar motivos
      const missingWithReasons: MissingItem[] = diff.map(d => {
        const key = `${d.name}|${d.planner}`
        const row = byKey.get(key)
        if (!row) return { ...d, reason: 'desconhecido' }

        const item = sheetItems.find(it => it.key === key)
        const reasons: string[] = []
        const plannerRaw = item?.plannerRaw || ''
        const spouseVal = item?.spouseVal || ''
        const spouseRaw = item?.spouseRaw || ''
        const phoneRaw = item?.phoneRaw || ''
        const emailRaw = item?.emailRaw || ''
        const phoneDigits = extractDigits(phoneRaw)
        const phoneBadFormat = /[eE]\+|,/.test(phoneRaw)
        const plannerNorm = normalize(plannerRaw)

        // Planner inválido
        if (placeholders.has(plannerNorm)) {
          reasons.push(`planner inválido (valor: "${plannerRaw}")`)
        } else if (/^\d+$/.test(plannerNorm)) {
          reasons.push(`planner inválido (número isolado: "${plannerRaw}")`)
        }

        // Cônjuge
        if (spouseVal && !spousePlaceholders.has(spouseVal)) {
          reasons.push(spouseRaw ? `cônjuge (marcado como vinculado a "${spouseRaw}")` : 'cônjuge (marcado na planilha)')
        }

        // Telefone / Email
        if (phoneRaw) {
          if (phoneBadFormat) reasons.push('telefone inválido (formato E+ ou vírgula)')
          if (phoneDigits && phoneDigits.length > 0 && phoneDigits.length < 9) reasons.push(`telefone curto (${phoneDigits.length} dígitos)`)        
        }
        if (emailRaw && !isValidEmail(emailRaw)) reasons.push('email inválido')
        if ((!phoneDigits || phoneDigits.length < 9) && !isValidEmail(emailRaw)) {
          reasons.push('sem identificador (telefone curto/inválido e email vazio/inválido)')
        }

        // Duplicado na planilha por identity_key candidata
        const cand = item?.candidateKey || ''
        const grp = cand ? candidateGroups.get(cand) : undefined
        const grpCount = grp?.pairKeys.length || 0
        const hasPresentSibling = cand ? (groupHasPresent.get(cand) || false) : false
        if (grpCount > 1 && hasPresentSibling) {
          reasons.push('duplicado na planilha (colapsado por mesma identity_key)')
        } else if (grpCount > 1) {
          reasons.push('possível duplicado na planilha (mesma identity_key)')
        }

        // Planner divergente no snapshot
        const plannersInSnap = nameToPlanners.get(d.name)
        if (plannersInSnap && plannersInSnap.size > 0 && !plannersInSnap.has(d.planner)) {
          const sample = Array.from(plannersInSnap).slice(0, 3).join(', ')
          reasons.push(`planner divergente no snapshot (na base: ${sample})`)
        }

        if (reasons.length === 0) {
          reasons.push('não importado (sem causa evidente)')
        }
        return { ...d, reason: reasons.join('; ') }
      })

      setMissing(missingWithReasons)
    } catch (e) {
      console.error('Erro ao processar CSV:', e)
      setMissing([])
      setSnapshotCount(null)
      setSheetCount(0)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card className={`${isDarkMode ? 'gradient-card-dark' : 'gradient-card-light'}`}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ListChecks className="h-5 w-5" />
            Qualidade de Dados (Planilha vs Snapshot)
          </CardTitle>
          <CardDescription>
            Envie a planilha mestre para comparar com o snapshot atual e ver clientes com erro.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleFile(f)
              }}
            />
            <Button variant="outline" disabled>
              <FileUp className="h-4 w-4 mr-2" />
              {loading ? 'Processando...' : (fileName ? 'Arquivo carregado' : 'Selecione o CSV')}
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Total na planilha</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold">{sheetCount}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Total no snapshot</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold">{snapshotCount ?? '-'}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Com erro</CardTitle></CardHeader>
              <CardContent>
                <div className="text-2xl font-bold flex items-center gap-2">
                  {missing.length}
                  {missing.length > 0 && <AlertTriangle className="h-5 w-5 text-amber-500" />}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Arquivo</CardTitle></CardHeader>
              <CardContent><div className="text-sm text-muted-foreground truncate">{fileName || '-'}</div></CardContent>
            </Card>
          </div>

          {missing.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {Object.entries(reasonsCount).map(([reason, count]) => (
                  <Badge key={reason} variant="outline">{reason}: {count}</Badge>
                ))}
              </div>
              <div className="max-h-[380px] overflow-auto border rounded-md">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="text-left p-2">Cliente</th>
                      <th className="text-left p-2">Planejador</th>
                      <th className="text-left p-2">Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {missing.map((m, i) => (
                      <tr key={`${m.name}|${m.planner}|${i}`} className="border-t">
                        <td className="p-2 capitalize">{m.name}</td>
                        <td className="p-2 capitalize">{m.planner}</td>
                        <td className="p-2">{m.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}


