// Storage helpers backed by Cloudflare R2 (S3-compatible), acessado direto
// via @aws-sdk/client-s3 (sem proxy de presign de terceiro). Downloads
// continuam servidos por /manus-storage/{key} (nome de rota mantido por
// compatibilidade — cada URL já gravada no banco usa esse prefixo; trocar o
// nome quebraria toda mídia já enviada).

import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ENV } from "./_core/env";

let cachedClient: { client: S3Client; bucket: string } | null = null;

function getR2Client() {
  if (cachedClient) return cachedClient;
  const { r2AccountId, r2AccessKeyId, r2SecretAccessKey, r2BucketName } = ENV;
  if (!r2AccountId || !r2AccessKeyId || !r2SecretAccessKey || !r2BucketName) {
    throw new Error(
      "Storage config missing: set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET_NAME",
    );
  }
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: r2AccessKeyId, secretAccessKey: r2SecretAccessKey },
  });
  cachedClient = { client, bucket: r2BucketName };
  return cachedClient;
}

export function normalizeStorageKey(relKey: string): string {
  const semBarraInicial = relKey.replace(/^\/+/, "");
  // Espaços precisam virar hífen, pois a reencodificação de espaços em uma
  // URL assinada invalida a assinatura quando o CDN é acessado por
  // navegadores ou pela Z-API.
  const combiningMarks = new RegExp("[\\u0300-\\u036f]", "g");
  const semAcentos = semBarraInicial.normalize("NFD").replace(combiningMarks, "");
  return semAcentos
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9._/-]/g, "_");
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const { client, bucket } = getR2Client();
  const key = appendHashSuffix(normalizeStorageKey(relKey));

  const body = typeof data === "string" ? Buffer.from(data) : Buffer.from(data);
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
  }));

  return { key, url: `/manus-storage/${key}` };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeStorageKey(relKey);
  return { key, url: `/manus-storage/${key}` };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const { client, bucket } = getR2Client();
  const key = normalizeStorageKey(relKey);
  return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 3600 });
}

/**
 * Baixa os bytes de um objeto do storage e devolve em Base64 — usado
 * pelo nó "midia" dos Fluxos pra reenviar um arquivo já guardado direto
 * pra Z-API (URL assinada direto pra Z-API se mostrou não-confiável
 * nesse projeto, ver zapiApi.sendImageBase64/sendDocumentBase64).
 */
export async function storageGetBase64(relKey: string): Promise<string> {
  const signedUrl = await storageGetSignedUrl(relKey);
  const resp = await fetch(signedUrl);
  if (!resp.ok) {
    throw new Error(`Storage download failed (${resp.status}) for ${relKey}`);
  }
  const buffer = Buffer.from(await resp.arrayBuffer());
  return buffer.toString("base64");
}
