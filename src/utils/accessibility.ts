/**
 * Utilitários de acessibilidade
 */

/**
 * Adiciona atributos ARIA para melhorar acessibilidade
 */
export function addAriaAttributes(element: HTMLElement, attributes: Record<string, string>): void {
  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, value);
  });
}

/**
 * Navegação por teclado - foco no próximo elemento
 */
export function focusNextElement(currentElement: HTMLElement): void {
  const focusableElements = document.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
  
  const currentIndex = Array.from(focusableElements).indexOf(currentElement);
  const nextIndex = (currentIndex + 1) % focusableElements.length;
  
  focusableElements[nextIndex]?.focus();
}

/**
 * Navegação por teclado - foco no elemento anterior
 */
export function focusPreviousElement(currentElement: HTMLElement): void {
  const focusableElements = document.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
  
  const currentIndex = Array.from(focusableElements).indexOf(currentElement);
  const previousIndex = currentIndex === 0 ? focusableElements.length - 1 : currentIndex - 1;
  
  focusableElements[previousIndex]?.focus();
}

/**
 * Anuncia mudanças para leitores de tela
 */
export function announceToScreenReader(message: string, priority: 'polite' | 'assertive' = 'polite'): void {
  const announcement = document.createElement('div');
  announcement.setAttribute('role', 'status');
  announcement.setAttribute('aria-live', priority);
  announcement.setAttribute('aria-atomic', 'true');
  announcement.className = 'sr-only';
  announcement.textContent = message;
  
  document.body.appendChild(announcement);
  
  setTimeout(() => {
    document.body.removeChild(announcement);
  }, 1000);
}

/**
 * Verifica se elemento está visível na viewport
 */
export function isElementVisible(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
  );
}

/**
 * Scroll suave para elemento com foco
 */
export function scrollToElement(element: HTMLElement, behavior: ScrollBehavior = 'smooth'): void {
  element.scrollIntoView({ behavior, block: 'nearest' });
}

