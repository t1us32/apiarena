"use client";

import { useState, useCallback, useRef } from "react";
import SetupScreen from "@/components/SetupScreen";
import MatchmakingScreen from "@/components/MatchmakingScreen";
import PrepScreen from "@/components/PrepScreen";
import BattleArena from "@/components/BattleArena";
import { GameSocket } from "@/lib/ws";
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
  const socketRef = useRef<GameSocket | null>(null);
  const mpStateRef = useRef<MultiplayerState>(INITIAL_MP);
  const [mp, setMp] = useState<MultiplayerState>(INITIAL_MP);

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

  const handleFindMatch = useCallback((provider: string, modelName: string, apiKey: string) => {
    updateMp({ provider, modelName, apiKey, queuePosition: 0 });
    setPhase("matchmaking");

    const socket = new GameSocket();
    socketRef.current = socket;

    socket.connect((event, data) => {
      switch (event) {
        case "ws_open":
          socket.send("join_queue", { provider, model_name: modelName, api_key: apiKey });
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

  return (
    <div className="flex flex-col min-h-screen">
      <header className="border-b border-zinc-800 px-3 sm:px-6 py-3 sm:py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-purple-500 flex items-center justify-center font-bold text-zinc-950 text-xs sm:text-sm shrink-0">
              A
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-semibold tracking-tight truncate">AI Арена</h1>
              <p className="text-[10px] sm:text-xs text-zinc-500 hidden sm:block">Мультиплеерная битва промптов</p>
            </div>
          </div>
          {phase !== "setup" && (
            <button
              onClick={handleBackToSetup}
              className="text-xs sm:text-sm text-zinc-400 hover:text-zinc-200 transition-colors shrink-0"
            >
              {phase === "battle" ? "Выйти" : "Отмена"}
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 flex flex-col">
        {phase === "setup" && (
          <SetupScreen onFindMatch={handleFindMatch} />
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
            promptHint={
              mp.yourRole === "agent_1"
                ? mp.scenario.agent_1_prompt_hint
                : mp.scenario.agent_2_prompt_hint
            }
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
    </div>
  );
}
