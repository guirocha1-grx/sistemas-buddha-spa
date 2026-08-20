import { beforeEach, describe, expect, it, vi } from "vitest";
import { agentesConversas } from "../drizzle/schema";

const getDb = vi.hoisted(() => vi.fn());
const where = vi.hoisted(() => vi.fn());
const deleteRow = vi.hoisted(() => vi.fn(() => ({ where })));

vi.mock("./db", () => ({
  getDb,
  obterModoEfetivoAutomacaoAgentes: vi.fn(() => "ativa"),
}));

import { reiniciarEstadoConversa } from "./agentesDb";

describe("reiniciarEstadoConversa", () => {
  beforeEach(() => {
    where.mockReset();
    where.mockResolvedValue(undefined);
    deleteRow.mockClear();
    getDb.mockResolvedValue({ delete: deleteRow });
  });

  it("remove apenas o estado operacional persistido da conversa", async () => {
    await reiniciarEstadoConversa(41);

    expect(deleteRow).toHaveBeenCalledWith(agentesConversas);
    expect(where).toHaveBeenCalledTimes(1);
  });
});
