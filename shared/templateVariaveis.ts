/**
 * Regras de conteúdo de variável {{N}} pra Message Templates da Meta
 * (2026-08-14) — validado tanto no formulário (client/src/pages/Templates.tsx,
 * feedback imediato) quanto no backend (server/routers.ts, defesa contra
 * requisição direta) antes de mandar pra revisão. Regras vêm direto do
 * que a Meta rejeita automaticamente: sequência sem buraco começando
 * em {{1}}, variável solta no início/fim do texto, ou duas variáveis
 * coladas sem nada entre elas.
 */

export function extrairVariaveis(texto: string): number[] {
  const encontradas = texto.match(/\{\{(\d+)\}\}/g) ?? [];
  const indices = new Set(encontradas.map((v) => Number(v.replace(/\D/g, ""))));
  return Array.from(indices).sort((a, b) => a - b);
}

/** Sequência precisa ser 1, 2, 3... sem pular número — a Meta rejeita {{1}} e {{3}} sem {{2}}. */
function validarSequencia(indices: number[]): string | null {
  for (let i = 0; i < indices.length; i++) {
    if (indices[i] !== i + 1) {
      return `Variáveis precisam seguir sequência sem pular número (esperado {{${i + 1}}}, encontrado {{${indices[i]}}})`;
    }
  }
  return null;
}

export function validarCorpo(corpo: string): string[] {
  const problemas: string[] = [];
  const texto = corpo.trim();
  if (!texto) return problemas;

  const indices = extrairVariaveis(texto);
  const erroSequencia = validarSequencia(indices);
  if (erroSequencia) problemas.push(erroSequencia);

  if (/^\{\{\d+\}\}/.test(texto)) {
    problemas.push("O corpo não pode começar direto com uma variável solta — adicione texto antes (ex: \"Olá, {{1}}!\")");
  }
  if (/\{\{\d+\}\}$/.test(texto)) {
    problemas.push("O corpo não pode terminar direto numa variável solta — adicione texto depois");
  }
  if (/\}\}\{\{/.test(texto)) {
    problemas.push("Não deixe duas variáveis coladas (ex: {{1}}{{2}}) — separe com espaço ou pontuação");
  }

  return problemas;
}

/** Cabeçalho da Meta só aceita no máximo 1 variável, e precisa ser {{1}}. */
export function validarCabecalho(cabecalho: string): string[] {
  const problemas: string[] = [];
  const texto = cabecalho.trim();
  if (!texto) return problemas;

  const indices = extrairVariaveis(texto);
  if (indices.length > 1) {
    problemas.push("O cabeçalho só pode ter 1 variável ({{1}})");
  } else if (indices.length === 1 && indices[0] !== 1) {
    problemas.push("A variável do cabeçalho precisa ser {{1}}");
  }
  return problemas;
}
