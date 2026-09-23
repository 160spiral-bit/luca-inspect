import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { Toaster, toast as sonnerToast } from "sonner";
import { Menu, PanelLeft } from "lucide-react";
import Sidebar from "./components/Sidebar";
import ChatArea from "./components/ChatArea";
import Composer from "./components/Composer";
import Auth from "./components/Auth";
const ArtifactPanel = lazy(() => import("./components/ArtifactPanel"));
import { AdminPanel, ProfilePanel, SettingsPanel } from "./components/Panels";
import { useNavigate } from "react-router-dom";
import {
  followups, getUserData, nameChatFromMessages, pingHealth, putUserData,
  refreshMe, setUsername, streamChat, verifySession, verifyToken,
} from "./lib/api";
import type { ChatMsg, EngineEvent } from "./lib/api";
import {
  clearAuth, clearDeviceState, confirmedUsername, defaultSettings, downscaleImage, isGuest,
  loadActiveId, loadArtifacts, loadAuthUser, loadProfile, loadSessions,
  loadSettings, loadTier, loadToken, markUsernameConfirmed, mergeAdopted,
  saveActiveId, saveArtifacts, saveAuthUser, saveProfile, saveSessions, saveSettings,
  saveTier, saveToken, setGuest, titleFromMessage, uid,
} from "./lib/store";
import { buildGreeting, greetingStats } from "./lib/greeting";
import type { Artifact, Attachment, AuthUser, LucaMessage, Profile, Session, Settings, Tier, ToolRound } from "./lib/store";

// Inline document/code attachments as text blocks so the model actually
// receives them. Images travel as image_url parts; everything else must be
// text here or it is silently dropped.
function docBlockFor(atts?: Attachment[]): string {
  const docs = (atts || []).filter((a) => !a.type.startsWith("image/"));
  if (!docs.length) return "";
  return docs.map((a) => a.text
    ? `[Attached file: ${a.name}]\n${a.text}`
    : `[Attached file: ${a.name}] (could not extract text from this file type — contents not included)`).join("\n\n");
}



export default function App({ namespace: _namespace }: { namespace: string }) {
  const [profile, setProfile] = useState<Profile | null>(() => loadProfile());
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsReady, setSessionsReady] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(() => loadActiveId());
  // Sessions hydrate async from IndexedDB (Phase 2). Nothing saves until ready.
  useEffect(() => {
    let dead = false;
    void loadSessions().then((list) => {
      if (dead) return;
      setSessions(list);
      const id = loadActiveId();
      setActiveId(id && list.some((s) => s.id === id) ? id : null);
      setSessionsReady(true);
    });
    return () => { dead = true; };
  }, []);
  const [tier, setTier] = useState<Tier>(() => loadTier());
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [streaming, setStreaming] = useState<{ sessionId: string; msgUid: string } | null>(null);
  const [panel, setPanel] = useState<"settings" | "profile" | "admin" | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState("");
  const [artifacts, setArtifacts] = useState<Record<string, Artifact>>({});
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(() => loadAuthUser());
  const [authLoading, setAuthLoading] = useState(true);
  const [guest, setGuestState] = useState(() => isGuest());
  const [nameDraft, setNameDraft] = useState("");
  const [avatarDraft, setAvatarDraft] = useState<string | null>(null);
  const [composerDraft, setComposerDraft] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);

  const activeSession = sessions.find((s) => s.id === activeId) || null;
  // FIX 2a: generation state is scoped to its session. The composer only
  // shows "stop" when the running stream belongs to the open chat.
  const streamingActive = !!streaming && streaming.sessionId === activeId;
  // Live mirrors for async callbacks (follow-ups) that outlive their closure.
  const sessionsRef = useRef(sessions);
  const activeIdRef = useRef(activeId);
  const themeRef = useRef(settings.theme);
  useEffect(() => { sessionsRef.current = sessions; }, [sessions]);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);
  useEffect(() => { themeRef.current = settings.theme; }, [settings.theme]);
  useEffect(() => {
    document.body.classList.toggle("no-times", !settings.showTimestamps);
  }, [settings.showTimestamps]);

  // Sonner toasts: persistent live region, real announcements, dismissable.
  const toast = useCallback((text: string) => {
    sonnerToast(text, { duration: 2400 });
  }, []);
  // Wipe every client slice (storage + memory) so the next session starts
  // clean. Called on sign-out AND before hydrating a new sign-in. Defined
  // above the bootstrap effect so the dep array is honest.
  const wipeClientState = useCallback(() => {
    abortRef.current?.abort();
    setStreaming(null);
    clearDeviceState();
    setSessions([]);
    setActiveId(null);
    const fresh = defaultSettings();
    setSettings(fresh);
    document.documentElement.setAttribute("data-theme", fresh.theme);
    setTier("flash");
    setProfile(null);
    setNameDraft("");
    setAvatarDraft(null);
    setPanel(null);
    setSearch("");
    hydrated.current = false;
  }, []);

  useEffect(() => {
    const ping = () => { void pingHealth(); };
    ping();
    const id = window.setInterval(ping, 60000);
    return () => window.clearInterval(id);
  }, []);

  // auth bootstrap: oauth callback, then cached session
  useEffect(() => {
    if (isGuest()) { setGuestState(true); setAuthLoading(false); return; }
    const params = new URLSearchParams(window.location.search);
    const token = params.get("auth_token");
    const err = params.get("auth_error");
    if (err) { toast("Authentication failed: " + err); window.history.replaceState({}, "", window.location.pathname); }
    if (token) {
      const name = params.get("auth_name") ? decodeURIComponent(params.get("auth_name")!) : "";
      const username = params.get("auth_username") ? decodeURIComponent(params.get("auth_username")!) : "";
      verifyToken(token).then((user) => {
        const u = user || { id: "oauth", email: "", name: name || "User", username: username || "user", provider: "oauth", avatar: null };
        wipeClientState();
        saveToken(token); saveAuthUser(u); setAuthUser(u);
        window.history.replaceState({}, "", window.location.pathname);
        setAuthLoading(false);
      }).catch(() => {
        const cached = loadAuthUser() || { id: "oauth", email: "", name: name || "User", username: username || "user", provider: "oauth", avatar: null };
        saveToken(token); saveAuthUser(cached); setAuthUser(cached);
        window.history.replaceState({}, "", window.location.pathname);
        setAuthLoading(false);
      });
      return;
    }
    const saved = loadToken();
    if (!saved) { setAuthLoading(false); return; }
    const cached = loadAuthUser();
    if (cached) {
      setAuthUser(cached);
      setAuthLoading(false);
      verifySession(saved)
        .then((r) => {
          if (r.status === 401) { wipeClientState(); clearAuth(); setAuthUser(null); return null; }
          return r.ok ? r.json() : null;
        })
        .then((j) => { if (j?.user) { saveAuthUser(j.user); setAuthUser(j.user); } })
        .catch(() => {});
      return;
    }
    verifyToken(saved).then((user) => {
      if (user) { saveAuthUser(user); setAuthUser(user); }
      else { clearAuth(); setAuthUser(null); }
      setAuthLoading(false);
    }).catch(() => setAuthLoading(false));
  }, [toast, wipeClientState]);

  const storageFullToast = useCallback(() => {
    toast("Couldn't save chats — storage is full. Delete old chats to free space.");
  }, [toast]);
  // Artifacts persist in IndexedDB alongside sessions (Phase 6e).
  useEffect(() => {
    let dead = false;
    void loadArtifacts().then((a) => { if (!dead) setArtifacts(a); });
    return () => { dead = true; };
  }, []);
  useEffect(() => {
    if (Object.keys(artifacts).length === 0) return;
    const t = window.setTimeout(() => { void saveArtifacts(artifacts, storageFullToast); }, 500);
    return () => window.clearTimeout(t);
  }, [artifacts, storageFullToast]);
  const openArtifact = useCallback((id: string) => { setActiveArtifactId(id); setMobileNav(false); }, []);
  // Client-side previews: the backend doesn't emit artifact events, so large
  // ```html blocks get an "Open preview" button that materializes a local
  // artifact (persisted like the rest). No server round-trip involved.
  const previewHtml = useCallback((title: string, html: string) => {
    const id = uid();
    setArtifacts((prev) => ({
      ...prev,
      [id]: { id, artifactType: "html", title: title || "HTML preview", versions: [{ version: 1, content: html, createdAt: new Date().toISOString() }] },
    }));
    setMobileNav(false);
    setActiveArtifactId(id);
  }, []);
  // TEMPORARY layout debugger (?debug=layout): outlines each container and
  // prints real rects so centering can be verified without guesswork.
  useEffect(() => {
    let qs: URLSearchParams | null = null;
    try { qs = new URLSearchParams(window.location.search); } catch { return; }
    if (!qs || !String(qs.get("debug") || "").includes("layout")) return;
    const t = window.setTimeout(() => {
      const colors = ["red", "lime", "cyan", "magenta", "orange", "yellow"];
      const sels = [".sidebar", ".main", ".home", ".conv", ".hero", ".hero .composer-zone", ".conv .composer-zone", ".composer", ".thread-inner"];
      const rows = sels.map((sel, i) => {
        const el = document.querySelector(sel) as HTMLElement | null;
        if (!el) return { sel, status: "MISSING" };
        const r = el.getBoundingClientRect();
        el.style.outline = `2px solid ${colors[i % colors.length]}`;
        return {
          sel, left: Math.round(r.left), width: Math.round(r.width),
          center: Math.round(r.left + r.width / 2), display: getComputedStyle(el).display,
        };
      });
      console.table(rows);
      console.log("VIEWPORT", window.innerWidth, "USER", authUser?.id || (guest ? "guest" : "signed-out"));
      // On-page report: no console needed, just screenshot the page.
      const box = document.createElement("div");
      box.style.cssText = "position:fixed;bottom:8px;right:8px;z-index:9999;background:#000;color:#0f0;font:11px/1.5 monospace;padding:10px 12px;border:1px solid #0f0;white-space:pre;max-width:60vw;max-height:50dvh;overflow:auto;";
      box.textContent = `VIEWPORT ${window.innerWidth}\n` + rows
        .map((r) => ("status" in r ? `${r.sel} MISSING` : `${r.sel} left=${r.left} w=${r.width} center=${r.center} d=${r.display}`))
        .join("\n");
      if (document.getElementById("luca-debug-report")) document.getElementById("luca-debug-report")!.remove();
      box.id = "luca-debug-report";
      document.body.appendChild(box);
    }, 800);
    return () => window.clearTimeout(t);
    // Re-runs on sign-in AND guest entry: opening the link logged-out shows auth first.
  }, [authUser, guest]);
  const clearAllChats = useCallback(() => {
    // Real clear: wipe local state AND the server record (source of truth).
    abortRef.current?.abort();
    setSessions([]);
    setActiveId(null);
    void saveSessions([], storageFullToast);
    const t = loadToken();
    if (authUser && t) void putUserData(t, { sessions: [], activeId: null, settings, tier, profile });
    toast("All chats cleared");
  }, [authUser, settings, tier, profile, toast, storageFullToast]);
  useEffect(() => {
    if (!sessionsReady) return;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void saveSessions(sessions, storageFullToast);
    }, 350);
    return () => window.clearTimeout(saveTimer.current);
  }, [sessions, sessionsReady, storageFullToast]);
  useEffect(() => saveActiveId(activeId), [activeId]);
  useEffect(() => saveTier(tier), [tier]);
  useEffect(() => {
    saveSettings(settings);
    document.documentElement.setAttribute("data-theme", settings.theme);
  }, [settings]);

  // per-account cloud sync — REPLACE semantics. Server data for the current
  // user overwrites every slice; nothing is merged, so a previous account's
  // chats/settings/tier/profile can never leak into this one.
  const hydrated = useRef(false);
  const adoptRef = useRef<Session[] | null>(null);
  useEffect(() => {
    if (!authUser || guest) return;
    const myId = authUser.id;
    const token = loadToken();
    if (!token) return;
    getUserData(token)
      .then((r) => {
        if (r.status === 401) { clearAuth(); setAuthUser(null); setGuestState(false); return null; }
        return r.ok ? r.json() : null;
      })
      .then((j) => {
        if (myId !== authUser.id) return; // account changed mid-flight — discard
        const d = j?.data || {};
        const srvSessions = Array.isArray(d.sessions) ? d.sessions : [];
        // Adopt pre-login guest work only into an EMPTY server record, and
        // merge messages sent during the hydration window. Never another
        // account's data: post-wipe local state can only be this user's own.
        const adopted = adoptRef.current || [];
        adoptRef.current = null;
        setSessions((prev) => {
          const merged = mergeAdopted(srvSessions, adopted, prev);
          void saveSessions(merged, storageFullToast);
          return merged;
        });
        const srvActive = typeof d.activeId === "string" && srvSessions.some((s: Session) => s.id === d.activeId) ? d.activeId : null;
        setActiveId((prev) => {
          const next = prev || srvActive;
          saveActiveId(next);
          return next;
        });
        const srvSettings = { ...defaultSettings(), ...(d.settings || {}) };
        setSettings(srvSettings);
        saveSettings(srvSettings);
        const srvTier = d.tier === "pro" ? "pro" : "flash";
        setTier(srvTier);
        saveTier(srvTier);
        // Server profile presence = onboarding completed for THIS user.
        // Absent → fall back to the account's own name/avatar (OAuth already
        // has both) so the gate never re-asks for what exists; only a truly
        // blank account sees the name prompt.
        if (d.profile && typeof d.profile === "object") { setProfile(d.profile); saveProfile(d.profile); }
        else {
          const aName = (authUser.name || "").trim();
          const hasRealName = !!aName && aName !== "User" && !/^(googleuser|githubuser|user\d*)$/i.test(aName);
          if (hasRealName || authUser.avatar) {
            const adopted = { name: hasRealName ? aName : "User", persona: null, theme: themeRef.current, avatar: authUser.avatar || null };
            setProfile(adopted); saveProfile(adopted);
          } else { setProfile(null); }
        }
        hydrated.current = true;
      })
      .catch(() => { /* stay unhydrated: never POST wiped state over server data */ });
  }, [authUser, guest, storageFullToast]);
  useEffect(() => {
    if (!authUser || guest || !hydrated.current) return;
    const token = loadToken();
    if (!token) return;
    const t = window.setTimeout(() => {
      void putUserData(token, { sessions, activeId, settings, tier, profile });
    }, 900);
    return () => window.clearTimeout(t);
  }, [sessions, activeId, settings, tier, profile, authUser, guest]);

  const patchMsg = useCallback((sid: string, mu: string, patch: Partial<LucaMessage>) => {
    setSessions((prev) => prev.map((s) => s.id === sid
      ? { ...s, updatedAt: Date.now(), messages: s.messages.map((m) => (m.uid === mu ? { ...m, ...patch } : m)) }
      : s));
  }, []);
  const patchRound = useCallback((sid: string, mu: string, rid: string, patch: Partial<ToolRound>) => {
    setSessions((prev) => prev.map((s) => s.id === sid ? {
      ...s, updatedAt: Date.now(),
      messages: s.messages.map((m) => {
        if (m.uid !== mu) return m;
        const rounds = m.toolRounds || [];
        return { ...m, toolRounds: rounds.some((r) => r.id === rid) ? rounds.map((r) => (r.id === rid ? { ...r, ...patch } : r)) : [...rounds, { id: rid, name: "web_search", query: "", sources: [], status: "running" as const, ...patch }] };
      }),
    } : s));
  }, []);
  const commitVersion = useCallback((sid: string, mu: string, text: string) => {
    if (!text.trim()) return;
    setSessions((prev) => prev.map((s) => s.id !== sid ? s : {
      ...s, messages: s.messages.map((m) => {
        if (m.uid !== mu) return m;
        const versions = [...(m.versions || [])];
        if (!versions.length || versions[versions.length - 1] !== text) versions.push(text);
        return { ...m, versions, versionIndex: versions.length - 1 };
      }),
    }));
  }, []);

  const runStream = useCallback(async (sid: string, auid: string, history: ChatMsg[], userText: string, t: Tier) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setStreaming({ sessionId: sid, msgUid: auid });
    let acc = "", reasoning = "";
    const startedAt = Date.now();
    let firstContentAt: number | null = null;
    try {
      const gen = streamChat({ tier: t, history, settings, profile, auth: authUser, signal: controller.signal });
      for await (const ev of gen as AsyncGenerator<EngineEvent>) {
        switch (ev.kind) {
          case "reset": reasoning = ""; patchMsg(sid, auid, { reasoning: "", toolRounds: [] }); break;
          case "meta": patchMsg(sid, auid, { modelMeta: { model: ev.model, provider: ev.provider, pinned: ev.pinned } }); break;
          case "reasoning": reasoning += ev.text; patchMsg(sid, auid, { reasoning }); break;
          case "stage": patchMsg(sid, auid, { stage: ev.stage, stageLabel: ev.label }); break;
          case "sources": patchMsg(sid, auid, { sources: ev.sources }); break;
          case "search-info": patchMsg(sid, auid, { searchInfo: { query: ev.query, reason: ev.reason, count: ev.count } }); break;
          case "content":
            if (!firstContentAt) firstContentAt = Date.now();
            acc += ev.text;
            patchMsg(sid, auid, { content: acc });
            break;
          case "tool-start": patchRound(sid, auid, ev.roundId, { name: ev.name, query: ev.query, status: "running" }); break;
          case "tool-end": patchRound(sid, auid, ev.roundId, { sources: ev.sources, status: "done", ms: ev.ms, ...(ev.result ? { result: ev.result } : {}) }); break;
          case "error": patchMsg(sid, auid, { error: ev.message }); break;
          case "artifact_start": {
            setArtifacts((prev) => {
              const ex = prev[ev.id];
              if (ex) return { ...prev, [ev.id]: { ...ex, versions: [...ex.versions, { version: ex.versions.length + 1, content: "", createdAt: new Date().toISOString() }] } };
              return { ...prev, [ev.id]: { id: ev.id, artifactType: ev.artifactType as Artifact["artifactType"], title: ev.title, versions: [{ version: 1, content: "", createdAt: new Date().toISOString() }] } };
            });
            // Link the artifact to its message so it survives reloads (Phase 6e).
            {
              const cur = sessionsRef.current.find((s) => s.id === sid);
              const curMsg = cur?.messages.find((m) => m.uid === auid);
              const ids = curMsg?.artifactIds && curMsg.artifactIds.includes(ev.id)
                ? curMsg.artifactIds
                : [...(curMsg?.artifactIds || []), ev.id];
              patchMsg(sid, auid, { artifactIds: ids });
            }
            setActiveArtifactId(ev.id);
            break;
          }
          case "artifact_delta": {
            setArtifacts((prev) => {
              const art = prev[ev.id];
              if (!art) return prev;
              const versions = [...art.versions];
              const last = versions[versions.length - 1];
              if (!last) return prev;
              versions[versions.length - 1] = { ...last, content: last.content + ev.chunk };
              return { ...prev, [ev.id]: { ...art, versions } };
            });
            break;
          }
          case "artifact_end": break;
          case "done": break;
        }
      }
      patchMsg(sid, auid, { streaming: false, thinkingMs: reasoning ? (firstContentAt || Date.now()) - startedAt : undefined, elapsedMs: Date.now() - startedAt });
      commitVersion(sid, auid, acc);
      // Follow-up chips: only for clean completions with substance. Applied
      // only if this message is still the latest (conversation didn't move on).
      if (acc.trim().length > 40 && !controller.signal.aborted) {
        void followups(acc).then((sugs) => {
          if (!sugs.length || controller.signal.aborted) return;
          const cur = sessionsRef.current.find((s) => s.id === sid);
          const last = cur?.messages[cur.messages.length - 1];
          if (!last || last.uid !== auid || last.role !== "assistant") return;
          if (activeIdRef.current !== sid) return;
          patchMsg(sid, auid, { followups: sugs });
        });
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        patchMsg(sid, auid, { streaming: false, interrupted: true, elapsedMs: Date.now() - startedAt });
        commitVersion(sid, auid, acc);
      } else {
        const stalled = e instanceof DOMException && e.name === "TimeoutError";
        const raw = e instanceof Error ? e.message : "Something went wrong.";
        patchMsg(sid, auid, {
          streaming: false,
          elapsedMs: Date.now() - startedAt,
          error: stalled
            ? "Stream stalled — the backend stopped responding. Hit Retry to continue."
            : /failed to fetch|networkerror|load failed|typeerror/i.test(raw) ? "Backend not reachable — try again in a moment." : raw,
        });
        commitVersion(sid, auid, acc);
      }
    } finally {
      setStreaming(null);
      abortRef.current = null;
      // External background agent: premise-established naming, uses LATEST sent message, not first.
      // Fire-and-forget so it never blocks the chat turn.
      void (async () => {
        try {
          if (!acc || acc.trim().length < 15) return;
          const cur = sessionsRef.current.find((s) => s.id === sid);
          if (!cur) return;
          const isDefault = cur.title === "New chat";
          const lastUserMsg = [...cur.messages].reverse().find((m) => m.role === "user");
          const lastUserText = lastUserMsg ? lastUserMsg.content.trim() : userText;
          const substantive = lastUserText.length > 12 && !/^(hi|hello|hey|hola|howdy|yo)[\s!.?]*$/i.test(lastUserText);
          // If premise not yet established (greeting only), defer naming to next turn
          if (isDefault && !substantive && cur.messages.length <= 2) return;
          // Build history from latest messages (premise in latest, not first)
          const hist: ChatMsg[] = cur.messages
            .filter((m) => (m.role === "user" ? m.content : m.content || m.toolRounds?.length))
            .slice(-6)
            .map((m) => ({ role: m.role, content: m.content }));
          if (hist.length === 0) hist.push({ role: "user", content: userText }, { role: "assistant", content: acc.slice(0, 500) });
          const title = (await nameChatFromMessages(hist)) || titleFromMessage(lastUserText);
          if (title) setSessions((p) => p.map((x) => (x.id === sid ? { ...x, title } : x)));
        } catch { /* background naming must never break the chat turn */ }
      })();
    }
  }, [settings, profile, authUser, patchMsg, patchRound, commitVersion]);

  const toHistory = (msgs: LucaMessage[]): ChatMsg[] =>
    msgs.filter((m) => (m.role === "user" ? m.content : m.content || m.toolRounds?.length))
      .map((m, i, arr) => {
        if (m.role !== "user") return { role: m.role, content: m.content };
        const docs = docBlockFor(m.attachments);
        const text = m.content + (m.attachments?.length ? "\n[Attached: " + m.attachments.map((a) => a.name).join(", ") + "]" : "") + (docs ? "\n\n" + docs : "");
        const imgs = (m.attachments || []).filter((a) => a.type.startsWith("image/"));
        if (imgs.length && i >= arr.length - 3) {
          return { role: "user", content: [{ type: "text", text }, ...imgs.map((a) => ({ type: "image_url", image_url: { url: a.dataUrl } }))] };
        }
        return { role: "user", content: text };
      });

  // Model choice is PER-CHAT and persists on the chat record. New chats
  // inherit the global default; the composer control edits the open chat.
  const sendMessage = useCallback((text: string, attachments: Attachment[]) => {
    let sid = activeIdRef.current;
    // Only the actively-streaming chat is locked; other chats (or a new one)
    // can always send — the backend streams them independently.
    if (sid && streamingRef.current && streamingRef.current === sid) return;
    let baseMsgs: LucaMessage[] = [];
    const liveSession = sid ? sessionsRef.current.find((s) => s.id === sid) || null : null;
    if (!sid || !liveSession) {
      sid = uid();
      const chatTier = tier;
      setSessions((p) => [{ id: sid!, title: "New chat", createdAt: Date.now(), updatedAt: Date.now(), tier: chatTier, messages: [] }, ...p].slice(0, 500));
      setActiveId(sid);
    } else baseMsgs = liveSession.messages;
    const sendTier = liveSession?.tier || tier;
    const userMsg: LucaMessage = { uid: uid(), role: "user", content: text, ts: Date.now(), attachments: attachments.length ? attachments : undefined };
    const asstMsg: LucaMessage = { uid: uid(), role: "assistant", content: "", ts: Date.now(), tier: sendTier, streaming: true, toolRounds: [] };
    const id = sid;
    setSessions((p) => p.map((s) => (s.id === id ? { ...s, updatedAt: Date.now(), messages: [...s.messages, userMsg, asstMsg] } : s)));
    // New turn must carry its images as image_url parts (not a plain string),
    // otherwise the thumbnail renders locally but the model never receives them.
    // Documents/code ride along as inlined text blocks via docBlockFor.
    const newImgs = attachments.filter((a) => a.type.startsWith("image/"));
    const docBlock = docBlockFor(attachments);
    const fullText = text + (docBlock ? "\n\n" + docBlock : "");
    const newUserTurn: ChatMsg = newImgs.length
      ? { role: "user", content: [{ type: "text", text: fullText + "\n[Attached: " + attachments.filter((a) => a.type.startsWith("image/")).map((a) => a.name).join(", ") + "]" }, ...newImgs.map((a) => ({ type: "image_url", image_url: { url: a.dataUrl } }))] }
      : { role: "user", content: fullText };
    void runStream(id, asstMsg.uid, [...toHistory(baseMsgs), newUserTurn], text, sendTier);
  }, [tier, runStream]);
  const setChatTier = useCallback((sid: string, t: Tier) => {
    setSessions((p) => p.map((s) => (s.id === sid ? { ...s, tier: t } : s)));
  }, []);

  // Streams are per-chat on the backend (switching chats doesn't abort), so
  // only block actions in the chat that's actually streaming — never others.
  const streamingRef = useRef<string | null>(null);
  useEffect(() => { streamingRef.current = streaming ? streaming.sessionId : null; }, [streaming]);
  const regenerate = useCallback((sid: string, mu: string) => {
    if (streamingRef.current && streamingRef.current === sid) return;
    const s = sessionsRef.current.find((x) => x.id === sid);
    if (!s) return;
    const idx = s.messages.findIndex((m) => m.uid === mu);
    if (idx < 0) return;
    const before = s.messages.slice(0, idx);
    const lastUser = [...before].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    const target = s.messages[idx];
    if (!target) return;
    const prev = [...(target.versions || [])];
    if (target.content && !target.streaming && prev[prev.length - 1] !== target.content) prev.push(target.content);
    const rt = s.tier || tier;
    const fresh: LucaMessage = { uid: mu, role: "assistant", content: "", ts: Date.now(), tier: rt, streaming: true, toolRounds: [], versions: prev.length ? prev : undefined, versionIndex: undefined };
    setSessions((p) => p.map((x) => (x.id === sid ? { ...x, updatedAt: Date.now(), messages: [...before, fresh] } : x)));
    void runStream(sid, mu, toHistory(before), lastUser.content, rt);
  }, [tier, runStream]);

  const editAndResend = useCallback((sid: string, mu: string, text: string) => {
    if (streamingRef.current && streamingRef.current === sid) return;
    const s = sessionsRef.current.find((x) => x.id === sid);
    if (!s) return;
    const idx = s.messages.findIndex((m) => m.uid === mu);
    if (idx < 0) return;
    const before = s.messages.slice(0, idx);
    const orig = s.messages[idx];
    if (!orig || !orig.uid) return;
    const userMsg: LucaMessage = { ...orig, content: text, ts: Date.now() };
    const et = s.tier || tier;
    const asstMsg: LucaMessage = { uid: uid(), role: "assistant", content: "", ts: Date.now(), tier: et, streaming: true, toolRounds: [] };
    setSessions((p) => p.map((x) => (x.id === sid ? { ...x, updatedAt: Date.now(), messages: [...before, userMsg, asstMsg] } : x)));
    const editImgs = (userMsg.attachments || []).filter((a) => a.type.startsWith("image/"));
    const editDocBlock = docBlockFor(userMsg.attachments);
    const editFullText = text + (editDocBlock ? "\n\n" + editDocBlock : "");
    const editUserTurn: ChatMsg = editImgs.length
      ? { role: "user", content: [{ type: "text", text: editFullText }, ...editImgs.map((a) => ({ type: "image_url", image_url: { url: a.dataUrl } }))] }
      : { role: "user", content: editFullText };
    void runStream(sid, asstMsg.uid, [...toHistory(before), editUserTurn], text, et);
  }, [tier, runStream]);

  // Version switcher: re-added in Phase 6 with working controls (was threaded but never called).
  const setVersion = useCallback((sid: string, mu: string, i: number) => {
    setSessions((p) => p.map((s) => (s.id !== sid ? s : { ...s, messages: s.messages.map((m) => (m.uid === mu ? { ...m, versionIndex: i } : m)) })));
  }, []);

  // Centered hero input -> docked composer FLIP on first message.
  const isEmpty = !activeSession || activeSession.messages.length === 0;
  const heroRect = useRef<DOMRect | null>(null);
  const sendFromHero = useCallback((text: string, atts: Attachment[]) => {
    const el = document.querySelector(".home .composer-zone");
    heroRect.current = el ? el.getBoundingClientRect() : null;
    sendMessage(text, atts);
  }, [sendMessage]);
  useEffect(() => {
    if (isEmpty || !heroRect.current) return;
    const el = document.querySelector(".main > .composer-zone");
    const from = heroRect.current;
    heroRect.current = null;
    if (!el) return;
    const to = el.getBoundingClientRect();
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    el.animate(
      [{ transform: `translate(${dx}px, ${dy}px)`, opacity: 0.4 }, { transform: "none", opacity: 1 }],
      { duration: 320, easing: "cubic-bezier(.22,.8,.24,1)" }
    );
  }, [isEmpty]);

  // Switching chats does NOT abort the previous generation — it keeps
  // running in the background. streamingActive is scoped to activeId, so
  // the new chat shows "Send" while the old one continues to stream.
  const switchChat = useCallback((id: string | null) => {
    setActiveId(id);
    setSearch("");
    setMobileNav(false);
  }, []);
  const handleAuth = useCallback((token: string, user: AuthUser) => {
    // New account on this device: wipe first, THEN hydrate from that
    // account's server record. Nothing survives from the previous session.
    // Exception: guest work is adopted ONLY when the server record is empty
    // (same human, fresh account — never another account's data).
    adoptRef.current = isGuest() ? [...sessionsRef.current] : null;
    wipeClientState();
    setGuest(false); setGuestState(false);
    saveToken(token); saveAuthUser(user);
    setAuthUser(user);
    toast("Welcome, " + user.name);
  }, [toast, wipeClientState]);
  const handleGuest = useCallback(() => {
    setGuest(true); setGuestState(true); setAuthLoading(false);
    toast("You're browsing as a guest — chats stay on this device");
  }, [toast]);
  const navigate = useNavigate();
  const logout = useCallback(() => {
    wipeClientState();
    clearAuth(); setGuest(false); setGuestState(false);
    setAuthUser(null);
    toast("Logged out");
    window.setTimeout(() => navigate("/"), 250);
  }, [toast, wipeClientState, navigate]);
  const resetEverything = useCallback(() => {
    abortRef.current?.abort();
    clearDeviceState(); clearAuth(); setGuest(false); setGuestState(false);
    setAuthUser(null); setSessions([]); setActiveId(null); setPanel(null);
    setTier("flash"); setProfile(null);
    document.documentElement.setAttribute("data-theme", "dark");
    window.setTimeout(() => navigate("/"), 200);
  }, [navigate]);
  const refreshSelf = useCallback(() => {
    refreshMe().then((u) => { if (u) { saveAuthUser(u); setAuthUser(u); } }).catch(() => { /* stay with cached user */ });
  }, []);
  const handleEditDraft = useCallback((text: string) => {
    setComposerDraft(text);
  }, []);
  // Dynamic hero greeting: time of day + recency/frequency of use +
  // whether any chat was left unfinished. Deterministic, never random.
  const heroGreeting = buildGreeting({
    hour: new Date().getHours(),
    name: (profile?.name || authUser?.name || "there").trim() || "there",
    ...greetingStats(sessions),
    hasUnfinished: sessions.some((s) => {
      const l = s.messages[s.messages.length - 1];
      return !!l && (!!l.interrupted || !!l.error);
    }),
  });
  // Stable suggestion sender — keeps memoised messages from re-rendering.
  const sendSuggestion = useCallback((t: string) => {
    sendMessage(t, []);
  }, [sendMessage]);

  if (authLoading) {
    return <div className="center-page"><div className="spinner" /></div>;
  }
  if (!authUser && !guest) return <Auth onAuth={handleAuth} onGuest={handleGuest} />;
  if (authUser && !confirmedUsername(authUser.id) && (!authUser.username || /^(googleuser|githubuser|user\d*$)/i.test(authUser.username))) {
    return (
      <div className="center-page">
        <div className="auth-card">
          <h1>Pick a username</h1>
          <p className="sub">Signed in as {authUser.email}. Usernames stick around, so pick one you like.</p>
          <div className="field"><label htmlFor="un">Username</label>
            <input id="un" type="text" value={nameDraft} onChange={(e) => setNameDraft(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} placeholder="yourname" maxLength={20} /></div>
          <button className="btn-primary" disabled={nameDraft.trim().length < 3} onClick={async () => {
            const token = loadToken();
            if (!token) return;
            try {
              const { error } = await setUsername(token, nameDraft.trim());
              if (error) throw new Error(error);
              markUsernameConfirmed(authUser.id);
              saveAuthUser({ ...authUser, username: nameDraft.trim() });
              setAuthUser({ ...authUser, username: nameDraft.trim() });
              toast("@" + nameDraft.trim() + " saved!");
            } catch (e) { toast(e instanceof Error ? e.message : "Failed to save"); }
          }}>Continue</button>
        </div>
      </div>
    );
  }
  if (!profile) {
    return (
      <div className="center-page">
        <div className="auth-card">
          <h1>What should I call you?</h1>
          <p className="sub">This helps me answer in a way that suits you. You can change it anytime in your profile.</p>
          <div className="field"><span className="flabel" id="avatar-label">Profile picture <span className="opt">(optional)</span></span>
            <label className="avatar" style={{ width: 64, height: 64, fontSize: 22, cursor: "pointer" }} title="Upload a profile picture" aria-labelledby="avatar-label">
              {avatarDraft ? <img src={avatarDraft} alt="" /> : (nameDraft.trim() ? nameDraft.trim().charAt(0).toUpperCase() : "?")}
              <input type="file" accept="image/*" hidden aria-label="Upload a profile picture" onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f || !f.type.startsWith("image/")) return;
                const r = new FileReader();
                r.onload = () => { void downscaleImage(String(r.result), 256).then((v) => setAvatarDraft(v)); };
                r.readAsDataURL(f);
              }} />
            </label></div>
          <div className="field"><label htmlFor="nm">Name</label>
            <input id="nm" type="text" value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} placeholder="Harper" maxLength={40} /></div>
          <button className="btn-primary" onClick={() => {
            const p = { name: nameDraft.trim() || "User", persona: null, theme: settings.theme, avatar: avatarDraft };
            setProfile(p); saveProfile(p);
            setSettings((s) => ({ ...s, theme: p.theme }));
            setNameDraft("");
            setAvatarDraft(null);
            // Permanent for this account: push to the server record NOW
            // instead of relying on the debounced sync (tab could close).
            if (authUser && !guest) {
              const t = loadToken();
              if (t) void putUserData(t, { sessions, activeId, settings, tier, profile: p });
            }
          }}>Start chatting</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`app${collapsed ? " collapsed" : ""}`}>
      <button className="open-sidebar" onClick={() => setCollapsed(false)} aria-label="Open sidebar" title="Open sidebar">
        <PanelLeft size={16} />
      </button>
      <Sidebar
        sessions={sessions} activeId={activeId} search={search} onSearch={setSearch}
        onSelect={(id) => switchChat(id)} onNew={() => switchChat(null)}
        onRename={(id, t) => setSessions((p) => p.map((s) => (s.id === id ? { ...s, title: t } : s)))}
        onTogglePin={(id) => setSessions((p) => p.map((s) => (s.id === id ? { ...s, pinned: !s.pinned } : s)))}
        onDelete={(id) => {
          if (streaming?.sessionId === id) abortRef.current?.abort();
          setSessions((p) => p.filter((s) => s.id !== id));
          if (activeId === id) setActiveId(null);
          toast("Chat successfully deleted");
        }}
        onOpenSettings={() => setPanel("settings")} onOpenProfile={() => setPanel("profile")}
        onClearAll={clearAllChats}
        isAdmin={authUser?.isAdmin} onOpenAdmin={() => setPanel("admin")}
        authUser={authUser} profile={profile} mobileOpen={mobileNav} onCloseMobile={() => setMobileNav(false)}
        collapsed={collapsed} onToggleSidebar={() => setCollapsed((v) => !v)}
      />
      <a href="#main" className="skip-link">Skip to chat</a>
      <div className="main" id="main">
        {!isEmpty && (
        <header className="topbar">
          <button className="icon-btn only-mobile" onClick={() => setMobileNav(true)} aria-label="Open sidebar"><Menu size={17} /></button>
          {collapsed && (
            <button className="icon-btn only-desktop" onClick={() => setCollapsed(false)} aria-label="Open sidebar"><PanelLeft size={15} /></button>
          )}
          <h1>{activeSession ? activeSession.title : "New chat"}</h1>
        </header>
        )}
        {isEmpty ? (
          <div className="home">
            <div className="hero">
              <button className="icon-btn only-mobile hero-menu-btn" onClick={() => setMobileNav(true)} aria-label="Open sidebar"><Menu size={17} /></button>
              <h1 className="hero-greeting">{heroGreeting.head} — <em>{heroGreeting.sub}</em></h1>
              <Composer streaming={streamingActive} onSend={sendFromHero} onStop={() => abortRef.current?.abort()}
                tier={tier} onTierChange={(t) => setTier(t)} settings={settings} onToast={toast} prefill={composerDraft} onPrefillConsumed={() => setComposerDraft(null)} />
            </div>
          </div>
        ) : (
          <div className="conv">
            <ChatArea session={activeSession} profile={profile} settings={settings}
              onSuggestion={sendSuggestion} onRegenerate={regenerate}
              onEditResend={editAndResend} onVersion={setVersion} onToast={toast} onEditDraft={handleEditDraft} onOpenArtifact={openArtifact} onPreviewHtml={previewHtml} />
            <Composer streaming={streamingActive} onSend={sendMessage} onStop={() => abortRef.current?.abort()}
              tier={activeSession?.tier || tier}
              onTierChange={(t) => { if (activeSession) setChatTier(activeSession.id, t); else setTier(t); }}
              settings={settings} onToast={toast} prefill={composerDraft} onPrefillConsumed={() => setComposerDraft(null)} />
          </div>
        )}
      </div>

      {panel === "settings" && (
        <SettingsPanel settings={settings} onChange={(p) => setSettings((s) => ({ ...s, ...p }))} onClose={() => setPanel(null)} onReset={resetEverything} />
      )}
      {panel === "profile" && (
        <ProfilePanel profile={profile} authUser={authUser}
          onSave={(p) => setProfile((prev) => { const next = { ...(prev || { name: "", persona: null, theme: settings.theme, avatar: null }), ...p }; saveProfile(next); return next; })}
          onClose={() => setPanel(null)} onLogout={logout} onToast={toast} />
      )}
      {panel === "admin" && authUser?.isAdmin && (
        <AdminPanel token={loadToken() || ""} authUserId={authUser.id} onRefreshSelf={refreshSelf} onClose={() => setPanel(null)} onToast={toast} />
      )}
      {activeArtifactId && artifacts[activeArtifactId] && (
        <Suspense fallback={null}>
          <ArtifactPanel key={activeArtifactId} artifact={artifacts[activeArtifactId]} onClose={() => setActiveArtifactId(null)} />
        </Suspense>
      )}

      <Toaster position="bottom-center" theme={settings.theme === "light" ? "light" : "dark"} toastOptions={{ duration: 2400 }} />
    </div>
  );
}
