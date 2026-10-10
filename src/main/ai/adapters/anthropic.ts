/**
 * The Anthropic API adapter — the path a distributed build would use, where
 * each user brings their own key.
 *
 * Not currently exercisable on this machine: no ANTHROPIC_API_KEY, no stored
 * OAuth profile. It is written and typed so the swap is a settings change
 * rather than a project, but nothing here has been run against the real API,
 * and that is worth knowing before relying on it.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { AiRequest, ModelClass, ProviderStatus } from "@shared/types/ai.js";
import type { AiProvider } from "./types.js";

// Exact ids, no date suffixes.
const MODEL: Record<ModelClass, string> = {
  fast: "claude-haiku-4-5",
  balanced: "claude-sonnet-5",
  deep: "claude-opus-5",
};

export class AnthropicProvider implements AiProvider {
  readonly id = "anthropic" as const;
  private client: Anthropic | null = null;

  constructor(private readonly apiKey: string | null) {
    if (apiKey) this.client = new Anthropic({ apiKey });
  }

  async status(): Promise<ProviderStatus> {
    return {
      id: this.id,
      label: "Anthropic API (your key)",
      available: this.client !== null,
      detail:
        this.client === null
          ? "No API key set. Add ANTHROPIC_API_KEY to use this."
          : "Billed per token against your own key. Typically 1-2s per reply.",
    };
  }

  private params(req: AiRequest) {
    return {
      model: MODEL[req.model],
      // Hints are short; a low cap keeps a runaway reply from costing real
      // money, and nothing here should ever approach it.
      max_tokens: req.maxTokens ?? 600,
      system: req.system,
      messages: [...(req.history ?? []), { role: "user" as const, content: req.user }],
    };
  }

  async complete(req: AiRequest, signal?: AbortSignal): Promise<string> {
    if (!this.client) throw new Error("No Anthropic API key configured.");
    const res = await this.client.messages.create(
      this.params(req),
      signal ? { signal } : undefined,
    );
    return res.content
      .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
  }

  /**
   * The path a conversational tutor actually wants: first token in well under
   * a second, so the reply reads as someone talking rather than a batch job.
   * Untested here for the same reason as `complete` — no key on this machine.
   */
  async stream(
    req: AiRequest,
    onText: (delta: string) => void,
    signal?: AbortSignal,
  ): Promise<string> {
    if (!this.client) throw new Error("No Anthropic API key configured.");
    const s = this.client.messages.stream(this.params(req), signal ? { signal } : undefined);
    s.on("text", (delta) => onText(delta));
    return (await s.finalText()).trim();
  }
}
