import { describe, expect, it } from "vitest";
import { dividirEmComandos, validarConsultaSomenteLeitura } from "./migracoesRunner";

describe("dividirEmComandos", () => {
  it("separa múltiplos comandos por ponto e vírgula", () => {
    const comandos = dividirEmComandos("ALTER TABLE a ADD COLUMN x INT;\nALTER TABLE b ADD COLUMN y INT;");
    expect(comandos).toEqual(["ALTER TABLE a ADD COLUMN x INT", "ALTER TABLE b ADD COLUMN y INT"]);
  });

  it("ignora linhas de comentário --", () => {
    const comandos = dividirEmComandos("-- comentário explicando\nCREATE TABLE a (id INT);\n-- outro comentário\n");
    expect(comandos).toEqual(["CREATE TABLE a (id INT)"]);
  });

  it("ignora comandos vazios entre pontos e vírgulas", () => {
    expect(dividirEmComandos("SELECT 1;;SELECT 2;")).toEqual(["SELECT 1", "SELECT 2"]);
  });
});

describe("validarConsultaSomenteLeitura", () => {
  it("aceita SELECT simples e adiciona LIMIT padrão", () => {
    expect(validarConsultaSomenteLeitura("select * from clientes")).toBe("select * from clientes LIMIT 200");
  });

  it("preserva LIMIT já informado", () => {
    expect(validarConsultaSomenteLeitura("select * from clientes limit 10")).toBe("select * from clientes limit 10");
  });

  it("remove ponto e vírgula final antes de validar", () => {
    expect(validarConsultaSomenteLeitura("select 1;")).toBe("select 1 LIMIT 200");
  });

  it("rejeita comando que não começa com select", () => {
    expect(() => validarConsultaSomenteLeitura("update clientes set nome = 'x'")).toThrow();
  });

  it("rejeita múltiplos comandos", () => {
    expect(() => validarConsultaSomenteLeitura("select 1; drop table clientes")).toThrow();
  });

  it("rejeita palavra-chave de escrita mesmo dentro de um select", () => {
    expect(() => validarConsultaSomenteLeitura("select * from clientes where drop = 1")).toThrow();
  });

  it("rejeita consulta vazia", () => {
    expect(() => validarConsultaSomenteLeitura("   ")).toThrow();
  });
});
