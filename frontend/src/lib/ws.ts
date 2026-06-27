"use client";

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";

type EventHandler = (event: string, data: Record<string, unknown>) => void;

export class GameSocket {
  private ws: WebSocket | null = null;
  private handler: EventHandler | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private url: string;

  constructor(gamePath: string = "/ws/game") {
    this.url = `${WS_BASE}${gamePath}`;
  }

  connect(onEvent: EventHandler): void {
    this.handler = onEvent;
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      onEvent("ws_open", {});
    };

    this.ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        onEvent(msg.event, msg.data || {});
      } catch {
        // ignore
      }
    };

    this.ws.onclose = () => {
      onEvent("ws_close", {});
    };

    this.ws.onerror = () => {
      onEvent("ws_error", {});
    };
  }

  send(event: string, data: Record<string, unknown> = {}): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ event, data }));
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.handler = null;
  }

  get readyState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED;
  }
}
