/**
 * Minimal Gemini client (REST, no SDK). Free-tier keys and models are tried in order; a key/model that is busy
 * (503) or over quota (429) is rested for a while so the next call goes straight to one that works.
 */
export interface GeminiConfig {
  keys: string[];
  models: string[];
  timeoutMs?: number;
}

export function geminiConfigFromEnv(env: NodeJS.ProcessEnv = process.env): GeminiConfig | null {
  const keys = (env.GEMINI_API_KEYS ?? env.GEMINI_API_KEY ?? "").split(",").map((k) => k.trim()).filter(Boolean);
  const models = (env.GEMINI_MODELS ?? "gemini-2.5-flash").split(",").map((m) => m.replace(/#.*$/, "").trim()).filter(Boolean);
  return keys.length ? { keys, models } : null;
}

export class AiUnavailableError extends Error {}

const rested = new Map<string, number>(); // `${keyIndex}:${model}` -> until (ms)

export interface GeminiCall {
  system: string;
  parts: ({ text: string } | { inlineData: { mimeType: string; data: string } })[];
  /** OpenAPI-style schema for JSON output */
  schema: Record<string, unknown>;
}

export interface GeminiResult<T> {
  data: T;
  model: string;
  keyIndex: number;
  ms: number;
  tokens: { input: number; output: number } | null;
}

export async function geminiJson<T>(cfg: GeminiConfig, call: GeminiCall): Promise<GeminiResult<T>> {
  const started = Date.now();
  let last = "no key or model available";
  for (const model of cfg.models) {
    for (const [i, key] of cfg.keys.entries()) {
      const slot = `${i}:${model}`;
      if ((rested.get(slot) ?? 0) > Date.now()) continue;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs ?? 45_000);
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: "POST",
          signal: ctrl.signal,
          headers: { "content-type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: call.system }] },
            contents: [{ role: "user", parts: call.parts }],
            generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: call.schema },
          }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
          usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
          error?: { status?: string; message?: string };
        };
        if (!res.ok) {
          last = `${model}: ${body.error?.status ?? res.status}`;
          // busy model: rest 2 minutes; quota: rest an hour; bad request: no point trying other keys
          if (res.status === 503 || res.status === 500) rested.set(slot, Date.now() + 120_000);
          else if (res.status === 429) rested.set(slot, Date.now() + 3600_000);
          else if (res.status === 400) throw new AiUnavailableError(`Gemini rejected the request: ${body.error?.message ?? res.status}`);
          continue;
        }
        const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
        const data = JSON.parse(text) as T;
        const u = body.usageMetadata;
        return {
          data, model, keyIndex: i + 1, ms: Date.now() - started,
          tokens: u ? { input: u.promptTokenCount ?? 0, output: u.candidatesTokenCount ?? 0 } : null,
        };
      } catch (e) {
        if (e instanceof AiUnavailableError) throw e;
        last = `${model}: ${(e as Error).name === "AbortError" ? "timed out" : (e as Error).message}`;
      } finally {
        clearTimeout(timer);
      }
    }
  }
  throw new AiUnavailableError(`AI is busy right now (${last}). Enter the details by hand or try again in a minute.`);
}
