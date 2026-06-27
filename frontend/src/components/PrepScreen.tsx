"use client";

import { useState, useEffect, useRef, useCallback, type KeyboardEvent, type ClipboardEvent } from "react";
import type { ScenarioDef } from "@/lib/api";

const MAX_WORDS = 200;
const PREP_SECONDS = 30;

interface Props {
  scenario: ScenarioDef;
  yourRole: "agent_1" | "agent_2";
  promptHint: string;
  onSubmit: (prompt: string) => void;
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export default function PrepScreen({ scenario, yourRole, promptHint, onSubmit }: Props) {
  const [prompt, setPrompt] = useState("");
  const [timeLeft, setTimeLeft] = useState(PREP_SECONDS);
  const [submitted, setSubmitted] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const submittedRef = useRef(false);

  const wordCount = countWords(prompt);
  const atLimit = wordCount >= MAX_WORDS;

  const roleLabel = yourRole === "agent_1" ? scenario.agent_1_label : scenario.agent_2_label;
  const roleDescription = yourRole === "agent_1"
    ? "Вы — ЗАЩИТНИК. Напишите инструкции, чтобы помочь вашему ИИ защитить секрет."
    : "Вы — АТАКУЮЩИЙ. Напишите инструкции, чтобы помочь вашему ИИ добыть секрет.";

  const doSubmit = useCallback((text: string) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitted(true);
    // Отправляем текст как есть; бэкенд сам добавит нейтральный фолбэк при пустом вводе
    onSubmit(text.trim());
  }, [onSubmit]);

  // Таймер обратного отсчёта
  useEffect(() => {
    if (submitted) return;
    if (timeLeft <= 0) {
      doSubmit(prompt);
      return;
    }
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [timeLeft, submitted, prompt, doSubmit]);

  useEffect(() => {
    if (timeLeft <= 0 && !submitted) {
      doSubmit(prompt);
    }
  }, [timeLeft, submitted, prompt, doSubmit]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "v") {
      e.preventDefault();
      return;
    }
    if (e.key === "Paste" || (e.ctrlKey && e.key === "V")) {
      e.preventDefault();
      return;
    }
    if (atLimit && !["Backspace", "Delete", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "Tab", "Shift", "Control", "Alt", "Meta"].includes(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  return (
    <div className="flex-1 flex items-start justify-center p-6 overflow-y-auto">
      <div className="w-full max-w-2xl space-y-5 py-6">
        {/* Таймер */}
        <div className="text-center space-y-2">
          <div className={`text-5xl font-bold font-mono transition-colors ${
            timeLeft <= 5 ? "text-rose-400 animate-pulse" : timeLeft <= 10 ? "text-amber-400" : "text-zinc-200"
          }`}>
            0:{String(timeLeft).padStart(2, "0")}
          </div>
          <p className="text-sm text-zinc-500">Напишите системный промпт, пока не истекло время</p>
        </div>

        {/* Информация о сценарии */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-cyan-400 uppercase tracking-wider">{scenario.name}</span>
          </div>
          <p className="text-sm text-zinc-400">{scenario.description}</p>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-zinc-500">Ваша роль:</span>
            <span className={`font-semibold ${yourRole === "agent_1" ? "text-emerald-400" : "text-rose-400"}`}>
              {roleLabel}
            </span>
            <span className="text-zinc-600">—</span>
            <span className="text-zinc-500">{roleDescription}</span>
          </div>
          {/* Подсказка вместо полного промпта */}
          <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-3 mt-3">
            <p className="text-[11px] text-zinc-500 leading-relaxed">
              <span className="text-cyan-400 font-medium">Подсказка: </span>
              {promptHint}
            </p>
            <p className="text-[10px] text-zinc-600 mt-1">
              Базовые правила сценария уже встроены в систему и не требуют описания.
              Сосредоточьтесь на характере и тактике вашего агента.
            </p>
          </div>
        </div>

        {/* Поле ввода */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs text-zinc-500 font-medium">
              Ваш системный промпт
              <span className="text-zinc-600 ml-1">(вставка заблокирована)</span>
            </label>
            <span className={`text-xs font-mono ${atLimit ? "text-rose-400" : "text-zinc-500"}`}>
              {wordCount} / {MAX_WORDS} слов
            </span>
          </div>
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => {
              const words = countWords(e.target.value);
              if (words <= MAX_WORDS) {
                setPrompt(e.target.value);
              }
            }}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onContextMenu={handleContextMenu}
            disabled={submitted}
            rows={10}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-xl p-4 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all placeholder-zinc-600 resize-none leading-relaxed disabled:opacity-60 disabled:cursor-not-allowed"
            placeholder="Опишите характер и тактику вашего ИИ-агента..."
            autoFocus
          />
          <div className="flex justify-between items-center">
            <p className="text-[10px] text-zinc-600">
              Только ручной ввод — вставка из буфера обмена заблокирована.
            </p>
            {!submitted && timeLeft > 0 && (
              <button
                onClick={() => doSubmit(prompt)}
                className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors font-medium"
              >
                Отправить досрочно →
              </button>
            )}
          </div>
        </div>

        {submitted && (
          <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-xl p-4 text-center">
            <p className="text-sm text-cyan-400 font-medium">Промпт отправлен!</p>
            <p className="text-xs text-zinc-500 mt-1">Ожидание завершения подготовки соперника...</p>
          </div>
        )}
      </div>
    </div>
  );
}
