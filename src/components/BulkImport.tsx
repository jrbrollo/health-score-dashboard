import { useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Upload, Download, FileText, CheckCircle, AlertTriangle } from "lucide-react";
import { Client, Planner, LastMeeting, AppUsage, PaymentStatus, NPSScore, EcosystemUsage } from "@/types/client";
import { toast } from "@/hooks/use-toast";

interface BulkImportProps {
  onImport: (clients: Omit<Client, "id" | "createdAt" | "updatedAt">[]) => void;
  onClose: () => void;
  isDarkMode?: boolean;
}

export function BulkImport({ onImport, onClose, isDarkMode = false }: BulkImportProps) {
  const [csvData, setCsvData] = useState<string>("");
  const [preview, setPreview] = useState<any[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const csvTemplate = `Planejador;Cliente;Ultima reuniao;Proxima reuniao;Uso app categorizacao;Pagamento;Indicacoes;Nota NPS;Uso outras areas
Barroso;Joao Silva;<30 dias;Sim;Acessou e categorizou (15 dias);Em dia;Sim;Promotor (9-10);Usou 2+ areas
Helio;Maria Santos;31-60 dias;Nao;Acessou, sem categorizacao;Em dia;Nao;Neutro/SR (7-8);Usou 1 area
Abraao;Pedro Costa;>60 dias;Nao;Nao acessou/categorizou (30+ dias);1 parcela em atraso;Nao;Detrator (0-6);Nenhuma`;

  const downloadTemplate = () => {
    const blob = new Blob([csvTemplate], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = 'template_clientes.csv';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    
    toast({
      title: "Template baixado!",
      description: "Use o arquivo template_clientes.csv como modelo.",
    });
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setCsvData(text);
      parseCsv(text);
    };
    reader.readAsText(file);
  };

  const parseCsv = (text: string) => {
    try {
      const lines = text.trim().split('\n');
      const headers = lines[0].split(';').map(h => h.trim());
      
      const expectedHeaders = [
        'Planejador', 'Cliente', 'Ultima reuniao', 'Proxima reuniao', 
        'Uso app categorizacao', 'Pagamento', 'Indicacoes', 'Nota NPS', 'Uso outras areas'
      ];

      // Validar headers simples (comparação exata)
      const missingHeaders = expectedHeaders.filter(h => !headers.includes(h));
      if (missingHeaders.length > 0) {
        setErrors([`Headers obrigatórios faltando: ${missingHeaders.join(', ')}`]);
        setPreview([]);
        return;
      }

      const data = [];
      const newErrors = [];

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(';').map(v => v.trim());
        if (values.length !== headers.length) {
          newErrors.push(`Linha ${i + 1}: Número incorreto de colunas`);
          continue;
        }

        const row: any = {};
        headers.forEach((header, index) => {
          row[header] = values[index];
        });

        // Validações específicas
        if (!row['Cliente'] || row['Cliente'].length < 2) {
          newErrors.push(`Linha ${i + 1}: Nome do cliente inválido`);
        }

        const validPlanners = ["Barroso", "Rossetti", "Ton", "Bizelli", "Abraao", "Murilo", "Felipe", "Helio", "Vinícius"];
        if (!validPlanners.includes(row['Planejador'])) {
          newErrors.push(`Linha ${i + 1}: Planejador inválido: ${row['Planejador']}`);
        }

        // Validar valores de Ultima reuniao
        const validLastMeeting = ["<30 dias", "31-60 dias", ">60 dias"];
        if (!validLastMeeting.includes(row['Ultima reuniao'])) {
          newErrors.push(`Linha ${i + 1}: Valor inválido em 'Ultima reuniao': ${row['Ultima reuniao']}`);
        }

        // Validar valores de Proxima reuniao
        const validProximaReuniao = ["Sim", "Nao"];
        if (!validProximaReuniao.includes(row['Proxima reuniao'])) {
          newErrors.push(`Linha ${i + 1}: Valor inválido em 'Proxima reuniao': ${row['Proxima reuniao']}`);
        }

        // Validar valores de Pagamento
        const validPayment = ["Em dia", "1 parcela em atraso", "2 parcelas em atraso", "3+ parcelas em atraso"];
        if (!validPayment.includes(row['Pagamento'])) {
          newErrors.push(`Linha ${i + 1}: Valor inválido em 'Pagamento': ${row['Pagamento']}`);
        }

        // Validar valores de Indicacoes
        const validIndicacoes = ["Sim", "Nao"];
        if (!validIndicacoes.includes(row['Indicacoes'])) {
          newErrors.push(`Linha ${i + 1}: Valor inválido em 'Indicacoes': ${row['Indicacoes']}`);
        }

        // Validar valores de Nota NPS
        const validNPS = ["Promotor (9-10)", "Neutro/SR (7-8)", "Detrator (0-6)"];
        if (!validNPS.includes(row['Nota NPS'])) {
          newErrors.push(`Linha ${i + 1}: Valor inválido em 'Nota NPS': ${row['Nota NPS']}`);
        }

        // Converter e mapear campos para o formato esperado
        row.name = row['Cliente'];
        row.planner = row['Planejador'];
        row.hasScheduledMeeting = row['Proxima reuniao']?.toLowerCase() === 'sim';
        row.hasReferrals = row['Indicacoes']?.toLowerCase() === 'sim';

        // Mapear campos específicos com conversões necessárias
        const ultimaReuniao = row['Ultima reuniao'];
        if (ultimaReuniao === '<30 dias') {
          row.lastMeeting = '< 30 dias';
        } else if (ultimaReuniao === '>60 dias') {
          row.lastMeeting = '> 60 dias';
        } else {
          row.lastMeeting = ultimaReuniao;
        }

        // Mapear uso do app
        const usoApp = row['Uso app categorizacao'];
        if (usoApp === 'Acessou e categorizou (15 dias)') {
          row.appUsage = 'Acessou e categorizou (15 dias)';
        } else if (usoApp === 'Acessou, sem categorizacao') {
          row.appUsage = 'Acessou, sem categorização';
        } else if (usoApp === 'Nao acessou/categorizou (30+ dias)') {
          row.appUsage = 'Sem acesso/categorização (30+ dias)';
        } else {
          // Fallback para valores não mapeados
          newErrors.push(`Linha ${i + 1}: Valor inválido em 'Uso app categorizacao': ${usoApp}`);
          row.appUsage = 'Sem acesso/categorização (30+ dias)'; // Valor padrão
        }

        // Mapear status de pagamento
        const pagamento = row['Pagamento'];
        if (pagamento === 'Em dia') {
          row.paymentStatus = 'Pagamento em dia';
        } else {
          row.paymentStatus = pagamento;
        }

        // Mapear NPS
        const nps = row['Nota NPS'];
        if (nps === 'Neutro/SR (7-8)') {
          row.npsScore = 'Neutro (7-8)';
        } else {
          row.npsScore = nps;
        }

        // Mapear outras áreas
        const outrasAreas = row['Uso outras areas'];
        if (outrasAreas === 'Usou 2+ areas') {
          row.ecosystemUsage = 'Usou 2+ áreas';
        } else if (outrasAreas === 'Usou 1 area') {
          row.ecosystemUsage = 'Usou 1 área';
        } else if (outrasAreas === 'Nenhuma') {
          row.ecosystemUsage = 'Não usou';
        } else {
          // Fallback para valores não mapeados
          newErrors.push(`Linha ${i + 1}: Valor inválido em 'Uso outras areas': ${outrasAreas}`);
          row.ecosystemUsage = 'Não usou'; // Valor padrão
        }

        // Para a preview, manter os valores originais dos headers
        row['Cliente'] = row.name;
        row['Planejador'] = row.planner;
        row['Ultima reuniao'] = ultimaReuniao;
        row['Pagamento'] = pagamento;

        data.push(row);
      }

      setErrors(newErrors);
      setPreview(data);
    } catch (error) {
      setErrors(['Erro ao processar arquivo CSV']);
      setPreview([]);
    }
  };

  const handleImport = () => {
    if (errors.length > 0) {
      toast({
        title: "Não é possível importar",
        description: "Corrija os erros antes de importar.",
        variant: "destructive",
      });
      return;
    }

    if (preview.length === 0) {
      toast({
        title: "Nenhum dado para importar",
        description: "Selecione um arquivo CSV válido.",
        variant: "destructive",
      });
      return;
    }

    // Converter dados para o formato esperado
    const clients = preview.map(row => ({
      name: row.name,
      planner: row.planner as Planner,
      lastMeeting: row.lastMeeting as LastMeeting,
      hasScheduledMeeting: row.hasScheduledMeeting,
      appUsage: row.appUsage as AppUsage,
      paymentStatus: row.paymentStatus as PaymentStatus,
      hasReferrals: row.hasReferrals,
      npsScore: row.npsScore as NPSScore,
      ecosystemUsage: row.ecosystemUsage as EcosystemUsage,
    }));

    // Debug: verificar dados antes de importar
    console.log('Clientes a serem importados:', clients);
    clients.forEach((client, index) => {
      console.log(`Cliente ${index + 1}: ${client.name} - Planejador: ${client.planner}`);
    });

    onImport(clients);
    
    toast({
      title: "Importação concluída!",
      description: `${clients.length} cliente(s) importado(s) com sucesso.`,
    });
  };

  return (
    <div className={`min-h-screen p-6 transition-colors duration-300 ${isDarkMode ? 'gradient-bg-dark text-white' : 'gradient-bg-light text-gray-900'}`}>
      <div className="max-w-4xl mx-auto space-y-8">
        <Card className={`animate-fade-in-up ${isDarkMode ? 'gradient-card-dark card-hover-dark' : 'gradient-card-light card-hover'}`}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              <Upload className="h-6 w-6" />
              Importação em Massa de Clientes
            </CardTitle>
            <CardDescription className="text-lg">
              Faça upload de um arquivo CSV para adicionar múltiplos clientes de uma vez
            </CardDescription>
          </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Template Download */}
          <div className={`flex items-center justify-between p-4 rounded-lg border transition-colors ${isDarkMode ? 'bg-blue-900/20 border-blue-700/50' : 'bg-blue-50 border-blue-200'}`}>
            <div className="flex items-center gap-3">
              <FileText className={`h-5 w-5 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
              <div>
                <p className={`font-medium ${isDarkMode ? 'text-blue-300' : 'text-blue-900'}`}>Baixe o template CSV</p>
                <p className={`text-sm ${isDarkMode ? 'text-blue-400' : 'text-blue-700'}`}>Use este modelo para organizar seus dados</p>
              </div>
            </div>
            <Button variant="outline" onClick={downloadTemplate} className="shadow-lg">
              <Download className="h-4 w-4 mr-2" />
              Baixar Template
            </Button>
          </div>

          {/* File Upload */}
          <div className="space-y-2">
            <Label htmlFor="csv-file">Selecionar arquivo CSV</Label>
            <Input
              id="csv-file"
              type="file"
              accept=".csv"
              ref={fileInputRef}
              onChange={handleFileUpload}
              className="cursor-pointer"
            />
          </div>

          {/* Errors */}
          {errors.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-1">
                  <p className="font-medium">Erros encontrados:</p>
                  <ul className="list-disc list-inside space-y-1">
                    {errors.map((error, index) => (
                      <li key={index} className="text-sm">{error}</li>
                    ))}
                  </ul>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Preview */}
          {preview.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <h3 className="font-medium">Preview dos dados ({preview.length} cliente(s))</h3>
              </div>
              
              <div className="max-h-60 overflow-auto border rounded-lg">
                <table className="w-full text-sm">
                  <thead className={`${isDarkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
                    <tr>
                      <th className="p-2 text-left">Cliente</th>
                      <th className="p-2 text-left">Planejador</th>
                      <th className="p-2 text-left">Ultima reuniao</th>
                      <th className="p-2 text-left">Pagamento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 5).map((row, index) => (
                      <tr key={index} className="border-t">
                        <td className="p-2">{row['Cliente']}</td>
                        <td className="p-2">{row['Planejador']}</td>
                        <td className="p-2">{row['Ultima reuniao']}</td>
                        <td className="p-2">{row['Pagamento']}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.length > 5 && (
                  <div className={`p-2 text-center text-muted-foreground ${isDarkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
                    ... e mais {preview.length - 5} cliente(s)
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-between pt-4 border-t">
            <Button variant="outline" onClick={onClose} className="shadow-lg">
              Cancelar
            </Button>
            <Button 
              onClick={handleImport}
              disabled={preview.length === 0 || errors.length > 0}
              className="flex items-center gap-2 btn-gradient"
            >
              <Upload className="h-4 w-4" />
              Importar {preview.length} Cliente(s)
            </Button>
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
