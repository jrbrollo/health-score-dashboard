/**
 * Funções de validação de dados de clientes
 */

/**
 * Valida NPS Score
 * @param npsScore Valor do NPS (0-10 ou null)
 * @returns true se válido
 */
export function validateNpsScore(npsScore: number | null | undefined): boolean {
  if (npsScore === null || npsScore === undefined) return true; // null é válido
  return Number.isFinite(npsScore) && npsScore >= 0 && npsScore <= 10;
}

/**
 * Valida número de parcelas em atraso
 * @param installments Número de parcelas
 * @returns true se válido
 */
export function validateOverdueInstallments(installments: number | null | undefined): boolean {
  if (installments === null || installments === undefined) return true; // null é válido
  return Number.isFinite(installments) && installments >= 0;
}

/**
 * Valida dias de inadimplência
 * @param days Número de dias
 * @returns true se válido
 */
export function validateOverdueDays(days: number | null | undefined): boolean {
  if (days === null || days === undefined) return true; // null é válido
  return Number.isFinite(days) && days >= 0;
}

/**
 * Valida contagem de cross sell
 * @param count Número de produtos
 * @returns true se válido
 */
export function validateCrossSellCount(count: number | null | undefined): boolean {
  if (count === null || count === undefined) return true; // null é válido
  return Number.isFinite(count) && count >= 0;
}

/**
 * Valida meses desde fechamento
 * @param months Número de meses
 * @returns true se válido
 */
export function validateMonthsSinceClosing(months: number | null | undefined): boolean {
  if (months === null || months === undefined) return true; // null é válido
  return Number.isFinite(months) && months >= 0;
}

/**
 * Valida formato de email
 * @param email Email a validar
 * @returns true se válido ou vazio/null
 */
export function validateEmail(email: string | null | undefined): boolean {
  if (!email || email.trim() === '') return true; // Vazio é válido (opcional)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Valida dados de cliente para update
 * @param updates Dados a serem atualizados
 * @returns Array de erros (vazio se válido)
 */
export function validateClientUpdates(updates: Partial<{
  npsScoreV3?: number | null;
  overdueInstallments?: number;
  overdueDays?: number;
  crossSellCount?: number;
  monthsSinceClosing?: number | null;
  email?: string;
}>, fieldName: string = 'campo'): string[] {
  const errors: string[] = [];

  if (updates.npsScoreV3 !== undefined && !validateNpsScore(updates.npsScoreV3)) {
    errors.push(`${fieldName}: NPS Score deve ser entre 0 e 10 ou null`);
  }

  if (updates.overdueInstallments !== undefined && !validateOverdueInstallments(updates.overdueInstallments)) {
    errors.push(`${fieldName}: Parcelas em atraso deve ser >= 0`);
  }

  if (updates.overdueDays !== undefined && !validateOverdueDays(updates.overdueDays)) {
    errors.push(`${fieldName}: Dias de inadimplência deve ser >= 0`);
  }

  if (updates.crossSellCount !== undefined && !validateCrossSellCount(updates.crossSellCount)) {
    errors.push(`${fieldName}: Contagem de Cross Sell deve ser >= 0`);
  }

  if (updates.monthsSinceClosing !== undefined && !validateMonthsSinceClosing(updates.monthsSinceClosing)) {
    errors.push(`${fieldName}: Meses desde fechamento deve ser >= 0 ou null`);
  }

  if (updates.email !== undefined && !validateEmail(updates.email)) {
    errors.push(`${fieldName}: Email inválido`);
  }

  return errors;
}

