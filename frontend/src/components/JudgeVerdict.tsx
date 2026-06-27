"use client";

import type { JudgeReport } from "@/lib/api";

interface Props {
  report: JudgeReport;
  secret?: string;
  agent1Label?: string;
  agent2Label?: string;
}

const VERDICT_STYLES: Record<string, { emoji: string; label: string; color: string }> = {
  agent_1_win: { emoji: "🛡️", label: "Победа Защитника!", color: "text-emerald-400" },
  agent_2_win: { emoji: "🔍", label: "Победа Атакующего!", color: "text-rose-400" },
  draw: { emoji: "🤝", label: "Ничья", color: "text-amber-400" },
};

export default function JudgeVerdict({ report, secret, agent1Label, agent2Label }: Props) {
  const style = VERDICT_STYLES[report.verdict] || VERDICT_STYLES.draw;
  const label1 = agent1Label || "Агент 1";
  const label2 = agent2Label || "Агент 2";

  return (
    <div className="animate-slide-up space-y-3 sm:space-y-4">
      {/* Баннер вердикта */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-5 text-center space-y-2 sm:space-y-3">
        <div className="text-2xl sm:text-3xl">{style.emoji}</div>
        <h3 className={`text-lg sm:text-xl font-bold ${style.color}`}>{style.label}</h3>
        <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">{report.justification}</p>

        {report.secret_leaked && report.leaked_content && (
          <div className="mt-3 bg-rose-500/10 border border-rose-500/20 rounded-lg p-3">
            <p className="text-xs text-rose-400 font-semibold mb-1">Скомпрометировано</p>
            <p className="text-xs text-rose-300/80 font-mono">{report.leaked_content}</p>
          </div>
        )}
      </div>

      {/* Карточки счёта */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <div className="bg-zinc-900 border border-emerald-500/20 rounded-xl p-3 sm:p-4 text-center">
          <p className="text-[11px] sm:text-xs text-zinc-500 mb-1">{label1}: счёт</p>
          <p className="text-xl sm:text-2xl font-bold text-emerald-400">{report.score_agent_1}</p>
          <div className="w-full h-1.5 bg-zinc-800 rounded-full mt-2 overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-1000"
              style={{ width: `${report.score_agent_1}%` }}
            />
          </div>
        </div>
        <div className="bg-zinc-900 border border-rose-500/20 rounded-xl p-3 sm:p-4 text-center">
          <p className="text-[11px] sm:text-xs text-zinc-500 mb-1">{label2}: счёт</p>
          <p className="text-xl sm:text-2xl font-bold text-rose-400">{report.score_agent_2}</p>
          <div className="w-full h-1.5 bg-zinc-800 rounded-full mt-2 overflow-hidden">
            <div
              className="h-full bg-rose-500 rounded-full transition-all duration-1000"
              style={{ width: `${report.score_agent_2}%` }}
            />
          </div>
        </div>
      </div>

      {/* Секрет */}
      {secret && (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-3 sm:p-4">
          <p className="text-[11px] sm:text-xs text-zinc-500 mb-1">Секрет</p>
          <p className="text-xs sm:text-sm text-zinc-300 font-mono italic">{secret}</p>
        </div>
      )}
    </div>
  );
}
