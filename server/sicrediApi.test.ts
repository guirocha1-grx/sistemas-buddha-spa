import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validarCompatibilidadePar } from "./sicrediApi";

const fixturesDir = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures");
const certificado = readFileSync(resolve(fixturesDir, "sicredi-test-cert.pem"), "utf8");
const chaveCompativel = readFileSync(resolve(fixturesDir, "sicredi-test-key-match.pem"), "utf8");
const chaveIncompativel = readFileSync(resolve(fixturesDir, "sicredi-test-key-mismatch.pem"), "utf8");

describe("Sicredi mTLS credential validation", () => {
  it("accepts a certificate and its matching private key", () => {
    expect(() => validarCompatibilidadePar(certificado, chaveCompativel)).not.toThrow();
  });

  it("rejects a certificate paired with a different private key", () => {
    expect(() => validarCompatibilidadePar(certificado, chaveIncompativel)).toThrow(
      "não pertencem ao mesmo par mTLS",
    );
  });
});
