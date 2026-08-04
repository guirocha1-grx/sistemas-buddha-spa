/**
 * Buddha Mkt — WhatsApp Cloud API oficial (Meta), conta única usada para
 * disparo de marketing nas duas unidades.
 *
 * Credenciais ainda não foram provisionadas (fica pendente até alguém
 * configurar em /configuracoes). Toda função aqui lança erro claro
 * enquanto isso, no mesmo padrão de guarda já usado para o Belle
 * (`if (!unidade?.belleToken) throw ...`).
 */

import { getConfig } from "./db";

const GRAPH_API_VERSION = "v20.0";

interface BuddhaMktConfig {
  phoneNumberId: string;
  token: string;
  wabaId: string | null;
}

export async function getBuddhaMktConfig(): Promise<BuddhaMktConfig | null> {
  const [phoneNumberId, token, wabaId] = await Promise.all([
    getConfig("buddha_mkt_phone_number_id"),
    getConfig("buddha_mkt_token"),
    getConfig("buddha_mkt_waba_id"),
  ]);

  if (!phoneNumberId?.valor || !token?.valor) return null;

  return {
    phoneNumberId: phoneNumberId.valor,
    token: token.valor,
    wabaId: wabaId?.valor ?? null,
  };
}

async function requireBuddhaMktConfig(): Promise<BuddhaMktConfig> {
  const config = await getBuddhaMktConfig();
  if (!config) throw new Error("Buddha Mkt não configurado");
  return config;
}

export interface BuddhaMktSendResult {
  messageId: string;
}

export const buddhaMktApi = {
  async sendText(phone: string, message: string): Promise<BuddhaMktSendResult> {
    const config = await requireBuddhaMktConfig();

    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${config.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: phone,
          type: "text",
          text: { body: message },
        }),
      },
    );

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(`Buddha Mkt (WhatsApp Cloud API) error ${response.status}: ${errorBody || response.statusText}`);
    }

    const data = (await response.json()) as { messages?: { id: string }[] };
    return { messageId: data.messages?.[0]?.id ?? "" };
  },
};
