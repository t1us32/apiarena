"use client";

type EventHandler = (event: string, data: Record<string, unknown>) => void;

function getWsUrl(gamePath: string): string {
  if (typeof window !== "undefined") {
    const host = window.location.host;
    return `ws://${host}${gamePath}`;
  }
  return `${process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000"}${gamePath}`;
}

export class GameSocket {
  private ws: WebSocket | null = null;
  private handler: EventHandler | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private url: string;

  constructor(gamePath: string = "/ws/game") {
    this.url = getWsUrl(gamePath);
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
