/**
 * Message Templates da Meta (WhatsApp Cloud API) — criar e consultar
 * status de aprovação. Mesma conta/credenciais do Buddha Mkt
 * (`getBuddhaMktConfig`, server/buddhaMktApi.ts) — token + WABA ID.
 * Só os campos que a tela de Templates (client/src/pages/Templates.tsx)
 * usa: corpo com variável {{1}}, cabeçalho/rodapé opcionais, até 3
 * botões de resposta rápida.
 */
import { getBuddhaMktConfig } from "./buddhaMktApi";

const GRAPH_API_VERSION = "v20.0";

export interface CriarTemplateInput {
  nome: string;
  idioma: string;
  categoria: "MARKETING" | "UTILITY";
  corpo: string;
  cabecalho?: string;
  rodape?: string;
  botoes?: Array<{ tipo: "QUICK_REPLY"; texto: string }>;
}

export interface CriarTemplateResultado {
  metaTemplateId: string;
  status: string; // "PENDING" normalmente
}

export interface MetaTemplateStatus {
  nome: string;
  idioma: string;
  status: string; // "PENDING" | "APPROVED" | "REJECTED" | ...
  motivoRejeicao?: string;
}

export const metaTemplatesApi = {
  async criarTemplate(input: CriarTemplateInput): Promise<CriarTemplateResultado> {
    const config = await getBuddhaMktConfig();
    if (!config) throw new Error("Buddha Mkt não configurado");
    if (!config.wabaId) throw new Error("WABA ID não configurado (Configurações → Buddha Mkt)");

    const components: Record<string, unknown>[] = [];
    if (input.cabecalho) components.push({ type: "HEADER", format: "TEXT", text: input.cabecalho });
    components.push({ type: "BODY", text: input.corpo });
    if (input.rodape) components.push({ type: "FOOTER", text: input.rodape });
    if (input.botoes && input.botoes.length > 0) {
      components.push({
        type: "BUTTONS",
        buttons: input.botoes.map((b) => ({ type: b.tipo, text: b.texto })),
      });
    }

    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${config.wabaId}/message_templates`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: input.nome,
          language: input.idioma,
          category: input.categoria,
          components,
        }),
      },
    );

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(`Meta Templates error ${response.status}: ${errorBody || response.statusText}`);
    }

    const data = (await response.json()) as { id: string; status?: string };
    return { metaTemplateId: data.id, status: data.status ?? "PENDING" };
  },

  /** Consulta status de aprovação de todos os templates da conta — usado pra sincronizar em massa. */
  async listarTemplatesMeta(): Promise<MetaTemplateStatus[]> {
    const config = await getBuddhaMktConfig();
    if (!config) throw new Error("Buddha Mkt não configurado");
    if (!config.wabaId) throw new Error("WABA ID não configurado (Configurações → Buddha Mkt)");

    const url = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${config.wabaId}/message_templates`);
    url.searchParams.set("fields", "name,status,language,rejected_reason");
    url.searchParams.set("limit", "200");

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${config.token}` },
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(`Meta Templates error ${response.status}: ${errorBody || response.statusText}`);
    }

    const data = (await response.json()) as {
      data?: Array<{ name: string; status: string; language: string; rejected_reason?: string }>;
    };
    return (data.data ?? []).map((t) => ({
      nome: t.name,
      idioma: t.language,
      status: t.status,
      motivoRejeicao: t.rejected_reason,
    }));
  },
};
