import type { AiRequest, ProviderId, ProviderStatus } from "@shared/types/ai.js";

/**
 * `stream` is optional on purpose.
 *
 * Every provider can complete; not every provider can usefully stream, and a
 * provider that fakes it by resolving `complete()` and then handing the whole
 * reply over as one "delta" is worse than one that says it cannot — the UI
 * would show a typing indicator that is a lie about what is happening.
 *
 * `onText` receives DELTAS, not snapshots. Returns the full text, so a caller
 * that ignored the deltas still has the reply.
 */
export interface AiProvider {
  readonly id: ProviderId;
  /** Cheap check — must not make a paid call. */
  status(): Promise<ProviderStatus>;
  complete(req: AiRequest, signal?: AbortSignal): Promise<string>;
  stream?(req: AiRequest, onText: (delta: string) => void, signal?: AbortSignal): Promise<string>;
}
