# Java Tutor

A local-first macOS app for learning Java from scratch through DSA and competitive
programming, with an AI tutor. Plan: `~/.claude/plans/can-we-create-a-abstract-ullman.md`.

## Prerequisites

Verified on macOS 26.2, Apple Silicon. Nothing below has been tested on Intel.

### Required

| | Minimum | Verified on | Why |
| --- | --- | --- | --- |
| macOS | — | 26.2 (arm64) | Electron shell; `sandbox-exec` is macOS-only |
| **JDK** with `javac` | 9 in theory | **26.0.2** | The runner passes `--limit-modules`, which needs the module system (JDK 9+). The Java sources themselves compile at `--release 8`. |
| **Node.js** | **22.5** | 26.7 | `node:sqlite` for the authoring and test scripts. It landed experimental in 22.5 and stabilised in 24, so 24+ is the comfortable floor. |
| Disk | ~1 GB | — | 718 MB `node_modules`, of which 268 MB is the Electron binary |

**No Xcode Command Line Tools and no native compilation.** That is deliberate: using
Node's built-in `node:sqlite` instead of `better-sqlite3` removed the only native module,
so there is no `node-gyp` step and no `electron-rebuild`.

The JDK is found through `/usr/libexec/java_home`, not `JAVA_HOME` — that variable is
frequently stale or points at a JRE with no compiler, and a missing `javac` would
otherwise surface much later as a confusing runner failure. The app reports what it found
on the Home screen.

### Two install gotchas on this machine

Both cost real time; both are recorded because they will recur.

1. **npm 11 does not run postinstall scripts by default.** It prints a warning and
   carries on, so packages that download binaries in postinstall — Electron, esbuild —
   install but do not work. Fix:
   ```bash
   npm install-scripts approve electron esbuild && npm rebuild electron esbuild
   ```
2. **Electron's extractor can fail silently with exit code 0**, leaving `dist/` holding
   only `LICENSES.chromium.html`. The 100 MB+ zip downloads and caches fine; it is the
   `.app` bundle's symlinks that break it. Extract with macOS's own tool instead:
   ```bash
   cd node_modules/electron && rm -rf dist && mkdir dist
   ditto -x -k ~/Library/Caches/electron/<hash>/electron-v<ver>-darwin-arm64.zip dist/
   printf 'Electron.app/Contents/MacOS/Electron' > path.txt
   ```
   `path.txt` must be written by hand too — `install.js` normally writes it after
   extracting.

### Optional — the AI tutor

The app is fully usable with none of these: the authored hint ladder, the compiler
messages and every problem work with AI switched off. A provider adds a second opinion
that has read your code.

| Provider | Needs | Cost | Speed |
| --- | --- | --- | --- |
| **Claude Code** | the `claude` CLI, already logged in | free with your subscription | slow — 16s typical, up to 39s |
| Anthropic API | `ANTHROPIC_API_KEY` | per token | ~1-2s (untested here) |
| Ollama | Ollama running with a model pulled, e.g. `ollama pull qwen2.5-coder:7b` | free, offline | untested here |

Claude Code is offered **only in development builds**. Anthropic does not permit
third-party products to offer claude.ai login or rate limits to their users, so a
packaged build must fall back to a user-supplied key or Ollama. That rule is enforced in
`src/main/ai/registry.ts`, not left to documentation.

### Authoring only

`npm run author` needs `/usr/bin/sandbox-exec` (built into macOS). It runs generated Java
with network and out-of-directory writes denied, because that is the one path where
hundreds of never-reviewed programs execute unattended.

## Status

**Phase 0 complete** — shell skeleton verified.

| Check | Result |
| --- | --- |
| Electron / bundled Node | 38.8.6 / 22.22.0 |
| `node:sqlite` in Electron | **available** — `DatabaseSync`, WAL, full roundtrip. No `better-sqlite3` needed. |
| JDK auto-detection | javac 26.0.2 via `/usr/libexec/java_home` |
| renderer -> preload -> ipcMain -> SQLite | verified; row read back from an independent process |
| IPC round-trip (warm) | 188 ms (cold 702 ms — includes JDK probe) |

**Phase 1 complete** — content model and validator.

| Check | Result |
| --- | --- |
| `npm run validate` | 6/6 problems pass (4 method, 1 class, 1 stdio) |
| `npm test` | 30/30 |
| Emitter gate | every `JavaType` literal compiled by real javac **and** round-tripped through the JVM |
| Gate is not vacuous | mutation-tested: breaking the `double` and `long` emitters both fail it |
| Footguns | long past 2^53, 2-code-unit char, emoji char, `null` on a primitive, oversized literal — each rejected with a message naming the fix |
| Reference solutions | all 6 compile (correctness is Phase 6's compile-and-run gate) |

**Phase 2 complete** — the Java runner.

| Check (from the plan) | Result |
| --- | --- |
| Correct solution -> all pass, per-case timings | 6/6 reference solutions, **32/32 cases**, all three kinds. Case 0 carries JIT warmup (0.193 ms), later cases microseconds. |
| Syntax error -> `phase: "compile"` at exact line:col | verified on tab-indented source |
| `while(true){}` -> killed, no leftover `java` | 3 timeout kills across the suite, **0 orphaned JVMs**, 0 stray run dirs |
| 100k-deep recursion | passes on the 64 MB runner thread; overflows at 1 MB (control) |
| `System.out.println` -> `consoleLogs`, not the case stream | verified, including a print with no trailing newline |
| stdio with a large input file -> per-case `durationMs` | 300k integers via `stdinFile`, well inside the limit |
| `npm test` | **44/44** |

Measured latency (18 runs): `compileMs` p50 **434 ms**, total p50 **491 ms** / p95 592 ms.
The plan's threshold for building a compiler daemon is total p50 > 1200 ms — **not needed**.

**Phase 3 complete** — the Javelin UI, built to the design canvas.

Implements `Java AI Tutor App Design/Javelin.dc.html` and its Modernist design system
(dark adaptation): Archivo, single red accent, **zero corner radius**, 2px rules,
flush-left button labels with the trailing glyph pushed right.

| Screen | State |
| --- | --- |
| Onboarding | 4 steps, asks goal / level / daily time / **navigation layout** |
| Home | three-column grid over the real content registry |
| Problems | data table, filter + search over the corpus |
| Practice | Coach ↔ Editor on a sliding 200% track, wired to the real Java runner |
| Progress | ring + bars, showing corpus coverage |
| Settings | live preferences, no save step |
| ⌘K palette | screens + every problem |

**Navigation is switchable between tabs and a sidebar** — chosen during onboarding,
changeable any time in Settings, persisted in SQLite. ⌘K works in both, which is why the
canvas's third `nav` option (palette) is not offered as a mutually-exclusive mode.

**Phase 4 complete** — progress persistence.

| Check (from the plan) | Result |
| --- | --- |
| Solve, quit, reopen -> progress restored | streak, per-track solved counts, sidebar ✓ marks, dashboard — all from disk on a cold start |
| Drafts restored | editor reopens on the saved draft, not the starter |
| Dashboard shows attempt counts | 2 solved / 3 attempted / 4 runs / 50% compile-error rate, matching the database exactly |
| Delete the db file -> starts clean | recreated at v1, 0 errors, falls back to onboarding |

Schema is now versioned (`src/main/db/migrations.ts`) rather than the ad-hoc
`CREATE TABLE IF NOT EXISTS` scattered through phases 0-3. Migration 1 also drops the
dead phase-0 `ping` table, and is tested against a simulated phase-3 database to prove
existing settings survive the upgrade.

Design decisions worth keeping straight:

- **Passing Run does not solve a problem.** Run executes visible cases only; the hidden
  cases are the whole point, so only a passing Submit sets `solved`.
- **Solved is a ratchet.** Breaking it again later does not un-solve it, and the first
  solve timestamp never moves.
- **The hint gate reads from persisted `failed_attempts`**, so quitting the app is not a
  way to reset it — and yesterday's failed runs still count today.

**Phase 5 complete** — AI provider layer, hints and the error explainer.

The plan's gate was "benchmark before building UI; if p50 > 2s, fall back to the
Anthropic SDK". Measured:

| Path | p50 | Notes |
| --- | --- | --- |
| claude-code, trivial prompt, cold | 9.3s | n=20 |
| claude-code, trivial prompt, warm session | 6.2s | n=11 — warm only recovers a third, so the cost is the harness, not the spawn |
| **claude-code, real hint prompt** | **16.2s** (max 38.9s) | n=5 — the honest number: real prompts carry problem, code and failing case |
| cached | **0ms** | |

The fallback the plan assumed does not exist on this machine: no `ANTHROPIC_API_KEY`,
no stored OAuth profile, no Ollama models. `claude-code` is the only live provider.

**So the design changed rather than the provider.** AI is progressive enhancement over
an instant floor: the authored hint renders immediately, and the AI second opinion —
which has actually read the learner's code — arrives underneath when it arrives. Nothing
blocks, nothing spins. Every failure (no provider, slow provider, filtered response)
lands in the same place: the static hint is simply what you have. Caching matters far
more than expected, since a repeat is 0ms rather than 16s.

Verification, all against real model output:

- **Redaction** — every problem in the corpus, asserted at both the redacted-context and
  fully-built-prompt level: no solution, no hidden case.
- **Post-filter** — a real model, given an adversarial prompt, produced a complete
  36-line solution. Rejected at **all four** rungs; the static hint took over.
- **Provider off** — returns inert, does not throw, app unaffected.

The overlap threshold scales with the rung, which measurement forced: the worst
legitimate authored hint scores 22% and a realistic prose leak 27%, a 5-point gap far
too tight for one threshold. The resolution is that the same sentence *is* a leak at
level 1 and is exactly what level 4 exists to say. Overlap is a backstop regardless —
the real defence is that the model never receives the solution.

**Phase 6 complete** — authoring pipeline, gates, and the review discipline.

`DESIGN -> DEDUPE -> IMPLEMENT -> VALIDATE -> GATES -> REPAIR -> EMIT`, every generated
program executed under seatbelt.

| Check (from the plan) | Result |
| --- | --- |
| Sandbox for unattended execution | network blocked, writes confined to the run dir, **child processes inherit the profile** — all verified against a real JVM |
| Generate a topic, all clearing the gates | 3/3 accepted, 0 rejected, 2.4 min (~45-80s each) |
| Repair fires, cases never modified | fired on generation; enforced structurally, not requested |
| `validate:all` in a pre-commit hook | 8 problems, 0 failing, 5.4s |
| Read every prompt yourself | done — and it changed the pipeline twice |

**The gates cannot see the defect that matters most.** The first batch passed
compile-and-run, starter-must-fail and mutant-must-fail — and all three problems were
unusable: one stated its whole algorithm in the prompt ("keep a Map from each value to
the most recent index... one pass, O(n) time"), one had a title describing a different
problem, one claimed a 200,000-element performance limit while its largest test case had
three elements. Reading them is what caught it, exactly as the plan predicted.

Each finding became a rule and, where possible, a gate:

- **Approach-leak gate** — rejects a prompt that names a data structure, states a
  complexity, or describes the approach. It flagged all three retroactively, confirming
  the fault was systematic. Complexity needed a finer rule than the rest: "get and put
  must run in O(1)" is LRU Cache's contract, while "an O(n^2) solution will time out"
  gives the game away — the calibration test caught the first version rejecting a
  hand-authored prompt.
- **Sentinel rule** — a sentinel must be impossible as a real answer. Held back a
  generated problem returning `' '` for "no repeated character", where a space can
  itself repeat and no test covered it.
- **Difficulty from the spec** — `targetCounts` was declared and never used, so every
  design came back "medium". Now an interleaved queue, so an interrupted run still
  leaves a usable mix.

**Scope:** `method` problems only. `class` (op-sequences) and `stdio` (the CP track) need
their own design and implement prompts — roughly a third of the planned 145.

**Throughput:** ~45-80s per accepted problem, so the 145 is 3-4 hours unattended. Human
review at ~2 min each remains the bottleneck, as the plan said.

**Phase 7 complete** — the tutor chat pane, and the app's only streaming path.

A third pane on the Practice track (`Coach | Editor | Tutor`, ⌘1/⌘2/⌘3), with the Editor
in the middle so both kinds of help are one step from the work.

| Check (from the plan) | Result |
| --- | --- |
| Streams token by token | verified against the live provider — 8-85 deltas per reply, printed with arrival times by `npm run tutor` |
| References *your* variable names | the editor's current contents travel with every turn; the reply quotes them back |
| History restored on reopen | `chat_message`, per problem, migration 3 — verified applied in the running app |
| Works with the provider off | the pane says there is nobody to ask and points at Settings; nothing else changes |
| `npm test` | **123/123** |

**Measured first, as in Phase 5, and it changed the design.** The question was not total
latency but how much of it precedes the first token:

| | p50 | range |
| --- | --- | --- |
| first token | 6.4s | 4.2 - 14.5s (n=9) |
| complete | 11.4s | 10.9 - 17.7s |

So streaming earns its place — a little over half the reply arrives progressively — but
the opening seconds are silence, and the spread is far too wide to promise a number. The
pane therefore **counts the wait rather than predicting it**: a live elapsed counter is
right every time, where "about five seconds" would have been wrong a third of the time.
The first version of the copy said exactly that, and the second benchmark disproved it.

**The tutor is not the hint ladder with a text box.** The ladder answers "I am stuck on
this problem" and is rationed by failed attempts; the tutor answers "why does Java do
that?", which is not about the problem at all, is not rationed, and *is* allowed to write
three lines of Java — a tutor that will not show a beginner a `for` loop is useless.

That difference is why it needed its own filter, calibrated against the corpus rather
than guessed:

| | verbatim solution lines | secret-vocabulary tokens | rate |
| --- | --- | --- | --- |
| pasted solution | 4-15 | 1-13 | 14-65% |
| solution reworded as prose | 0 | 1-13 | 20-68% |
| authored L4 walk hint | 0 | 0-6 | 5-19% |
| a general Java answer | 0 | 0-2 | 0-18% |

Three findings shaped it. **The authored hints are the standard** — the app hands the
learner the L4 walk for the asking, so a filter that rejects it is miscalibrated, not
strict; the first threshold rejected six of them. **A rate alone cannot work** — L3
reaches 22% while a pasted solution sits at 14%, because a short reply has few tokens and
each shared one is a large fraction. **Subtract what they can already see** — the prompt,
the examples and their own code — because naming their own variables must cost nothing,
and what remains is vocabulary only the solution knows.

Honest limits, both in the code as comments: a problem whose solution says nothing its
prompt does not ("compute the average") has a one-token secret vocabulary and no word-based
measure can work on it — the code rules are the whole defence there. And because the reply
streams, the filter runs when it is *complete*: rejection pulls it from the transcript and
from history, but the learner has already watched it arrive. The defence that holds is
structural — the tutor never receives the solution.

**A gap in Phase 5 found by mutation-testing Phase 7.** `filterHint` was thoroughly tested
as a function and nothing proved the service ever *called* it; deleting the call left all
121 tests passing. Those are different claims and only the second protects a learner. Now
covered, and mutation-verified along with every other guardrail added here.

**Phase 8 complete** — code review, and concept pages that cannot go stale.

| Check (from the plan) | Result |
| --- | --- |
| Post-pass review with complexity | structured JSON, shown beside the problem's authored complexity |
| Concepts = definition + runnable Java + pitfalls + quiz | 4 pages, 9 examples, all compiled and run by the build |
| No GSAP visuals ported | none — see below |
| `npm test` | **139/139** |
| `npm run validate:all` | 8 problems + 4 concepts / 9 examples, 0 failing, 5.2s |

### Review is the one feature that sees the answer

Everything else in the AI layer is built so it cannot leak the solution. Review is the
exception, and it is only safe because the learner has already passed — so that condition
is checked **in the main process against the database**, before a prompt is built:

```
if (progress?.status !== "solved") return { rejected: "not solved yet" };
```

Not in the button's `disabled` attribute. A UI-only gate is one refactor from being no
gate, and the thing behind it is the answer. The test asserts not just that an unsolved
request is refused but that **no prompt was constructed at all** — a refusal after the
solution had been assembled into a string would be no refusal.

`solved` means a passing **submit**, which runs the hidden cases. Passing the visible
cases on a Run does not open it.

**Real reviews, real numbers.** Run against a deliberately naive but correct two-sum, the
review named the nested scan, gave O(n²) against the reference's O(n), and volunteered the
`-128..127` Integer cache — which is one of the concept pages. Measured 14.1s, 16.6s,
26.4s. The first draft of the panel said "give it ten seconds or so", which was wrong every
time; it now **counts the wait**, the same correction Phase 7 made. Two features in a row
have now needed it, which suggests the rule rather than the instance: never write a latency
into copy that a benchmark has not earned.

**Parsing is half the feature.** Asking for JSON and getting JSON are different events —
fences, preambles, closing remarks, a string where a list was asked for. All of it is
treated as expected input; only a reply with no object in it is a failure. The extractor
counts braces and is string-aware, because a Java review says "your closing `}` is on the
wrong line" constantly and a naive scan truncates the object there.

### Concept pages: the claim and the build agree

The JS platform had 58 GSAP visualisations here. **None are ported** — half explain
JavaScript semantics that do not exist in Java (the event loop, hoisting, `this`), and the
rest are weeks of animation on the least differentiated part of the product.

What replaces them is the thing an animation cannot do: **every example is a complete
program, editable and runnable in the page, and `npm run validate:all` compiles and runs
all nine and fails if the output has drifted.** A page cannot rot into folklore, because
the build checks. That gate is mutation-verified three ways — a wrong claimed output, a
changed example, and an example that stops compiling.

One rule shaped the content: **assert only what the language guarantees.** The tempting
example prints a HashMap's iteration order, because the surprise is the lesson — but that
order is unspecified, so the expected output would be a claim about this JDK rather than
about Java, and the page would fail for a learner on another one. Where the interesting
behaviour is unspecified, the example demonstrates the guaranteed alternative (TreeMap,
LinkedHashMap) and the prose says the rest.

The four pages are the ones that catch people arriving from another language: `int` vs
`Integer`, `==` vs `.equals`, the four HashMap methods that replace most loops, and
`Arrays.asList` — including the `int[]` trap that compiles and gives you a one-element
list.

**Two accessibility fixes came from the guardrail, not from a checklist.** The quiz marked
right and wrong with colour alone, which is nothing at all to a screen reader; the
accessible name now carries what the border shows. And a test that "cannot fail" is not
hypothetical — the first JSON-scanner test used a *balanced* `{a=1}` inside a string, so it
passed with string-awareness removed entirely, and the escaped-quote case needed an odd
number of quotes before it discriminated at all. Both were found by mutation, not review.

**Phase 9 complete** — packaging, signing, the sandbox, and JDK detection.

```bash
npm run package     # icon -> build -> electron-builder -> ad-hoc sign -> dmg + zip
"Java Tutor.app/Contents/MacOS/Java Tutor" --selftest
```

| Check (from the plan) | Result |
| --- | --- |
| `open MyApp.app` works outside the repo | installed from the DMG to `/tmp`, launched, UI rendered, quit cleanly |
| `sandbox.sb` on for the app | on whenever packaged, and **verified by trying to escape it** |
| JDK detection, clear error if absent | `/usr/libexec/java_home`; a banner above the nav, and the runner's message names the symlink step |
| Not jlink-bundled | 106 MB DMG; uses the system JDK, as the plan decided |
| `npm test` | **140/140** |

### `--selftest`: packaging gets its own acceptance test

Everything in this project is tested from source, which is exactly why packaging needed
its own check — the Phase 2 path bug passed every test for days because the tests run
under tsx and the bug only existed in the bundle. A packaged app adds a third layout, an
asar archive, and now a seatbelt profile that development does not use.

So the built app runs six checks against the real paths and exits non-zero if any fail:
resources survived packaging, a JDK resolves, the database migrates to v4, a real problem
compiles and passes 6/6, a concept example still prints what its page claims, and the
sandbox refuses a deliberate escape attempt. "The package works" is a command, not an
opinion.

**Both halves of that were mutation-tested, and one of them was broken.** Pointing the
resource root at `app.getAppPath()` — the Phase 2 bug, reintroduced on purpose — is caught
(`MISSING: runtime/java/Judge.java`, exit 1). Removing the sandbox entirely was **not**:
the check branched on `profile === undefined` and reported "off in development", so a
packaged build that silently lost its sandbox passed and exited 0. The expectation now
keys on `app.isPackaged`, which is the thing being claimed. A check conditioned on what it
is meant to verify cannot fail, and that is worse than no check, because it reads as one.

### The licensing boundary became physical

`registry.ts` has always refused to offer the Claude Code provider in a packaged build.
Packaging turned that from a rule into a fact: the Agent SDK pulls in a **190 MB** platform
binary, so a static import would have put a third of the download inside an app that is
forbidden to use it. The import is now dynamic and `electron-builder.yml` excludes the
package outright — in a packaged build the specifier does not resolve at all.

### Signing: what is true, and what would be needed

The only certificate on this machine is an **Apple Development** one, which is not a
Developer ID and cannot be notarised. The first build made that worse rather than
honest: `identity: null` does not produce an unsigned app, it produces a **broken** one —
the Electron executable keeps its own linker signature (`Identifier=Electron`) while the
bundle's resources are never sealed, and `spctl` says *"code has no resources but signature
indicates they must be present"*. That is the state that shows a user "the application is
damaged" rather than the ordinary unidentified-developer prompt.

`scripts/after-pack.cjs` now ad-hoc signs the bundle and verifies the seal, so the app is
internally consistent — correct identifier, sealed resources, `codesign --verify --deep
--strict` passes, and it survives the DMG round trip. It still will not pass Gatekeeper on
another machine, and it is not pretending to. To actually distribute you need: an Apple
Developer Program membership, a **Developer ID Application** certificate, `hardenedRuntime:
true` with the JIT entitlements Electron requires, and notarisation credentials. Set the
identity in `electron-builder.yml` and delete the hook.

### The sandbox is on in the app now, and the reasoning changed

Phase 2 argued against sandboxing the app: your own code, your own machine, nothing a
timeout does not already cover. That reasoning holds for development and stops holding for
a packaged build — not because packaging is riskier in the abstract, but because the two
face different code. A packaged app runs whatever a learner **pastes** into the editor, and
"paste this solution from the forum and run it" is a normal thing for someone learning to
do. Concept examples are editable too.

What it buys: a pasted `Files.walk(Paths.get("/"))` cannot touch anything outside the run
directory, and nothing that runs can open a socket. What it does not: protection from the
user, who owns the machine. It is protection from what they were told to paste.

### The one dependency the app cannot supply

The plan chose the system JDK over a jlink bundle, and the cost of that decision is a
failure mode a new user hits before anything else works. That path had **never been
executed** — this machine has a JDK, so nothing reached it. `JAVATUTOR_NO_JDK=1` is a test
seam added for exactly that, and the test asserts the message names the fix rather than
the fault. The fix it gives is Homebrew's own caveat, checked against `brew info openjdk`
rather than recalled: `brew install openjdk` alone leaves a keg-only install
`/usr/libexec/java_home` cannot see, so the symlink is the step that actually matters.

### Design-system guardrails

`src/renderer/src/design/design-system.test.ts` — six lint-shaped tests, each
mutation-verified to prove it actually fails when the rule is broken:

| Guardrail | Catches |
| --- | --- |
| spacing sits on the ramp | any padding/margin/gap off the 2/4/8px ramp |
| CSS ramp matches the test's | `--space-N` whose value is not N px |
| `var(--token)` exists | a dangling reference after a token rename |
| `aria-selected` has a supporting role | the attribute on a plain `<button>` |
| palette is a real modal | missing dialog/listbox roles, focus trap, focus restore |
| every button has an accessible name | icon/bar buttons with no text and no label |

Spacing is enforced as a ramp of readable px rather than `var()` everywhere: in a
heavily inline-styled renderer, `padding: "32px 40px 20px"` beats
`` padding: `${space[8]} ${space[10]} ${space[5]}` `` for no consistency gain. The ramp
is named by value — `--space-12` is 12px — because a step-numbered scale invites the
"is space-4 four pixels or sixteen?" question every time.

### Motion — Apple easings via GSAP

`src/renderer/src/design/motion.ts` registers Apple's curves as GSAP CustomEases rather
than approximating them with `power2`, because the difference *is* the part that reads as
Apple: `power2.out` decelerates evenly, while `cubic-bezier(0.32, 0.72, 0, 1)`
front-loads the movement and then takes its time arriving.

| Ease | Curve | Used for |
| --- | --- | --- |
| `out` | 0.32, 0.72, 0, 1 | the signature decelerate — entrances, sheets, row reveals |
| `inOut` | 0.65, 0, 0.35, 1 | reversible transitions (the Coach ↔ Editor track) |
| `smooth` | 0.36, 0.66, 0.04, 1 | SwiftUI `.smooth` — values settling (ring, counters) |
| `snappy` | 0.34, 1.24, 0.64, 1 | SwiftUI `.snappy` — confirmations only, never chrome |

Durations follow Apple's ranges: 0.15s micro, 0.3s chrome, 0.45s panels. `prefers-reduced-motion`
collapses every duration to 0 — the state change still happens, it just does not travel.

One deliberate pace change from the prototype: it staggered test rows at 320ms, which is a
demo pace (ten rows = three seconds). Apple's list staggers are 30–50ms, so rows use 40ms.

### Departures from the canvas, and why

- **Real traffic lights, not drawn ones.** The prototype painted three circles; those are
  Electron's own `hiddenInset` controls, with the bar made draggable. A fake close button
  that does not close is worse than no chrome.
- **Monaco, not the hand-tokenised mock.** The canvas's code pane was a static listing.
  The real editor is Monaco with a `javelin` theme built from the same palette (bold ink
  keywords, accent types, tinted literals) and `setModelMarkers` fed by javac diagnostics.
- **Coach drives the static hint ladder, not a chat.** The AI provider is Phase 5. The
  four authored hints per problem are the floor the AI is meant to fall back to, so the
  screen is real today; Phase 5 replaces the text source, not the screen. Levels 3 and 4
  unlock on failed *runs*, not clicks.
- **Invented numbers replaced with real ones.** The canvas showed a 12-day streak, ratings
  and "68%". Solve history is Phase 4, so Home and Progress show corpus counts and label
  what is not yet earnable.

### A bug only the built app could find

The runner resolved `runtime/java` from `import.meta.url`. That depth is correct in the
source tree (`src/main/services/`) but wrong once bundled to `out/main/index.js`, so the
built app looked one directory *above* the project and failed with a bare `ENOENT` on
copyfile. Every Phase 2 test passed throughout, because they run from source via tsx.
Fixed by injecting `runtimeDir` from `app.getAppPath()`, plus a startup path log and a
guard that now names the problem instead of surfacing a raw copy error.

### Two plan assumptions that measurement overturned

- **`-XDrawDiagnostics` is the wrong source for columns.** Its column is TAB-EXPANDED:
  for one tab-indented line javac reports column 27 where the character column is 13.
  Monaco counts characters, so every marker on tab-indented Java — most Java — would
  land 14 columns off. The human format's caret line preserves the indentation, so its
  caret index *is* the character column, and it carries real messages plus the
  `symbol:` / `location:` detail lines. The stable code the AI cache wants is recovered
  by normalising the message instead.
- **`-Xss` does apply to the primordial thread.** Measured on JDK 26 / macOS arm64:
  `-Xss256m` alone recurses 400k deep on `main`, and an explicitly-sized thread works
  with no `-Xss` at all. Neither is load-bearing alone. Both are kept because they cover
  different ground — `-Xss` also sizes threads the learner spawns — but the code comment
  now says what is true rather than repeating the folklore.

### Design changes Phase 1 forced

- **`comparison.custom` gained `expectedType`.** In-place mutation broke the original
  model: `removeDuplicates` returns an `int`, but the answer you want to write down is
  the `int[]` prefix. Without the override the only options were validating `expected`
  against the wrong type or not validating custom problems at all — and custom is
  10-15% of DSA problems, too many to leave unchecked.
- **Equality does not live in TypeScript.** After a JSON round-trip `int`, `long` and
  `double` are indistinguishable and `1.0 === 1`, so comparing there yields false
  passes. `Judge.java` owns it; the harness returns only `passed` plus rendered strings.

### Not yet exercised

`unordered`, `unorderedNested` and `anyOf` comparison modes are typed and validated but
no authored problem uses them, and their Java comparators land with the runner in
Phase 2. `bannedApis` is currently only checked against the reference solution; checking
a learner's imports needs the runner.

## Layout

Uses electron-vite's `src/main` / `src/preload` / `src/renderer` convention rather than
the plan's `electron/` + `src/`. Same separation, standard tooling.

- `shared/types/` — the typed bridge, imported by both sides. The renderer imports
  nothing from electron, so a future hosted build swaps the preload for `fetch`.
- `content/` — curriculum as typed TS modules (Phase 1)
- `runtime/java/` — `Judge.java`, `TreeNode.java`, harness templates (Phase 2)
- `scripts/` — authoring + validation, run in system Node

## Develop

```bash
npm run dev        # electron-vite dev, HMR renderer
npm run build      # typecheck + build all three bundles
npm start          # run the built app
npm run typecheck
npm test           # 123 tests, no Electron needed
npm run tutor      # one real tutor turn end to end, with arrival times
npm run review:one # one real code review, raw reply and parsed result
npm run validate:concepts   # compile and run every concept example
npm run package    # build a signed .dmg into release/
npm run icon       # regenerate build/icon.png from the design tokens
npm run bench:stream   # first-token vs complete latency, n runs
```
