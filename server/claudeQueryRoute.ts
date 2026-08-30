import crypto from "node:crypto";
import express, { type Express } from "express";
import { getDb } from "./db";
import { auditLog } from "../drizzle/schema";
import { executarConsultaSql } from "./migracoesRunner";

/**
 * Rota separada do tRPC/login por cookie — dá à Claude acesso autônomo
 * SOMENTE LEITURA ao banco (via executarConsultaSql, que já bloqueia
 * qualquer coisa além de um único SELECT), sem depender de alguém
 * logado no navegador pra rodar uma consulta durante uma investigação.
 * Aplicar migração continua exclusivo da tela /banco-de-dados.
 */
function tokenConfereComSeguranca(recebido: string, esperado: string): boolean {
  const bufRecebido = Buffer.from(recebido);
  const bufEsperado = Buffer.from(esperado);
  if (bufRecebido.length !== bufEsperado.length) return false;
  return crypto.timingSafeEqual(bufRecebido, bufEsperado);
}

async function registrarAuditoria(params: { inputResumo: string; sucesso: boolean; erroMsg?: string | null; duracaoMs: number }) {
  try {
    const db = await getDb();
    if (!db) return;
    await db.insert(auditLog).values({
      userNome: "Claude (token de consulta)",
      userRole: "admin",
      procedure: "bancoDeDados.consultaSqlToken",
      inputResumo: params.inputResumo.slice(0, 2000),
      sucesso: params.sucesso,
      erroMsg: params.erroMsg ?? null,
      duracaoMs: params.duracaoMs,
    });
  } catch (e) {
    console.error("[ClaudeQueryRoute] Falha ao gravar log de auditoria:", e);
  }
}

export function registerClaudeQueryRoute(app: Express) {
  app.post("/api/claude-consulta", express.json({ limit: "100kb" }), async (req, res) => {
    const inicio = Date.now();
    const tokenEsperado = process.env.CLAUDE_QUERY_TOKEN;
    if (!tokenEsperado) {
      return res.status(503).json({ success: false, error: "CLAUDE_QUERY_TOKEN não configurado neste ambiente." });
    }
    const tokenRecebido = req.header("x-claude-token");
    if (!tokenRecebido || !tokenConfereComSeguranca(tokenRecebido, tokenEsperado)) {
      return res.status(401).json({ success: false, error: "Token inválido." });
    }
    const sqlBruto = (req.body as { sql?: unknown })?.sql;
    if (typeof sqlBruto !== "string" || !sqlBruto.trim()) {
      return res.status(400).json({ success: false, error: "Envie { \"sql\": \"select ...\" } no corpo da requisição." });
    }
    try {
      const resultado = await executarConsultaSql(sqlBruto);
      await registrarAuditoria({ inputResumo: sqlBruto, sucesso: true, duracaoMs: Date.now() - inicio });
      return res.json({ success: true, ...resultado });
    } catch (error) {
      const mensagem = error instanceof Error ? error.message : "Falha ao executar consulta.";
      await registrarAuditoria({ inputResumo: sqlBruto, sucesso: false, erroMsg: mensagem, duracaoMs: Date.now() - inicio });
      return res.status(400).json({ success: false, error: mensagem });
    }
  });
}
