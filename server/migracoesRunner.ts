import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { migracoesAplicadas } from "../drizzle/schema";

const DIRETORIO_DRIZZLE = path.resolve(process.cwd(), "drizzle");
const ARQUIVO_TABELA_CONTROLE = "2026-08-30-migracoes-aplicadas.sql";

type BancoConectado = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Usuario = { id: number; name: string | null };

/** Só arquivos .sql soltos em drizzle/ — as subpastas meta/ e migrations/ são do drizzle-kit, não migração manual. */
function listarArquivosSql(): string[] {
  return fs.readdirSync(DIRETORIO_DRIZZLE, { withFileTypes: true })
    .filter((entrada) => entrada.isFile() && entrada.name.endsWith(".sql"))
    .map((entrada) => entrada.name)
    .sort();
}

function caminhoSeguro(nomeArquivo: string, arquivosValidos: string[]): string {
  if (!arquivosValidos.includes(nomeArquivo)) {
    throw new Error(`Arquivo de migração não encontrado: ${nomeArquivo}`);
  }
  return path.join(DIRETORIO_DRIZZLE, nomeArquivo);
}

/** Remove linhas de comentário "--" e separa em comandos individuais (o driver não roda múltiplos comandos numa só chamada). */
export function dividirEmComandos(conteudoSql: string): string[] {
  const semComentarios = conteudoSql
    .split("\n")
    .map((linha) => (linha.trim().startsWith("--") ? "" : linha))
    .join("\n");
  return semComentarios.split(";").map((trecho) => trecho.trim()).filter(Boolean);
}

/**
 * Cria a tabela de controle na primeira vez que a tela é aberta (idempotente)
 * e já registra a si mesma como aplicada, pra não aparecer como pendência
 * eterna na lista.
 */
async function garantirTabelaDeControle(db: BancoConectado) {
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS \`_migracoes_aplicadas\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`nomeArquivo\` VARCHAR(255) NOT NULL,
      \`aplicadaEm\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`aplicadaPorUserId\` INT NULL,
      \`aplicadaPorNome\` VARCHAR(200) NULL,
      \`apenasRegistrada\` BOOLEAN NOT NULL DEFAULT FALSE,
      UNIQUE KEY \`migracoes_aplicadas_nome_idx\` (\`nomeArquivo\`)
    )
  `));
  await db.execute(sql.raw(
    `INSERT IGNORE INTO \`_migracoes_aplicadas\` (\`nomeArquivo\`, \`apenasRegistrada\`) VALUES ('${ARQUIVO_TABELA_CONTROLE}', TRUE)`,
  ));
}

async function registrarAplicacao(db: BancoConectado, nomeArquivo: string, usuario: Usuario, apenasRegistrada: boolean) {
  await db.insert(migracoesAplicadas)
    .values({ nomeArquivo, aplicadaPorUserId: usuario.id, aplicadaPorNome: usuario.name, apenasRegistrada })
    .onDuplicateKeyUpdate({ set: { aplicadaEm: new Date(), aplicadaPorUserId: usuario.id, aplicadaPorNome: usuario.name, apenasRegistrada } });
}

export type MigracaoListada = {
  nomeArquivo: string;
  conteudo: string;
  aplicada: boolean;
  aplicadaEm: Date | null;
  aplicadaPorNome: string | null;
  apenasRegistrada: boolean;
};

/** Mais recente primeiro — os nomes de arquivo (0000_..., 2026-08-30-...) já ordenam cronologicamente como string. */
export async function listarMigracoes(): Promise<MigracaoListada[]> {
  const db = await getDb();
  if (!db) return [];
  await garantirTabelaDeControle(db);
  const arquivos = listarArquivosSql();
  const aplicadas = await db.select().from(migracoesAplicadas);
  const porNome = new Map(aplicadas.map((registro) => [registro.nomeArquivo, registro]));
  return arquivos.map((nomeArquivo) => {
    const registro = porNome.get(nomeArquivo);
    return {
      nomeArquivo,
      conteudo: fs.readFileSync(path.join(DIRETORIO_DRIZZLE, nomeArquivo), "utf8"),
      aplicada: !!registro,
      aplicadaEm: registro?.aplicadaEm ?? null,
      aplicadaPorNome: registro?.aplicadaPorNome ?? null,
      apenasRegistrada: registro?.apenasRegistrada ?? false,
    };
  }).reverse();
}

/** Executa de fato os comandos do arquivo, lido direto do disco (nunca do que o cliente mandar) e registra o resultado. */
export async function aplicarMigracao(nomeArquivo: string, usuario: Usuario): Promise<{ comandosExecutados: number }> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  await garantirTabelaDeControle(db);
  const caminho = caminhoSeguro(nomeArquivo, listarArquivosSql());
  const comandos = dividirEmComandos(fs.readFileSync(caminho, "utf8"));
  for (const comando of comandos) {
    await db.execute(sql.raw(comando));
  }
  await registrarAplicacao(db, nomeArquivo, usuario, false);
  return { comandosExecutados: comandos.length };
}

/** Só grava o histórico, sem rodar nada — pra registrar migrações antigas já aplicadas manualmente antes desse runner existir. */
export async function marcarMigracaoAplicada(nomeArquivo: string, usuario: Usuario): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  await garantirTabelaDeControle(db);
  caminhoSeguro(nomeArquivo, listarArquivosSql());
  await registrarAplicacao(db, nomeArquivo, usuario, true);
}

const PALAVRAS_BLOQUEADAS = /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|replace|call|lock|unlock|rename|into\s+outfile)\b/i;

/** Só SELECT, um comando, com LIMIT — ferramenta de pesquisa, não de escrita. */
export function validarConsultaSomenteLeitura(sqlBruto: string): string {
  const consulta = sqlBruto.trim().replace(/;+\s*$/, "");
  if (!consulta) throw new Error("Consulta vazia.");
  if (consulta.includes(";")) throw new Error("Envie apenas um comando SELECT por vez.");
  if (!/^select\b/i.test(consulta)) throw new Error("Só é permitido executar SELECT nesta ferramenta.");
  if (PALAVRAS_BLOQUEADAS.test(consulta)) throw new Error("Consulta contém uma palavra-chave não permitida (só leitura).");
  return /\blimit\s+\d+/i.test(consulta) ? consulta : `${consulta} LIMIT 200`;
}

function normalizarLinhas(resultado: unknown): Record<string, unknown>[] {
  if (Array.isArray(resultado)) {
    const primeiro = resultado[0];
    return Array.isArray(primeiro) ? (primeiro as Record<string, unknown>[]) : (resultado as Record<string, unknown>[]);
  }
  return (resultado as { rows?: Record<string, unknown>[] })?.rows ?? [];
}

export async function executarConsultaSql(sqlBruto: string): Promise<{ linhas: Record<string, unknown>[]; total: number }> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  const consulta = validarConsultaSomenteLeitura(sqlBruto);
  const resultado = await db.execute(sql.raw(consulta));
  const linhas = normalizarLinhas(resultado);
  return { linhas, total: linhas.length };
}
