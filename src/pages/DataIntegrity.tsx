import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { DataIntegrityDashboard } from '@/components/DataIntegrityDashboard';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

export default function DataIntegrity() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  // Verificar autenticação
  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/login');
    }
  }, [user, authLoading, navigate]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>Carregando...</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header com botão de voltar */}
      <div className="border-b">
        <div className="flex h-16 items-center px-6">
          <Button
            variant="ghost"
            onClick={() => navigate('/')}
            className="mr-4"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar ao Dashboard
          </Button>
        </div>
      </div>

      {/* Dashboard */}
      <DataIntegrityDashboard />
    </div>
  );
}
