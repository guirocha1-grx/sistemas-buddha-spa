import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config({ path: '/home/ubuntu/sistemas-buddha-spa/.env' });

const dbUrl = process.env.DATABASE_URL;

async function main() {
  const conn = await mysql.createConnection(dbUrl);
  
  // 1. Listar unidades
  const [unidades] = await conn.query('SELECT id, nome, slug, interContaCorrente FROM unidades ORDER BY id');
  console.log('=== UNIDADES ===');
  console.table(unidades);
  
  // 2. Contar extratos por unidade
  const [counts] = await conn.query('SELECT unidadeId, origem, COUNT(*) as total FROM inter_extratos GROUP BY unidadeId, origem');
  console.log('\n=== EXTRATOS POR UNIDADE ===');
  console.table(counts);
  
  // 3. Verificar batches por syncedAt
  const [batches] = await conn.query('SELECT DATE(syncedAt) as data, HOUR(syncedAt) as hora, COUNT(*) as total, MIN(id) as min_id, MAX(id) as max_id FROM inter_extratos GROUP BY DATE(syncedAt), HOUR(syncedAt) ORDER BY data DESC, hora DESC');
  console.log('\n=== BATCHES DE UPLOAD ===');
  console.table(batches);
  
  // 4. Amostra dos últimos 5 extratos
  const [amostra] = await conn.query('SELECT id, unidadeId, origem, dataEntrada, tipoOperacao, valor, titulo, nomeOrigem, nomeDestino, syncedAt FROM inter_extratos ORDER BY id DESC LIMIT 5');
  console.log('\n=== ÚLTIMOS 5 EXTRATOS ===');
  console.table(amostra);
  
  await conn.end();
}

main().catch(console.error);
