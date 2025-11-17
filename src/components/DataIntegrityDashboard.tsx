import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, CheckCircle, Info, Users, TrendingDown, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Client } from '@/types/client';
import { calculateHealthScore } from '@/utils/healthScore';

interface IntegrityMetrics {
  totalClients: number;
  totalSpouses: number;
  spousesWithoutPayer: Array<{ name: string; spousePartnerName: string; planner: string }>;
  clientsWithMissingData: Array<{ name: string; missingFields: string[] }>;
  clientsWithZeroScore: Array<{ name: string; planner: string; reason: string }>;
  outdatedClients: Array<{ name: string; lastSeenAt: string; daysSince: number }>;
}

export function DataIntegrityDashboard() {
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<IntegrityMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadIntegrityMetrics();
  }, []);

  async function loadIntegrityMetrics() {
    try {
      setLoading(true);
      setError(null);

      // Buscar todos os clientes
      const { data: clients, error: clientsError } = await supabase
        .from('clients')
        .select('*')
        .order('name');

      if (clientsError) throw clientsError;

      if (!clients || clients.length === 0) {
        setMetrics({
          totalClients: 0,
          totalSpouses: 0,
          spousesWithoutPayer: [],
          clientsWithMissingData: [],
          clientsWithZeroScore: [],
          outdatedClients: [],
        });
        setLoading(false);
        return;
      }

      // Processar métricas
      const totalClients = clients.length;
      const spouses = clients.filter((c) => c.is_spouse === true);
      const totalSpouses = spouses.length;

      // 1. Cônjuges sem pagante encontrado
      const spousesWithoutPayer: typeof metrics.spousesWithoutPayer = [];
      for (const spouse of spouses) {
        if (!spouse.spouse_partner_name) continue;

        // Verificar se pagante existe no banco
        const payerExists = clients.some(
          (c) =>
            c.name?.toLowerCase().trim() === spouse.spouse_partner_name?.toLowerCase().trim() &&
            c.planner === spouse.planner &&
            c.is_spouse !== true
        );

        if (!payerExists) {
          spousesWithoutPayer.push({
            name: spouse.name,
            spousePartnerName: spouse.spouse_partner_name,
            planner: spouse.planner,
          });
        }
      }

      // 2. Clientes com dados faltantes
      const clientsWithMissingData: typeof metrics.clientsWithMissingData = [];
      for (const client of clients) {
        const missingFields: string[] = [];

        if (!client.email) missingFields.push('Email');
        if (!client.phone) missingFields.push('Telefone');
        if (client.months_since_closing == null) missingFields.push('Meses de Relacionamento');
        if (client.nps_score_v3 == null && client.is_spouse !== true) missingFields.push('NPS');

        if (missingFields.length > 0) {
          clientsWithMissingData.push({
            name: client.name,
            missingFields,
          });
        }
      }

      // 3. Clientes com score 0 (críticos)
      const clientsWithZeroScore: typeof metrics.clientsWithZeroScore = [];
      for (const client of clients) {
        const score = calculateHealthScore(client as Client, clients as Client[]);
        if (score.total === 0) {
          let reason = '';
          if ((client.overdue_installments ?? 0) >= 3) {
            reason = '3+ parcelas em atraso';
          } else if (score.total === 0) {
            reason = 'Score calculado = 0';
          }

          clientsWithZeroScore.push({
            name: client.name,
            planner: client.planner,
            reason,
          });
        }
      }

      // 4. Clientes desatualizados (last_seen_at > 7 dias)
      const outdatedClients: typeof metrics.outdatedClients = [];
      const now = new Date();
      for (const client of clients) {
        if (!client.last_seen_at) continue;

        const lastSeen = new Date(client.last_seen_at);
        const daysSince = Math.floor((now.getTime() - lastSeen.getTime()) / (1000 * 60 * 60 * 24));

        if (daysSince > 7) {
          outdatedClients.push({
            name: client.name,
            lastSeenAt: lastSeen.toLocaleDateString('pt-BR'),
            daysSince,
          });
        }
      }

      setMetrics({
        totalClients,
        totalSpouses,
        spousesWithoutPayer,
        clientsWithMissingData,
        clientsWithZeroScore,
        outdatedClients,
      });
    } catch (err: any) {
      console.error('Erro ao carregar métricas de integridade:', err);
      setError(err.message || 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>Erro ao carregar dashboard de integridade: {error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!metrics) return null;

  const totalIssues =
    metrics.spousesWithoutPayer.length +
    metrics.clientsWithMissingData.length +
    metrics.clientsWithZeroScore.length +
    metrics.outdatedClients.length;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard de Integridade de Dados</h1>
        <p className="text-muted-foreground">
          Monitore a qualidade e consistência dos dados de clientes
        </p>
      </div>

      {/* Resumo de Métricas */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Clientes</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalClients}</div>
            <p className="text-xs text-muted-foreground">
              {metrics.totalSpouses} cônjuge{metrics.totalSpouses !== 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Problemas Encontrados</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalIssues}</div>
            <p className="text-xs text-muted-foreground">
              {totalIssues === 0 ? 'Nenhum problema' : 'Requer atenção'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cônjuges sem Pagante</CardTitle>
            <AlertCircle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.spousesWithoutPayer.length}</div>
            <p className="text-xs text-muted-foreground">Podem receber score incorreto</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Scores Críticos</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.clientsWithZeroScore.length}</div>
            <p className="text-xs text-muted-foreground">Score = 0</p>
          </CardContent>
        </Card>
      </div>

      {/* Status Geral */}
      {totalIssues === 0 ? (
        <Alert>
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>
            ✅ <strong>Excelente!</strong> Nenhum problema de integridade detectado nos dados.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            ⚠️ <strong>{totalIssues} problema{totalIssues !== 1 ? 's' : ''}</strong> detectado
            {totalIssues !== 1 ? 's' : ''} nos dados. Revise as abas abaixo para mais detalhes.
          </AlertDescription>
        </Alert>
      )}

      {/* Detalhes dos Problemas */}
      <Tabs defaultValue="spouses" className="space-y-4">
        <TabsList>
          <TabsTrigger value="spouses">
            Cônjuges sem Pagante
            {metrics.spousesWithoutPayer.length > 0 && (
              <Badge variant="destructive" className="ml-2">
                {metrics.spousesWithoutPayer.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="missing">
            Dados Faltantes
            {metrics.clientsWithMissingData.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {metrics.clientsWithMissingData.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="critical">
            Scores Críticos
            {metrics.clientsWithZeroScore.length > 0 && (
              <Badge variant="destructive" className="ml-2">
                {metrics.clientsWithZeroScore.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="outdated">
            Desatualizados
            {metrics.outdatedClients.length > 0 && (
              <Badge variant="outline" className="ml-2">
                {metrics.outdatedClients.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="spouses" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Cônjuges sem Pagante Encontrado</CardTitle>
              <CardDescription>
                Cônjuges que não têm o pagante correspondente no banco de dados. Estes cônjuges não
                herdarão NPS do pagante e receberão 0 pontos se não tiverem NPS próprio.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {metrics.spousesWithoutPayer.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  ✅ Todos os cônjuges têm pagantes válidos encontrados.
                </p>
              ) : (
                <div className="space-y-2">
                  {metrics.spousesWithoutPayer.slice(0, 50).map((spouse, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between border-b pb-2 last:border-0"
                    >
                      <div>
                        <p className="font-medium">{spouse.name}</p>
                        <p className="text-sm text-muted-foreground">
                          Pagante esperado: "{spouse.spousePartnerName}" • Planner: {spouse.planner}
                        </p>
                      </div>
                      <Badge variant="outline">Sem Pagante</Badge>
                    </div>
                  ))}
                  {metrics.spousesWithoutPayer.length > 50 && (
                    <p className="text-sm text-muted-foreground pt-4">
                      ... e mais {metrics.spousesWithoutPayer.length - 50} cônjuge(s)
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="missing" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Clientes com Dados Faltantes</CardTitle>
              <CardDescription>
                Clientes que possuem campos importantes vazios ou nulos.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {metrics.clientsWithMissingData.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  ✅ Todos os clientes têm dados completos.
                </p>
              ) : (
                <div className="space-y-2">
                  {metrics.clientsWithMissingData.slice(0, 50).map((client, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between border-b pb-2 last:border-0"
                    >
                      <div>
                        <p className="font-medium">{client.name}</p>
                        <p className="text-sm text-muted-foreground">
                          Faltando: {client.missingFields.join(', ')}
                        </p>
                      </div>
                      <Badge variant="secondary">{client.missingFields.length} campo(s)</Badge>
                    </div>
                  ))}
                  {metrics.clientsWithMissingData.length > 50 && (
                    <p className="text-sm text-muted-foreground pt-4">
                      ... e mais {metrics.clientsWithMissingData.length - 50} cliente(s)
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="critical" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Clientes com Score Crítico (0)</CardTitle>
              <CardDescription>
                Clientes com health score igual a zero, normalmente por inadimplência grave (3+
                parcelas).
              </CardDescription>
            </CardHeader>
            <CardContent>
              {metrics.clientsWithZeroScore.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  ✅ Nenhum cliente com score crítico.
                </p>
              ) : (
                <div className="space-y-2">
                  {metrics.clientsWithZeroScore.slice(0, 50).map((client, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between border-b pb-2 last:border-0"
                    >
                      <div>
                        <p className="font-medium">{client.name}</p>
                        <p className="text-sm text-muted-foreground">
                          Planner: {client.planner} • Motivo: {client.reason}
                        </p>
                      </div>
                      <Badge variant="destructive">Score 0</Badge>
                    </div>
                  ))}
                  {metrics.clientsWithZeroScore.length > 50 && (
                    <p className="text-sm text-muted-foreground pt-4">
                      ... e mais {metrics.clientsWithZeroScore.length - 50} cliente(s)
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="outdated" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Clientes Desatualizados</CardTitle>
              <CardDescription>
                Clientes que não foram vistos (last_seen_at) há mais de 7 dias.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {metrics.outdatedClients.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  ✅ Todos os clientes estão atualizados.
                </p>
              ) : (
                <div className="space-y-2">
                  {metrics.outdatedClients.slice(0, 50).map((client, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between border-b pb-2 last:border-0"
                    >
                      <div>
                        <p className="font-medium">{client.name}</p>
                        <p className="text-sm text-muted-foreground">
                          Última atualização: {client.lastSeenAt} ({client.daysSince} dias atrás)
                        </p>
                      </div>
                      <Badge variant="outline">{client.daysSince} dias</Badge>
                    </div>
                  ))}
                  {metrics.outdatedClients.length > 50 && (
                    <p className="text-sm text-muted-foreground pt-4">
                      ... e mais {metrics.outdatedClients.length - 50} cliente(s)
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
