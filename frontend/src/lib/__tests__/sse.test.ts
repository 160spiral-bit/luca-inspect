import { afterEach, describe, expect, it, vi } from "vitest";
import { streamChat } from "../api";
import type { EngineEvent } from "../api";
import type { Settings } from "../store";

const settings = (): Settings => ({
  theme: "dark", enterToSend: true, showTimestamps: false, autoScroll: true, backendUrl: "",
  customPrompt: "", personality: { creativity: 50, formality: 50, verbosity: 50 },
});

function sseResponse(chunks: string[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      const enc = new TextEncoder();
      for (const ch of chunks) c.enqueue(enc.encode(ch));
      c.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });
}

async function collect(chunks: string[]): Promise<EngineEvent[]> {
  vi.stubGlobal("fetch", async () => sseResponse(chunks));
  const gen = streamChat({
    tier: "flash", history: [], settings: settings(),
    profile: null, auth: null, signal: new AbortController().signal,
  });
  const out: EngineEvent[] = [];
  for await (const ev of gen) out.push(ev);
  return out;
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("streamChat SSE parsing", () => {
  it("reassembles frames split across chunks", async () => {
    const evs = await collect(['data: {"con', 'tent":"hel', 'lo"}\n\ndata: [DONE]\n\n']);
    expect(evs).toContainEqual({ kind: "content", text: "hello" });
    expect(evs[evs.length - 1]).toEqual({ kind: "done" });
  });

  it("handles \\r\\n line endings", async () => {
    const evs = await collect(['data: {"content":"hi"}\r\n\r\ndata: [DONE]\r\n\r\n']);
    expect(evs).toContainEqual({ kind: "content", text: "hi" });
  });

  it("skips malformed JSON without killing the stream", async () => {
    const evs = await collect(['data: {broken\n\ndata: {"content":"ok"}\n\ndata: [DONE]\n\n']);
    expect(evs).toContainEqual({ kind: "content", text: "ok" });
    expect(evs[evs.length - 1]).toEqual({ kind: "done" });
  });

  it("routes event: artifact frames to the artifact channel", async () => {
    const evs = await collect([
      'event: artifact_delta\ndata: {"id":"a1","chunk":"<h1>"}\n\n',
      'data: [DONE]\n\n',
    ]);
    expect(evs).toContainEqual({ kind: "artifact_delta", id: "a1", chunk: "<h1>" });
  });
});
