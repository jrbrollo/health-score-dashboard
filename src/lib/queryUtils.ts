/**
 * Utilitários para queries com timeout e retry
 */

/**
 * Adiciona timeout a uma promise
 * @param promise Promise a ser executada
 * @param timeoutMs Timeout em milissegundos (padrão: 60 segundos)
 * @param errorMessage Mensagem de erro personalizada
 * @returns Promise com timeout
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = 60000, // 60 segundos padrão
  errorMessage: string = 'Operação excedeu o tempo limite'
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`${errorMessage} (${timeoutMs / 1000}s)`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]);
}

/**
 * Verifica se um erro é recuperável (deve tentar novar)
 */
function isRetryableError(error: any): boolean {
  if (!error) return false;
  
  // Erros de rede são recuperáveis
  if (error.message?.includes('network') || error.message?.includes('Network')) return true;
  if (error.message?.includes('fetch') || error.message?.includes('Failed to fetch')) return true;
  
  // Timeouts são recuperáveis
  if (error.message?.includes('timeout') || error.message?.includes('tempo limite')) return true;
  if (error.code === 'TIMEOUT') return true;
  
  // Erros 5xx do servidor são recuperáveis
  if (error.status >= 500 && error.status < 600) return true;
  
  // Erros específicos do Supabase que são recuperáveis
  if (error.code === 'PGRST301' || error.code === 'PGRST116') return false; // Não encontrado - não retry
  if (error.code === 'PGRST204') return false; // Sem conteúdo - não retry
  
  // Erros de autenticação não são recuperáveis
  if (error.status === 401 || error.status === 403) return false;
  
  // Por padrão, erros desconhecidos não são recuperáveis (mais seguro)
  return false;
}

/**
 * Executa uma função com retry e exponential backoff
 * @param fn Função a ser executada
 * @param maxRetries Número máximo de tentativas (padrão: 3)
 * @param initialDelayMs Delay inicial em milissegundos (padrão: 1000ms)
 * @returns Resultado da função
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelayMs: number = 1000
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      // Se não é recuperável ou é a última tentativa, re-throw
      if (!isRetryableError(error) || attempt === maxRetries) {
        throw error;
      }
      
      // Calcular delay com exponential backoff
      const delayMs = initialDelayMs * Math.pow(2, attempt);
      console.warn(`Tentativa ${attempt + 1}/${maxRetries + 1} falhou, tentando novamente em ${delayMs}ms...`, error.message);
      
      // Aguardar antes de tentar novamente
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  throw lastError;
}

/**
 * Executa uma query com timeout e retry
 * @param queryFn Função que retorna a query do Supabase
 * @param timeoutMs Timeout em milissegundos (padrão: 60 segundos)
 * @param retryEnabled Se deve tentar novamente em caso de erro recuperável (padrão: true)
 * @param maxRetries Número máximo de tentativas (padrão: 2)
 * @returns Resultado da query
 */
export async function executeQueryWithTimeout<T>(
  queryFn: () => Promise<{ data: T | null; error: any }>,
  timeoutMs: number = 60000,
  retryEnabled: boolean = true,
  maxRetries: number = 2
): Promise<{ data: T | null; error: any }> {
  try {
    const executeWithTimeout = async () => {
      const result = await withTimeout(
        queryFn(),
        timeoutMs,
        'Query excedeu o tempo limite'
      );
      
      // Se houver erro na resposta, verificar se é recuperável
      if (result.error && retryEnabled && isRetryableError(result.error)) {
        throw result.error; // Re-throw para trigger retry
      }
      
      return result;
    };
    
    if (retryEnabled) {
      return await withRetry(executeWithTimeout, maxRetries, 1000);
    } else {
      return await executeWithTimeout();
    }
  } catch (error: any) {
    // Se for erro de timeout, retornar como erro da query
    if (error.message?.includes('tempo limite') || error.code === 'TIMEOUT') {
      return {
        data: null,
        error: {
          message: error.message || 'Query excedeu o tempo limite',
          code: 'TIMEOUT',
          details: 'A operação demorou muito para ser concluída. Tente novamente ou reduza o escopo da consulta.',
        },
      };
    }
    
    // Se for erro após retries, retornar como erro da query
    if (error.error) {
      return { data: null, error: error.error };
    }
    
    // Re-throw outros erros
    throw error;
  }
}

