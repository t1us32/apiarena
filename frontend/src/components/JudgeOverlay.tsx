"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";

interface Props {
  verdict: "agent_1_win" | "agent_2_win" | "draw";
  justification: string;
  scoreAgent1: number;
  scoreAgent2: number;
  defenderLabel: string;
  attackerLabel: string;
  onClose: () => void;
}

const TYPING_SPEED = 20;
const REVEAL_DELAY = 800;

export default function JudgeOverlay({
  verdict, justification, scoreAgent1, scoreAgent2,
  defenderLabel, attackerLabel, onClose,
}: Props) {
  const { t } = useT();
  const [stage, setStage] = useState<"title" | "justification" | "verdict" | "scores" | "done">("title");
  const [typedJustification, setTypedJustification] = useState("");
  const [visible, setVisible] = useState(false);

  const verdictLabels: Record<string, string> = {
    agent_1_win: t("verdict.defenderWins"),
    agent_2_win: t("verdict.attackerWins"),
    draw: t("verdict.draw"),
  };
  const verdictLabel = verdictLabels[verdict] || verdictLabels.draw;

  useEffect(() => {
    const t0 = setTimeout(() => setVisible(true), 100);
    const t1 = setTimeout(() => setStage("justification"), 1200);
    return () => { clearTimeout(t0); clearTimeout(t1); };
  }, []);

  useEffect(() => {
    if (stage !== "justification") return;
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setTypedJustification(justification.slice(0, i));
      if (i >= justification.length) {
        clearInterval(interval);
        setTimeout(() => setStage("verdict"), REVEAL_DELAY);
      }
    }, TYPING_SPEED);
    return () => clearInterval(interval);
  }, [stage, justification]);

  useEffect(() => {
    if (stage !== "verdict") return;
    const t = setTimeout(() => setStage("scores"), 1800);
    return () => clearTimeout(t);
  }, [stage]);

  useEffect(() => {
    if (stage !== "scores") return;
    const t = setTimeout(() => setStage("done"), 1500);
    return () => clearTimeout(t);
  }, [stage]);

  return (
    <div className={`fixed inset-0 z-50 flex items-start justify-center overflow-y-auto transition-all duration-700 ${visible ? "bg-canvas/95 backdrop-blur-sm" : "bg-canvas/0"}`}>
      <div className="max-w-[640px] w-full px-4 sm:px-8 text-center space-y-5 sm:space-y-8 py-12 sm:py-16">

        {/* Title */}
        <div className={`transition-all duration-1000 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <p className="text-xs sm:text-sm text-mute uppercase tracking-[0.2em] animate-pulse">
            {t("battle.judgeAnalyzing")}
          </p>
        </div>

        {/* Justification — typewriter */}
        {(stage === "justification" || stage === "verdict" || stage === "scores" || stage === "done") && (
          <div className="transition-all duration-500">
            <p className="text-sm sm:text-lg text-body leading-relaxed font-sans text-left sm:text-center">
              {typedJustification}
              {stage === "justification" && typedJustification.length < justification.length && (
                <span className="inline-block w-0.5 h-4 sm:h-5 bg-ink/60 ml-0.5 animate-pulse align-text-bottom" />
              )}
            </p>
          </div>
        )}

        {/* Verdict */}
        {(stage === "verdict" || stage === "scores" || stage === "done") && (
          <div className="animate-slide-up">
            <div className={`text-2xl sm:text-4xl font-bold tracking-tight leading-tight ${
              verdict === "agent_1_win" ? "text-accent-green" :
              verdict === "agent_2_win" ? "text-accent-red" :
              "text-accent-yellow"
            }`}>
              {verdictLabel.toUpperCase()}
            </div>
          </div>
        )}

        {/* Scores */}
        {(stage === "scores" || stage === "done") && (
          <div className="flex justify-center gap-6 sm:gap-8 animate-slide-up">
            <div className="text-center space-y-1">
              <p className="text-[10px] sm:text-xs text-mute">{defenderLabel}</p>
              <p className="text-2xl sm:text-3xl font-mono font-bold text-accent-green tabular-nums">{scoreAgent1}</p>
            </div>
            <div className="text-center space-y-1">
              <p className="text-[10px] sm:text-xs text-mute">{attackerLabel}</p>
              <p className="text-2xl sm:text-3xl font-mono font-bold text-accent-red tabular-nums">{scoreAgent2}</p>
            </div>
          </div>
        )}

        {stage === "done" && (
          <button onClick={onClose} className="btn-primary animate-slide-up">
            {t("app.back")}
          </button>
        )}

      </div>
    </div>
  );
}
