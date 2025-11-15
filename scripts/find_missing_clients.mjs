import fs from 'fs';
import path from 'path';

// Ler o arquivo SQL gerado
const sqlPath = path.join(process.cwd(), 'sql', 'import_missing_clients_13_11_batched.sql');
const sqlContent = fs.readFileSync(sqlPath, 'utf-8');

// Extrair a lista de clientes do final do script SQL
// Procurar pelo array de clientes no final
const arrayMatch = sqlContent.match(/ARRAY\[([\s\S]*?)\]\) AS key;/);
if (!arrayMatch) {
  console.error('❌ Não foi possível encontrar a lista de clientes no script SQL');
  process.exit(1);
}

// Extrair as chaves dos clientes (formato: 'nome|planner')
const clientKeys = arrayMatch[1]
  .split(',')
  .map(line => line.trim())
  .filter(line => line && line.startsWith("'") && line.endsWith("'"))
  .map(line => line.slice(1, -1)); // Remover aspas

console.log(`📊 Total de clientes na lista do script: ${clientKeys.length}\n`);

// Gerar query SQL para identificar os faltantes
const sqlQuery = `-- Identificar os 7 clientes que ainda faltam no banco
SELECT 
  key as client_key,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM clients c
      WHERE LOWER(TRIM(c.name)) || '|' || LOWER(TRIM(c.planner)) = key
        AND c.name != '0'
        AND c.planner != '0'
    ) THEN 'ENCONTRADO'
    ELSE 'FALTANDO'
  END as status
FROM unnest(ARRAY[
${clientKeys.map(k => `  '${k.replace(/'/g, "''")}'`).join(',\n')}
]) AS key
WHERE NOT EXISTS (
  SELECT 1 FROM clients c
  WHERE LOWER(TRIM(c.name)) || '|' || LOWER(TRIM(c.planner)) = key
    AND c.name != '0'
    AND c.planner != '0'
)
ORDER BY key;`;

// Salvar query SQL
const outputPath = path.join(process.cwd(), 'sql', 'find_missing_clients.sql');
fs.writeFileSync(outputPath, sqlQuery);

console.log(`✅ Query SQL gerada: ${outputPath}`);
console.log(`\n💡 Execute esta query no Supabase para identificar os 7 clientes faltantes\n`);

