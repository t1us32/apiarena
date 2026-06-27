"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useT } from "@/lib/i18n";

interface Props {
  agent: "agent_1" | "agent_2" | "judge";
  content: string;
  turn?: number;
  isStreaming?: boolean;
  label?: string;
  active?: boolean;
  onFinish?: () => void;
}

const CHAR_LIMIT = 500;
const REVEAL_SPEED = 55;
const PUNCTUATION_MAJOR_PAUSE = 450;
const PUNCTUATION_MINOR_PAUSE = 250;
const SOUND_EVERY = 2;
const MAX_SOUNDS = 40;
const SOUND_COOLDOWN = 40;

const MAJOR_PUNCTUATION = new Set([".", "!", "?"]);
const MINOR_PUNCTUATION = new Set([",", ":", ";", "—", "…"]);

// Pre-loaded Audio pool — 2 elements per agent to prevent browser blocking rapid re-plays
function createAudioPool(src: string): HTMLAudioElement[] {
  if (typeof Audio === "undefined") return [];
  return [0, 1].map(() => {
    const a = new Audio(src);
    a.volume = 0.25;
    a.preload = "auto";
    return a;
  });
}

const audioPool: Record<string, HTMLAudioElement[]> = {
  agent_1: createAudioPool("/sounds/flowey.wav"),
  agent_2: createAudioPool("/sounds/sans.wav"),
};

let poolIndex = 0;

function playSound(agent: string) {
  const pool = audioPool[agent];
  if (!pool || pool.length === 0) return;
  poolIndex = (poolIndex + 1) % pool.length;
  const el = pool[poolIndex];
  el.currentTime = 0;
  el.play().catch(() => {});
}

export default function ChatBubble({ agent, content, turn, isStreaming, label, active = true, onFinish }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [displayedLen, setDisplayedLen] = useState(0);
  const displayedRef = useRef(0);
  const soundCountRef = useRef(0);
  const lastSoundTimeRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;
  const { t } = useT();

  const displayLabel = label || (agent === "agent_1" ? t("chat.agent1") : agent === "agent_2" ? t("chat.agent2") : t("chat.judge"));

  const isLong = content.length > CHAR_LIMIT;
  const visibleText = useMemo(() => {
    const finished = displayedLen >= content.length;
    const shouldTruncate = finished && isLong && !expanded;
    const raw = shouldTruncate ? content.slice(0, CHAR_LIMIT) + "..." : content;
    return raw.slice(0, displayedLen);
  }, [content, isLong, expanded, displayedLen]);

  const isDefender = agent === "agent_1";
  const isAttacker = agent === "agent_2";
  const isJudge = agent === "judge";

  const triggerSound = () => {
    if (soundCountRef.current >= MAX_SOUNDS) return;
    const now = Date.now();
    if (now - lastSoundTimeRef.current < SOUND_COOLDOWN) return;
    lastSoundTimeRef.current = now;
    soundCountRef.current++;
    playSound(agent);
  };

  // Typewriter reveal
  useEffect(() => {
    if (!active) return;

    const finished = displayedRef.current >= content.length;
    if (finished) {
      onFinishRef.current?.();
      return;
    }

    const scheduleNext = () => {
      const i = displayedRef.current;
      if (i >= content.length) {
        onFinishRef.current?.();
        return;
      }

      const char = content[i];
      const isMajor = MAJOR_PUNCTUATION.has(char);
      const isMinor = MINOR_PUNCTUATION.has(char);
      const delay = isMajor
        ? REVEAL_SPEED + PUNCTUATION_MAJOR_PAUSE
        : isMinor
        ? REVEAL_SPEED + PUNCTUATION_MINOR_PAUSE
        : REVEAL_SPEED;

      timeoutRef.current = setTimeout(() => {
        displayedRef.current = i + 1;
        setDisplayedLen(i + 1);

        const soundIdx = Math.floor((i + 1) / SOUND_EVERY);
        if (soundIdx > soundCountRef.current) {
          triggerSound();
        }

        scheduleNext();
      }, delay);
    };

    scheduleNext();

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [content.length, agent, active]);

  // Reset on new message
  useEffect(() => {
    displayedRef.current = 0;
    soundCountRef.current = 0;
    lastSoundTimeRef.current = 0;
    setDisplayedLen(0);
  }, [turn]);

  return (
    <div className={`animate-message-in flex gap-3 ${isAttacker ? "justify-end" : ""}`}>
      <div className={`max-w-[92%] sm:max-w-[75%] card-subtle !p-2.5 sm:!p-4 space-y-1.5 sm:space-y-2 ${
        isStreaming ? "border-hairline-strong" : ""
      } ${isAttacker ? "!border-accent-red/20" : isDefender ? "!border-accent-green/20" : ""}`}>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <span className={`status-dot ${isDefender ? "bg-accent-green" : isJudge ? "bg-accent-yellow" : "bg-accent-red"}`} />
          <span className="text-[11px] sm:text-xs font-medium text-ink">{displayLabel}</span>
          {turn && <span className="text-[9px] sm:text-[10px] text-stone">{t("chat.turn")} {turn}</span>}
          {displayedLen < content.length && (
            <span className="w-1 sm:w-1.5 h-1 sm:h-1.5 rounded-full bg-accent-blue animate-pulse ml-auto" />
          )}
        </div>
        <p className="text-xs sm:text-sm text-body leading-relaxed whitespace-pre-wrap break-words">
          {visibleText}
          {displayedLen < content.length && (
            <span className="inline-block w-1 sm:w-1.5 h-3 sm:h-4 bg-[#BDB4FE]/60 ml-0.5 animate-pulse align-text-bottom" />
          )}
        </p>
        {displayedLen >= content.length && isLong && (
          <button onClick={() => setExpanded(!expanded)} className="text-[10px] sm:text-xs text-accent-blue hover:text-ink transition-colors font-medium">
            {expanded ? t("chat.collapse") : t("chat.showMore")}
          </button>
        )}
      </div>
    </div>
  );
}
