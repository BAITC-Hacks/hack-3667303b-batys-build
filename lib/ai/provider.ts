/**
 * Тонкий клиент к OpenAI-совместимым эндпоинтам.
 *
 * Поддержаны три провайдера: OpenAI, NVIDIA NIM и OpenRouter. Путь
 * /chat/completions, заголовок Bearer и формат сообщений у них одинаковые,
 * различий ровно три:
 *   — базовый URL и имя переменной с ключом;
 *   — OpenRouter умеет перебирать модели сам через поле models[], а OpenAI
 *     и NIM требуют одиночное model и вернут 400 на массив. Поэтому перебор
 *     моделей сделан на нашей стороне — это работает у всех троих;
 *   — поля reasoning и заголовки атрибуции есть только у OpenRouter.
 *
 * Без ключа модуль не бросает на импорте: isAiConfigured() вернёт false,
 * и симулятор просто покажет детерминированный разбор.
 */

export type ProviderId = "openai" | "nvidia" | "openrouter"

interface ProviderConfig {
  id: ProviderId
  label: string
  baseUrl: string
  keyEnv: string
  defaultModels: string[]
  /** Заголовки сверх авторизации. */
  headers?: Record<string, string>
}

const PROVIDERS: Record<ProviderId, ProviderConfig> = {
  openai: {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    keyEnv: "OPENAI_API_KEY",
    defaultModels: ["gpt-4o-mini"],
  },
  nvidia: {
    id: "nvidia",
    label: "NVIDIA NIM",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    keyEnv: "NVIDIA_API_KEY",
    defaultModels: ["meta/llama-3.3-70b-instruct"],
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    keyEnv: "OPENROUTER_API_KEY",
    defaultModels: ["anthropic/claude-haiku-4.5"],
  },
}

/** Порядок отката: явно выбранный провайдер, затем все остальные с ключом. */
function providerChain(): ProviderConfig[] {
  const preferred = process.env.AI_PROVIDER as ProviderId | undefined
  const withKey = (Object.keys(PROVIDERS) as ProviderId[])
    .map((id) => PROVIDERS[id])
    .filter((config) => Boolean(process.env[config.keyEnv]))

  if (preferred && PROVIDERS[preferred] && process.env[PROVIDERS[preferred].keyEnv]) {
    return [PROVIDERS[preferred], ...withKey.filter((c) => c.id !== preferred)]
  }
  return withKey
}

export const isAiConfigured = (): boolean => providerChain().length > 0

/** Какой провайдер и модель обслужат следующий запрос — для интерфейса и README. */
export function activeProvider(): { id: ProviderId; label: string; model: string } | null {
  const [config] = providerChain()
  if (!config) return null
  return { id: config.id, label: config.label, model: modelsFor(config)[0] }
}

function modelsFor(config: ProviderConfig): string[] {
  const configured = (process.env.AI_MODEL ?? "")
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean)
  return configured.length ? configured : config.defaultModels
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool"
  content: string | null
  tool_call_id?: string
  tool_calls?: ToolCall[]
}

export interface ToolCall {
  id: string
  type: "function"
  function: { name: string; arguments: string }
}

export interface ToolDefinition {
  type: "function"
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface CompletionOptions {
  maxTokens?: number
  temperature?: number
  timeoutMs?: number
  tools?: ToolDefinition[]
}

export interface CompletionResult {
  content: string | null
  toolCalls: ToolCall[]
  model: string
  provider: ProviderId
}

interface ApiResponse {
  choices?: Array<{
    finish_reason?: string | null
    message?: { content?: string | null; tool_calls?: ToolCall[] }
  }>
  error?: { message?: string }
}

/**
 * Один запрос к модели. Перебирает провайдеры и модели по очереди:
 * первая, которая ответила, выигрывает. Если не ответил никто — бросает
 * последнюю ошибку, и вызывающий код откатывается на детерминированный текст.
 */
export async function chatCompletion(
  messages: ChatMessage[],
  options: CompletionOptions = {},
): Promise<CompletionResult> {
  const chain = providerChain()
  if (!chain.length) throw new Error("Не задан ни один ключ ИИ-провайдера")

  let lastError: unknown = null

  for (const config of chain) {
    for (const model of modelsFor(config)) {
      try {
        return await requestOnce(config, model, messages, options)
      } catch (error) {
        lastError = error
        console.warn(`[ai] ${config.id}/${model} не ответил:`, error)
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Все провайдеры ИИ недоступны")
}

async function requestOnce(
  config: ProviderConfig,
  model: string,
  messages: ChatMessage[],
  options: CompletionOptions,
): Promise<CompletionResult> {
  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: options.maxTokens ?? 900,
    temperature: options.temperature ?? 0.3,
  }
  if (options.tools?.length) {
    body.tools = options.tools
    body.tool_choice = "auto"
  }
  // Поле понимает только OpenRouter; у остальных оно вызовет ошибку валидации.
  if (config.id === "openrouter") body.reasoning = { enabled: false }

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env[config.keyEnv]}`,
      ...(config.id === "openrouter"
        ? { "http-referer": process.env.APP_URL ?? "http://localhost:3000", "x-title": "Аким на 5 часов" }
        : {}),
      ...config.headers,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(options.timeoutMs ?? 45_000),
  })

  const payload = (await response.json().catch(() => ({}))) as ApiResponse
  if (!response.ok || payload.error) {
    throw new Error(`${config.label} ${response.status}: ${payload.error?.message ?? response.statusText}`)
  }

  const choice = payload.choices?.[0]
  const content = choice?.message?.content ?? null
  const toolCalls = choice?.message?.tool_calls ?? []
  if (!content && !toolCalls.length) throw new Error(`${config.label} вернул пустой ответ`)

  return { content, toolCalls, model, provider: config.id }
}

/** Модели любят обернуть JSON в markdown — вырезаем сам объект или массив. */
export function parseJsonReply(text: string): unknown {
  const start = text.search(/[[{]/)
  const end = Math.max(text.lastIndexOf("]"), text.lastIndexOf("}"))
  if (start === -1 || end <= start) throw new Error("В ответе модели нет JSON")
  return JSON.parse(text.slice(start, end + 1))
}
