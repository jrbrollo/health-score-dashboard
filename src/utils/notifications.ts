/**
 * Sistema de notificações para mudanças
 */

export interface NotificationOptions {
  title: string;
  body?: string;
  icon?: string;
  badge?: string;
  tag?: string;
  requireInteraction?: boolean;
  silent?: boolean;
}

/**
 * Solicita permissão para notificações
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) {
    console.warn('Este navegador não suporta notificações');
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  return false;
}

/**
 * Envia notificação
 */
export function sendNotification(options: NotificationOptions): void {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    console.warn('Notificações não permitidas');
    return;
  }

  const notification = new Notification(options.title, {
    body: options.body,
    icon: options.icon || '/favicon.ico',
    badge: options.badge || '/favicon.ico',
    tag: options.tag,
    requireInteraction: options.requireInteraction || false,
    silent: options.silent || false,
  });

  notification.onclick = () => {
    window.focus();
    notification.close();
  };
}

/**
 * Notifica mudança de categoria de cliente
 */
export function notifyCategoryChange(clientName: string, oldCategory: string, newCategory: string): void {
  if (Notification.permission === 'granted') {
    sendNotification({
      title: 'Mudança de Categoria',
      body: `${clientName} mudou de ${oldCategory} para ${newCategory}`,
      tag: `category-change-${clientName}`,
    });
  }
}

/**
 * Notifica score abaixo do threshold
 */
export function notifyLowScore(clientName: string, score: number, threshold: number = 35): void {
  if (score < threshold && Notification.permission === 'granted') {
    sendNotification({
      title: 'Score Baixo',
      body: `${clientName} tem score de ${score} (abaixo de ${threshold})`,
      tag: `low-score-${clientName}`,
      requireInteraction: true,
    });
  }
}

