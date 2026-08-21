import express, { type Express, type Request, type Response } from "express";
import { createContext } from "./_core/context";
import * as db from "./db";
import { parseAtendimentosBelleXlsx } from "./atendimentosBelleXlsxParser";
import { storageGetSignedUrl, storagePut } from "./storage";

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

function erro(res: Response, status: number, mensagem: string) {
  return res.status(status).json({ success: false, error: mensagem });
}

async function autorizar(req: Request, res: Response) {
  const ctx = await createContext({ req, res });
  if (!ctx.user) return { erro: "Sessão expirada. Entre novamente para importar o relatório." } as const;
  if (ctx.user.role !== "admin") return { erro: "Somente administradores podem importar relatórios." } as const;
  return { user: ctx.user } as const;
}

function numeroInteiro(valor: unknown, minimo: number, maximo: number) {
  return typeof valor === "number" && Number.isInteger(valor) && valor >= minimo && valor <= maximo;
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
      if (!numeroInteiro(input.unidadeId, 1, 2) || typeof input.uploadId !== "string" || !/^[\w-]{20,80}$/.test(input.uploadId) || !Array.isArray(input.storageKeys) || input.storageKeys.length < 1 || input.storageKeys.length > 200 || input.storageKeys.some((key) => typeof key !== "string")) {
        return erro(res, 400, "Dados de processamento inválidos.");
      }
      const unidade = await db.getUnidadeById(input.unidadeId);
      if (!unidade || unidade.canal !== "zapi") return erro(res, 400, "Selecione uma unidade física para importar atendimentos.");
      const prefixo = `importacoes/atendimentos-chunks/${acesso.user.id}/unidade-${input.unidadeId}/${input.uploadId}/`;
      if (input.storageKeys.some((key) => !key.startsWith(prefixo))) return erro(res, 400, "Partes de relatório não pertencem à unidade selecionada.");
      const partes: Buffer[] = [];
      for (const key of input.storageKeys) {
        const arquivo = await fetch(await storageGetSignedUrl(key));
        if (!arquivo.ok) return erro(res, 502, `Não foi possível recuperar uma parte do relatório (${arquivo.status}).`);
        partes.push(Buffer.from(await arquivo.arrayBuffer()));
      }
      const linhas = parseAtendimentosBelleXlsx(Buffer.concat(partes));
      if (linhas.length === 0) return erro(res, 422, "Nenhum atendimento válido foi encontrado no relatório.");
      const resultado = await db.upsertAtendimentosBelleImportados(input.unidadeId, linhas);
      await db.createSyncLog({ unidadeId: input.unidadeId, tipo: "importacao_atendimentos", status: "sucesso", registrosProcessados: linhas.length, detalhes: `Relatório de Atendimentos importado em ${input.storageKeys.length} parte(s) HTTP autenticadas.` });
      return res.json({ success: true, totalLinhas: linhas.length, ...resultado });
    } catch (error) {
      console.error("[AtendimentosUpload] Falha ao processar relatório:", error);
      return erro(res, 500, error instanceof Error ? error.message : "Falha ao processar relatório de atendimentos.");
    }
  });
}
