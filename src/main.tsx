import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Aplicar tema escuro por padrão ao carregar a aplicação
const savedTheme = localStorage.getItem('healthScoreDarkMode');
if (savedTheme === 'true' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
  document.documentElement.classList.add('dark');
}

// Desabilitar Service Worker temporariamente para evitar problemas de cache
// TODO: Reativar quando o problema de cache for resolvido
if ('serviceWorker' in navigator) {
  // Desregistrar todos os service workers existentes
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => {
      registration.unregister().then(() => {
        console.log('Service Worker desregistrado:', registration.scope);
      });
    });
  });
  
  // Limpar todos os caches
  if ('caches' in window) {
    caches.keys().then((cacheNames) => {
      cacheNames.forEach((cacheName) => {
        caches.delete(cacheName).then(() => {
          console.log('Cache deletado:', cacheName);
        });
      });
    });
  }
}

createRoot(document.getElementById("root")!).render(<App />);
