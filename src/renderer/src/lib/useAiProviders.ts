/**
 * Provider availability, read once per session.
 *
 * Probing is cheap by contract — `status()` never makes a paid call — but it
 * does shell out to check for a CLI and hit Ollama's local port, so it is not
 * something to repeat on every render.
 */

import { useEffect, useState } from "react";
import type { ProviderStatus } from "@shared/types/ai.js";

export function useAiProviders(): { providers: ProviderStatus[]; anyAvailable: boolean } {
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  useEffect(() => {
    void window.api.ai.providers().then(setProviders);
  }, []);
  return {
    providers,
    anyAvailable: providers.some((p) => p.id !== "none" && p.available),
  };
}
