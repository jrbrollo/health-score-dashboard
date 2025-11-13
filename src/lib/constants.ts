/**
 * Constantes compartilhadas do sistema
 */

/**
 * Data mínima para histórico confiável
 * 
 * IMPORTANTE: Histórico anterior a esta data contém dados de versões antigas
 * do sistema e não deve ser usado para análises, pois:
 * - Usa estrutura de dados diferente (v2 vs v3)
 * - Métricas calculadas de forma diferente
 * - Pode causar inconsistências e análises incorretas
 * 
 * Data: 13/11/2025 - Primeira data com dados confiáveis da versão v3
 */
export const MIN_HISTORY_DATE = new Date(2025, 10, 13); // 13/11/2025 (mês é 0-indexed, então 10 = novembro)
MIN_HISTORY_DATE.setHours(0, 0, 0, 0); // Garantir que é meia-noite

/**
 * Verifica se uma data é válida para uso no histórico
 */
export function isValidHistoryDate(date: Date): boolean {
  const dateToCheck = new Date(date);
  dateToCheck.setHours(0, 0, 0, 0);
  return dateToCheck >= MIN_HISTORY_DATE;
}

/**
 * Garante que uma data não seja anterior à data mínima
 * Retorna a data mínima se a data fornecida for anterior
 */
export function clampToMinHistoryDate(date: Date): Date {
  const dateToCheck = new Date(date);
  dateToCheck.setHours(0, 0, 0, 0);
  return dateToCheck < MIN_HISTORY_DATE ? new Date(MIN_HISTORY_DATE) : dateToCheck;
}

