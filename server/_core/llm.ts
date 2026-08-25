import { ENV } from "./env";

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4" ;
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: {
    name: string;
  };
};

export type ToolChoice =
  | ToolChoicePrimitive
  | ToolChoiceByName
  | ToolChoiceExplicit;

export type InvokeParams = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  model?: string;
  thinking?: Record<string, unknown>;
  reasoning?: Record<string, unknown>;
  // Chat Completions (endpoint usado aqui, /v1/chat/completions) usa o campo
  // plano "reasoning_effort" pra modelos de raciocínio — "reasoning: {effort}"
  // é da Responses API e é ignorado silenciosamente aqui. Ver comentário no
  // uso em agentesService.ts: o diagnóstico de completion_tokens/reasoning_tokens
  // mostrou o orçamento inteiro (maxTokens) sendo gasto em raciocínio mesmo com
  // reasoning:{effort:"minimal"} configurado, porque o campo nunca chegava.
  reasoningEffort?: "minimal" | "low" | "medium" | "high";
  reasoning_effort?: "minimal" | "low" | "medium" | "high";
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

/** Converte uma resposta da Responses API no formato de Chat Completions usado pelo CRM. */
export function normalizarRespostaLLM(payload: unknown): InvokeResult {
  if (!payload || typeof payload !== "object") {
    throw new Error("LLM returned an invalid response body");
  }

  const body = payload as Record<string, unknown>;
  const choices = body.choices;

  const textoUtil = (valor: unknown): string | null => {
    if (typeof valor === "string") return valor.trim() || null;
    if (!Array.isArray(valor)) return null;
    const texto = valor
      .filter((parte): parte is Record<string, unknown> => Boolean(parte) && typeof parte === "object")
      .filter((parte) => (parte.type === "text" || parte.type === "output_text") && typeof parte.text === "string")
      .map((parte) => parte.text as string)
      .join("\n")
      .trim();
    return texto || null;
  };

  if (Array.isArray(choices)) {
    for (const choice of choices) {
      if (!choice || typeof choice !== "object" || !("message" in choice)) continue;
      const message = choice.message;
      const texto = message && typeof message === "object" && "content" in message ? textoUtil(message.content) : null;
      if (!texto) continue;
      if (typeof message.content === "string") return payload as InvokeResult;
      return {
        id: typeof body.id === "string" ? body.id : "chat-completions",
        created: typeof body.created === "number" ? body.created : Date.now(),
        model: typeof body.model === "string" ? body.model : "unknown",
        choices: [{ index: 0, message: { role: "assistant", content: texto }, finish_reason: "stop" }],
      };
    }
  }

  const textos: string[] = [];
  const tiposSaida = new Set<string>();
  if (typeof body.output_text === "string") textos.push(body.output_text);
  if (Array.isArray(body.output)) {
    for (const item of body.output) {
      if (!item || typeof item !== "object") continue;
      const saida = item as Record<string, unknown>;
      if (typeof saida.type === "string") tiposSaida.add(saida.type);
      if (typeof saida.text === "string") textos.push(saida.text);
      const textoConteudo = textoUtil(saida.content);
      if (textoConteudo) textos.push(textoConteudo);
    }
  }

  const content = textos.join("\n").trim();
  if (!content) {
    const detail = typeof body.error === "object" && body.error && "message" in body.error && typeof body.error.message === "string"
      ? body.error.message
      : undefined;
    const formatos = tiposSaida.size > 0 ? `; output types: ${Array.from(tiposSaida).join(", ")}` : "";
    const diagnosticoChoices = Array.isArray(choices) ? `; choices: ${choices.length} sem conteúdo textual` : "";
    // finish_reason + usage são o que realmente diferencia "estourou
    // max_tokens no raciocínio" (finish_reason "length", completion_tokens
    // no teto) de qualquer outra causa (ex.: filtro de conteúdo, tool_calls
    // inesperado) — sem isso, cada falha nova vira outro palpite às cegas.
    const finishReasons = Array.isArray(choices)
      ? choices.map((choice) => (choice && typeof choice === "object" && "finish_reason" in choice ? choice.finish_reason : undefined)).filter((valor) => valor != null)
      : [];
    const diagnosticoFinish = finishReasons.length > 0 ? `; finish_reason: ${finishReasons.join(", ")}` : "";
    const usage = body.usage && typeof body.usage === "object" ? body.usage as Record<string, unknown> : null;
    const diagnosticoUsage = usage ? `; usage: ${JSON.stringify(usage)}` : "";
    throw new Error(`LLM response did not contain output text${detail ? `: ${detail}` : ""}${formatos}${diagnosticoChoices}${diagnosticoFinish}${diagnosticoUsage}`);
  }

  return {
    id: typeof body.id === "string" ? body.id : "responses-api",
    created: typeof body.created === "number" ? body.created : typeof body.created_at === "number" ? body.created_at : Date.now(),
    model: typeof body.model === "string" ? body.model : "unknown",
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
  };
}

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

const ensureArray = (
  value: MessageContent | MessageContent[]
): MessageContent[] => (Array.isArray(value) ? value : [value]);

const normalizeContentPart = (
  part: MessageContent
): TextContent | ImageContent | FileContent => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }

  if (part.type === "text") {
    return part;
  }

  if (part.type === "image_url") {
    return part;
  }

  if (part.type === "file_url") {
    return part;
  }

  throw new Error("Unsupported message content part");
};

const normalizeMessage = (message: Message) => {
  const { role, name, tool_call_id } = message;

  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content)
      .map(part => (typeof part === "string" ? part : JSON.stringify(part)))
      .join("\n");

    return {
      role,
      name,
      tool_call_id,
      content,
    };
  }

  const contentParts = ensureArray(message.content).map(normalizeContentPart);

  // If there's only text content, collapse to a single string for compatibility
  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return {
      role,
      name,
      content: contentParts[0].text,
    };
  }

  return {
    role,
    name,
    content: contentParts,
  };
};

const normalizeToolChoice = (
  toolChoice: ToolChoice | undefined,
  tools: Tool[] | undefined
): "none" | "auto" | ToolChoiceExplicit | undefined => {
  if (!toolChoice) return undefined;

  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }

  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured"
      );
    }

    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly"
      );
    }

    return {
      type: "function",
      function: { name: tools[0].function.name },
    };
  }

  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name },
    };
  }

  return toolChoice;
};

const resolveApiUrl = () => "https://api.openai.com/v1/chat/completions";

const assertApiKey = () => {
  if (!ENV.openaiApiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
};

const normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema,
}: {
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
}):
  | { type: "json_schema"; json_schema: JsonSchema }
  | { type: "text" }
  | { type: "json_object" }
  | undefined => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (
      explicitFormat.type === "json_schema" &&
      !explicitFormat.json_schema?.schema
    ) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object"
      );
    }
    return explicitFormat;
  }

  const schema = outputSchema || output_schema;
  if (!schema) return undefined;

  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }

  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...(typeof schema.strict === "boolean" ? { strict: schema.strict } : {}),
    },
  };
};

const RETRY_MAX_RETRIES = 4;
const RETRY_BASE_DELAY_MS = 500;
const RETRY_MAX_DELAY_MS = 30_000;

type FetchInit = NonNullable<Parameters<typeof fetch>[1]>;

const sleep = (ms: number) =>
  new Promise<void>(resolve => setTimeout(resolve, ms));

const parseRetryAfter = (value: string | null): number | undefined => {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const at = Date.parse(value);
  return Number.isNaN(at) ? undefined : Math.max(0, at - Date.now());
};

// Equal-jitter exponential backoff. The cap/2 floor guarantees a minimum
// delay so a misbehaving caller loop slows down instead of hammering the
// upstream while it keeps returning errors.
const computeBackoffDelay = (
  attempt: number,
  retryAfterMs?: number
): number => {
  const cap = Math.min(RETRY_BASE_DELAY_MS * 2 ** attempt, RETRY_MAX_DELAY_MS);
  const jittered = cap / 2 + Math.random() * (cap / 2);
  return Math.min(Math.max(jittered, retryAfterMs ?? 0), RETRY_MAX_DELAY_MS);
};

// Retries non-2xx responses and network errors with exponential backoff, then
// returns the final Response so callers keep their existing error handling.
const fetchWithBackoff = async (
  url: string,
  init: FetchInit
): Promise<Response> => {
  let lastError: unknown;

  for (let attempt = 0; attempt <= RETRY_MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, init);
      if (response.ok || attempt === RETRY_MAX_RETRIES) {
        return response;
      }

      const retryAfterMs = parseRetryAfter(
        response.headers.get("retry-after")
      );
      try {
        await response.body?.cancel();
      } catch {
        // Body already settled; nothing to clean up.
      }
      console.warn(
        `LLM request retry ${attempt + 1}/${RETRY_MAX_RETRIES} after status ${response.status}`
      );
      await sleep(computeBackoffDelay(attempt, retryAfterMs));
    } catch (error) {
      lastError = error;
      if (attempt === RETRY_MAX_RETRIES) throw error;
      console.warn(
        `LLM request retry ${attempt + 1}/${RETRY_MAX_RETRIES} after network error`
      );
      await sleep(computeBackoffDelay(attempt));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("LLM request failed after exhausting retries");
};

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  assertApiKey();

  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
    model,
    thinking,
    reasoning,
    reasoningEffort,
    reasoning_effort,
    maxTokens,
    max_tokens,
  } = params;

  const payload: Record<string, unknown> = {
    messages: messages.map(normalizeMessage),
  };

  if (model) {
    payload.model = model;
  }

  if (tools !== undefined) {
    // Array vazio é intencional, não "sem preferência": quando o chamador
    // não manda nenhuma ferramenta mas o proxy anexa uma por padrão (ex.:
    // web_search, incompatível com reasoning.effort "minimal" — erro real
    // visto em produção), "tools: []" explícito é o único jeito de
    // sobrepor esse padrão do lado do proxy.
    payload.tools = tools;
  }

  const normalizedToolChoice = normalizeToolChoice(
    toolChoice || tool_choice,
    tools
  );
  if (normalizedToolChoice) {
    payload.tool_choice = normalizedToolChoice;
  }

  const resolvedMaxTokens = max_tokens ?? maxTokens;
  if (typeof resolvedMaxTokens === "number") {
    // A OpenAI descontinuou "max_tokens" pra modelos de raciocínio (família
    // gpt-5): rejeita com 400 "Unsupported parameter" e pede
    // "max_completion_tokens" (cobre também os tokens de raciocínio interno,
    // não só o texto visível). O proxy anterior (Forge) aceitava
    // "max_tokens" e convertia por baixo dos panos; falando direto com a
    // OpenAI isso ficou explícito. "maxTokens"/"max_tokens" continuam sendo
    // os nomes do parâmetro aqui em InvokeParams — só o campo enviado no
    // payload mudou.
    payload.max_completion_tokens = resolvedMaxTokens;
  }

  if (thinking) {
    payload.thinking = thinking;
  }
  if (reasoning) {
    payload.reasoning = reasoning;
  }
  const resolvedReasoningEffort = reasoning_effort ?? reasoningEffort;
  if (resolvedReasoningEffort) {
    payload.reasoning_effort = resolvedReasoningEffort;
  }

  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema,
  });

  if (normalizedResponseFormat) {
    payload.response_format = normalizedResponseFormat;
  }

  const response = await fetchWithBackoff(resolveApiUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ENV.openaiApiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `LLM invoke failed: ${response.status} ${response.statusText} – ${errorText}`
    );
  }

  return normalizarRespostaLLM(await response.json());
}

export type ModelInfo = {
  id: string;
  object: string;
  created: number;
  owned_by: string;
};

export type ModelsResponse = {
  object: string;
  data: ModelInfo[];
};

export async function listLLMModels(): Promise<ModelsResponse> {
  assertApiKey();

  const url = "https://api.openai.com/v1/models";

  const response = await fetchWithBackoff(url, {
    headers: { authorization: `Bearer ${ENV.openaiApiKey}` },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `List LLM models failed: ${response.status} ${response.statusText} – ${errorText}`
    );
  }

  return (await response.json()) as ModelsResponse;
}
