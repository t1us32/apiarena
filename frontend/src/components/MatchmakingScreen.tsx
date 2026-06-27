"use client";

import { useState, useEffect } from "react";

interface Props {
  queuePosition?: number;
  onCancel: () => void;
}

export default function MatchmakingScreen({ queuePosition, onCancel }: Props) {
  const [dots, setDots] = useState("");

  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? "" : prev + "."));
    }, 500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
      <div className="text-center space-y-6 sm:space-y-8">
        <div className="relative w-20 h-20 sm:w-24 sm:h-24 mx-auto">
          <div className="absolute inset-0 rounded-full border-4 border-zinc-800 border-t-cyan-500 animate-spin" />
          <div className="absolute inset-2 rounded-full border-4 border-zinc-800 border-b-purple-500 animate-spin" style={{ animationDirection: "reverse", animationDuration: "1.5s" }} />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xl sm:text-2xl">🔍</span>
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="text-lg sm:text-xl font-semibold">
            Поиск соперника{dots}
          </h3>
          <p className="text-xs sm:text-sm text-zinc-500">
            {queuePosition !== undefined
              ? `Место в очереди: ${queuePosition}`
              : "Ожидание другого игрока..."}
          </p>
        </div>

        <div className="flex justify-center gap-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2 h-6 sm:h-8 bg-cyan-500/60 rounded-full animate-pulse"
              style={{ animationDelay: `${i * 0.2}s` }}
            />
          ))}
        </div>

        <button
          onClick={onCancel}
          className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors underline underline-offset-4"
        >
          Отмена
        </button>
      </div>
    </div>
  );
}
