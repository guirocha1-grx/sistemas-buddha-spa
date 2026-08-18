/**
 * Parser da planilha "[Buddha] Clientes" exportada do Belle Software —
 * fica pendente de API (franqueador negou acesso, 2026-08-08), então a
 * base local de clientes é alimentada por essa exportação manual, uma
 * unidade por vez. Colunas resolvidas por nome (cabeçalho pode não estar
 * na linha 0 — a planilha real tem um título antes do cabeçalho).
 */

import * as XLSX from "xlsx";

export interface LinhaClienteImportada {
  belleId: number;
  nome: string;
  rg: string | null;
  cpf: string | null;
  dataNascimento: string | null; // AAAA-MM-DD
  sexo: "Feminino" | "Masculino" | "Outros" | null;
  endereco: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  telefone: string | null;
  celular: string | null;
  celular2: string | null;
  email: string | null;
  dataCadastro: string | null; // AAAA-MM-DD
  primeiroAtendimento: string | null; // AAAA-MM-DD
  ultimoAtendimento: string | null; // AAAA-MM-DD
  qtdAtendimentosFinalizados: number;
  qtdServicosFinalizados: number;
}

function normalizarCabecalho(s: unknown): string {
  return (s ?? "").toString().toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// "," sozinho é artefato do export do Belle (endereço = rua + bairro
// concatenados com vírgula; quando ambos vazios, sobra só a vírgula) —
// não é dado de verdade, então vira null igual a campo vazio.
function limparTexto(v: unknown): string | null {
  const s = (v ?? "").toString().trim();
  if (!s || s === ",") return null;
  return s;
}

function parseDataBr(v: unknown): string | null {
  const s = (v ?? "").toString().trim();
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function parseSexo(v: unknown): "Feminino" | "Masculino" | "Outros" | null {
  const s = (v ?? "").toString().trim();
  return s === "Feminino" || s === "Masculino" || s === "Outros" ? s : null;
}

function parseInteiro(v: unknown): number {
  const n = Number((v ?? "0").toString().trim());
  return Number.isFinite(n) ? n : 0;
}

const COLUNAS_ESPERADAS = {
  belleId: ["id"],
  nome: ["nome"],
  rg: ["rg"],
  cpf: ["cpf"],
  dataNascimento: ["data de nascimento"],
  sexo: ["sexo"],
  endereco: ["endereco"],
  bairro: ["bairro"],
  cidade: ["cidade"],
  uf: ["uf"],
  telefone: ["telefone"],
  celular: ["celular"],
  celular2: ["celular 2"],
  email: ["e-mail", "email"],
  dataCadastro: ["data de cadastro"],
  primeiroAtendimento: ["primeiro atendimento"],
  ultimoAtendimento: ["ultimo atendimento"],
  qtdAtendimentosFinalizados: ["qtd. atendimento finalizados", "qtd atendimento finalizados"],
  qtdServicosFinalizados: ["qtd. servicos finalizados", "qtd servicos finalizados"],
} as const satisfies Record<string, string[]>;

type Campo = keyof typeof COLUNAS_ESPERADAS;

export function parseClientesXlsx(buffer: Buffer): LinhaClienteImportada[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const abaNome = workbook.SheetNames[0];
  if (!abaNome) throw new Error("Planilha sem abas");
  const sheet = workbook.Sheets[abaNome];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }) as unknown[][];

  const linhaHeaderIdx = rows.findIndex((r) => {
    const normalizados = r.map(normalizarCabecalho);
    return normalizados.includes("id") && normalizados.includes("nome");
  });
  if (linhaHeaderIdx < 0) {
    throw new Error('Não encontrei o cabeçalho (linha com "ID" e "Nome") na planilha.');
  }

  const header = rows[linhaHeaderIdx].map(normalizarCabecalho);
  const colIndex: Partial<Record<Campo, number>> = {};
  for (const campo of Object.keys(COLUNAS_ESPERADAS) as Campo[]) {
    const alternativas: readonly string[] = COLUNAS_ESPERADAS[campo];
    const idx = header.findIndex((h) => alternativas.includes(h));
    if (idx >= 0) colIndex[campo] = idx;
  }
  if (colIndex.belleId === undefined || colIndex.nome === undefined) {
    throw new Error('Colunas obrigatórias "ID"/"Nome" não encontradas no cabeçalho da planilha.');
  }

  const linhas: LinhaClienteImportada[] = [];
  for (let i = linhaHeaderIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const idRaw = (row[colIndex.belleId] ?? "").toString().trim();
    if (!idRaw) continue;
    const belleId = Number(idRaw);
    if (!Number.isFinite(belleId)) continue;

    const nome = limparTexto(row[colIndex.nome]);
    if (!nome) continue;

    const pega = (campo: Campo) => (colIndex[campo] !== undefined ? row[colIndex[campo] as number] : undefined);

    linhas.push({
      belleId,
      nome,
      rg: limparTexto(pega("rg")),
      cpf: limparTexto(pega("cpf")),
      dataNascimento: parseDataBr(pega("dataNascimento")),
      sexo: parseSexo(pega("sexo")),
      endereco: limparTexto(pega("endereco")),
      bairro: limparTexto(pega("bairro")),
      cidade: limparTexto(pega("cidade")),
      uf: limparTexto(pega("uf")),
      telefone: limparTexto(pega("telefone")),
      celular: limparTexto(pega("celular")),
      celular2: limparTexto(pega("celular2")),
      email: limparTexto(pega("email")),
      dataCadastro: parseDataBr(pega("dataCadastro")),
      primeiroAtendimento: parseDataBr(pega("primeiroAtendimento")),
      ultimoAtendimento: parseDataBr(pega("ultimoAtendimento")),
      qtdAtendimentosFinalizados: parseInteiro(pega("qtdAtendimentosFinalizados")),
      qtdServicosFinalizados: parseInteiro(pega("qtdServicosFinalizados")),
    });
  }

  return linhas;
}
