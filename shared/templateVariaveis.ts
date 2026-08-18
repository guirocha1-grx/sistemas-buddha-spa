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

// Faixas Unicode (plano básico) que cobrem símbolos/emoji comuns — a
// Meta rejeita qualquer emoji no cabeçalho (diferente do corpo, que
// aceita). Comparação por código de caractere em vez de regex com
// literal Unicode no source (mais robusto contra corrupção de
// caractere invisível no arquivo). Um par substituto (0xD800-0xDBFF
// seguido de 0xDC00-0xDFFF) sozinho já indica caractere do plano
// astral — cobre o bloco de emoji "carinha"/objeto (1F300-1FAFF) sem
// precisar decodificar o code point completo.
const FAIXAS_EMOJI_BMP: Array<[number, number]> = [
  [0x2600, 0x27bf], // símbolos diversos + dingbats (☀-➿)
  [0x2190, 0x21ff], // setas (←-⇿)
  [0x2b00, 0x2bff], // setas/formas diversas (⬀-⯿)
  [0xfe0f, 0xfe0f], // variation selector (emoji presentation)
];

function contemEmoji(texto: string): boolean {
  for (let i = 0; i < texto.length; i++) {
    const code = texto.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const low = texto.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) return true;
    }
    if (FAIXAS_EMOJI_BMP.some(([inicio, fim]) => code >= inicio && code <= fim)) return true;
  }
  return false;
}

/**
 * Cabeçalho da Meta é bem mais restrito que o corpo: no máximo 1
 * variável (precisa ser {{1}}), sem quebra de linha, sem marcação de
 * formatação do WhatsApp (*negrito*, _itálico_, ~riscado~, `mono`) e
 * sem emoji — confirmado pelo erro real da Graph API (error_subcode
 * 2388072, "O cabeçalho da mensagem não pode ter novas linhas,
 * caracteres de formatação, emojis ou asteriscos").
 */
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

  if (/[\n\r]/.test(texto)) {
    problemas.push("O cabeçalho não pode ter quebra de linha");
  }
  // Ignora os "{{" "}}" da própria variável na checagem de asterisco/underline/etc.
  const semVariaveis = texto.replace(/\{\{\d+\}\}/g, "");
  if (/[*_~`]/.test(semVariaveis)) {
    problemas.push("O cabeçalho não pode ter marcação de formatação (*negrito*, _itálico_, ~riscado~, `mono`)");
  }
  if (contemEmoji(texto)) {
    problemas.push("O cabeçalho não pode ter emoji");
  }

  return problemas;
}
