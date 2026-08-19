import { describe, expect, it } from "vitest";
import { INBOX_MANUAL_SUGGESTION_LLM_OPTIONS } from "./routers";

describe("configuração da sugestão manual do Inbox", () => {
  it("preserva margem para texto e bloqueia ferramentas implícitas", () => {
    expect(INBOX_MANUAL_SUGGESTION_LLM_OPTIONS.model).toBe("gpt-5-mini");
    expect(INBOX_MANUAL_SUGGESTION_LLM_OPTIONS.maxTokens).toBeGreaterThan(500);
    expect(INBOX_MANUAL_SUGGESTION_LLM_OPTIONS.reasoningEffort).toBe("low");
    expect(INBOX_MANUAL_SUGGESTION_LLM_OPTIONS.tools).toEqual([]);
    expect(INBOX_MANUAL_SUGGESTION_LLM_OPTIONS.toolChoice).toBe("none");
  });
});
