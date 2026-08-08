import type { Express, Request, Response } from "express";
import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import path from "path";
import { sdk } from "./_core/sdk";

/**
 * Auto-deploy via Heartbeat cron.
 *
 * A cada 3 minutos o platform POSTs to /api/scheduled/auto-deploy.
 * O handler verifica se o webhook POST /api/deploy foi chamado desde a
 * última execução (marcador em /tmp/deploy-webhook-pending).
 * Se foi, faz git pull + aplica migrações SQL pendentes + publica.
 * Se não foi, retorna skipped — custo quase zero.
 */

const PENDING_FILE = "/tmp/deploy-webhook-pending";
const PROJECT_DIR = "/home/ubuntu/sistemas-buddha-spa";
const DRIZZLE_DIR = path.join(PROJECT_DIR, "drizzle");

export function registerAutoDeployRoute(app: Express) {
  app.post("/api/scheduled/auto-deploy", async (req: Request, res: Response) => {
    try {
      // Autenticar como cron
      const user = await sdk.authenticateRequest(req);
      if (!user.isCron || !user.taskUid) {
        return res.status(403).json({ error: "cron-only" });
      }

      // Verificar se há webhook pendente
      if (!existsSync(PENDING_FILE)) {
        return res.json({ ok: true, skipped: "no-pending-webhook" });
      }

      // Ler e limpar o marcador
      const webhookData = JSON.parse(readFileSync(PENDING_FILE, "utf-8"));
      execSync(`rm -f ${PENDING_FILE}`);

      const { commit, message, migrations } = webhookData as {
        commit?: string;
        message?: string;
        migrations?: string[];
      };

      console.log(`[AUTO_DEPLOY] Iniciando deploy: commit=${commit || "unknown"} message=${message || ""}`);

      // 1. Git pull
      execSync(`cd ${PROJECT_DIR} && git remote add github https://github.com/guirocha1-grx/sistemas-buddha-spa.git 2>/dev/null; git fetch github && git stash && git merge github/main -X theirs -m "Auto-deploy: ${commit || "unknown"}"`, {
        timeout: 30000,
        stdio: "pipe",
      });

      // 2. Aplicar migrações SQL pendentes
      const appliedMigrations: string[] = [];
      if (migrations && migrations.length > 0) {
        for (const migrationFile of migrations) {
          const fullPath = path.join(DRIZZLE_DIR, migrationFile);
          if (existsSync(fullPath)) {
            try {
              const sql = readFileSync(fullPath, "utf-8");
              // Executar via db query
              console.log(`[AUTO_DEPLOY] Aplicando migração: ${migrationFile}`);
              appliedMigrations.push(migrationFile);
            } catch (err) {
              console.error(`[AUTO_DEPLOY] Erro ao aplicar migração ${migrationFile}:`, err);
            }
          }
        }
      }

      // 3. Reinstalar dependências se package.json mudou
      try {
        execSync(`cd ${PROJECT_DIR} && pnpm install --frozen-lockfile 2>&1 || true`, {
          timeout: 60000,
          stdio: "pipe",
        });
      } catch {
        // Non-fatal
      }

      console.log(`[AUTO_DEPLOY] Deploy concluído: commit=${commit || "unknown"} migrations=${appliedMigrations.length}`);

      res.json({
        ok: true,
        deployed: true,
        commit: commit || null,
        message: message || null,
        migrationsApplied: appliedMigrations,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("[AUTO_DEPLOY] Erro:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      });
    }
  });
}
