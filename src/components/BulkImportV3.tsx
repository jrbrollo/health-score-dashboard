import Papa from 'papaparse';
import { supabase } from '@/lib/supabase';
import { useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Upload, CheckCircle, AlertTriangle, Info } from "lucide-react";
import { Client, BulkImportPayload } from "@/types/client";
import { toast } from "@/hooks/use-toast";

interface BulkImportV3Props {
  onImport: (payload: BulkImportPayload) => void;
  onClose: () => void;
  isDarkMode?: boolean;
}

type ParsedClientRow = {
  client: Omit<Client, 'id' | 'createdAt' | 'updatedAt'>;
  nameNorm: string;
  plannerNorm: string;
  isSpouse: boolean;
  spousePartnerRaw?: string | null;
  spousePartnerNorm?: string | null;
};

export function BulkImportV3({ onImport, onClose, isDarkMode = false }: BulkImportV3Props) {
  const [csvData, setCsvData] = useState<string>("");
  const [preview, setPreview] = useState<any[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [spousesMarked, setSpousesMarked] = useState(0);
  const [parsedClients, setParsedClients] = useState<Omit<Client, 'id' | 'createdAt' | 'updatedAt'>[]>([]);
  const [sheetDateRaw, setSheetDateRaw] = useState<string | null>(null);
  const [sheetDateIso, setSheetDateIso] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setCsvData(text);
      parseCsvV3(text);
    };
    reader.readAsText(file, 'UTF-8'); // Garantir UTF-8
  };

  // Utils de sanitização
  function onlyDigits(s?: string | null) { return s ? s.replace(/\D+/g, '') : ''; }
  function parseIntSafe(s?: string | null) { const n = parseInt(onlyDigits(s)); return Number.isFinite(n) ? n : undefined; }
  function normalizePhone(s?: string | null) {
    if (!s) return undefined;
    const t = String(s).trim();
    if (t.includes('@')) return undefined;
    return t;
  }
  function parseReferral(val: any): boolean {
    const raw = (val ?? '').toString().trim();
    if (!raw) return false;
    const normalized = norm(raw);
    if (!normalized) return false;
    if (['sim', 's', 'true', 't', '1', 'x', 'ok', 'yes', 'y'].includes(normalized)) return true;
    const digits = parseInt(onlyDigits(raw) || '0', 10);
    if (Number.isFinite(digits) && digits > 0) return true; // qualquer número > 0
    return false;
  }

const GENERIC_PLACEHOLDERS = new Set(['', 'nao', 'não', 'na', 'n/a', 'n/d', '#n/d', '0', '-', '—', 'nao encontrou', 'não encontrou', '#ref!']);
const spousePlaceholders = GENERIC_PLACEHOLDERS;
  function parseSpouse(val: any): boolean {
    const raw = (val ?? '').toString().trim();
    if (!raw) return false;
    const normalized = norm(raw);
    if (spousePlaceholders.has(normalized)) return false;
    if (['sim', 's', 'true', 't', '1', 'x', 'yes', 'y'].includes(normalized)) return true;
    // Qualquer outro valor (normalmente o nome do titular pagante) significa que este cliente é cônjuge
    return true;
  }
  function norm(s: string) { return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); }
  function getField(row: any, target: string, fallbacks: string[] = []) {
    const keys = Object.keys(row || {});
    const targetNorm = norm(target);
    const fallbackNorms = fallbacks.map(norm);
    for (const k of keys) {
      const nk = norm(k);
      if (nk === targetNorm) return row[k];
      if (fallbackNorms.includes(nk)) return row[k];
    }
    // busca por contains quando houver variação (ex.: "indicacoes nps")
    for (const k of keys) {
      const nk = norm(k);
      if (nk.includes('indicacao') && nk.includes('nps')) return row[k];
    }
    return undefined;
  }

  function parseSheetDate(fields?: string[]): { raw: string | null; iso: string | null } {
    if (!fields || fields.length === 0) return { raw: null, iso: null };
    const candidate = fields
      .map(f => (f ?? '').trim())
      .find(f => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(f));
    if (!candidate) return { raw: null, iso: null };
    const [day, month, year] = candidate.split('/');
    const iso = `${year.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    return { raw: candidate, iso };
  }

  const parseCsvV3 = async (text: string) => {
    try {
      setParsedClients([]);
      const parsed = Papa.parse(text, {
        delimiter: ';',
        header: true,
        quoteChar: '"',
        skipEmptyLines: 'greedy',
        transformHeader: (h) => h.trim(),
      });

      const { raw: parsedSheetDateRaw, iso: parsedSheetDateIso } = parseSheetDate(parsed.meta?.fields);
      setSheetDateRaw(parsedSheetDateRaw);
      setSheetDateIso(parsedSheetDateIso);

      const expected = [
        'Clientes', 'Email', 'Telefone', 'Cônjuge', 'Meses do Fechamento',
        'Planejador', 'Líder em Formação', 'Mediador', 'Gerente',
        'NPS', 'Indicação NPS', 'Inadimplência Parcelas', 'Inadimplência Dias', 'Cross Sell'
      ];

      const rows = (parsed.data as any[]).filter(Boolean);
      const newErrors: string[] = [];
      const newWarnings: string[] = [];
      const parsedRows: ParsedClientRow[] = [];
      const pairs: { name: string; planner: string }[] = [];
      let spousesCount = 0;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const missing = expected.filter((h) => !(h in row));
        if (missing.length) {
          newErrors.push(`Linha ${i + 2}: headers ausentes: ${missing.join(', ')}`);
          continue;
        }

        const spouseRaw = getField(row, 'Cônjuge', ['Conjuge']);
        const spouseRawString = (spouseRaw ?? '').toString().trim();
        const isSpouse = parseSpouse(spouseRaw);
        if (isSpouse) { spousesCount++; }

        const name = (row['Clientes'] || '').toString().trim();
        const planner = (row['Planejador'] || '').toString().trim();
        const nameNorm = norm(name);
        const plannerNorm = norm(planner);
        if (!name || !planner || GENERIC_PLACEHOLDERS.has(nameNorm) || GENERIC_PLACEHOLDERS.has(plannerNorm)) {
          newWarnings.push(`Linha ${i + 2}: linha ignorada (nome/planejador inválido)`);
          continue;
        }

        const phone = normalizePhone(row['Telefone']);
        const monthsSinceClosing = parseIntSafe(
          getField(row, 'Meses do Fechamento', [
            'Meses de Fechamento', 'Meses Fechamento', 'Meses Relacionamento',
            'Meses de relacionamento', 'Tempo de Relacionamento', 'Tempo de relacionamento', 'Meses'
          ])
        ) ?? null;
        const npsScoreV3 = parseIntSafe(getField(row, 'NPS'));
        const hasNpsReferral = parseReferral(getField(row, 'Indicação NPS', ['Indicacao NPS', 'Indicações NPS', 'Indicacoes NPS']));
        const overdueInstallments = parseIntSafe(row['Inadimplência Parcelas']) ?? 0;
        const overdueDays = parseIntSafe(row['Inadimplência Dias']) ?? 0;
        const crossSellCount = parseIntSafe(
          getField(row, 'Cross Sell', [
            'Cross-Sell', 'CrossSell', 'Cross sell', 'Cross_sell',
            'Cross sell (qtd)', 'Cross-sell (qtd)', 'Cross Sell (Qtd)', 'CrossSell Qtd', 'Cross Sell Qtd',
            'Qtd Cross Sell', 'Qtd Cross-sell', 'Qtd cross sell', 'Qtd de cross sell',
            'Produtos adicionais', 'Produtos adicionais (qtd)'
          ])
        );

        const clientPayload: Omit<Client, 'id' | 'createdAt' | 'updatedAt'> = {
          name,
          email: (row['Email'] || '').toString().trim() || undefined,
          phone,
          planner,
          leader: (row['Líder em Formação'] || '').toString().trim() || undefined,
          mediator: (row['Mediador'] || '').toString().trim() || undefined,
          manager: (row['Gerente'] || '').toString().trim() || undefined,
          isSpouse,
          monthsSinceClosing,
          npsScoreV3: npsScoreV3 ?? null,
          hasNpsReferral,
          overdueInstallments,
          overdueDays,
          crossSellCount,
          meetingsEnabled: false,
        };

        parsedRows.push({
          client: clientPayload,
          nameNorm,
          plannerNorm,
          isSpouse,
          spousePartnerRaw: isSpouse ? spouseRawString : undefined,
          spousePartnerNorm: isSpouse && spouseRawString ? norm(spouseRawString) : undefined,
        });

        pairs.push({ name: name.toLowerCase().trim(), planner: planner.toLowerCase().trim() });
      }

      const payersByKey = new Map<string, ParsedClientRow>();
      const payersByName = new Map<string, ParsedClientRow>();
      for (const row of parsedRows) {
        if (!row.isSpouse) {
          const key = `${row.nameNorm}|${row.plannerNorm}`;
          if (!payersByKey.has(key)) {
            payersByKey.set(key, row);
          }
          if (!payersByName.has(row.nameNorm)) {
            payersByName.set(row.nameNorm, row);
          }
        }
      }

      for (const row of parsedRows) {
        if (!row.isSpouse || !row.spousePartnerNorm) continue;
        const partnerKey = `${row.spousePartnerNorm}|${row.plannerNorm}`;
        let partner = payersByKey.get(partnerKey);
        if (!partner) {
          partner = payersByName.get(row.spousePartnerNorm);
        }
        if (partner) {
          // Compartilhar apenas métricas que representam a jornada do relacionamento,
          // deixando NPS, Indicação, Cross Sell e Inadimplência individuais para evitar duplicidades.
          if (partner.client.monthsSinceClosing != null) {
            row.client.monthsSinceClosing = partner.client.monthsSinceClosing;
          }
        }
      }

      const finalClients = parsedRows.map(row => row.client);

      setSpousesMarked(spousesCount);
      setErrors(newErrors);
      const warningsWithDate = [...newWarnings];
      if (!parsedSheetDateIso) {
        warningsWithDate.push('Não foi possível identificar a data da planilha (coluna R). Usaremos a data atual como fallback.');
      }
      setWarnings(warningsWithDate);
      setPreview(finalClients.slice(0, 10));
      setParsedClients(finalClients);

      // Comparar com snapshot atual no Supabase (debug): quem está na planilha e não está no snapshot
      // Chamada assíncrona em background para não travar parsing
      const pairStrings = pairs.map(pair => `${pair.name}|${pair.planner}`);
      (supabase.rpc('diff_snapshot_pairs', { p_pairs: pairStrings }) as Promise<any>).then(({ data: diff, error: diffErr }) => {
        try {
          if (!diffErr && Array.isArray(diff)) {
            console.log('🔎 Ausentes no snapshot (nome|planejador):', diff.length, diff.slice(0, 20));
            if (diff.length > 0) {
              toast({ title: 'Diferenças encontradas', description: `${diff.length} clientes da planilha não estão no snapshot atual.`, variant: 'destructive' });
            }
          } else if (diffErr) {
            console.warn('Warn ao comparar com snapshot (diff_snapshot_pairs):', diffErr);
          }
        } catch (e) {
          console.warn('Warn ao processar diff:', e);
        }
      }).catch((e: any) => console.warn('Warn ao comparar com snapshot:', e));

      if (newErrors.length === 0 && finalClients.length > 0) {
        toast({
          title: 'CSV processado com sucesso!',
          description: `${finalClients.length} clientes prontos para importar. ${spousesCount} cônjuges marcados.${parsedSheetDateIso ? ` Data da planilha: ${parsedSheetDateIso}.` : ''}`
        });
      } else if (newErrors.length > 0) {
        toast({ title: 'Erros encontrados no CSV', description: `${newErrors.length} erro(s). Corrija e tente novamente.`, variant: 'destructive' });
      }
    } catch (error) {
      setErrors([`Erro ao processar CSV: ${error}`]);
      setPreview([]);
    }
  };

  const handleImport = () => {
    if (parsedClients.length === 0) {
      toast({
        title: "Nenhum dado para importar",
        description: "Faça upload de um arquivo CSV válido primeiro.",
        variant: "destructive",
      });
      return;
    }

    if (errors.length > 0) {
      toast({
        title: "Corrija os erros antes de importar",
        description: `${errors.length} erro(s) encontrado(s).`,
        variant: "destructive",
      });
      return;
    }

    const allData = parsedClients.map(client => ({ ...client }));
    onImport({
      clients: allData,
      sheetDate: sheetDateIso ?? undefined,
      sheetDateRaw: sheetDateRaw ?? undefined,
    });
    toast({
      title: 'Importação iniciada!',
      description: `${allData.length} clientes serão importados.${sheetDateIso ? ` Data referência: ${sheetDateIso}.` : ''}`
    });
  };

  return (
    <div className="space-y-6">
      <Card className={isDarkMode ? 'gradient-card-dark' : 'gradient-card-light'}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Importação em Massa v3
          </CardTitle>
          <CardDescription>
            Importe clientes da planilha Health Score v3 (formato CSV UTF-8, separador ;)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Info sobre cônjuges */}
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              <strong>Importante:</strong> Se a coluna "Cônjuge" estiver preenchida com o nome do titular pagante, o cliente será importado normalmente e marcado como cônjuge para fins de análise.
            </AlertDescription>
          </Alert>

          {/* Upload */}
          <div className="space-y-2">
            <Label htmlFor="csv-upload">Arquivo CSV</Label>
            <Input
              id="csv-upload"
              type="file"
              accept=".csv"
              ref={fileInputRef}
              onChange={handleFileUpload}
              className={isDarkMode ? 'bg-gray-800 border-gray-700' : ''}
            />
          </div>

          {/* Estatísticas */}
          {preview.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold text-green-600">{parsedClients.length}</div>
                  <div className="text-sm text-muted-foreground">Clientes válidos</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold text-blue-600">{spousesMarked}</div>
                  <div className="text-sm text-muted-foreground">Cônjuges identificados</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold text-purple-600">{sheetDateIso ?? '—'}</div>
                  <div className="text-sm text-muted-foreground">Data da planilha (coluna R)</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold text-red-600">{errors.length}</div>
                  <div className="text-sm text-muted-foreground">Erros</div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Erros */}
          {errors.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <div className="font-semibold mb-2">Erros encontrados:</div>
                <ul className="list-disc list-inside space-y-1 max-h-40 overflow-y-auto">
                  {errors.slice(0, 10).map((error, i) => (
                    <li key={i} className="text-sm">{error}</li>
                  ))}
                  {errors.length > 10 && (
                    <li className="text-sm font-semibold">... e mais {errors.length - 10} erro(s)</li>
                  )}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* Warnings */}
          {warnings.length > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <div className="font-semibold mb-2">Avisos ({warnings.length}):</div>
                <ul className="list-disc list-inside space-y-1 max-h-32 overflow-y-auto text-xs">
                  {warnings.slice(0, 5).map((warning, i) => (
                    <li key={i}>{warning}</li>
                  ))}
                  {warnings.length > 5 && (
                    <li className="font-semibold">... e mais {warnings.length - 5} aviso(s)</li>
                  )}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* Preview */}
          {preview.length > 0 && errors.length === 0 && (
            <div className="space-y-2">
              <Label>Preview (primeiros 10 clientes)</Label>
              <div className="border rounded-lg p-4 max-h-64 overflow-y-auto">
                {preview.map((client, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div>
                      <div className="font-medium">{client.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {client.planner} • {client.manager || 'Sem gerente'}
                      </div>
                    </div>
                    <div className="text-right text-sm">
                      <div>NPS: {client.npsScoreV3 ?? 'N/A'}</div>
                      <div>Meses: {client.monthsSinceClosing ?? 'N/A'}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ações */}
          <div className="flex gap-2 pt-4">
            <Button
              onClick={handleImport}
              disabled={preview.length === 0 || errors.length > 0}
              className="flex-1"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Importar {preview.length > 0 ? `${preview.length}+ clientes` : ''}
            </Button>
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

