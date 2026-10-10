import { useCallback, useEffect, useState } from "react";
import { ALL, getProblem } from "@content/index.js";
import { DEFAULT_SETTINGS, type Settings as SettingsType } from "@shared/types/settings.js";
import { Shell, type Screen } from "./components/Shell.js";
import { ProgressProvider, useProgress } from "./lib/progress.js";
import { Concepts } from "./routes/Concepts.js";
import { Home } from "./routes/Home.js";
import { Onboarding } from "./routes/Onboarding.js";
import { Practice } from "./routes/Practice.js";
import { Problems } from "./routes/Problems.js";
import { Progress } from "./routes/Progress.js";
import { Settings } from "./routes/Settings.js";

function Workspace(): React.JSX.Element {
  const { stats, lastProblemId } = useProgress();
  const [screen, setScreen] = useState<Screen>("home");
  const [problemId, setProblemId] = useState<string>(ALL[0]!.id);
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [replayOnboarding, setReplayOnboarding] = useState(false);

  useEffect(() => {
    void window.api.settings.get().then(setSettings);
  }, []);

  const patch = useCallback(async (p: Partial<SettingsType>) => {
    setSettings((s) => (s ? { ...s, ...p } : s));
    setSettings(await window.api.settings.set(p));
  }, []);

  function navigate(next: Screen, id?: string): void {
    if (id) setProblemId(id);
    setScreen(next);
  }

  // Nothing renders until the stored preferences are known — a flash of the
  // wrong navigation layout on every launch is worse than a blank first frame.
  if (!settings) return <div style={{ height: "100%", background: "var(--window)" }} />;

  if (!settings.onboarded || replayOnboarding) {
    return (
      <Onboarding
        onDone={(draft) => {
          void patch({ ...draft, onboarded: true });
          setReplayOnboarding(false);
          setScreen("home");
        }}
      />
    );
  }

  const problem = getProblem(problemId) ?? ALL[0]!;

  return (
    <Shell
      screen={screen}
      onNavigate={navigate}
      streak={stats?.streakDays ?? 0}
      nav={settings.nav}
      activeProblemId={screen === "practice" ? problem.id : null}
    >
      {screen === "home" && <Home onNavigate={navigate} lastProblemId={lastProblemId} />}
      {screen === "concepts" && <Concepts onNavigate={navigate} />}
      {screen === "problems" && <Problems onNavigate={navigate} />}
      {screen === "practice" && <Practice key={problem.id} problem={problem} />}
      {screen === "progress" && <Progress />}
      {screen === "settings" && (
        <Settings
          settings={settings}
          onChange={(p) => void patch(p)}
          onReplayOnboarding={() => setReplayOnboarding(true)}
        />
      )}
    </Shell>
  );
}

export function App(): React.JSX.Element {
  return (
    <ProgressProvider>
      <Workspace />
    </ProgressProvider>
  );
}
