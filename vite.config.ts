import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // Garantir que React e React-DOM sejam carregados primeiro no bundle principal
            // para que Recharts e outras bibliotecas possam usar React.forwardRef
            if (id.includes('react') || id.includes('react-dom')) {
              return 'index'; // Incluir no bundle principal
            }
            // Incluir recharts no bundle principal DEPOIS do React
            if (id.includes('recharts')) {
              return 'index'; // Incluir no bundle principal junto com React
            }
            // Garantir que lucide-react seja sempre incluído no bundle principal
            // para evitar problemas de carregamento após logout/login
            if (id.includes('lucide-react')) {
              return 'index'; // Incluir no bundle principal
            }
            if (id.includes('react-router-dom')) {
              return 'react-vendor';
            }
            if (id.includes('@radix-ui')) {
              return 'ui-vendor';
            }
            if (id.includes('@supabase')) {
              return 'supabase-vendor';
            }
          }
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
}));
