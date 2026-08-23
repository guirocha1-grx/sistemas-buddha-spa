/**
 * Geração de imagem via API da OpenAI (Images), usada pelo procedure
 * `laminas.gerar` (server/routers.ts).
 *
 * Exemplo:
 *   const { url } = await generateImage({ prompt: "A serene landscape" });
 */
import { storagePut } from "server/storage";
import { ENV } from "./env";

const DEFAULT_IMAGE_MODEL = "gpt-image-1";
const DEFAULT_IMAGE_QUALITY = "medium";

export type GenerateImageOptions = {
  prompt: string;
  /** Modelo de imagem da OpenAI. Padrão: gpt-image-1. */
  model?: string;
  /** Qualidade da geração ("low" | "medium" | "high" | "auto"). */
  quality?: string;
  size?: "1024x1024" | "1024x1536" | "1536x1024" | "auto";
};

export type GenerateImageResponse = {
  url?: string;
};

export async function generateImage(
  options: GenerateImageOptions
): Promise<GenerateImageResponse> {
  if (!ENV.openaiApiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ENV.openaiApiKey}`,
    },
    body: JSON.stringify({
      model: options.model ?? DEFAULT_IMAGE_MODEL,
      prompt: options.prompt,
      n: 1,
      size: options.size ?? "auto",
      quality: options.quality ?? DEFAULT_IMAGE_QUALITY,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Image generation request failed (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
    );
  }

  const result = (await response.json()) as { data?: Array<{ b64_json?: string }> };
  const base64Data = result.data?.[0]?.b64_json;
  if (!base64Data) {
    throw new Error("Image generation response did not contain image data");
  }
  const buffer = Buffer.from(base64Data, "base64");

  const { url } = await storagePut(`generated/${Date.now()}.png`, buffer, "image/png");
  return { url };
}
