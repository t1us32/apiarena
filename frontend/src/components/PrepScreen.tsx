"use client";

import { useState, useEffect, useRef, useCallback, type KeyboardEvent, type ClipboardEvent } from "react";
import type { ScenarioDef } from "@/lib/api";
import { useT } from "@/lib/i18n";

const MAX_WORDS = 200;
const PREP_SECONDS = 80;

interface Props {
  scenario: ScenarioDef;
  yourRole: "agent_1" | "agent_2";
  onSubmit: (prompt: string) => void;
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function formatTime(totalSeconds: number): string {
  if (totalSeconds < 60) return String(totalSeconds);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function PrepScreen({ scenario, yourRole, onSubmit }: Props) {
  const [prompt, setPrompt] = useState("");
  const [timeLeft, setTimeLeft] = useState(PREP_SECONDS);
  const [submitted, setSubmitted] = useState(false);
  const [pasteWarn, setPasteWarn] = useState(false);
  const [shortWarn, setShortWarn] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const submittedRef = useRef(false);
  const pasteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { t } = useT();

  const wordCount = countWords(prompt);
  const atLimit = wordCount >= MAX_WORDS;

  const roleLabel = yourRole === "agent_1" ? scenario.agent_1_label : scenario.agent_2_label;
  const isDefender = yourRole === "agent_1";

  const doSubmit = useCallback((text: string) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitted(true);
    onSubmit(text.trim());
  }, [onSubmit]);

  useEffect(() => {
    if (submitted) return;
    if (timeLeft <= 0) { doSubmit(prompt); return; }
    const interval = setInterval(() => {
      setTimeLeft((prev) => { if (prev <= 1) { clearInterval(interval); return 0; } return prev - 1; });
    }, 1000);
    return () => clearInterval(interval);
  }, [timeLeft, submitted, prompt, doSubmit]);

  useEffect(() => {
    if (timeLeft <= 0 && !submitted) { doSubmit(prompt); }
  }, [timeLeft, submitted, prompt, doSubmit]);

  const handleSubmit = () => {
    if (prompt.length < 10) {
      setShortWarn(true);
      if (pasteTimerRef.current) clearTimeout(pasteTimerRef.current);
      pasteTimerRef.current = setTimeout(() => setShortWarn(false), 2000);
      return;
    }
    doSubmit(prompt);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "v") { e.preventDefault(); setPasteWarn(true); if (pasteTimerRef.current) clearTimeout(pasteTimerRef.current); pasteTimerRef.current = setTimeout(() => setPasteWarn(false), 2000); return; }
    if (e.key === "Paste" || (e.ctrlKey && e.key === "V")) { e.preventDefault(); setPasteWarn(true); if (pasteTimerRef.current) clearTimeout(pasteTimerRef.current); pasteTimerRef.current = setTimeout(() => setPasteWarn(false), 2000); return; }
    if (atLimit && !["Backspace", "Delete", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "Tab", "Shift", "Control", "Alt", "Meta"].includes(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); }
  };

  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => { e.preventDefault(); setPasteWarn(true); if (pasteTimerRef.current) clearTimeout(pasteTimerRef.current); pasteTimerRef.current = setTimeout(() => setPasteWarn(false), 2000); };
  const handleContextMenu = (e: React.MouseEvent) => { e.preventDefault(); };

  const timerUrgent =
    timeLeft <= 5 ? "text-accent-red" :
    timeLeft <= 15 ? "text-accent-yellow" :
    "text-ink";

  const timerSize = "text-5xl xs:text-6xl sm:text-7xl";

  return (
    <div className="flex-1 flex items-start justify-center p-3 sm:p-8 overflow-y-auto">
      <div className="w-full max-w-[640px] space-y-4 sm:space-y-6 py-4 sm:py-8">

        <div className="text-center space-y-1.5 sm:space-y-2 animate-slide-up">
          <div className={`${timerSize} font-mono tabular-nums tracking-tight transition-colors leading-none ${timerUrgent}`}>
            {formatTime(timeLeft).split("").map((char, i, arr) => (
              <span
                key={i}
                className={i === arr.length - 1 ? "inline-block animate-tick" : ""}
              >
                {char}
              </span>
            ))}
          </div>
          <p className="text-xs sm:text-sm text-ash">{t("prep.timerHint")}</p>
        </div>

        <div className="flex justify-center animate-slide-up animate-delay-100">
          <span className={`badge ${isDefender ? "" : "!bg-accent-red/10 text-accent-red"}`}>
            <span className={`status-dot ${isDefender ? "bg-accent-green" : "bg-accent-red"}`} />
            {roleLabel}
          </span>
        </div>

        <div className="card-subtle space-y-2 sm:space-y-3 animate-slide-up animate-delay-200 !p-4 sm:!p-6">
          <span className="text-[10px] sm:text-xs font-medium text-mute uppercase tracking-[0.15em]">{t("prep.scenario")}</span>
          <p className="text-xs sm:text-sm text-body leading-relaxed">{t(`scenarios.${scenario.id}.description`)}</p>
        </div>

        <div className="space-y-3 sm:space-y-4 animate-slide-up animate-delay-300">
          <div className="flex items-center justify-between">
            <label className="text-[10px] sm:text-xs text-mute font-medium select-none">{t("prep.promptLabel")}</label>
            <span className={`text-[10px] sm:text-xs font-mono tabular-nums ${atLimit ? "text-accent-red" : "text-charcoal"}`}>
              {wordCount} / {MAX_WORDS} {t("prep.wordsUnit")}
            </span>
          </div>

          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => { const words = countWords(e.target.value); if (words <= MAX_WORDS) setPrompt(e.target.value); }}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onContextMenu={handleContextMenu}
            disabled={submitted}
            rows={7}
            className="code-surface w-full rounded-lg p-3 sm:p-4 text-sm text-body leading-relaxed font-sans placeholder:text-stone focus:outline-none focus:border-hairline-strong border border-hairline transition-colors resize-none scrollbar-resend disabled:opacity-50 disabled:cursor-not-allowed"
            placeholder={t("prep.placeholder")}
            autoFocus
          />

          {pasteWarn && (
            <p className="text-[10px] sm:text-xs text-accent-red animate-slide-up font-medium">{t("prep.pasteWarning")}</p>
          )}
          {shortWarn && !pasteWarn && (
            <p className="text-[10px] sm:text-xs text-accent-red animate-slide-up font-medium">{t("prep.shortWarning")}</p>
          )}

          {!submitted && timeLeft > 0 && (
            <button onClick={handleSubmit} className="btn-primary w-full !h-11 sm:!h-12 text-sm sm:text-base">{t("prep.submit")}</button>
          )}
        </div>

        {submitted && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/95 backdrop-blur-sm transition-all duration-700">
            <div className="max-w-[480px] w-full px-4 sm:px-8 text-center space-y-6 sm:space-y-8 animate-slide-up">
              <div className={`text-3xl sm:text-5xl font-bold tracking-tight leading-tight ${isDefender ? "text-accent-green" : "text-accent-red"}`}>
                {t("prep.submitted").toUpperCase()}
              </div>
              <p className="text-sm sm:text-base text-body">{t("prep.waitingOpponent")}</p>
              <div className="flex justify-center gap-2">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-ink/30 animate-pulse" style={{ animationDelay: `${i * 0.2}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
