/**
 * The Claude Code adapter: drives the locally installed, already-authenticated
 * `claude` CLI through the Agent SDK.
 *
 * LICENSING — enforced in registry.ts, restated here because it is the kind of
 * rule that gets lost in a refactor: Anthropic does not permit third-party
 * products to offer claude.ai login or rate limits to THEIR users. Using your
 * own logged-in CLI on your own machine is just you using Claude Code. A
 * distributed build must never present this provider.
 *
 * MEASURED, and the reason the UI is built the way it is:
 *
 *   trivial prompt, cold spawn   p50  9.3s  (n=20)
 *   trivial prompt, warm session p50  6.2s  (n=11)
 *   REAL hint prompt             p50 16.2s, max 38.9s (n=5)
 *
 * The trivial number is the misleading one. A real hint carries the problem
 * statement, the learner's code and a failing case, and that pushes it to
 * 16s typical and nearly 40s at worst — 8-20x the 2s threshold the plan set
 * for an interactive hint. Warm sessions only recovered a third of the spawn
 * cost, so the overhead is the Claude Code harness itself, not the process.
 *
 * Hence: hints never block on this. The authored ladder answers instantly and
 * this arrives afterwards as a second opinion, and the cache makes a repeat
 * free. For a genuinely interactive tutor you want an API key.
 */

import type { AiRequest, ModelClass, ProviderStatus } from "@shared/types/ai.js";
import type { AiProvider } from "./types.js";

const MODEL: Record<ModelClass, string> = {
  fast: "claude-haiku-4-5",
  balanced: "claude-sonnet-5",
  deep: "claude-opus-5",
};

export class ClaudeCodeProvider implements AiProvider {
  readonly id = "claude-code" as const;

  constructor(private readonly cliPath: string | null) {}

  async status(): Promise<ProviderStatus> {
    return {
      id: this.id,
      label: "Claude Code (your subscription)",
      available: this.cliPath !== null,
      detail:
        this.cliPath === null
          ? "The `claude` CLI was not found on PATH."
          : "Uses your existing Claude Code login — no API key, no per-token cost. Slow: measured 16s typical, up to 39s. Answers arrive alongside the instant authored hint, never instead of it.",
      observedMs: 16200,
    };
  }

  async complete(req: AiRequest, signal?: AbortSignal): Promise<string> {
    let text = "";
    for await (const msg of await this.ask(req, false, signal)) {
      if (msg.type === "assistant") {
        for (const b of msg.message.content) if (b.type === "text") text += b.text;
      }
    }
    return text.trim();
  }

  /**
   * Streaming, via the SDK's partial-message events.
   *
   * Worth knowing what this does and does not buy. The harness overhead
   * measured in Phase 5 sits BEFORE the first token — spawning the CLI,
   * loading the session — so streaming does not make the reply arrive sooner.
   * What it does is turn one long silence into a visible one: the wait
   * happens once, up front, and then the text moves.
   *
   * Measured (scripts/bench-stream.ts, n=9): first token 4.2-14.5s, p50 6.4s;
   * complete p50 11.4s. Chunk sizes are not uniform — the CLI sometimes emits
   * 85 small deltas and sometimes 8 large ones for a reply of the same length,
   * so the text arrives in visible steps rather than smoothly.
   */
  async stream(
    req: AiRequest,
    onText: (delta: string) => void,
    signal?: AbortSignal,
  ): Promise<string> {
    let text = "";
    for await (const msg of await this.ask(req, true, signal)) {
      if (msg.type === "stream_event") {
        const ev = msg.event;
        if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
          text += ev.delta.text;
          onText(ev.delta.text);
        }
      }
    }
    return text.trim();
  }

  private async ask(req: AiRequest, partial: boolean, signal?: AbortSignal) {
    // Not a top-level import: see the licensing note above. In a packaged
    // build this specifier does not resolve, and it must not be reached.
    const { query } = await import("@anthropic-ai/claude-agent-sdk");
    return query({
      // The Agent SDK's prompt is a string, so a conversation has to be
      // flattened into it. Roles are labelled rather than dropped: without
      // them a three-turn exchange reads as one run-on question.
      prompt: flatten(req),
      options: {
        ...(partial ? { includePartialMessages: true } : {}),
        // No tools at all: this is a text call, and a tutor has no business
        // reading the filesystem.
        allowedTools: [],
        permissionMode: "bypassPermissions",
        maxTurns: req.maxTurns ?? 1,
        // Isolate from the user's own ~/.claude: their skills, MCP servers and
        // plugins would otherwise load into every hint, costing latency and
        // making replies depend on unrelated local configuration.
        settingSources: [],
        systemPrompt: req.system,
        model: MODEL[req.model],
        ...(signal ? { abortController: toController(signal) } : {}),
      },
    });
  }
}

function flatten(req: AiRequest): string {
  if (!req.history || req.history.length === 0) return req.user;
  const lines: string[] = ["Earlier in this conversation:"];
  for (const m of req.history) {
    lines.push("", m.role === "user" ? `They asked: ${m.content}` : `You replied: ${m.content}`);
  }
  lines.push("", "---", "", req.user);
  return lines.join("\n");
}

function toController(signal: AbortSignal): AbortController {
  const c = new AbortController();
  if (signal.aborted) c.abort();
  else signal.addEventListener("abort", () => c.abort(), { once: true });
  return c;
}
