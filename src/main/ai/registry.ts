/**
 * Which providers exist, and which one is in use.
 *
 * The licensing rule lives here as CODE, not as a comment in a design doc:
 * Anthropic does not permit third-party products to offer claude.ai login or
 * rate limits to their users. Driving your own authenticated CLI on your own
 * machine is fine; shipping that to someone else is not. `app.isPackaged` is
 * the line, and `providers()` will not return the claude-code adapter on the
 * far side of it.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { ProviderId, ProviderStatus } from "@shared/types/ai.js";
import { AnthropicProvider } from "./adapters/anthropic.js";
import { ClaudeCodeProvider } from "./adapters/claude-code.js";
import { OllamaProvider } from "./adapters/ollama.js";
import type { AiProvider } from "./adapters/types.js";

function findClaudeCli(): string | null {
  const candidates = [
    join(homedir(), ".local/bin/claude"),
    "/opt/homebrew/bin/claude",
    "/usr/local/bin/claude",
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

export type RegistryOptions = {
  /** True in a distributed build. Gates the claude-code adapter entirely. */
  packaged: boolean;
  apiKey?: string | null;
};

export function buildProviders(opts: RegistryOptions): AiProvider[] {
  const list: AiProvider[] = [];
  // The licensing gate. Not a preference, not a default — an availability rule.
  if (!opts.packaged) list.push(new ClaudeCodeProvider(findClaudeCli()));
  list.push(new AnthropicProvider(opts.apiKey ?? process.env["ANTHROPIC_API_KEY"] ?? null));
  list.push(new OllamaProvider());
  return list;
}

export class ProviderRegistry {
  private readonly providers: AiProvider[];

  constructor(private readonly opts: RegistryOptions) {
    this.providers = buildProviders(opts);
  }

  get(id: ProviderId): AiProvider | null {
    return this.providers.find((p) => p.id === id) ?? null;
  }

  async statuses(): Promise<ProviderStatus[]> {
    const known = await Promise.all(this.providers.map((p) => p.status()));
    return [
      ...known,
      {
        id: "none" as const,
        label: "Off",
        available: true,
        detail: "No AI. The authored hint ladder and compiler messages work exactly as they do now.",
      },
    ];
  }

  /**
   * The provider to use when the learner has not chosen one.
   *
   * First available wins, in the order built — which puts claude-code first on
   * a development machine because it is the only one that costs nothing and
   * needs no setup, despite being the slowest.
   */
  async defaultProvider(): Promise<ProviderId> {
    for (const p of this.providers) {
      if ((await p.status()).available) return p.id;
    }
    return "none";
  }

  get packaged(): boolean {
    return this.opts.packaged;
  }
}
