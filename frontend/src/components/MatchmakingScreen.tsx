"use client";

import { useState, useEffect } from "react";
import { useT } from "@/lib/i18n";

interface Props {
  queuePosition?: number;
  onCancel: () => void;
}

export default function MatchmakingScreen({ queuePosition, onCancel }: Props) {
  const [dots, setDots] = useState("");
  const { t } = useT();

  useEffect(() => {
    const interval = setInterval(() => setDots((prev) => (prev.length >= 3 ? "" : prev + ".")), 500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex-1 flex items-center justify-center p-3 sm:p-8">
      <div className="text-center space-y-6 sm:space-y-8 animate-slide-up">
        <div className="relative w-20 h-20 sm:w-24 sm:h-24 mx-auto">
          <div className="absolute inset-0 rounded-full border-2 border-hairline border-t-ink animate-spin" />
          <div className="absolute inset-3 rounded-full border-2 border-hairline border-b-ink/40 animate-spin" style={{ animationDirection: "reverse", animationDuration: "1.5s" }} />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-lg sm:text-xl font-bold text-ink">A</span>
          </div>
        </div>

        <div className="space-y-1.5 sm:space-y-2">
          <h3 className="text-base sm:text-lg font-medium text-ink">{t("matchmaking.searching")}{dots}</h3>
          <p className="text-xs sm:text-sm text-ash">
            {queuePosition !== undefined ? `${t("matchmaking.queuePosition")}: ${queuePosition}` : t("matchmaking.waiting")}
          </p>
        </div>

        <div className="flex justify-center gap-1.5 sm:gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="w-1 sm:w-1.5 h-6 sm:h-8 bg-ink/20 rounded-full animate-pulse" style={{ animationDelay: `${i * 0.2}s` }} />
          ))}
        </div>

        <button onClick={onCancel} className="text-xs sm:text-sm text-ash hover:text-ink transition-colors underline underline-offset-4 font-medium">
          {t("matchmaking.cancel")}
        </button>
      </div>
    </div>
  );
}
