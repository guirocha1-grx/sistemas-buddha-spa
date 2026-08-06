import { describe, expect, it } from "vitest";
import { getGoogleSheetsClient } from "./googleSheets";
import { google } from "googleapis";

describe("Google Sheets credentials", () => {
  it("should have GOOGLE_SHEETS_CLIENT_EMAIL configured", () => {
    expect(process.env.GOOGLE_SHEETS_CLIENT_EMAIL).toBeTruthy();
    expect(process.env.GOOGLE_SHEETS_CLIENT_EMAIL).toContain("@");
  });

  it("should have GOOGLE_SHEETS_PRIVATE_KEY configured", () => {
    expect(process.env.GOOGLE_SHEETS_PRIVATE_KEY).toBeTruthy();
    expect(process.env.GOOGLE_SHEETS_PRIVATE_KEY).toContain("BEGIN PRIVATE KEY");
  });

  it("should create a valid JWT auth client", async () => {
    const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL!;
    const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY!.replace(/\\n/g, "\n");

    const jwt = new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });

    // Tenta obter um token de acesso — valida que a chave privada é válida
    const tokens = await jwt.authorize();
    expect(tokens.access_token).toBeTruthy();
    expect(typeof tokens.access_token).toBe("string");
  });
});
