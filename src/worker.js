import { DurableObject } from "cloudflare:workers";

// Одна комната = один Durable Object. Он просто пересылает сообщения между двумя игроками.
export class Room extends DurableObject {
  async fetch(request) {
    const role = new URL(request.url).searchParams.get("role") === "host" ? "host" : "guest";
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, [role]);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws !== server) try { ws.send(JSON.stringify({ t: "join", role })); } catch {}
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws, msg) {
    if (typeof msg === "string" && msg.includes('"t":"ping"')) return;
    for (const other of this.ctx.getWebSockets()) {
      if (other !== ws) try { other.send(msg); } catch {}
    }
  }

  webSocketClose(ws, code) {
    for (const other of this.ctx.getWebSockets()) {
      if (other !== ws) try { other.send(JSON.stringify({ t: "left" })); } catch {}
    }
    try { ws.close(1000); } catch {}
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/ws") {
      const room = url.searchParams.get("room") || "";
      if (!/^[a-z0-9]{4,12}$/.test(room)) return new Response("bad room", { status: 400 });
      if (request.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
      return env.ROOM.get(env.ROOM.idFromName(room)).fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};
