import crypto from "node:crypto";

// Hash do PIN (4 dígitos) dos atendentes — scrypt nativo do Node, sem
// dependência nova (nem bcrypt/argon2 estavam no projeto). O PIN é
// curto de propósito (baixo atrito num terminal compartilhado da
// recepção); a defesa real contra tentativa repetida é a aplicação
// não expor "tentativas restantes" nem enumerar atendentes por PIN
// (ver server/routers.ts: atendentes.entrar sempre retorna o mesmo
// erro genérico pra ID errado ou PIN errado).
const SCRYPT_KEYLEN = 32;

export function hashPin(pin: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivado = crypto.scryptSync(pin, salt, SCRYPT_KEYLEN).toString("hex");
  return `${salt}:${derivado}`;
}

export function verifyPin(pin: string, hash: string): boolean {
  const [salt, derivadoEsperado] = hash.split(":");
  if (!salt || !derivadoEsperado) return false;
  const derivado = crypto.scryptSync(pin, salt, SCRYPT_KEYLEN);
  const esperado = Buffer.from(derivadoEsperado, "hex");
  if (derivado.length !== esperado.length) return false;
  return crypto.timingSafeEqual(derivado, esperado);
}
