"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { fetchModels } from "@/lib/api";
import type { ModelConfig } from "@/lib/api";

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
  onFindMatch: (provider: string, modelName: string, apiKey: string) => void;
}

export default function SetupScreen({ onFindMatch }: Props) {
  const [provider, setProvider] = useState("openai");
  const [modelName, setModelName] = useState("gpt-4o");
  const [apiKey, setApiKey] = useState("");
  const [models, setModels] = useState<string[]>(FALLBACK_MODELS["openai"] || []);
  const [loadingModels, setLoadingModels] = useState(false);
  const [fetchedProviders, setFetchedProviders] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadModels = useCallback(async (prov: string, key: string) => {
    if (!key || key.length < 3) {
      setModels(FALLBACK_MODELS[prov] || []);
      return;
    }
    const cacheKey = `${prov}:${key.slice(-8)}`;
    if (fetchedProviders.has(cacheKey)) return;

    setLoadingModels(true);
    try {
      const fetched = await fetchModels(prov as ModelConfig["provider"], key);
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
      loadModels(provider, apiKey);
    }, 600);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [provider, apiKey, loadModels]);

  const handleProviderChange = (p: string) => {
    setProvider(p);
    setModelName(FALLBACK_MODELS[p]?.[0] || "");
    setModels(FALLBACK_MODELS[p] || []);
  };

  const handleFindMatch = () => {
    if (!apiKey.trim()) {
      setError("Введите API-ключ");
      return;
    }
    if (!modelName) {
      setError("Выберите модель");
      return;
    }
    setError("");
    onFindMatch(provider, modelName, apiKey.trim());
  };

  const isValid = apiKey.trim().length > 0;

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-cyan-400 to-purple-500 flex items-center justify-center text-zinc-950 text-2xl font-bold">
            A
          </div>
          <h2 className="text-xl font-bold tracking-tight">AI Арена</h2>
          <p className="text-sm text-zinc-400">Мультиплеерная битва промптов</p>
          <p className="text-xs text-zinc-600 mt-2 max-w-xs mx-auto">
            Настройте своего ИИ-агента и найдите соперника. Вы каждый напишете
            системный промпт для своего ИИ, затем наблюдайте за битвой в реальном времени.
          </p>
        </div>

        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-500">Провайдер</label>
            <select
              value={provider}
              onChange={(e) => handleProviderChange(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all"
            >
              {Object.entries(PROVIDER_LABELS).map(([val, lbl]) => (
                <option key={val} value={val}>{lbl}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-zinc-500">Модель</label>
            <div className="relative">
              <select
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all appearance-none"
              >
                {models.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              {loadingModels && (
                <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                  <span className="w-3 h-3 border border-zinc-500 border-t-cyan-400 rounded-full animate-spin inline-block" />
                </div>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-zinc-500">API-ключ</label>
            <input
              type="password"
              placeholder="sk-..."
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setFetchedProviders(new Set());
              }}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all placeholder-zinc-500"
            />
            {!apiKey && (
              <p className="text-[10px] text-zinc-600">Введите API-ключ для загрузки списка моделей</p>
            )}
          </div>
        </div>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-3 text-center">
            <p className="text-sm text-rose-400">{error}</p>
          </div>
        )}

        <button
          onClick={handleFindMatch}
          disabled={!isValid}
          className="w-full py-3.5 rounded-xl font-semibold text-sm bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-400 hover:to-purple-400 text-zinc-950 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-cyan-500/20"
        >
          Найти игру
        </button>
      </div>
    </div>
  );
}
