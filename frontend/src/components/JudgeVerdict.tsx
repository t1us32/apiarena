"use client";

import type { JudgeReport } from "@/lib/api";
import { useT } from "@/lib/i18n";

interface Props {
  report: JudgeReport;
  secret?: string;
  agent1Label?: string;
  agent2Label?: string;
}

export default function JudgeVerdict({ report, secret, agent1Label, agent2Label }: Props) {
  const { t } = useT();

  const verdictLabels: Record<string, string> = {
    agent_1_win: t("verdict.defenderWins"),
    agent_2_win: t("verdict.attackerWins"),
    draw: t("verdict.draw"),
  };
  const verdictLabel = verdictLabels[report.verdict] || verdictLabels.draw;
  const label1 = agent1Label || t("chat.agent1");
  const label2 = agent2Label || t("chat.agent2");

  return (
    <div className="animate-slide-up space-y-4">
      <div className="card-subtle text-center space-y-3">
        <h3 className="text-lg font-medium text-ink">{verdictLabel}</h3>
        <p className="text-sm text-body leading-relaxed">{report.justification}</p>
        {report.secret_leaked && report.leaked_content && (
          <div className="card-subtle !bg-surface-deep !p-3 text-left !rounded-lg">
            <p className="text-xs text-accent-red font-medium mb-1">{t("verdict.compromised")}</p>
            <p className="text-xs text-body font-mono">{report.leaked_content}</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="card-subtle text-center space-y-2">
          <p className="text-xs text-mute">{label1}</p>
          <p className="text-2xl font-mono font-bold text-ink">{report.score_agent_1}</p>
          <div className="w-full h-1 bg-hairline rounded-full overflow-hidden">
            <div className="h-full bg-accent-green rounded-full transition-all duration-1000" style={{ width: `${report.score_agent_1}%` }} />
          </div>
        </div>
        <div className="card-subtle text-center space-y-2">
          <p className="text-xs text-mute">{label2}</p>
          <p className="text-2xl font-mono font-bold text-ink">{report.score_agent_2}</p>
          <div className="w-full h-1 bg-hairline rounded-full overflow-hidden">
            <div className="h-full bg-accent-red rounded-full transition-all duration-1000" style={{ width: `${report.score_agent_2}%` }} />
          </div>
        </div>
      </div>

      {secret && (
        <div className="card-subtle">
          <p className="text-xs text-mute mb-2">{t("verdict.secret")}</p>
          <p className="text-sm text-body font-mono">{secret}</p>
        </div>
      )}
    </div>
  );
}
