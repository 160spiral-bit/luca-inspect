// Dynamic hero greeting — deterministic, built from measurable factors:
// time of day, recency/frequency of use, and whether work was left unfinished.
// No randomness: the same inputs always produce the same greeting.
export interface GreetingInput {
  hour: number; // 0-23 local
  name: string;
  totalChats: number;
  chatsToday: number;
  daysSinceActive: number | null; // whole days since last activity, null = never
  hasUnfinished: boolean; // open chat ends interrupted / errored
}

export function timeSegment(hour: number): string {
  if (hour < 5) return "Still up";
  if (hour < 12) return "Morning";
  if (hour < 18) return "Afternoon";
  return "Evening";
}

export function buildGreeting(i: GreetingInput): { head: string; sub: string } {
  const head = `${timeSegment(i.hour)}, ${i.name}`;
  let sub = "what are we working on?";
  if (i.hasUnfinished) sub = "want to pick that back up?";
  else if (i.totalChats === 0) sub = i.hour < 5 ? "what are we starting tonight?" : "what are we starting with?";
  else if (i.daysSinceActive !== null && i.daysSinceActive >= 2) sub = "long time — what are we working on?";
  else if (i.daysSinceActive === 1) sub = "welcome back — what's next?";
  else if (i.chatsToday >= 3) sub = "on a roll — what's next?";
  else if (i.hour < 5) sub = "burning the midnight oil?";
  return { head, sub };
}

interface SessionLike { createdAt: number; updatedAt: number; messages: { ts: number }[] }

export function greetingStats(sessions: SessionLike[], now = Date.now()): {
  totalChats: number; chatsToday: number; daysSinceActive: number | null;
} {
  const totalChats = sessions.length;
  if (!totalChats) return { totalChats: 0, chatsToday: 0, daysSinceActive: null };
  const day = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
  const today = day(now);
  const chatsToday = sessions.filter((s) => day(s.updatedAt || s.createdAt || now) === today).length;
  const last = Math.max(...sessions.map((s) => s.updatedAt || s.createdAt || 0));
  const daysSinceActive = Math.max(0, Math.floor((now - last) / 86_400_000));
  return { totalChats, chatsToday, daysSinceActive };
}
