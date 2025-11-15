/**
 * Utilitários para exportação de dados
 */

import { Client } from '@/types/client';
import { calculateHealthScore } from './healthScore';

export interface ExportOptions {
  format: 'csv' | 'json' | 'xlsx';
  includeHistory?: boolean;
  filters?: {
    planner?: string;
    category?: string;
    manager?: string;
    mediator?: string;
    leader?: string;
  };
}

/**
 * Exporta clientes para CSV
 */
export function exportClientsToCSV(clients: Client[], options?: ExportOptions): string {
  const headers = [
    'Nome',
    'Planejador',
    'Gerente',
    'Mediador',
    'Líder',
    'Health Score',
    'Categoria',
    'NPS Score v3',
    'Tem Indicação',
    'Parcelas em Atraso',
    'Dias de Inadimplência',
    'Cross Sell Count',
    'Meses Relacionamento',
    'Email',
    'Telefone',
    'Última Reunião',
    'Tem Reunião Agendada',
    'Status App',
    'Status Pagamento',
    'Tem Indicações',
    'Uso Ecossistema',
    'É Cônjuge',
    'Nome do Pagante'
  ];

  const rows = clients.map(client => {
    const score = calculateHealthScore(client);
    return [
      client.name || '',
      client.planner || '',
      client.manager || '',
      client.mediator || '',
      client.leader || '',
      score.score.toString(),
      score.category,
      client.npsScoreV3?.toString() || '',
      client.hasNpsReferral ? 'Sim' : 'Não',
      client.overdueInstallments?.toString() || '0',
      client.overdueDays?.toString() || '0',
      client.crossSellCount?.toString() || '0',
      client.monthsSinceClosing?.toString() || '',
      client.email || '',
      client.phone || '',
      client.lastMeeting || '',
      client.hasScheduledMeeting ? 'Sim' : 'Não',
      client.appUsage || '',
      client.paymentStatus || '',
      client.hasReferrals ? 'Sim' : 'Não',
      client.ecosystemUsage || '',
      client.isSpouse ? 'Sim' : 'Não',
      client.spousePartnerName || ''
    ];
  });

  // Escapar valores que contêm vírgulas ou aspas
  const escapeCSV = (value: string): string => {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  };

  const csvContent = [
    headers.map(escapeCSV).join(','),
    ...rows.map(row => row.map(escapeCSV).join(','))
  ].join('\n');

  return csvContent;
}

/**
 * Exporta clientes para JSON
 */
export function exportClientsToJSON(clients: Client[], options?: ExportOptions): string {
  const data = clients.map(client => {
    const score = calculateHealthScore(client);
    return {
      ...client,
      healthScore: score.score,
      healthCategory: score.category,
      breakdown: score.breakdown
    };
  });

  return JSON.stringify(data, null, 2);
}

/**
 * Faz download de arquivo
 */
export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Exporta clientes com opções
 */
export function exportClients(clients: Client[], options: ExportOptions): void {
  const timestamp = new Date().toISOString().split('T')[0];
  let content: string;
  let filename: string;
  let mimeType: string;

  switch (options.format) {
    case 'csv':
      content = exportClientsToCSV(clients, options);
      filename = `health-score-clientes-${timestamp}.csv`;
      mimeType = 'text/csv;charset=utf-8;';
      break;
    case 'json':
      content = exportClientsToJSON(clients, options);
      filename = `health-score-clientes-${timestamp}.json`;
      mimeType = 'application/json';
      break;
    default:
      throw new Error(`Formato não suportado: ${options.format}`);
  }

  downloadFile(content, filename, mimeType);
}

