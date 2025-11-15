/**
 * Utilitários para métricas de performance
 */

interface PerformanceMetric {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
}

class PerformanceTracker {
  private metrics: Map<string, PerformanceMetric> = new Map();
  private history: PerformanceMetric[] = [];

  /**
   * Inicia medição de performance
   */
  start(name: string): void {
    this.metrics.set(name, {
      name,
      startTime: performance.now()
    });
  }

  /**
   * Finaliza medição de performance
   */
  end(name: string): number | null {
    const metric = this.metrics.get(name);
    if (!metric) {
      console.warn(`Métrica "${name}" não encontrada`);
      return null;
    }

    const endTime = performance.now();
    const duration = endTime - metric.startTime;

    metric.endTime = endTime;
    metric.duration = duration;

    this.history.push({ ...metric });
    this.metrics.delete(name);

    return duration;
  }

  /**
   * Obtém todas as métricas
   */
  getMetrics(): PerformanceMetric[] {
    return [...this.history];
  }

  /**
   * Limpa histórico
   */
  clear(): void {
    this.metrics.clear();
    this.history = [];
  }

  /**
   * Obtém métrica específica
   */
  getMetric(name: string): PerformanceMetric | undefined {
    return this.history.find(m => m.name === name);
  }

  /**
   * Obtém média de duração para uma métrica
   */
  getAverageDuration(name: string): number {
    const metrics = this.history.filter(m => m.name === name && m.duration);
    if (metrics.length === 0) return 0;
    const sum = metrics.reduce((acc, m) => acc + (m.duration || 0), 0);
    return sum / metrics.length;
  }
}

export const performanceTracker = new PerformanceTracker();

/**
 * Hook para medir performance de componentes
 */
export function measurePerformance<T>(
  name: string,
  fn: () => T
): T {
  performanceTracker.start(name);
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result.then(value => {
        performanceTracker.end(name);
        return value;
      }) as T;
    }
    performanceTracker.end(name);
    return result;
  } catch (error) {
    performanceTracker.end(name);
    throw error;
  }
}

/**
 * Log de métricas de performance
 */
export function logPerformanceMetrics(): void {
  const metrics = performanceTracker.getMetrics();
  if (metrics.length === 0) {
    console.log('📊 Nenhuma métrica de performance registrada');
    return;
  }

  console.group('📊 Métricas de Performance');
  metrics.forEach(metric => {
    if (metric.duration) {
      const avg = performanceTracker.getAverageDuration(metric.name);
      console.log(`${metric.name}: ${metric.duration.toFixed(2)}ms (média: ${avg.toFixed(2)}ms)`);
    }
  });
  console.groupEnd();
}

