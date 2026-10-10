/**
 * The Ollama adapter — local, free, offline, and private.
 *
 * Untested here: Ollama is installed on this machine but has no models pulled,
 * so `status()` reports the empty roster rather than pretending to be ready.
 * That empty state is deliberate — a provider that claims availability and
 * then fails on first use is worse than one that says what it needs.
 */

import type { AiRequest, ModelClass, ProviderStatus } from "@shared/types/ai.js";
import type { AiProvider } from "./types.js";

const HOST = "http://127.0.0.1:11434";

/** Sensible local equivalents; overridden by whatever is actually pulled. */
const PREFERRED: Record<ModelClass, string[]> = {
  fast: ["qwen2.5-coder:7b", "llama3.2", "qwen2.5-coder"],
  balanced: ["qwen2.5-coder:14b", "qwen2.5-coder:7b"],
  deep: ["qwen2.5-coder:32b", "qwen2.5-coder:14b"],
};

export class OllamaProvider implements AiProvider {
  readonly id = "ollama" as const;
  private models: string[] | null = null;

  private async list(): Promise<string[]> {
    if (this.models) return this.models;
    try {
      const res = await fetch(`${HOST}/api/tags`, { signal: AbortSignal.timeout(1500) });
      if (!res.ok) return (this.models = []);
      const body = (await res.json()) as { models?: { name: string }[] };
      return (this.models = (body.models ?? []).map((m) => m.name));
    } catch {
      return (this.models = []);
    }
  }

  async status(): Promise<ProviderStatus> {
    const models = await this.list();
    return {
      id: this.id,
      label: "Ollama (local)",
      available: models.length > 0,
      detail:
        models.length === 0
          ? "Ollama is reachable but has no models. Try `ollama pull qwen2.5-coder:7b`."
          : `Local and offline. Models: ${models.slice(0, 3).join(", ")}.`,
    };
  }

  private pick(cls: ModelClass, available: string[]): string {
    for (const want of PREFERRED[cls]) {
      const hit = available.find((m) => m === want || m.startsWith(`${want}:`));
      if (hit) return hit;
    }
    return available[0] ?? "llama3.2";
  }

  private async post(req: AiRequest, stream: boolean, signal?: AbortSignal): Promise<Response> {
    const models = await this.list();
    if (models.length === 0) throw new Error("Ollama has no models pulled.");
    const res = await fetch(`${HOST}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: this.pick(req.model, models),
        stream,
        messages: [
          { role: "system", content: req.system },
          ...(req.history ?? []),
          { role: "user", content: req.user },
        ],
        options: { num_predict: req.maxTokens ?? 600 },
      }),
      ...(signal ? { signal } : {}),
    });
    if (!res.ok) throw new Error(`Ollama returned ${res.status}`);
    return res;
  }

  async complete(req: AiRequest, signal?: AbortSignal): Promise<string> {
    const res = await this.post(req, false, signal);
    const body = (await res.json()) as { message?: { content?: string } };
    return (body.message?.content ?? "").trim();
  }

  /**
   * Ollama streams NDJSON — one JSON object per line, not SSE. Chunks arrive
   * split across reads at arbitrary byte offsets, so the tail of a partial
   * line has to be carried into the next read; parsing each chunk on its own
   * drops a token every few hundred and the reply comes out subtly mangled.
   */
  async stream(
    req: AiRequest,
    onText: (delta: string) => void,
    signal?: AbortSignal,
  ): Promise<string> {
    const res = await this.post(req, true, signal);
    if (!res.body) throw new Error("Ollama returned no body.");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let text = "";

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim() === "") continue;
        const obj = JSON.parse(line) as { message?: { content?: string }; done?: boolean };
        const piece = obj.message?.content ?? "";
        if (piece !== "") {
          text += piece;
          onText(piece);
        }
      }
    }
    return text.trim();
  }
}
