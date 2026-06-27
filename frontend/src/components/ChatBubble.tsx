"use client";

interface Props {
  agent: "agent_1" | "agent_2" | "judge";
  content: string;
  turn?: number;
  isStreaming?: boolean;
  label?: string;
}

const AGENT_STYLES: Record<string, { icon: string; border: string; bg: string; text: string }> = {
  agent_1: {
    icon: "🛡️",
    border: "border-emerald-500/30",
    bg: "bg-emerald-500/5",
    text: "text-emerald-400",
  },
  agent_2: {
    icon: "🔍",
    border: "border-rose-500/30",
    bg: "bg-rose-500/5",
    text: "text-rose-400",
  },
  judge: {
    icon: "⚖️",
    border: "border-amber-500/30",
    bg: "bg-amber-500/5",
    text: "text-amber-400",
  },
};

export default function ChatBubble({ agent, content, turn, isStreaming, label }: Props) {
  const style = AGENT_STYLES[agent];
  const displayLabel = label || (agent === "agent_1" ? "Агент 1" : agent === "agent_2" ? "Агент 2" : "Судья");

  return (
    <div className={`animate-slide-up flex gap-3 ${agent === "agent_2" ? "justify-end" : ""}`}>
      <div
        className={`max-w-[80%] border ${style.border} ${style.bg} rounded-xl p-4 space-y-1 ${
          isStreaming ? "ring-1 ring-cyan-500/30" : ""
        }`}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm">{style.icon}</span>
          <span className={`text-xs font-semibold ${style.text}`}>{displayLabel}</span>
          {turn && (
            <span className="text-[10px] text-zinc-600 ml-1">Ход {turn}</span>
          )}
          {isStreaming && (
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse ml-auto" />
          )}
        </div>
        <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
          {content}
          {isStreaming && <span className="inline-block w-1.5 h-4 bg-cyan-400 ml-0.5 animate-pulse align-text-bottom" />}
        </p>
      </div>
    </div>
  );
}
