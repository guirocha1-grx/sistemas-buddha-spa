import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

const origem = "/home/ubuntu/upload/pasted_content.txt";
const destino = "/home/ubuntu/sistemas-buddha-spa-agentes/drizzle/seed-tabela-precos-ribeirao.sql";

function escapar(valor) {
  return valor.replaceAll("'", "''");
}

function nomeBase(nome) {
  const semDomingo = nome.replace(/\s+dom\b/iu, "").trim();
  return semDomingo === "Relaxante Mencare" ? "Relaxante Mencare 50" : semDomingo;
}

function duracao(nome) {
  const ocorrencias = [...nome.matchAll(/(\d{1,3})/g)];
  return ocorrencias.length ? Number(ocorrencias.at(-1)[1]) : null;
}

const linhas = fs.readFileSync(origem, "utf8").split(/\r?\n/);
const agrupado = new Map();

for (const linha of linhas) {
  const colunas = linha.split("\t").map((valor) => valor.trim());
  if (colunas.length < 3 || !/R\$\s*[\d.,]+/u.test(colunas.at(-1))) continue;
  const [nomeBruto, categoria, precoBruto] = colunas;
  if (!nomeBruto || nomeBruto === "--") continue;
  const preco = Number(precoBruto.replace(/[R$\s.]/gu, "").replace(",", "."));
  if (!Number.isFinite(preco) || preco <= 0) continue;
  const domingo = /\sdom\b/iu.test(nomeBruto);
  const servico = nomeBase(nomeBruto);
  const atual = agrupado.get(servico) ?? { servico, categoria, duracaoMinutos: duracao(servico), precoSemana: null, precoDomingo: null };
  if (domingo) atual.precoDomingo = preco;
  else atual.precoSemana = preco;
  agrupado.set(servico, atual);
}

const catalogo = [...agrupado.values()].sort((a, b) => a.servico.localeCompare(b.servico, "pt-BR"));
const importaveis = catalogo.filter((item) => item.precoSemana !== null && item.precoDomingo !== null);
const pendentes = catalogo.filter((item) => item.precoSemana === null || item.precoDomingo === null);
const instrucoes = [
  "-- Gerado a partir da tabela fornecida pela administração em 2026-08-18.",
  "-- Importa somente Ribeirão Shopping, identificado por nome ou slug.",
];

for (const item of importaveis) {
  const semana = item.precoSemana === null ? "NULL" : item.precoSemana.toFixed(2);
  const domingo = item.precoDomingo === null ? "NULL" : item.precoDomingo.toFixed(2);
  instrucoes.push(
    `INSERT INTO agentes_tabela_precos (unidadeId, servico, categoria, duracaoMinutos, precoSemana, precoDomingo, ativo, origem) ` +
    `SELECT id, '${escapar(item.servico)}', '${escapar(item.categoria)}', ${item.duracaoMinutos ?? "NULL"}, ${semana}, ${domingo}, true, 'Tabela enviada pela administração' ` +
    `FROM unidades WHERE slug LIKE '%ribeirao%' OR slug LIKE '%rbs%' OR LOWER(nome) LIKE '%ribeir%' ` +
    `ON DUPLICATE KEY UPDATE categoria = VALUES(categoria), duracaoMinutos = VALUES(duracaoMinutos), precoSemana = VALUES(precoSemana), precoDomingo = VALUES(precoDomingo), ativo = VALUES(ativo), origem = VALUES(origem);`,
  );
}

fs.mkdirSync(path.dirname(destino), { recursive: true });
fs.writeFileSync(destino, `${instrucoes.join("\n")}\n`);

let importacao = null;
if (process.argv.includes("--aplicar")) {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL indisponível para importar a tabela comercial.");
  const conexao = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const [unidades] = await conexao.execute("SELECT id FROM unidades WHERE slug LIKE '%ribeirao%' OR slug LIKE '%rbs%' OR LOWER(nome) LIKE '%ribeir%' LIMIT 1");
    let unidade = unidades[0];
    if (!unidade) {
      const [insert] = await conexao.execute("INSERT INTO unidades (nome, slug, canal, corTema, ativa) VALUES (?, ?, 'zapi', ?, 'true')", ["Ribeirão Shopping", "ribeirao-shopping", "#6c2330"]);
      unidade = { id: insert.insertId };
    }
    for (const item of importaveis) {
      await conexao.execute(
        "INSERT INTO agentes_tabela_precos (unidadeId, servico, categoria, duracaoMinutos, precoSemana, precoDomingo, ativo, origem) VALUES (?, ?, ?, ?, ?, ?, true, ?) ON DUPLICATE KEY UPDATE categoria = VALUES(categoria), duracaoMinutos = VALUES(duracaoMinutos), precoSemana = VALUES(precoSemana), precoDomingo = VALUES(precoDomingo), ativo = VALUES(ativo), origem = VALUES(origem)",
        [unidade.id, item.servico, item.categoria, item.duracaoMinutos, item.precoSemana, item.precoDomingo, "Tabela enviada pela administração"],
      );
    }
    importacao = { unidadeId: unidade.id, registros: importaveis.length };
  } finally {
    await conexao.end();
  }
}

console.log(JSON.stringify({ servicosImportados: importaveis.length, pendentesDeConfirmacao: pendentes, destino, importacao }));
