import express, { type Express, type Request, type Response } from "express";
import { createContext } from "./_core/context";
import * as db from "./db";
import { parseAtendimentosBelleXlsx } from "./atendimentosBelleXlsxParser";
import { storageGetSignedUrl, storagePut } from "./storage";
import type { User } from "../drizzle/schema";

type PartePayload = {
  unidadeId?: unknown;
  uploadId?: unknown;
  indice?: unknown;
  totalPartes?: unknown;
  conteudoBase64?: unknown;
};

type ProcessarPayload = {
  unidadeId?: unknown;
  uploadId?: unknown;
  storageKeys?: unknown;
};

type ProcessarLotePayload = ProcessarPayload & {
  lote?: unknown;
  tamanhoLote?: unknown;
};

type ConcluirPayload = ProcessarPayload & {
  totalLinhas?: unknown;
  inseridos?: unknown;
  atualizados?: unknown;
};

function erro(res: Response, status: number, mensagem: string) {
  return res.status(status).json({ success: false, error: mensagem });
}

async function autorizar(req: Request, res: Response): Promise<{ erro: string } | { user: User }> {
  // Chamado fora do middleware real do tRPC (rota Express dedicada, pra
  // aceitar corpo bruto em vez de payload em lote) — createContext só usa
  // req/res (ver server/_core/context.ts), o campo `info` exigido pelo tipo
  // do tRPC v11 não é lido por ela.
  const ctx = await createContext({ req, res } as unknown as Parameters<typeof createContext>[0]);
  if (!ctx.user) return { erro: "Sessão expirada. Entre novamente para importar o relatório." };
  if (ctx.user.role !== "admin") return { erro: "Somente administradores podem importar relatórios." };
  return { user: ctx.user };
}

function numeroInteiro(valor: unknown, minimo: number, maximo: number): valor is number {
  return typeof valor === "number" && Number.isInteger(valor) && valor >= minimo && valor <= maximo;
}

async function carregarLinhasImportacao(input: ProcessarPayload, userId: number) {
  if (!numeroInteiro(input.unidadeId, 1, 2) || typeof input.uploadId !== "string" || !/^[\w-]{20,80}$/.test(input.uploadId) || !Array.isArray(input.storageKeys) || input.storageKeys.length < 1 || input.storageKeys.length > 200 || input.storageKeys.some((key) => typeof key !== "string")) {
    throw new Error("Dados de processamento inválidos.");
  }
  const unidade = await db.getUnidadeById(input.unidadeId);
  if (!unidade || unidade.canal !== "zapi") throw new Error("Selecione uma unidade física para importar atendimentos.");
  const prefixo = `importacoes/atendimentos-chunks/${userId}/unidade-${input.unidadeId}/${input.uploadId}/`;
  if (input.storageKeys.some((key) => !key.startsWith(prefixo))) throw new Error("Partes de relatório não pertencem à unidade selecionada.");
  const partes: Buffer[] = [];
  for (const key of input.storageKeys) {
    const arquivo = await fetch(await storageGetSignedUrl(key));
    if (!arquivo.ok) throw new Error(`Não foi possível recuperar uma parte do relatório (${arquivo.status}).`);
    partes.push(Buffer.from(await arquivo.arrayBuffer()));
  }
  const linhas = parseAtendimentosBelleXlsx(Buffer.concat(partes));
  if (linhas.length === 0) throw new Error("Nenhum atendimento válido foi encontrado no relatório.");
  return { linhas, unidadeId: input.unidadeId, partes: input.storageKeys.length };
}

export function registerAtendimentosUploadRoute(app: Express) {
  const jsonPequeno = express.json({ limit: "1mb" });

  app.post("/api/importacoes/atendimentos/parte", jsonPequeno, async (req, res) => {
    try {
      const acesso = await autorizar(req, res);
      if ("erro" in acesso) return erro(res, 401, acesso.erro);
      const input = req.body as PartePayload;
      if (!numeroInteiro(input.unidadeId, 1, 2) || !numeroInteiro(input.indice, 0, 199) || !numeroInteiro(input.totalPartes, 1, 200) || input.indice >= input.totalPartes || typeof input.uploadId !== "string" || !/^[\w-]{20,80}$/.test(input.uploadId) || typeof input.conteudoBase64 !== "string") {
        return erro(res, 400, "Parte de relatório inválida.");
      }
      const unidade = await db.getUnidadeById(input.unidadeId);
      if (!unidade || unidade.canal !== "zapi") return erro(res, 400, "Selecione uma unidade física para importar atendimentos.");
      const buffer = Buffer.from(input.conteudoBase64, "base64");
      if (buffer.length === 0 || buffer.length > 600_000) return erro(res, 413, "A parte enviada excede o tamanho permitido.");
      const { key } = await storagePut(
        `importacoes/atendimentos-chunks/${acesso.user.id}/unidade-${input.unidadeId}/${input.uploadId}/parte-${input.indice}.bin`,
        buffer,
        "application/octet-stream",
      );
      return res.json({ success: true, storageKey: key });
    } catch (error) {
      console.error("[AtendimentosUpload] Falha ao receber parte:", error);
      return erro(res, 500, error instanceof Error ? error.message : "Falha ao receber parte do relatório.");
    }
  });

  app.post("/api/importacoes/atendimentos/processar", jsonPequeno, async (req, res) => {
    try {
      const acesso = await autorizar(req, res);
      if ("erro" in acesso) return erro(res, 401, acesso.erro);
      const input = req.body as ProcessarPayload;
      const { linhas, unidadeId, partes } = await carregarLinhasImportacao(input, acesso.user.id);
      const resultado = await db.upsertAtendimentosBelleImportados(unidadeId, linhas);
      await db.createSyncLog({ unidadeId, tipo: "importacao_atendimentos", status: "sucesso", registrosProcessados: linhas.length, detalhes: `Relatório de Atendimentos importado em ${partes} parte(s) HTTP autenticadas.` });
      return res.json({ success: true, totalLinhas: linhas.length, ...resultado });
    } catch (error) {
      console.error("[AtendimentosUpload] Falha ao processar relatório:", error);
      return erro(res, 500, error instanceof Error ? error.message : "Falha ao processar relatório de atendimentos.");
    }
  });

  app.post("/api/importacoes/atendimentos/processar-lote", jsonPequeno, async (req, res) => {
    try {
      const acesso = await autorizar(req, res);
      if ("erro" in acesso) return erro(res, 401, acesso.erro);
      const input = req.body as ProcessarLotePayload;
      if (!numeroInteiro(input.lote, 0, 500) || !numeroInteiro(input.tamanhoLote, 50, 1_000)) return erro(res, 400, "Lote de processamento inválido.");
      const { linhas, unidadeId } = await carregarLinhasImportacao(input, acesso.user.id);
      const inicio = input.lote * input.tamanhoLote;
      if (inicio >= linhas.length) return erro(res, 400, "O lote solicitado está fora do relatório.");
      const fim = Math.min(inicio + input.tamanhoLote, linhas.length);
      const resultado = await db.upsertAtendimentosBelleImportados(unidadeId, linhas.slice(inicio, fim));
      return res.json({ success: true, totalLinhas: linhas.length, inicio, fim, possuiProximo: fim < linhas.length, ...resultado });
    } catch (error) {
      console.error("[AtendimentosUpload] Falha ao processar lote:", error);
      return erro(res, 500, error instanceof Error ? error.message : "Falha ao processar lote de atendimentos.");
    }
  });

  app.post("/api/importacoes/atendimentos/concluir", jsonPequeno, async (req, res) => {
    try {
      const acesso = await autorizar(req, res);
      if ("erro" in acesso) return erro(res, 401, acesso.erro);
      const input = req.body as ConcluirPayload;
      if (!numeroInteiro(input.unidadeId, 1, 2) || !numeroInteiro(input.totalLinhas, 1, 100_000) || !numeroInteiro(input.inseridos, 0, 100_000) || !numeroInteiro(input.atualizados, 0, 100_000)) return erro(res, 400, "Resumo final de importação inválido.");
      await db.createSyncLog({ unidadeId: input.unidadeId, tipo: "importacao_atendimentos", status: "sucesso", registrosProcessados: input.totalLinhas, detalhes: `Relatório de Atendimentos processado em blocos curtos pela tela. Inseridos: ${input.inseridos}; atualizados: ${input.atualizados}.` });
      return res.json({ success: true });
    } catch (error) {
      console.error("[AtendimentosUpload] Falha ao concluir importação:", error);
      return erro(res, 500, error instanceof Error ? error.message : "Falha ao concluir importação de atendimentos.");
    }
  });
}
