const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface ModelConfig {
  provider: "openai" | "anthropic" | "openrouter" | "deepseek" | "grok";
  model_name: string;
  api_key: string;
  api_base?: string;
}

export interface AgentConfig {
  system_prompt: string;
  model_config: ModelConfig;
}

export interface ScenarioDef {
  id: string;
  name: string;
  description: string;
  max_turns: number;
  agent_1_label: string;
  agent_2_label: string;
  agent_1_roles: string[];
  agent_2_roles: string[];
  agent_1_prompt_hint: string;
  agent_2_prompt_hint: string;
  judge_prompt_hint: string;
}

export interface BattleConfig {
  scenario_id: string;
  agent_1: AgentConfig;
  agent_2: AgentConfig;
  judge: AgentConfig;
  max_turns: number;
  temperature: number;
}

export interface Turn {
  turn_number: number;
  agent_1_message: string;
  agent_2_message: string;
  timestamp: string;
}

export interface JudgeReport {
  verdict: "agent_1_win" | "agent_2_win" | "draw";
  justification: string;
  secret_leaked: boolean;
  leaked_content?: string;
  score_agent_1: number;
  score_agent_2: number;
}

export interface BattleState {
  battle_id: string;
  status: "configuring" | "running" | "judging" | "complete" | "error";
  scenario_id: string;
  turns: Turn[];
  judge_report?: JudgeReport;
  error_message?: string;
  max_turns: number;
  current_turn: number;
}

export async function fetchScenarios(): Promise<ScenarioDef[]> {
  const res = await fetch(`${API_BASE}/api/battle/scenarios`);
  if (!res.ok) throw new Error("Не удалось загрузить сценарии");
  const data = await res.json();
  return data.scenarios || [];
}

export async function fetchModels(
  provider: ModelConfig["provider"],
  apiKey: string,
  apiBase?: string
): Promise<string[]> {
  const res = await fetch(`${API_BASE}/api/battle/models`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, api_key: apiKey, api_base: apiBase || undefined }),
  });
  if (!res.ok) throw new Error("Не удалось загрузить модели");
  const data = await res.json();
  return data.models || [];
}

export async function startBattle(config: BattleConfig): Promise<{ battle_id: string }> {
  const res = await fetch(`${API_BASE}/api/battle/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Не удалось начать битву");
  }
  return res.json();
}

export async function getBattleStatus(battleId: string): Promise<BattleState> {
  const res = await fetch(`${API_BASE}/api/battle/${battleId}/status`);
  if (!res.ok) throw new Error("Битва не найдена");
  return res.json();
}

export function streamBattle(
  battleId: string,
  onEvent: (event: string, data: Record<string, unknown>) => void,
  onError?: (err: Error) => void
): EventSource {
  const url = `${API_BASE}/api/battle/${battleId}/stream`;
  const es = new EventSource(url);

  const knownEvents = new Set([
    "battle_start", "status", "generating", "message",
    "turn_complete", "judge_report", "secret_revealed",
    "error", "close", "ping"
  ]);

  knownEvents.forEach((evt) => {
    es.addEventListener(evt, (e: MessageEvent) => {
      try {
        const parsed = JSON.parse(e.data);
        onEvent(evt, parsed);
      } catch {
        // ignore parse errors
      }
    });
  });

  es.onmessage = null;
  es.onerror = () => {
    if (onError) onError(new Error("Ошибка соединения SSE"));
    es.close();
  };

  return es;
}
