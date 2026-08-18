import { describe, expect, it } from "vitest";
import { normalizarRespostaLLM } from "./llm";

describe("normalizarRespostaLLM", () => {
  it("converte output da Responses API em uma escolha compatível", () => {
    const resultado = normalizarRespostaLLM({
      id: "resp_1",
      created_at: 123,
      model: "gpt-5-mini",
      output: [{ type: "message", content: [{ type: "output_text", text: '{"destino":"diana","confianca":96}' }] }],
    });

    expect(resultado.choices[0]?.message.content).toBe('{"destino":"diana","confianca":96}');
    expect(resultado.model).toBe("gpt-5-mini");
  });

  it("mantém respostas de Chat Completions sem alteração", () => {
    const original = { id: "chat_1", created: 123, model: "gpt-5-mini", choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }] };
    expect(normalizarRespostaLLM(original)).toBe(original);
  });

  it("falha com diagnóstico quando não existe texto de saída", () => {
    expect(() => normalizarRespostaLLM({ id: "resp_2", output: [] })).toThrow("did not contain output text");
  });
});
