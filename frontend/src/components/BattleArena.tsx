"use client";

import { useEffect, useRef, useCallback } from "react";
import type { Turn, JudgeReport, ScenarioDef } from "@/lib/api";
import ChatBubble from "./ChatBubble";
import JudgeVerdict from "./JudgeVerdict";

type StreamPhase = "connecting" | "running" | "judging" | "complete" | "error";

interface GameState {
  phase: StreamPhase;
  turns: Turn[];
  currentTurn: number;
  maxTurns: number;
  streamingAgent: "agent_1" | "agent_2" | "judge" | null;
  streamingContent: string;
  judgeReport?: JudgeReport;
  secret?: string;
  error?: string;
  scenario?: ScenarioDef;
  gameId?: string;
}

interface Props {
  state: GameState;
  onBack: () => void;
}

export default function BattleArena({ state, onBack }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [state.turns, state.streamingContent, scrollToBottom]);

  const phaseLabels: Record<StreamPhase, string> = {
    connecting: "Подключение к арене...",
    running: "Битва идёт",
    judging: "Судья выносит решение...",
    complete: "Битва завершена",
    error: "Ошибка",
  };

  const phaseIcon: Record<StreamPhase, string> = {
    connecting: "🌀",
    running: "⚔️",
    judging: "⚖️",
    complete: "🏁",
    error: "❌",
  };

  const agent1Label = state.scenario?.agent_1_label || "Агент 1";
  const agent2Label = state.scenario?.agent_2_label || "Агент 2";

  return (
    <div className="flex-1 flex flex-col max-w-4xl w-full mx-auto px-3 sm:px-6 py-3 sm:py-4">
      {/* Статус-бар */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 sm:mb-4">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0">
          <span className="text-base sm:text-lg">{phaseIcon[state.phase]}</span>
          <span className="text-xs sm:text-sm text-zinc-400 truncate">{phaseLabels[state.phase]}</span>
          {state.phase === "running" && (
            <span className="text-[10px] sm:text-xs text-zinc-600">
              Ход {state.currentTurn}/{state.maxTurns}
            </span>
          )}
          {state.streamingAgent && state.phase === "running" && (
            <span className="text-[10px] sm:text-xs text-cyan-400 animate-pulse truncate">
              {state.streamingAgent === "agent_2"
                ? `${agent2Label} думает...`
                : `${agent1Label} отвечает...`}
            </span>
          )}
          {state.phase === "judging" && (
            <span className="text-[10px] sm:text-xs text-amber-400 animate-pulse truncate">Судья анализирует расшифровку...</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {Array.from({ length: state.maxTurns }, (_, i) => (
            <div
              key={i}
              className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full transition-colors ${
                i < state.currentTurn
                  ? "bg-cyan-500"
                  : i === state.currentTurn && state.phase === "running"
                  ? "bg-cyan-500/50 animate-pulse"
                  : "bg-zinc-700"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Область чата */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-3 sm:space-y-4 scrollbar-thin pr-1 sm:pr-2 mb-3 sm:mb-4"
      >
        {state.turns.map((turn) => (
          <div key={`${turn.turn_number}-${turn.timestamp}`} className="space-y-3">
            <ChatBubble
              agent="agent_2"
              content={turn.agent_2_message}
              turn={turn.turn_number}
              label={agent2Label}
            />
            {turn.agent_1_message && (
              <ChatBubble
                agent="agent_1"
                content={turn.agent_1_message}
                turn={turn.turn_number}
                label={agent1Label}
              />
            )}
          </div>
        ))}

        {/* Вердикт судьи */}
        {state.judgeReport && (
          <div className="pt-4 border-t border-zinc-800">
            <JudgeVerdict
              report={state.judgeReport}
              secret={state.secret}
              agent1Label={agent1Label}
              agent2Label={agent2Label}
            />
          </div>
        )}

        {/* Ошибка */}
        {state.phase === "error" && state.error && (
          <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 text-center">
            <p className="text-sm text-rose-400">{state.error}</p>
          </div>
        )}

        {/* Загрузка */}
        {state.phase === "connecting" && (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-600">
            <div className="w-12 h-12 border-2 border-zinc-700 border-t-cyan-500 rounded-full animate-spin mb-4" />
            <p className="text-sm">Инициализация арены...</p>
            <p className="text-xs mt-1">Настройка агентов и подготовка сценария</p>
          </div>
        )}
      </div>

      {/* Футер */}
      <div className="flex items-center justify-between py-2 sm:py-3 border-t border-zinc-800">
        <div className="text-[10px] sm:text-xs text-zinc-600 truncate max-w-[60%]">
          {state.gameId && <span>Игра: {state.gameId}</span>}
        </div>
        <button
          onClick={onBack}
          className="text-xs sm:text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          ← Назад
        </button>
      </div>
    </div>
  );
}
