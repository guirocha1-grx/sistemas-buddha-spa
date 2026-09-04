import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { migracoesAplicadas } from "../drizzle/schema";

const DIRETORIO_DRIZZLE = path.resolve(process.cwd(), "drizzle");
const ARQUIVO_TABELA_CONTROLE = "2026-08-30-migracoes-aplicadas.sql";

type BancoConectado = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Usuario = { id: number; name: string | null };

// Ordena por "tier" antes do nome — arquivo datado (YYYY-MM-DD-...) é o
// padrão atual, mais recente primeiro; numerado legado (0000_..., do
// tempo do drizzle-kit generate) vem depois, também mais recente
// primeiro; qualquer outro nome solto (ex.: seed-tabela-precos-*.sql)
// vai pro fim — puramente alfabético não funcionava porque "seed-..."
// vem depois de "2026-..." e acabava aparecendo como "mais recente"
// (2026-09-03, achado ao tentar simplesmente ordenar por nome).
function tierArquivoMigracao(nome: string): number {
  if (/^\d{4}-\d{2}-\d{2}-/.test(nome)) return 0;
  if (/^\d{4}_/.test(nome)) return 1;
  return 2;
}

/** Só arquivos .sql soltos em drizzle/ — as subpastas meta/ e migrations/ são do drizzle-kit, não migração manual. */
function listarArquivosSql(): string[] {
  return fs.readdirSync(DIRETORIO_DRIZZLE, { withFileTypes: true })
    .filter((entrada) => entrada.isFile() && entrada.name.endsWith(".sql"))
    .map((entrada) => entrada.name)
    .sort();
}

/** Mesma lista de listarArquivosSql, mas do mais novo pro mais antigo — pra exibição. */
function listarArquivosSqlMaisRecentePrimeiro(): string[] {
  return listarArquivosSql().sort((a, b) => {
    const diferencaTier = tierArquivoMigracao(a) - tierArquivoMigracao(b);
    return diferencaTier !== 0 ? diferencaTier : b.localeCompare(a);
  });
}

function caminhoSeguro(nomeArquivo: string, arquivosValidos: string[]): string {
  if (!arquivosValidos.includes(nomeArquivo)) {
    throw new Error(`Arquivo de migração não encontrado: ${nomeArquivo}`);
  }
  return path.join(DIRETORIO_DRIZZLE, nomeArquivo);
}

/**
 * Remove linhas de comentário "--" e separa em comandos individuais (o driver não roda
 * múltiplos comandos numa só chamada). Respeita aspas simples, duplas e crase: um ";" dentro
 * de uma string (ex.: texto de prompt em português, que usa ";" com frequência) não corta o
 * comando ao meio — só ";" fora de aspas separa. Também entende escape por barra invertida
 * ('\'') e por aspas duplicadas ('' dentro de string), já que ambos aparecem em SQL do MySQL.
 */
export function dividirEmComandos(conteudoSql: string): string[] {
  const semComentarios = conteudoSql
    .split("\n")
    .map((linha) => (linha.trim().startsWith("--") ? "" : linha))
    .join("\n");

  const comandos: string[] = [];
  let atual = "";
  let aspas: "'" | '"' | "`" | null = null;
  for (let i = 0; i < semComentarios.length; i++) {
    const char = semComentarios[i];
    if (aspas) {
      atual += char;
      if (char === "\\" && aspas !== "`") {
        i++;
        if (i < semComentarios.length) atual += semComentarios[i];
        continue;
      }
      if (char === aspas) {
        if (semComentarios[i + 1] === aspas) {
          atual += aspas;
          i++;
        } else {
          aspas = null;
        }
      }
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      aspas = char;
      atual += char;
      continue;
    }
    if (char === ";") {
      const trecho = atual.trim();
      if (trecho) comandos.push(trecho);
      atual = "";
      continue;
    }
    atual += char;
  }
  const ultimo = atual.trim();
  if (ultimo) comandos.push(ultimo);
  return comandos;
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

/** Mais recente primeiro (ver listarArquivosSqlMaisRecentePrimeiro). */
export async function listarMigracoes(): Promise<MigracaoListada[]> {
  const db = await getDb();
  if (!db) return [];
  await garantirTabelaDeControle(db);
  const arquivos = listarArquivosSqlMaisRecentePrimeiro();
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
  });
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
