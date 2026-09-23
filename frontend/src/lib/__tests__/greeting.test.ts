import { describe, expect, it } from "vitest";
import { buildGreeting, greetingStats, timeSegment } from "../greeting";

describe("timeSegment", () => {
  it("covers the full day without randomness", () => {
    expect(timeSegment(0)).toBe("Still up");
    expect(timeSegment(4)).toBe("Still up");
    expect(timeSegment(5)).toBe("Morning");
    expect(timeSegment(11)).toBe("Morning");
    expect(timeSegment(12)).toBe("Afternoon");
    expect(timeSegment(17)).toBe("Afternoon");
    expect(timeSegment(18)).toBe("Evening");
    expect(timeSegment(23)).toBe("Evening");
  });
});

describe("buildGreeting", () => {
  const base = { hour: 10, name: "coal", totalChats: 2, chatsToday: 1, daysSinceActive: 0, hasUnfinished: false };
  it("is deterministic for identical inputs", () => {
    expect(buildGreeting(base)).toEqual(buildGreeting({ ...base }));
  });
  it("prioritises unfinished work", () => {
    expect(buildGreeting({ ...base, hasUnfinished: true }).sub).toBe("want to pick that back up?");
  });
  it("welcomes first-timers", () => {
    expect(buildGreeting({ ...base, totalChats: 0 }).sub).toContain("starting");
  });
  it("notices absence", () => {
    expect(buildGreeting({ ...base, daysSinceActive: 5 }).sub).toContain("long time");
    expect(buildGreeting({ ...base, daysSinceActive: 1 }).sub).toContain("welcome back");
  });
  it("notices busy days", () => {
    expect(buildGreeting({ ...base, chatsToday: 4 }).sub).toContain("on a roll");
  });
  it("defaults to the standard line", () => {
    expect(buildGreeting(base)).toEqual({ head: "Morning, coal", sub: "what are we working on?" });
  });
});

describe("greetingStats", () => {
  it("handles a fresh account", () => {
    expect(greetingStats([])).toEqual({ totalChats: 0, chatsToday: 0, daysSinceActive: null });
  });
  it("measures recency and today counts", () => {
    const now = new Date(2026, 8, 22, 10, 0, 0).getTime();
    const day = 86_400_000;
    const sessions = [
      { createdAt: now - 3 * day, updatedAt: now - 3 * day, messages: [] },
      { createdAt: now - 3600_000, updatedAt: now - 1000, messages: [{ ts: now - 1000 }] },
    ];
    expect(greetingStats(sessions, now)).toEqual({ totalChats: 2, chatsToday: 1, daysSinceActive: 0 });
  });
});
