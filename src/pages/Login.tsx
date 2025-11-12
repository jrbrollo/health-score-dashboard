import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, Mail, Lock, User } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

export default function Login() {
  const navigate = useNavigate();
  const { signIn, signUp, getAvailableNames, resetPassword, loading: authLoading } = useAuth();
  
  // Login state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  // Signup state
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupConfirmPassword, setSignupConfirmPassword] = useState('');
  const [signupRole, setSignupRole] = useState<string>('');
  const [signupHierarchyName, setSignupHierarchyName] = useState<string>('');
  const [availableNames, setAvailableNames] = useState<string[]>([]);
  const [loadingNames, setLoadingNames] = useState(false);
  const [signupLoading, setSignupLoading] = useState(false);

  // Carregar nomes quando role mudar
  const handleRoleChange = async (role: string) => {
    setSignupRole(role);
    setSignupHierarchyName('');
    
    if (role) {
      setLoadingNames(true);
      try {
        const names = await getAvailableNames(role);
        setAvailableNames(names);
      } catch (error) {
        console.error('Erro ao carregar nomes:', error);
        toast({
          title: 'Erro',
          description: 'Não foi possível carregar os nomes disponíveis.',
          variant: 'destructive',
        });
      } finally {
        setLoadingNames(false);
      }
    } else {
      setAvailableNames([]);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!loginEmail || !loginPassword) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Por favor, preencha email e senha.',
        variant: 'destructive',
      });
      return;
    }

    setLoginLoading(true);
    try {
      await signIn(loginEmail, loginPassword);
      navigate('/');
    } catch (error) {
      // Erro já tratado no signIn
    } finally {
      setLoginLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!signupEmail || !signupPassword || !signupRole || !signupHierarchyName) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Por favor, preencha todos os campos.',
        variant: 'destructive',
      });
      return;
    }

    if (signupPassword !== signupConfirmPassword) {
      toast({
        title: 'Senhas não coincidem',
        description: 'As senhas devem ser iguais.',
        variant: 'destructive',
      });
      return;
    }

    if (signupPassword.length < 6) {
      toast({
        title: 'Senha muito curta',
        description: 'A senha deve ter pelo menos 6 caracteres.',
        variant: 'destructive',
      });
      return;
    }

    setSignupLoading(true);
    try {
      await signUp(signupEmail, signupPassword, signupRole, signupHierarchyName);
      navigate('/');
    } catch (error) {
      // Erro já tratado no signUp
    } finally {
      setSignupLoading(false);
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'manager': return 'Gerente';
      case 'mediator': return 'Mediador';
      case 'leader': return 'Líder em Formação';
      case 'planner': return 'Planejador';
      default: return role;
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!resetEmail) {
      toast({
        title: 'Email obrigatório',
        description: 'Por favor, informe seu email.',
        variant: 'destructive',
      });
      return;
    }

    setResetLoading(true);
    try {
      await resetPassword(resetEmail);
      setShowResetPassword(false);
      setResetEmail('');
    } catch (error) {
      // Erro já tratado no resetPassword
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            Health Score Dashboard
          </CardTitle>
          <CardDescription className="text-lg mt-2">
            Sistema de Gestão de Clientes
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Criar Conta</TabsTrigger>
            </TabsList>

            {/* Login Tab */}
            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="seu.email@braunaplanejamento.com.br"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="login-password">Senha</Label>
                    <Dialog open={showResetPassword} onOpenChange={setShowResetPassword}>
                      <DialogTrigger asChild>
                        <button
                          type="button"
                          className="text-sm text-primary hover:underline"
                        >
                          Esqueci minha senha
                        </button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Redefinir Senha</DialogTitle>
                          <DialogDescription>
                            Digite seu email e enviaremos um link para redefinir sua senha.
                          </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleResetPassword} className="space-y-4 mt-4">
                          <div className="space-y-2">
                            <Label htmlFor="reset-email">Email</Label>
                            <Input
                              id="reset-email"
                              type="email"
                              placeholder="seu.email@braunaplanejamento.com.br"
                              value={resetEmail}
                              onChange={(e) => setResetEmail(e.target.value)}
                              required
                            />
                          </div>
                          <div className="flex gap-2 justify-end">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setShowResetPassword(false)}
                            >
                              Cancelar
                            </Button>
                            <Button
                              type="submit"
                              disabled={resetLoading}
                            >
                              {resetLoading ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  Enviando...
                                </>
                              ) : (
                                'Enviar Email'
                              )}
                            </Button>
                          </div>
                        </form>
                      </DialogContent>
                    </Dialog>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="login-password"
                      type="password"
                      placeholder="••••••••"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>

                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={loginLoading || authLoading}
                >
                  {loginLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Entrando...
                    </>
                  ) : (
                    'Entrar'
                  )}
                </Button>
              </form>
            </TabsContent>

            {/* Signup Tab */}
            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-role">Sua Posição</Label>
                  <Select value={signupRole} onValueChange={handleRoleChange} required>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione sua posição" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manager">Gerente</SelectItem>
                      <SelectItem value="mediator">Mediador</SelectItem>
                      <SelectItem value="leader">Líder em Formação</SelectItem>
                      <SelectItem value="planner">Planejador</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {signupRole && (
                  <div className="space-y-2">
                    <Label htmlFor="signup-name">Seu Nome na Hierarquia</Label>
                    {loadingNames ? (
                      <div className="flex items-center justify-center p-4">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        <span className="text-sm text-muted-foreground">Carregando nomes...</span>
                      </div>
                    ) : availableNames.length === 0 ? (
                      <p className="text-sm text-muted-foreground p-2">
                        Nenhum {getRoleLabel(signupRole).toLowerCase()} encontrado na base de dados.
                      </p>
                    ) : (
                      <Select 
                        value={signupHierarchyName} 
                        onValueChange={setSignupHierarchyName}
                        required
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={`Selecione seu nome como ${getRoleLabel(signupRole)}`} />
                        </SelectTrigger>
                        <SelectContent>
                          {availableNames.map((name) => (
                            <SelectItem key={name} value={name}>
                              {name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email Corporativo</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="seu.email@braunaplanejamento.com.br"
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-password">Senha</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="signup-password"
                      type="password"
                      placeholder="Mínimo 6 caracteres"
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      className="pl-10"
                      required
                      minLength={6}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-confirm-password">Confirmar Senha</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="signup-confirm-password"
                      type="password"
                      placeholder="Digite a senha novamente"
                      value={signupConfirmPassword}
                      onChange={(e) => setSignupConfirmPassword(e.target.value)}
                      className="pl-10"
                      required
                      minLength={6}
                    />
                  </div>
                </div>

                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={signupLoading || authLoading || !signupRole || !signupHierarchyName}
                >
                  {signupLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Criando conta...
                    </>
                  ) : (
                    'Criar Conta'
                  )}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

