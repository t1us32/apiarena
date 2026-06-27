"use client";

import { useState, useCallback, useRef } from "react";
import SetupScreen from "@/components/SetupScreen";
import MatchmakingScreen from "@/components/MatchmakingScreen";
import PrepScreen from "@/components/PrepScreen";
import BattleArena from "@/components/BattleArena";
import DevToolbar from "@/components/DevToolbar";
import { GameSocket } from "@/lib/ws";
import { useT, type Locale } from "@/lib/i18n";
import type { Turn, JudgeReport, ScenarioDef } from "@/lib/api";

type Phase = "setup" | "matchmaking" | "prep" | "battle";

interface BattleGameState {
  phase: "connecting" | "running" | "judging" | "complete" | "error";
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

interface MultiplayerState {
  provider: string;
  modelName: string;
  apiKey: string;
  queuePosition: number;
  scenario?: ScenarioDef;
  yourRole: "agent_1" | "agent_2";
  opponentModel?: string;
  gameId?: string;
  battle: BattleGameState;
  promptSubmitted: boolean;
  prepComplete: boolean;
}

const INITIAL_MP: MultiplayerState = {
  provider: "",
  modelName: "",
  apiKey: "",
  queuePosition: 0,
  yourRole: "agent_1",
  battle: {
    phase: "connecting",
    turns: [],
    currentTurn: 0,
    maxTurns: 5,
    streamingAgent: null,
    streamingContent: "",
  },
  promptSubmitted: false,
  prepComplete: false,
};

export default function Home() {
  const [phase, setPhase] = useState<Phase>("setup");
  const [compactMode, setCompactMode] = useState(false);
  const socketRef = useRef<GameSocket | null>(null);
  const mpStateRef = useRef<MultiplayerState>(INITIAL_MP);
  const [mp, setMp] = useState<MultiplayerState>(INITIAL_MP);
  const { t, locale, setLocale } = useT();

  const updateMp = useCallback((patch: Partial<MultiplayerState>) => {
    mpStateRef.current = { ...mpStateRef.current, ...patch };
    setMp(mpStateRef.current);
  }, []);

  const updateBattle = useCallback((patch: Partial<BattleGameState>) => {
    mpStateRef.current = {
      ...mpStateRef.current,
      battle: { ...mpStateRef.current.battle, ...patch },
    };
    setMp(mpStateRef.current);
  }, []);

  const handleFindMatch = useCallback((provider: string, modelName: string, apiKey: string, compactMode: boolean) => {
    updateMp({ provider, modelName, apiKey, queuePosition: 0 });
    setPhase("matchmaking");

    const socket = new GameSocket();
    socketRef.current = socket;

    socket.connect((event, data) => {
      switch (event) {
        case "ws_open":
          socket.send("join_queue", { provider, model_name: modelName, api_key: apiKey, compact_mode: compactMode });
          break;

        case "ws_close": {
          const bp = mpStateRef.current.battle.phase;
          // Only reset if we haven't finished the game yet (unexpected disconnect)
          if (bp !== "complete" && bp !== "running" && bp !== "judging") {
            setPhase("setup");
          }
          break;
        }

        case "queue_joined":
          updateMp({ queuePosition: (data.position as number) || 0 });
          break;

        case "match_found": {
          const scenario = data.scenario as unknown as ScenarioDef;
          updateMp({
            gameId: data.game_id as string,
            scenario,
            yourRole: data.your_role as "agent_1" | "agent_2",
            opponentModel: data.opponent_model as string,
            promptSubmitted: false,
            prepComplete: false,
          });
          setPhase("prep");
          break;
        }

        case "prep_start":
          break;

        case "prep_complete":
          updateMp({ prepComplete: true });
          setPhase("battle");
          updateBattle({
            phase: "connecting",
            turns: [],
            currentTurn: 0,
          });
          break;

        case "generating":
          updateBattle({
            streamingAgent: data.agent as "agent_1" | "agent_2" | "judge",
            streamingContent: "",
          });
          break;

        case "message": {
          const msgAgent = data.agent as "agent_1" | "agent_2";
          const msgTurn = data.turn as number;
          const msgContent = data.content as string;

          const { battle } = mpStateRef.current;
          const newBattle = { ...battle };

          if (msgAgent === "agent_2") {
            newBattle.phase = "running";
            newBattle.streamingAgent = "agent_1";
            if (!newBattle.turns.some((t) => t.turn_number === msgTurn && t.agent_2_message)) {
              newBattle.turns = [...newBattle.turns, {
                turn_number: msgTurn,
                agent_1_message: "",
                agent_2_message: msgContent,
                timestamp: new Date().toISOString(),
              }];
            }
          } else {
            newBattle.streamingAgent = null;
            const existingIdx = newBattle.turns.findIndex(
              (t) => t.turn_number === msgTurn && t.agent_1_message
            );
            if (existingIdx === -1 && newBattle.turns.length > 0) {
              const updated = [...newBattle.turns];
              updated[updated.length - 1] = {
                ...updated[updated.length - 1],
                agent_1_message: msgContent,
              };
              newBattle.turns = updated;
            }
          }
          updateBattle(newBattle);
          break;
        }

        case "turn_complete":
          updateBattle({ currentTurn: data.turn as number });
          break;

        case "judge_report":
          updateBattle({
            judgeReport: {
              verdict: data.verdict as JudgeReport["verdict"],
              justification: data.justification as string,
              secret_leaked: data.secret_leaked as boolean,
              leaked_content: data.leaked_content as string | undefined,
              score_agent_1: data.score_agent_1 as number,
              score_agent_2: data.score_agent_2 as number,
            },
          });
          break;

        case "secret_revealed":
          updateBattle({ secret: data.secret as string });
          break;

        case "game_over":
          updateBattle({ phase: "complete", streamingAgent: null });
          break;

        case "error":
          updateBattle({ phase: "error", error: data.message as string });
          break;

        case "opponent_disconnected":
          updateBattle({ phase: "error", error: "Соперник отключился" });
          break;

        case "pong":
          break;
      }
    });
  }, [updateMp, updateBattle]);

  const handleCancelMatchmaking = useCallback(() => {
    socketRef.current?.send("leave_queue");
    socketRef.current?.disconnect();
    socketRef.current = null;
    setPhase("setup");
  }, []);

  const handleSubmitPrompt = useCallback((prompt: string) => {
    socketRef.current?.send("submit_prompt", { prompt });
    updateMp({ promptSubmitted: true });
  }, [updateMp]);

  const handleBackToSetup = useCallback(() => {
    socketRef.current?.disconnect();
    socketRef.current = null;
    setPhase("setup");
    updateMp(INITIAL_MP);
  }, [updateMp]);

  const devActions = {
    jumpToPrep: (scenario: ScenarioDef) => {
      socketRef.current?.disconnect();
      socketRef.current = null;
      updateMp({
        scenario,
        yourRole: "agent_1",
        opponentModel: "dev-mock-model",
        gameId: "dev-" + Math.random().toString(36).slice(2, 8),
        promptSubmitted: false,
        prepComplete: false,
        provider: "openai",
        modelName: "gpt-4o",
        apiKey: "dev-key",
      });
      setPhase("prep");
    },
    jumpToBattle: (data: {
      scenario: ScenarioDef;
      turns: Turn[];
      phase: "connecting" | "running" | "judging" | "complete" | "error";
      currentTurn: number;
      streamingAgent: "agent_1" | "agent_2" | "judge" | null;
      judgeReport?: JudgeReport;
      secret?: string;
      error?: string;
    }) => {
      socketRef.current?.disconnect();
      socketRef.current = null;
      updateMp({
        scenario: data.scenario,
        yourRole: "agent_1",
        opponentModel: "dev-mock-model",
        gameId: "dev-" + Math.random().toString(36).slice(2, 8),
        promptSubmitted: true,
        prepComplete: true,
        provider: "openai",
        modelName: "gpt-4o",
        apiKey: "dev-key",
      });
      updateBattle({
        phase: data.phase,
        turns: data.turns,
        currentTurn: data.currentTurn,
        maxTurns: data.scenario.max_turns,
        streamingAgent: data.streamingAgent,
        streamingContent: "",
        judgeReport: data.judgeReport,
        secret: data.secret,
        error: data.error,
        scenario: data.scenario,
        gameId: "dev-001",
      });
      setPhase("battle");
    },
  };

  return (
    <div className="flex flex-col h-full relative bg-canvas">
      {/* Floating back button */}
        {phase !== "setup" && phase !== "battle" && (
          <button
            onClick={handleBackToSetup}
            className="fixed top-4 left-4 z-40 card-subtle !rounded-lg !p-2 text-xs text-mute hover:text-ink transition-colors font-medium flex items-center gap-1.5"
          >
            <span className="inline-block w-2.5 h-2.5 border-l-2 border-t-2 border-current -rotate-45 translate-y-px" />
            {t("app.cancel")}
          </button>
        )}
      <main className="flex-1 flex flex-col">
        {phase === "setup" && (
          <SetupScreen
            onFindMatch={handleFindMatch}
            compactMode={compactMode}
            onCompactChange={setCompactMode}
            locale={locale}
            onLocaleChange={setLocale}
          />
        )}

        {phase === "matchmaking" && (
          <MatchmakingScreen
            queuePosition={mp.queuePosition}
            onCancel={handleCancelMatchmaking}
          />
        )}

        {phase === "prep" && mp.scenario && (
          <PrepScreen
            scenario={mp.scenario}
            yourRole={mp.yourRole}
            onSubmit={handleSubmitPrompt}
          />
        )}

        {phase === "battle" && (
          <BattleArena
            state={mp.battle}
            onBack={handleBackToSetup}
          />
        )}
      </main>

      {process.env.NODE_ENV === "development" && phase === "setup" && (
        <DevToolbar
          actions={devActions}
          compactMode={compactMode}
          onCompactChange={setCompactMode}
        />
      )}
    </div>
  );
}
