"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { fetchModels } from "@/lib/api";
import { useT, type Locale } from "@/lib/i18n";
import type { ModelConfig } from "@/lib/api";

const FALLBACK_MODELS: Record<string, string[]> = {
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo", "o3-mini", "o1", "o1-mini"],
  anthropic: ["claude-sonnet-4-20250514", "claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022", "claude-3-opus-20240229"],
  openrouter: ["openai/gpt-4o", "anthropic/claude-sonnet-4", "anthropic/claude-3.5-sonnet", "google/gemini-2.5-pro", "meta-llama/llama-4-maverick", "deepseek/deepseek-chat-v3"],
  deepseek: ["deepseek-chat", "deepseek-reasoner"],
  grok: ["grok-3", "grok-3-mini", "grok-2-latest"],
};

const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI", anthropic: "Anthropic", openrouter: "OpenRouter", deepseek: "DeepSeek", grok: "Grok (xAI)",
};

interface Props {
  onFindMatch: (provider: string, modelName: string, apiKey: string, compactMode: boolean) => void;
  compactMode: boolean;
  onCompactChange: (v: boolean) => void;
  locale: Locale;
  onLocaleChange: (l: Locale) => void;
}

function ensureValidModel(models: string[], current: string): string {
  if (!current || !models.includes(current)) return models[0] || "";
  return current;
}

export default function SetupScreen({ onFindMatch, compactMode, onCompactChange, locale, onLocaleChange }: Props) {
  const [provider, setProvider] = useState("openai");
  const [apiKey, setApiKey] = useState("");
  const [models, setModels] = useState<string[]>(FALLBACK_MODELS["openai"] || []);
  const [modelName, setModelName] = useState(() => ensureValidModel(FALLBACK_MODELS["openai"] || [], "gpt-4o"));
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelsFromApi, setModelsFromApi] = useState(false);
  const [error, setError] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cacheRef = useRef<Map<string, string[]>>(new Map());
  const { t } = useT();

  const loadModels = useCallback(async (prov: string, key: string) => {
    setModelsFromApi(false);
    if (!key || key.length < 3) {
      const fb = FALLBACK_MODELS[prov] || [];
      setModels(fb);
      setModelName((prev) => ensureValidModel(fb, prev));
      return;
    }
    const cacheKey = `${prov}:${key.slice(-8)}`;
    const cached = cacheRef.current.get(cacheKey);
    if (cached) { setModels(cached); setModelName((prev) => ensureValidModel(cached, prev)); setModelsFromApi(true); return; }
    setLoadingModels(true);
    try {
      const fetched = await fetchModels(prov as ModelConfig["provider"], key);
      if (fetched.length > 0) { cacheRef.current.set(cacheKey, fetched); setModels(fetched); setModelName((prev) => ensureValidModel(fetched, prev)); setModelsFromApi(true); }
    } catch {
      const fb = FALLBACK_MODELS[prov] || [];
      setModels(fb);
      setModelName((prev) => ensureValidModel(fb, prev));
    } finally { setLoadingModels(false); }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadModels(provider, apiKey), 600);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [provider, apiKey, loadModels]);

  const handleProviderChange = (p: string) => { setProvider(p); setModelsFromApi(false); const fb = FALLBACK_MODELS[p] || []; setModels(fb); setModelName((prev) => ensureValidModel(fb, prev)); };
  const handleApiKeyChange = (value: string) => { setApiKey(value); if (value !== apiKey) { cacheRef.current.clear(); setModelsFromApi(false); } };
  const handleFindMatch = () => {
    if (!apiKey.trim()) { setError(t("setup.errorApiKey")); return; }
    if (!modelName || !models.includes(modelName)) { setError(t("setup.errorModel")); return; }
    setError("");
    onFindMatch(provider, modelName, apiKey.trim(), compactMode);
  };
  const isValid = apiKey.trim().length > 0;

  return (
    <div className="flex-1 flex items-center justify-center p-3 sm:p-8">
      <div className="w-full max-w-[440px] space-y-4 sm:space-y-6">

        <div className="text-center space-y-3 sm:space-y-4 animate-slide-up">
          <div className="w-12 h-12 sm:w-16 sm:h-16 mx-auto rounded-xl bg-primary flex items-center justify-center text-primary-on text-xl sm:text-2xl font-bold">A</div>
          <h2 className="text-xl sm:text-2xl font-medium text-ink tracking-tight">{t("setup.heading")}</h2>
          <p className="text-xs sm:text-sm text-ash max-w-sm mx-auto">{t("setup.description")}</p>
        </div>

        <div className="card space-y-3 sm:space-y-4 animate-slide-up animate-delay-100 !p-4 sm:!p-6">
          <div className="space-y-1 sm:space-y-1.5">
            <label className="text-[10px] sm:text-xs text-mute font-medium">{t("setup.provider")}</label>
            <select value={provider} onChange={(e) => handleProviderChange(e.target.value)} className="input w-full appearance-none text-xs sm:text-sm">
              {Object.entries(PROVIDER_LABELS).map(([val, lbl]) => (<option key={val} value={val} className="bg-surface-card">{lbl}</option>))}
            </select>
          </div>

          <div className="space-y-1 sm:space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] sm:text-xs text-mute font-medium">{t("setup.model")}</label>
              {modelsFromApi && <span className="text-[9px] sm:text-[10px] text-accent-blue font-medium">API</span>}
            </div>
            <div className="relative">
              <select value={modelName} onChange={(e) => setModelName(e.target.value)} className="input w-full appearance-none text-xs sm:text-sm">
                {!loadingModels && models.length === 0 && <option value="">Loading...</option>}
                {models.map((m) => (<option key={m} value={m} className="bg-surface-card">{m}</option>))}
              </select>
              {loadingModels && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <span className="w-3 h-3 border border-hairline border-t-ink rounded-full animate-spin inline-block" />
                </div>
              )}
            </div>
          </div>

          <div className="space-y-1 sm:space-y-1.5">
            <label className="text-[10px] sm:text-xs text-mute font-medium">{t("setup.apiKey")}</label>
            <input type="password" placeholder={t("setup.apiPlaceholder")} value={apiKey} onChange={(e) => handleApiKeyChange(e.target.value)} className="input w-full text-xs sm:text-sm" />
            {!apiKey && <p className="text-[9px] sm:text-[10px] text-stone">{t("setup.apiHint")}</p>}
            {loadingModels && apiKey.length >= 3 && <p className="text-[9px] sm:text-[10px] text-accent-blue">{t("setup.loadingModels")}</p>}
          </div>
        </div>

        {error && (
          <div className="card-subtle !p-3 sm:!p-4 text-center animate-slide-up">
            <p className="text-xs sm:text-sm text-accent-red font-medium">{error}</p>
          </div>
        )}

        <label className="flex items-center gap-2 sm:gap-3 cursor-pointer select-none card-subtle !px-3 sm:!px-4 !py-2.5 sm:!py-3 animate-slide-up animate-delay-200">
          <input type="checkbox" checked={compactMode} onChange={(e) => onCompactChange(e.target.checked)} className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded border-hairline-strong bg-surface-card accent-primary cursor-pointer" />
          <div>
            <span className="text-xs sm:text-sm text-body font-medium">{t("setup.compactLabel")}</span>
            <p className="text-[9px] sm:text-[10px] text-stone">{t("setup.compactHint")}</p>
          </div>
        </label>

        <button onClick={handleFindMatch} disabled={!isValid} className="btn-primary w-full !h-10 sm:!h-12 text-sm sm:text-base animate-slide-up animate-delay-300">
          {t("setup.findMatch")}
        </button>

        <div className="flex justify-center animate-slide-up animate-delay-400">
          <button
            onClick={() => onLocaleChange(locale === "en" ? "ru" : "en")}
            className="text-xs text-stone hover:text-ink transition-colors font-medium uppercase"
          >
            {locale === "en" ? "Русский" : "English"}
          </button>
        </div>

      </div>
    </div>
  );
}
