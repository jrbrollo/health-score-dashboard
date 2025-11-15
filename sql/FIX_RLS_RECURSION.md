# 🔧 CORREÇÃO DE RECURSÃO INFINITA EM RLS

## Problema
Erro: `infinite recursion detected in policy for relation "clients"`

## Causa
As políticas RLS estavam consultando `user_profiles` dentro da política de `clients`, causando possível recursão.

## Solução Aplicada
1. Criada função `check_user_access_to_client()` com `SECURITY DEFINER`
2. Função bypassa RLS ao acessar `user_profiles`
3. Política única `FOR ALL` usando a função

## Se ainda houver recursão:

### Opção 1: Desabilitar RLS temporariamente
```sql
ALTER TABLE clients DISABLE ROW LEVEL SECURITY;
-- Restaurar acesso imediatamente
-- Depois investigar e corrigir políticas
```

### Opção 2: Política permissiva temporária
```sql
DROP POLICY IF EXISTS "Users can access clients" ON clients;
CREATE POLICY "Temporary permissive policy"
ON clients FOR ALL
USING (true);
-- ATENÇÃO: Isso permite acesso total - usar apenas temporariamente
```

### Opção 3: Verificar políticas de user_profiles
```sql
-- Verificar se há políticas que consultam clients
SELECT * FROM pg_policies WHERE tablename = 'user_profiles';
```

## Teste
1. Recarregar página do dashboard
2. Verificar se clientes aparecem
3. Verificar console para erros

