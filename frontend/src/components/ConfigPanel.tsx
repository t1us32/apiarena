"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { fetchModels, fetchScenarios } from "@/lib/api";
import type { BattleConfig, ModelConfig, AgentConfig, ScenarioDef } from "@/lib/api";

const FALLBACK_MODELS: Record<string, string[]> = {
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo", "o3-mini", "o1", "o1-mini"],
  anthropic: ["claude-sonnet-4-20250514", "claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022", "claude-3-opus-20240229"],
  openrouter: ["openai/gpt-4o", "anthropic/claude-sonnet-4", "anthropic/claude-3.5-sonnet", "google/gemini-2.5-pro", "meta-llama/llama-4-maverick", "deepseek/deepseek-chat-v3"],
  deepseek: ["deepseek-chat", "deepseek-reasoner"],
  grok: ["grok-3", "grok-3-mini", "grok-2-latest"],
};

const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  openrouter: "OpenRouter",
  deepseek: "DeepSeek",
  grok: "Grok (xAI)",
};

interface Props {
  config: BattleConfig;
  onStart: (config: BattleConfig) => void;
}

function ModelConfigFields({
  label,
  config,
  onChange,
}: {
  label: string;
  config: ModelConfig;
  onChange: (cfg: ModelConfig) => void;
}) {
  const [models, setModels] = useState<string[]>(FALLBACK_MODELS[config.provider] || []);
  const [loadingModels, setLoadingModels] = useState(false);
  const [fetchedProviders, setFetchedProviders] = useState<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadModels = useCallback(async (provider: string, apiKey: string) => {
    if (!apiKey || apiKey.length < 3) {
      setModels(FALLBACK_MODELS[provider] || []);
      return;
    }
    const cacheKey = `${provider}:${apiKey.slice(-8)}`;
    if (fetchedProviders.has(cacheKey)) return;

    setLoadingModels(true);
    try {
      const fetched = await fetchModels(provider as ModelConfig["provider"], apiKey);
      if (fetched.length > 0) {
        setModels(fetched);
        setFetchedProviders((prev) => new Set(prev).add(cacheKey));
      }
    } catch {
      // fallback
    } finally {
      setLoadingModels(false);
    }
  }, [fetchedProviders]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      loadModels(config.provider, config.api_key);
    }, 600);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [config.provider, config.api_key, loadModels]);

  const handleProviderChange = (provider: string) => {
    const p = provider as ModelConfig["provider"];
    const fallback = FALLBACK_MODELS[p]?.[0] || "";
    const newConfig = { ...config, provider: p, model_name: fallback };
    setModels(FALLBACK_MODELS[p] || []);
    onChange(newConfig);
  };

  const handleKeyChange = (key: string) => {
    const newConfig = { ...config, api_key: key };
    setFetchedProviders(new Set());
    onChange(newConfig);
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <select
          value={config.provider}
          onChange={(e) => handleProviderChange(e.target.value)}
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all"
        >
          {Object.entries(PROVIDER_LABELS).map(([val, lbl]) => (
            <option key={val} value={val}>{lbl}</option>
          ))}
        </select>
        <div className="flex-1 relative">
          <select
            value={config.model_name}
            onChange={(e) => onChange({ ...config, model_name: e.target.value })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all appearance-none"
          >
            {models.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          {loadingModels && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              <span className="w-3 h-3 border border-zinc-500 border-t-cyan-400 rounded-full animate-spin inline-block" />
            </div>
          )}
        </div>
      </div>
      <input
        type="password"
        placeholder={`${label} API-ключ`}
        value={config.api_key}
        onChange={(e) => handleKeyChange(e.target.value)}
        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all placeholder-zinc-500"
      />
      {!config.api_key && (
        <p className="text-[10px] text-zinc-600">Введите API-ключ для загрузки списка моделей</p>
      )}
    </div>
  );
}

function AgentConfigSection({
  title,
  icon,
  color,
  config,
  onChange,
  promptHint,
}: {
  title: string;
  icon: string;
  color: string;
  config: AgentConfig;
  onChange: (cfg: AgentConfig) => void;
  promptHint?: string;
}) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        <h3 className={`font-semibold text-sm ${color}`}>{title}</h3>
      </div>

      <ModelConfigFields
        label={title}
        config={config.model_config}
        onChange={(mc) => onChange({ ...config, model_config: mc })}
      />

      {promptHint && (
        <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-3">
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            <span className="text-cyan-400 font-medium">Подсказка: </span>
            {promptHint}
          </p>
          <p className="text-[10px] text-zinc-600 mt-1">
            Базовые правила уже встроены. Сосредоточьтесь на характере и тактике агента.
          </p>
        </div>
      )}

      <div>
        <label className="block text-xs text-zinc-500 mb-1.5">
          Системный промпт
        </label>
        <textarea
          value={config.system_prompt}
          onChange={(e) => onChange({ ...config, system_prompt: e.target.value })}
          rows={4}
          placeholder="Опишите характер и тактику вашего ИИ-агента..."
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all placeholder-zinc-600 resize-none leading-relaxed"
        />
      </div>
    </div>
  );
}

export default function ConfigPanel({ config: initialConfig, onStart }: Props) {
  const [config, setConfig] = useState<BattleConfig>(initialConfig);
  const [scenarios, setScenarios] = useState<ScenarioDef[]>([]);
  const [selectedScenario, setSelectedScenario] = useState<ScenarioDef | null>(null);
  const [sharedKey, setSharedKey] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    fetchScenarios()
      .then((list) => {
        setScenarios(list);
        const current = list.find((s) => s.id === initialConfig.scenario_id) || list[0];
        setSelectedScenario(current);
      })
      .catch(() => {});
  }, [initialConfig.scenario_id]);

  const handleScenarioChange = (scenarioId: string) => {
    const scenario = scenarios.find((s) => s.id === scenarioId);
    if (!scenario) return;
    setSelectedScenario(scenario);
    setConfig((prev) => ({
      ...prev,
      scenario_id: scenario.id,
      max_turns: scenario.max_turns,
    }));
  };

  const handleStart = async () => {
    setStarting(true);
    try {
      onStart(config);
    } finally {
      setStarting(false);
    }
  };

  const updateAgent1 = (c: AgentConfig) => {
    const updated = { ...config, agent_1: c };
    if (sharedKey) {
      updated.agent_2 = {
        ...updated.agent_2,
        model_config: { ...updated.agent_2.model_config, api_key: c.model_config.api_key },
      };
    }
    setConfig(updated);
  };

  const updateAgent2 = (c: AgentConfig) => {
    const updated = { ...config, agent_2: c };
    if (sharedKey) {
      updated.agent_1 = {
        ...updated.agent_1,
        model_config: { ...updated.agent_1.model_config, api_key: c.model_config.api_key },
      };
    }
    setConfig(updated);
  };

  const toggleSharedKey = () => {
    const newShared = !sharedKey;
    setSharedKey(newShared);
    if (newShared) {
      const key = config.agent_2.model_config.api_key || config.agent_1.model_config.api_key;
      setConfig({
        ...config,
        agent_1: {
          ...config.agent_1,
          model_config: { ...config.agent_1.model_config, api_key: key },
        },
        agent_2: {
          ...config.agent_2,
          model_config: { ...config.agent_2.model_config, api_key: key },
        },
      });
    }
  };

  const agent1Label = selectedScenario?.agent_1_label || "Агент 1";
  const agent2Label = selectedScenario?.agent_2_label || "Агент 2";

  return (
    <div className="flex-1 flex items-start justify-center p-6 overflow-y-auto">
      <div className="w-full max-w-3xl space-y-6 py-8">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold tracking-tight">Настройка битвы</h2>
          <p className="text-zinc-500 text-sm">Выберите сценарий, настройте модели и ключи, затем начните битву</p>
        </div>

        {/* Выбор сценария */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">🎮</span>
            <h3 className="font-semibold text-sm text-cyan-400">Сценарий игры</h3>
          </div>

          {scenarios.length === 0 ? (
            <div className="text-sm text-zinc-500 animate-pulse">Загрузка сценариев...</div>
          ) : (
            <>
              <select
                value={config.scenario_id}
                onChange={(e) => handleScenarioChange(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all"
              >
                {scenarios.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              {selectedScenario && (
                <div className="space-y-2">
                  <p className="text-xs text-zinc-400 leading-relaxed">{selectedScenario.description}</p>
                  <div className="flex gap-4 text-xs text-zinc-500">
                    <span>🛡️ {selectedScenario.agent_1_label}</span>
                    <span>против</span>
                    <span>🔍 {selectedScenario.agent_2_label}</span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Общий ключ */}
        <div className="flex items-center gap-3 bg-zinc-900/30 border border-zinc-800/50 rounded-lg px-4 py-3">
          <button
            onClick={toggleSharedKey}
            className={`relative w-10 h-5 rounded-full transition-colors ${
              sharedKey ? "bg-cyan-500" : "bg-zinc-700"
            }`}
          >
            <span
              className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                sharedKey ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
          <span className="text-sm text-zinc-400">Один API-ключ для всех агентов</span>
        </div>

        {/* Агенты */}
        <AgentConfigSection
          title={`${agent1Label} (Защитник)`}
          icon="🛡️"
          color="text-emerald-400"
          config={config.agent_1}
          onChange={updateAgent1}
          promptHint={selectedScenario?.agent_1_prompt_hint}
        />

        <AgentConfigSection
          title={`${agent2Label} (Атакующий)`}
          icon="🔍"
          color="text-rose-400"
          config={config.agent_2}
          onChange={updateAgent2}
          promptHint={selectedScenario?.agent_2_prompt_hint}
        />

        {/* Расширенные настройки */}
        <button
          onClick={() => setAdvanced(!advanced)}
          className="flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors w-full"
        >
          <span className={`transform transition-transform ${advanced ? "rotate-90" : ""}`}>▶</span>
          Расширенные настройки
        </button>

        {advanced && (
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 space-y-4 animate-slide-up">
            <AgentConfigSection
              title="Судья"
              icon="⚖️"
              color="text-amber-400"
              config={config.judge}
              onChange={(c) => setConfig({ ...config, judge: c })}
              promptHint={selectedScenario?.judge_prompt_hint}
            />

            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-xs text-zinc-500 mb-1.5">Макс. ходов</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={config.max_turns}
                  onChange={(e) => setConfig({ ...config, max_turns: parseInt(e.target.value) || 5 })}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-zinc-500 mb-1.5">Температура</label>
                <input
                  type="number"
                  min={0}
                  max={2}
                  step={0.1}
                  value={config.temperature}
                  onChange={(e) => setConfig({ ...config, temperature: parseFloat(e.target.value) || 0.7 })}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all"
                />
              </div>
            </div>
          </div>
        )}

        {/* Кнопка старта */}
        <button
          onClick={handleStart}
          disabled={starting || (!config.agent_1.model_config.api_key && !config.agent_2.model_config.api_key)}
          className="w-full py-3.5 rounded-xl font-semibold text-sm bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-400 hover:to-purple-400 text-zinc-950 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-cyan-500/20"
        >
          {starting ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-zinc-950/30 border-t-zinc-950 rounded-full animate-spin" />
              Запуск...
            </span>
          ) : (
            "⚔️  Начать битву"
          )}
        </button>
      </div>
    </div>
  );
}
