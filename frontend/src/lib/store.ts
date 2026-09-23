// Luca v2 — types + storage. Keys preserved from v1 so sessions survive.
import { del as idbDel, get as idbGet, set as idbSet } from "idb-keyval";

export type Tier = "flash" | "pro";
export type Role = "user" | "assistant";

export interface Attachment { id: string; name: string; type: string; size: number; dataUrl: string; text?: string; }
export interface ToolRound { id: string; name: string; query: string; sources: { title: string; url: string; host: string }[]; status: "running" | "done"; ms?: number; result?: string; }
export interface Source { id: number; url: string; domain: string; title: string; }
export interface SearchInfo { query: string; reason: string; count: number; }
export interface LucaMessage {
  uid: string; role: Role; content: string; ts: number;
  tier?: Tier; reasoning?: string; thinkingMs?: number; elapsedMs?: number;
  stage?: string; stageLabel?: string;
  sources?: Source[]; searchInfo?: SearchInfo; followups?: string[];
  toolRounds?: ToolRound[]; attachments?: Attachment[];
  error?: string; interrupted?: boolean; streaming?: boolean;
  versions?: string[]; versionIndex?: number;
  artifactIds?: string[];
  modelMeta?: { model: string; provider: string; pinned?: boolean } | null;
}
export interface Session { id: string; title: string; createdAt: number; updatedAt: number; pinned?: boolean; tier?: Tier; messages: LucaMessage[]; }
export interface Settings {
  theme: "dark" | "light"; enterToSend: boolean; showTimestamps: boolean;
  autoScroll: boolean; backendUrl: string; customPrompt: string;
  personality: { creativity: number; formality: number; verbosity: number };
}
export interface Profile { name: string; persona: string | null; theme: "dark" | "light"; avatar: string | null; complete?: boolean; }
export interface ArtifactVersion { version: number; content: string; createdAt: string; }
export interface Artifact { id: string; artifactType: "code" | "markdown" | "html" | "svg" | "mermaid"; title: string; versions: ArtifactVersion[]; }
export interface AuthUser {
  id: string; email: string; name: string; username: string; provider: string;
  avatar?: string | null; verified?: boolean; isAdmin?: boolean;
  badge?: string | null; modelOverride?: string | null;
}

const K = {
  settings: "luca-settings", sessions: "luca-sessions", active: "luca-active-session",
  tier: "luca_tier", onboard: "luca-onboarding", token: "luca-auth-token",
  user: "luca-auth-user", guest: "luca-guest", confirmed: "luca-username-confirmed",
};
function get(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } }
// TODO(storage): surface QuotaExceededError to the user (Phase 2 moves sessions to IndexedDB).
function set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* quota/full — surfaced in Phase 2 */ } }
function del(k: string) { try { localStorage.removeItem(k); } catch { /* missing key — nothing to remove */ } }

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

const DEFAULT_SETTINGS: Settings = {
  theme: "dark", enterToSend: true, showTimestamps: false, autoScroll: true, backendUrl: "",
  customPrompt: "", personality: { creativity: 50, formality: 50, verbosity: 50 },
};
export const defaultSettings = (): Settings => ({ ...DEFAULT_SETTINGS, personality: { ...DEFAULT_SETTINGS.personality } });
// Full device wipe for account switches: clears every client slice so the next
// session hydrates purely from the new account's server record. Never rely on
// overwriting individual fields.
export const clearDeviceState = () => {
  [K.settings, K.sessions, K.active, K.tier, K.onboard, K.token, K.user, K.guest, K.confirmed].forEach(del);
  void clearSessions();
  void clearArtifacts();
  try { sessionStorage.clear(); } catch { /* storage may be unavailable — device keys already removed */ }
};
export const loadSettings = (): Settings => {
  const raw = get(K.settings);
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    const p = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...p, personality: { ...DEFAULT_SETTINGS.personality, ...(p.personality || {}) } };
  } catch { return { ...DEFAULT_SETTINGS }; }
};
export const saveSettings = (s: Settings) => set(K.settings, JSON.stringify(s));

// Sessions live in IndexedDB (quota is GBs, not localStorage's ~5MB), so a
// few screenshots no longer silently end all persistence. Small prefs stay
// in localStorage because the inline theme script reads them pre-paint.
const SESSIONS_KEY = "luca-sessions";

function settleStreaming(list: Session[]): Session[] {
  // A stream can never survive a page reload: any message saved mid-stream
  // would otherwise render a stuck "thinking" spinner forever (or look like
  // it's regenerating). Settle them: empty stubs become interrupted (Retry
  // button), partial content just stops streaming.
  for (const s of list) {
    if (!s || !Array.isArray(s.messages)) continue;
    for (const m of s.messages) {
      if (m && m.streaming) {
        m.streaming = false;
        if (m.role === "assistant" && !String(m.content || "").trim()) m.interrupted = true;
      }
    }
  }
  return list;
}

export async function loadSessions(): Promise<Session[]> {
  try {
    const raw = await idbGet<Session[]>(SESSIONS_KEY);
    if (Array.isArray(raw)) return settleStreaming(raw);
  } catch { /* IndexedDB unavailable — try legacy localStorage */ }
  // One-time migration from localStorage, then the old key is removed.
  try {
    const legacy = JSON.parse(get(K.sessions) || "[]");
    del(K.sessions);
    if (Array.isArray(legacy)) {
      const settled = settleStreaming(legacy);
      try { await idbSet(SESSIONS_KEY, settled.slice(0, 500)); } catch { /* migrated read-only */ }
      return settled;
    }
  } catch { /* corrupted — start fresh */ }
  return [];
}

export async function saveSessions(list: Session[], onError?: (e: Error) => void): Promise<void> {
  try {
    await idbSet(SESSIONS_KEY, list.slice(0, 500));
  } catch (e) {
    onError?.(e instanceof Error ? e : new Error("Could not save chats"));
  }
}

export async function clearSessions(): Promise<void> {
  try { await idbDel(SESSIONS_KEY); } catch { /* already gone */ }
}

// Generated artifacts persist alongside sessions so they survive reloads.
// Capped at 50 by recency — HTML artifacts can be large.
const ARTIFACTS_KEY = "luca-artifacts";
const MAX_ARTIFACTS = 50;

export async function loadArtifacts(): Promise<Record<string, Artifact>> {
  try {
    const raw = await idbGet<Record<string, Artifact>>(ARTIFACTS_KEY);
    if (raw && typeof raw === "object") return raw;
  } catch { /* start empty */ }
  return {};
}

export async function saveArtifacts(a: Record<string, Artifact>, onError?: (e: Error) => void): Promise<void> {
  try {
    const keys = Object.keys(a);
    let out = a;
    if (keys.length > MAX_ARTIFACTS) {
      const latest = (art: Artifact) => art.versions[art.versions.length - 1]?.createdAt || "";
      const keep = keys
        .map((k) => k)
        .sort((x, y) => (latest(a[y] as Artifact) < latest(a[x] as Artifact) ? -1 : 1))
        .slice(0, MAX_ARTIFACTS);
      out = Object.fromEntries(keep.map((k) => [k, a[k]])) as Record<string, Artifact>;
    }
    await idbSet(ARTIFACTS_KEY, out);
  } catch (e) {
    onError?.(e instanceof Error ? e : new Error("Could not save artifacts"));
  }
}

export async function clearArtifacts(): Promise<void> {
  try { await idbDel(ARTIFACTS_KEY); } catch { /* already gone */ }
}
export const loadActiveId = (): string | null => get(K.active);
export const saveActiveId = (id: string | null) => { if (id) set(K.active, id); else del(K.active); };

export const loadTier = (): Tier => { const v = get(K.tier); return v === "pro" ? "pro" : "flash"; };
export const saveTier = (t: Tier) => set(K.tier, t);

export const loadProfile = (): Profile | null => {
  try { const p = JSON.parse(get(K.onboard) || "null"); return p && p.complete === true ? p : null; } catch { return null; }
};
export const saveProfile = (p: Profile) => set(K.onboard, JSON.stringify({ ...p, complete: true }));

export const loadToken = (): string | null => get(K.token);
// TODO(security): move luca-auth-token to an httpOnly cookie (see docs/SECURITY.md).
export const saveToken = (t: string) => set(K.token, t);
export const loadAuthUser = (): AuthUser | null => { try { const r = get(K.user); return r ? JSON.parse(r) : null; } catch { return null; } };
export const saveAuthUser = (u: AuthUser) => set(K.user, JSON.stringify(u));
export const clearAuth = () => { del(K.token); del(K.user); };
export const isGuest = () => get(K.guest) === "true";
export const setGuest = (v: boolean) => { if (v) set(K.guest, "true"); else del(K.guest); };
export const confirmedUsername = (id: string): boolean => {
  try { return !!JSON.parse(get(K.confirmed) || "{}")[id]; } catch { return false; }
};
export const markUsernameConfirmed = (id: string) => {
  try { const m = JSON.parse(get(K.confirmed) || "{}"); m[id] = true; set(K.confirmed, JSON.stringify(m)); } catch { /* corrupted confirm map — dropped */ }
};
// Guest→signed-in adoption: guest work merges into the server record without
// duplicating sessions that exist on both sides. Never another account's
// data — callers only pass pre-login local state for a fresh account.
export function mergeAdopted(srv: Session[], adopted: Session[], prev: Session[]): Session[] {
  const localOnly = [...adopted, ...prev].filter((l) => !srv.some((s) => s.id === l.id));
  return [...srv, ...localOnly];
}

export const titleFromMessage = (t: string) => {
  const c = t.replace(/\s+/g, " ").trim();
  if (c.length <= 44) return c || "New chat";
  return c.slice(0, 44).replace(/\s+\S*$/, "") + "…";
};
export async function copyText(t: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(t); return true; }
  catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = t; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      document.execCommand("copy"); ta.remove(); return true;
    } catch { return false; }
  }
}
export function downscaleImage(dataUrl: string, maxSize: number): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const sc = Math.min(1, maxSize / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.width * sc));
      c.height = Math.max(1, Math.round(img.height * sc));
      const ctx = c.getContext("2d");
      if (!ctx) return resolve(dataUrl);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      try { resolve(c.toDataURL("image/jpeg", 0.88)); } catch { resolve(dataUrl); }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
