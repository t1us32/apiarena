"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import type { Turn, JudgeReport, ScenarioDef } from "@/lib/api";
import { useT } from "@/lib/i18n";
import ChatBubble from "./ChatBubble";
import JudgeOverlay from "./JudgeOverlay";
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
  const { t } = useT();
  const [overlayDismissed, setOverlayDismissed] = useState(false);
  const [activeReveal, setActiveReveal] = useState(0);

  // Build ordered list of bubble IDs for sequential reveal
  const bubbleQueue = state.turns.flatMap((turn) => [
    `t${turn.turn_number}-agent_2`,
    ...(turn.agent_1_message ? [`t${turn.turn_number}-agent_1`] : []),
  ]);

  // Reset queue on new game
  useEffect(() => {
    setActiveReveal(0);
  }, [state.gameId]);

  const finishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const allBubblesRevealed = activeReveal >= bubbleQueue.length;

  const handleBubbleFinish = useCallback(() => {
    // Pause after the phrase ends before letting next agent speak
    if (finishTimerRef.current) clearTimeout(finishTimerRef.current);
    finishTimerRef.current = setTimeout(() => {
      setActiveReveal((prev) => prev + 1);
    }, 1200);
  }, []);

  // Unlock body scroll during battle
  useEffect(() => {
    document.body.classList.add("battle-mode");
    return () => document.body.classList.remove("battle-mode");
  }, []);

  useEffect(() => {
    if (state.phase !== "judging" && state.phase !== "complete") {
      setOverlayDismissed(false);
    }
  }, [state.phase]);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, []);

  useEffect(() => { scrollToBottom(); }, [state.turns, state.streamingContent, scrollToBottom]);

  const phaseLabels: Record<StreamPhase, string> = {
    connecting: t("battle.connecting"),
    running: t("battle.running"),
    judging: t("battle.judging"),
    complete: t("battle.complete"),
    error: t("battle.error"),
  };

  const agent1Label = state.scenario?.agent_1_label || t("chat.agent1");
  const agent2Label = state.scenario?.agent_2_label || t("chat.agent2");

  return (
    <div className="flex-1 flex flex-col max-w-[1200px] w-full mx-auto px-3 sm:px-8 py-3 sm:py-6">
      {/* Status bar */}
      <div className="card-subtle flex flex-wrap items-center justify-between gap-2 mb-3 sm:mb-4 !p-2.5 sm:!p-4">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2.5 min-w-0">
          <span className="text-xs sm:text-sm text-charcoal font-medium truncate max-w-[140px] sm:max-w-none">{phaseLabels[state.phase]}</span>
          {state.phase === "running" && (
            <span className="text-[10px] sm:text-xs text-stone">{t("battle.turn")} {state.currentTurn}/{state.maxTurns}</span>
          )}
          {state.streamingAgent && state.phase === "running" && (
            <span className={`text-[10px] sm:text-xs animate-pulse truncate font-medium ${
              state.streamingAgent === "agent_2" ? "text-accent-red" : "text-accent-green"
            }`}>
              {state.streamingAgent === "agent_2" ? `${agent2Label} ${t("battle.thinking")}` : `${agent1Label} ${t("battle.responding")}`}
            </span>
          )}
          {state.phase === "judging" && (
            <span className="text-[10px] sm:text-xs text-accent-yellow animate-pulse truncate font-medium">{t("battle.judgeAnalyzing")}</span>
          )}
        </div>
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {Array.from({ length: state.maxTurns }, (_, i) => (
            <div key={i} className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full transition-colors ${
              i < state.currentTurn ? "bg-ink/60" :
              i === state.currentTurn && state.phase === "running" ? "bg-ink/40 animate-pulse" :
              "bg-ink/10"
            }`} />
          ))}
        </div>
      </div>

      {/* Chat area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 sm:space-y-4 scrollbar-resend pr-1 sm:pr-2 mb-3 sm:mb-4">
        {state.turns.map((turn) => {
          const a2Id = `t${turn.turn_number}-agent_2`;
          const a1Id = `t${turn.turn_number}-agent_1`;
          const a2Idx = bubbleQueue.indexOf(a2Id);
          const a1Idx = bubbleQueue.indexOf(a1Id);
          return (
          <div key={`${turn.turn_number}-${turn.timestamp}`} className="space-y-3 sm:space-y-4">
            {a2Idx <= activeReveal && (
              <ChatBubble
                agent="agent_2"
                content={turn.agent_2_message}
                turn={turn.turn_number}
                label={agent2Label}
                isStreaming={state.phase === "running" && state.streamingAgent === "agent_2" && turn.turn_number === state.currentTurn}
                active={a2Idx === activeReveal}
                onFinish={handleBubbleFinish}
              />
            )}
            {turn.agent_1_message && a1Idx <= activeReveal && (
              <ChatBubble
                agent="agent_1"
                content={turn.agent_1_message}
                turn={turn.turn_number}
                label={agent1Label}
                isStreaming={state.phase === "running" && state.streamingAgent === "agent_1" && turn.turn_number === state.currentTurn}
                active={a1Idx === activeReveal}
                onFinish={handleBubbleFinish}
              />
            )}
          </div>
        )})}

        {state.judgeReport && overlayDismissed && (
          <div className="pt-4 border-t border-hairline">
            <JudgeVerdict report={state.judgeReport} secret={state.secret} agent1Label={agent1Label} agent2Label={agent2Label} />
          </div>
        )}

        {state.phase === "error" && state.error && (
          <div className="card-subtle text-center !p-3 sm:!p-4">
            <p className="text-xs sm:text-sm text-accent-red font-medium">{state.error}</p>
          </div>
        )}

        {state.phase === "connecting" && (
          <div className="flex flex-col items-center justify-center py-12 sm:py-20 text-stone">
            <div className="w-8 h-8 sm:w-10 sm:h-10 border-2 border-hairline border-t-ink rounded-full animate-spin mb-3 sm:mb-4" />
            <p className="text-xs sm:text-sm font-medium text-charcoal">{t("battle.initializing")}</p>
            <p className="text-[10px] sm:text-xs mt-1">{t("battle.initializingDesc")}</p>
          </div>
        )}
      </div>

      {/* Judge overlay — only after all bubbles finish */}
      {state.judgeReport && !overlayDismissed && allBubblesRevealed && (
        <JudgeOverlay
          verdict={state.judgeReport.verdict}
          justification={state.judgeReport.justification}
          scoreAgent1={state.judgeReport.score_agent_1}
          scoreAgent2={state.judgeReport.score_agent_2}
          defenderLabel={agent1Label}
          attackerLabel={agent2Label}
          onClose={() => setOverlayDismissed(true)}
        />
      )}
    </div>
  );
}
