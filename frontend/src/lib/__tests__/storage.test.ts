import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clear } from "idb-keyval";
import { loadSessions, saveSessions } from "../store";
import type { Session } from "../store";

const sess = (id: string): Session => ({
  id, title: "T", createdAt: 1, updatedAt: 2, messages: [],
});

beforeEach(async () => {
  await clear();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("sessions storage", () => {
  it("round-trips through IndexedDB", async () => {
    await saveSessions([sess("a")]);
    expect(await loadSessions()).toEqual([sess("a")]);
  });

  it("settles mid-stream messages on load", async () => {
    await saveSessions([{
      ...sess("b"),
      messages: [
        { uid: "u1", role: "assistant", content: "", ts: 1, streaming: true },
        { uid: "u2", role: "assistant", content: "partial", ts: 2, streaming: true },
      ],
    }]);
    const [loaded] = await loadSessions();
    expect(loaded?.messages[0]).toMatchObject({ streaming: false, interrupted: true });
    expect(loaded?.messages[1]).toMatchObject({ streaming: false });
    expect(loaded?.messages[1]).not.toHaveProperty("interrupted");
  });

  it("migrates legacy localStorage once and removes the key", async () => {
    localStorage.setItem("luca-sessions", JSON.stringify([sess("legacy")]));
    const loaded = await loadSessions();
    expect(loaded).toEqual([sess("legacy")]);
    expect(localStorage.getItem("luca-sessions")).toBeNull();
    // Second load comes from IndexedDB, not localStorage.
    expect(await loadSessions()).toEqual([sess("legacy")]);
  });

  it("surfaces write failures through onError instead of swallowing", async () => {
    // Functions are not structured-cloneable, so the IndexedDB write rejects.
    const bad = [sess("x")] as unknown as Session[];
    (bad[0] as unknown as Record<string, unknown>).boom = () => {};
    const err = await new Promise<Error | null>((resolve) => {
      void saveSessions(bad, (e) => resolve(e));
    });
    expect(err).toBeInstanceOf(Error);
  });
});
