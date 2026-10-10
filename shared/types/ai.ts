/**
 * The AI layer's wire types.
 *
 * The provider interface is deliberately dumb: no tool use, no content
 * blocks, no provider-specific options. Ollama cannot honour Anthropic's block
 * shape and the Agent SDK's message stream is a third shape again — the moment
 * a `ContentBlock` leaks into this interface, two of the three adapters become
 * a lie about what they can do.
 *
 * Features name a MODEL CLASS, never a model id. Feature code should never
 * contain the string "haiku"; mapping a class to a model is each adapter's job,
 * which is what lets the Ollama swap be config rather than a grep.
 */

export type ProviderId = "claude-code" | "anthropic" | "ollama" | "none";

export type ModelClass = "fast" | "balanced" | "deep";

export type AiFeature = "hint" | "explain-error" | "review" | "tutor";

export type ProviderStatus = {
  id: ProviderId;
  label: string;
  /** False when the provider cannot run — no key, no model pulled, packaged build. */
  available: boolean;
  /** Why it is unavailable, or how it is configured when it is. */
  detail: string;
  /** Measured p50 in ms, when we have measured it. */
  observedMs?: number;
};

export type AiRequest = {
  feature: AiFeature;
  system: string;
  user: string;
  model: ModelClass;
  maxTokens?: number;
  /**
   * Agent-loop turn cap. One is right for a short hint, but a long structured
   * response (the authoring pipeline asks for 4000 tokens of JSON) can need
   * the loop to continue, and a cap of 1 surfaces as
   * "Reached maximum number of turns (1)" rather than a truncated reply.
   */
  maxTurns?: number;
  /** Cache key; when set and a cached response exists, no call is made. */
  cacheKey?: string;
  /**
   * Prior turns, oldest first, for a conversation. Role and string only —
   * the same reason the rest of this interface is dumb: a provider that takes
   * a message array can use it directly, and one that only takes a prompt
   * (the Agent SDK) flattens it. A content-block shape here would make two of
   * the three adapters a lie.
   */
  history?: { role: "user" | "assistant"; content: string }[];
};

export type AiResult = {
  text: string;
  provider: ProviderId;
  ms: number;
  cached: boolean;
  /** Set when the post-filter rejected the response and the caller should fall back. */
  rejected?: string;
};

/** What the renderer sends. The main process builds the prompt from this. */
export type HintRequest = {
  problemId: string;
  level: number;
  userCode: string;
  /** The first failing visible case, rendered. Never a hidden one. */
  failingCase?: string;
  failedAttempts: number;
};

export type ExplainRequest = {
  problemId: string;
  /** javac's message, already normalised for the cache key. */
  code: string;
  message: string;
  detail?: string;
  line: number;
  /** The few lines around the error, never the whole file. */
  excerpt: string;
};

// --------------------------------------------------------------- tutor chat

export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  /** Assigned by SQLite on insert; 0 for a message not yet persisted. */
  id: number;
  problemId: string;
  role: ChatRole;
  content: string;
  createdAt: number;
  /** Assistant messages only. */
  provider?: ProviderId;
  ms?: number;
};

/**
 * One turn. The renderer mints `turnId` and the chunk channel is named after
 * it, so two turns can never interleave into one another's transcript.
 */
export type ChatRequest = {
  turnId: string;
  problemId: string;
  message: string;
  /** The editor's current contents, so the tutor can name their variables. */
  userCode: string;
  /** First VISIBLE failing case, or null. Hidden cases never travel. */
  failingCase?: string;
};

export type ChatChunk =
  | { type: "delta"; text: string }
  /** Sent once, the moment the first token lands. The number worth watching. */
  | { type: "first"; ms: number };

export type ChatResult = {
  /** The reply as stored. Empty when the turn was cancelled or rejected. */
  text: string;
  provider: ProviderId;
  ms: number;
  /** Time to first token; null when the provider did not stream. */
  firstMs: number | null;
  streamed: boolean;
  /**
   * Set when the post-filter rejected the completed reply, or the turn was
   * cancelled. The renderer has already SHOWN the streamed text by then —
   * see the note in filterTutor.
   */
  rejected?: string;
};

// -------------------------------------------------------------- code review

/**
 * A review of the learner's own solution, after they have passed.
 *
 * Structured rather than prose because the parts are used differently: the
 * complexity line sits beside the problem's authored complexity so the two can
 * be compared, and improvements are a list you work through rather than a
 * paragraph you read once.
 */
export type CodeReview = {
  /** One sentence. The headline, not a summary of the rest. */
  verdict: string;
  complexity: {
    /** The model's reading of THEIR code, which may differ from the reference. */
    time: string;
    space: string;
    note: string;
  };
  strengths: string[];
  improvements: { what: string; why: string }[];
  /** Java-specific idiom. The reason this app exists rather than a generic one. */
  idiom: string[];
};

export type ReviewRequest = {
  problemId: string;
  userCode: string;
};

export type ReviewResult = {
  review: CodeReview | null;
  provider: ProviderId;
  ms: number;
  cached: boolean;
  /**
   * Why there is no review. "not solved yet" is the important one: review is
   * the only feature that sees the reference solution, and it is gated on
   * having passed — in the service, not in the button's disabled attribute.
   */
  rejected?: string;
};
