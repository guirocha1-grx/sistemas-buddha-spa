import { describe, expect, it } from "vitest";
import { getInboxAttachmentUrl } from "../shared/inboxMedia";

describe("getInboxAttachmentUrl", () => {
  it("prioriza a chave persistida e gera uma rota estável do Inbox", () => {
    expect(getInboxAttachmentUrl({
      storageKey: "inbox/12/Contrato São Paulo.pdf",
      url: "https://cdn.example/assinatura-antiga",
    })).toBe("/api/inbox-media/inbox/12/Contrato%20S%C3%A3o%20Paulo.pdf");
  });

  it("recupera anexos antigos a partir da URL CloudFront armazenada", () => {
    expect(getInboxAttachmentUrl({
      url: "https://d36.cloudfront.net/projeto/inbox/2/Captura de Tela.png?Expires=1&Signature=abc",
    })).toBe("/api/inbox-media/inbox/2/Captura%20de%20Tela.png");
  });

  it("mantém uma URL sem chave quando ela não pertence ao storage do Inbox", () => {
    expect(getInboxAttachmentUrl({ url: "https://exemplo.com/arquivo.pdf" })).toBe("https://exemplo.com/arquivo.pdf");
  });
});
