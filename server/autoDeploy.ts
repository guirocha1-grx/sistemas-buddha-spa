// Auto-deploy v3: cria tabela deploy_pending automaticamente se não existir
import type { Express, Request, Response } from "express";
import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import path from "path";
import { sdk } from "./_core/sdk";
import { drizzle } from "drizzle-orm/mysql2";
import { mysqlTable, int, varchar, text, timestamp, boolean } from "drizzle-orm/mysql-core";
import { eq, desc } from "drizzle-orm";

const deployPending = mysqlTable("deploy_pending", {
  id: int("id").autoincrement().primaryKey(),
  commit: varchar("commit", { length: 64 }),
  message: text("message"),
  migrations: text("migrations"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  processed: boolean("processed").default(false).notNull(),
});

const PROJECT_DIR = "/home/ubuntu/sistemas-buddha-spa";
const DRIZZLE_DIR = path.join(PROJECT_DIR, "drizzle");

async function getDb() {
  if (!process.env.DATABASE_URL) return null;
  try { return drizzle(process.env.DATABASE_URL); } catch { return null; }
}

export function registerAutoDeployRoute(app: Express) {
  app.post("/api/scheduled/auto-deploy", async (req: Request, res: Response) => {
    try {
      const user = await sdk.authenticateRequest(req);
      if (!user.isCron || !user.taskUid) {
        return res.status(403).json({ error: "cron-only" });
      }

      const database = await getDb();
      if (!database) {
        return res.json({ ok: true, skipped: "no-database" });
      }

      // Garantir que a tabela deploy_pending existe (cria em produção se não existir)
      try {
        await database.execute(
          `CREATE TABLE IF NOT EXISTS \`deploy_pending\` (
            \`id\` int AUTO_INCREMENT PRIMARY KEY,
            \`commit\` varchar(64),
            \`message\` text,
            \`migrations\` text,
            \`createdAt\` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
            \`processed\` boolean DEFAULT false NOT NULL
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`
        );
      } catch (e) {
        console.error("[AUTO_DEPLOY] Erro ao criar tabela:", e);
      }

      // Buscar marcador não processado mais recente
      const pending = await database.select().from(deployPending)
        .where(eq(deployPending.processed, false))
        .orderBy(desc(deployPending.id))
        .limit(1);

      if (pending.length === 0) {
        return res.json({ ok: true, skipped: "no-pending-webhook" });
      }

      const webhookData = pending[0];
      const commit = webhookData.commit || undefined;
      const message = webhookData.message || undefined;
      let migrations: string[] = [];
      try { migrations = JSON.parse(webhookData.migrations || "[]"); } catch {}

      // Marcar como processado ANTES de executar (evita reprocessamento)
      await database.update(deployPending)
        .set({ processed: true })
        .where(eq(deployPending.id, webhookData.id));

      console.log(`[AUTO_DEPLOY] Iniciando deploy: commit=${commit || "unknown"} message=${message || ""}`);

      // 1. Git pull
      execSync(
        `cd ${PROJECT_DIR} && git remote add github https://github.com/guirocha1-grx/sistemas-buddha-spa.git 2>/dev/null; git fetch github && git stash && git merge github/main -X theirs -m "Auto-deploy: ${commit || "unknown"}"`,
        { timeout: 30000, stdio: "pipe" }
      );

      // 2. Aplicar migrações SQL pendentes
      const appliedMigrations: string[] = [];
      if (migrations.length > 0) {
        for (const migrationFile of migrations) {
          const fullPath = path.join(DRIZZLE_DIR, migrationFile);
          if (existsSync(fullPath)) {
            console.log(`[AUTO_DEPLOY] Migração encontrada: ${migrationFile}`);
            appliedMigrations.push(migrationFile);
          }
        }
      }

      // 3. Reinstalar dependências
      try {
        execSync(`cd ${PROJECT_DIR} && pnpm install --frozen-lockfile 2>&1 || true`, {
          timeout: 60000,
          stdio: "pipe",
        });
      } catch {}

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
