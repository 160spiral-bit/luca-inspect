import { Suspense, lazy, memo, useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, Check, ChevronDown, ChevronLeft, ChevronRight, Copy, FileText, Globe, Pencil, RefreshCw, RotateCcw } from "lucide-react";
const Markdown = lazy(() => import("./Markdown"));
import { copyText } from "../lib/store";
import type { LucaMessage, Session, Settings, Profile } from "../lib/store";

interface Props {
  session: Session | null; profile: Profile | null; settings: Settings;
  onSuggestion: (t: string) => void;
  onRegenerate: (sid: string, uid: string) => void;
  onEditResend: (sid: string, uid: string, text: string) => void;
  onVersion: (sid: string, uid: string, i: number) => void;
  onToast: (m: string) => void;
  onEditDraft: (text: string) => void;
  onOpenArtifact: (id: string) => void;
}

function ErrorState({ modelLabel, onRetry, onEditLastMessage }: { modelLabel: string; onRetry: () => void; onEditLastMessage: () => void }) {
  return (
    <div className="error-state">
      <p className="error-state__message">{modelLabel} didn't return a response.</p>
      <div className="error-state__actions">
        <button className="error-action" onClick={onRetry}>
          <RotateCcw size={15} strokeWidth={1.75} />
          Retry
        </button>
        <button className="error-action" onClick={onEditLastMessage}>
          <Pencil size={15} strokeWidth={1.75} />
          Edit message
        </button>
      </div>
    </div>
  );
}

// Unified live-process view: thinking, stages and tool calls blended into a
// single timeline card instead of separate blocks. Rounds stuck "running"
// after the stream ended (declared but never executed) render as done.
function ProcessView({ msg }: { msg: LucaMessage }) {
  const [expanded, setExpanded] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());
  const streaming = !!msg.streaming;
  useEffect(() => {
    if (!streaming) return;
    startRef.current = Date.now();
    setElapsed(0);
    const id = window.setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, [streaming, msg.uid]);
  const trace = (msg.reasoning || "").split(/\n+/).filter(Boolean);
  const rounds = msg.toolRounds || [];
  const running = rounds.filter((r) => r.status === "running" && streaming);
  const live = streaming && (!msg.content || running.length > 0);
  const shown = expanded || live;
  const doneCount = rounds.filter((r) => r.status !== "running" || !streaming).length;
  const toolMs = rounds.reduce((a, r) => a + (r.ms || 0), 0);
  if (!streaming && !trace.length && !rounds.length) return null;
  let label: string;
  if (streaming) {
    if (msg.stageLabel) label = msg.stageLabel;
    else if (running.length) label = `Using ${running.map((r) => prettyToolName(r.name)).join(", ")}`;
    else if (!msg.content) label = "Thinking";
    else label = "Working";
  } else {
    const bits: string[] = [];
    if (trace.length) bits.push(`Thought for ${Math.max(1, Math.round((msg.thinkingMs || 1000) / 1000))}s`);
    if (rounds.length) {
      const dur = fmtDur(toolMs);
      bits.push(`Used ${doneCount} tool${doneCount === 1 ? "" : "s"}${dur ? ` · ${dur}` : ""}`);
    }
    label = bits.join(" · ") || "Process";
  }
  return (
    <div className="process">
      <button className="process-head" onClick={() => setExpanded((v) => !v)} aria-expanded={shown}>
        {streaming ? <span className="tool-spin" aria-hidden="true" /> : <Check size={12} aria-hidden="true" />}
        <span className="process-label">{label}{streaming ? ` · ${elapsed}s` : ""}</span>
        <ChevronDown size={13} className={`thinking__chevron ${shown ? "thinking__chevron--open" : ""}`} aria-hidden="true" />
      </button>
      {shown && (
        <div className="process-body">
          {trace.length > 0 && (
            <div className="process-trace">
              {trace.map((line, i) => <p key={i} className="thinking__trace-line">{line}</p>)}
            </div>
          )}
          {rounds.map((r) => (
            <div key={r.id} className="tool-row">
              {r.status === "running" && streaming
                ? <span className="tool-spin" aria-hidden="true" />
                : <Check size={12} aria-hidden="true" />}
              <div className="tool-row-main">
                <div className="tool-row-top">
                  <strong>{prettyToolName(r.name)}</strong>
                  {r.ms ? <span>{(r.ms / 1000).toFixed(1)}s</span> : null}
                </div>
                {r.query ? <div className="tool-query">{r.query}</div> : null}
                {r.result ? <div className="tool-result">{r.result}</div> : null}
                {!!r.sources?.length && <div className="tool-sources">{r.sources.length} source{r.sources.length === 1 ? "" : "s"}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// Wall-clock response time for the message footer ("45s", "3m 26s", "1h 2m").
function fmtDur(ms?: number): string | null {
  if (!ms || ms <= 0) return null;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${Math.max(1, s)}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function prettyToolName(name: string): string {
  if (name === "web_search" || name === "search") return "Web search";
  if (name === "run_code") return "Run code";
  if (name === "fetch_page") return "Read page";
  const p = name.split("__");
  if (p[0] === "mcp" && p.length >= 3) return `${p[1]}/${p.slice(2).join("__")}`;
  return name || "tool";
}

// Re-parse streaming text at ~30fps instead of per token.
function useThrottled<T>(value: T, ms = 33): T {
  const [v, setV] = useState(value);
  const last = useRef(0);
  useEffect(() => {
    if (ms <= 0) { setV(value); return; }
    const now = Date.now();
    const wait = Math.max(0, ms - (now - last.current));
    const id = window.setTimeout(() => { last.current = Date.now(); setV(value); }, wait);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return v;
}

const AssistantMsg = memo(function AssistantMsg({ msg, session, isLast, onRegenerate, onVersion, onToast, onSelect, onEditDraft, onOpenArtifact }: {
  msg: LucaMessage; session: Session; isLast: boolean;
  onRegenerate: (sid: string, uid: string) => void;
  onVersion: (sid: string, uid: string, i: number) => void;
  onOpenArtifact: (id: string) => void;
  onToast: (m: string) => void;
  onSelect: (text: string) => void;
  onEditDraft: (text: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const versions = msg.versions || [];
  const showVersion = versions.length > 1 && !msg.streaming;
  const idx = msg.versionIndex ?? versions.length - 1;
  const display = showVersion ? versions[idx] : msg.content;
  // Throttle only while streaming; completed messages render immediately.
  const shown = useThrottled(display ?? msg.content, msg.streaming ? 33 : 0);
  const cited = (() => {
    if (!msg.sources?.length || !shown) return [];
    const seen = new Set<number>();
    const re = /\[(\d{1,2})\](?!\()/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(shown))) seen.add(Number(m[1]));
    return msg.sources.filter((s) => seen.has(s.id));
  })();
  const isContentError = !!shown && /The model didn't return a response|All models are rate-limited/i.test(shown.trim());
  // Display trim: streaming often leaves trailing newlines that render as a
  // blank gap at the bottom of the bubble. Copy keeps full fidelity.
  const shownTrimmed = typeof shown === "string" ? shown.replace(/\s+$/, "") : shown;
  const copyThis = async () => { if (await copyText(shown || msg.content)) { setCopied(true); onToast("Copied"); setTimeout(() => setCopied(false), 1400); } };
  const dur = fmtDur(msg.elapsedMs ?? msg.thinkingMs);
  // While streaming with no content yet: live process view only.
  if (msg.streaming && !display) {
    return (
      <div className="msg msg-luca">
        <div className="who">Luca</div>
        <ProcessView msg={msg} />
      </div>
    );
  }
  return (
    <div className="msg msg-luca" aria-busy={msg.streaming || undefined}>
      <div className="who">Luca</div>
        <ProcessView msg={msg} />

        {isContentError ? null : shown ? (
          <div className="bubble">
            <Suspense fallback={<div style={{ whiteSpace: "pre-wrap" }}>{shownTrimmed}</div>}><Markdown text={shownTrimmed} sources={msg.sources} /></Suspense>
          </div>
        ) : (!msg.reasoning && msg.streaming ? <span className="typing" aria-hidden="true"><i /><i /><i /></span> : null)}
        <div className="msg-time">{fmtTime(msg.ts)}</div>
        {cited.length > 0 && (
          <div className="sources-pill-wrap">
              <button className="sources-pill" onClick={() => setShowSources(!showSources)}>
                <Globe size={14} />
                <span>{cited.length} web {cited.length === 1 ? "page" : "pages"}</span>
              </button>
            {showSources && (
              <div className="sources-dropdown">
                {cited.map((s) => (
                  <a key={s.id} href={s.url} target="_blank" rel="noreferrer" className="source-row">
                    <span className="num">{s.id}</span>
                    <span className="domain">{s.domain}</span>
                    <span className="title">{s.title}</span>
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
        {msg.streaming && shown ? <span className="cursor" aria-hidden="true" /> : null}
        {(!!msg.error || isContentError) && !msg.streaming && (() => {
          const modelLabel = msg.tier ? `Luca ${msg.tier === "flash" ? "Flash" : "Pro"}` : "Luca";
          const lastUserText = (() => {
            const idx = session.messages.findIndex((m) => m.uid === msg.uid);
            for (let i = idx - 1; i >= 0; i--) { const m = session.messages[i]; if (m && m.role === "user") return m.content; }
            return session.messages.filter((m) => m.role === "user").slice(-1)[0]?.content || "";
          })();
          return (
            <ErrorState
              modelLabel={modelLabel}
              onRetry={() => onRegenerate(session.id, msg.uid)}
              onEditLastMessage={() => onEditDraft(lastUserText)}
            />
          );
        })()}
        {msg.interrupted && !msg.streaming && (
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12, color: "var(--ink-3)" }}>Stopped.</span>
            <button className="mini-btn" onClick={() => onRegenerate(session.id, msg.uid)}>Retry</button>
          </div>
        )}
        {!msg.streaming && (shown || msg.error) && (
          <div className="msg-meta">
            <span className="msg-actions">
              <button className="icon-btn" aria-label="Copy message" title="Copy" onClick={copyThis}>
                {copied ? <Check size={13} /> : <Copy size={13} />}
              </button>
              <button className="icon-btn" aria-label="Regenerate" title="Regenerate" onClick={() => onRegenerate(session.id, msg.uid)}>
                <RefreshCw size={13} />
              </button>
            </span>
            {msg.tier && (
              <>
                <span className="msg-sep" aria-hidden="true">·</span>
                <span className="model-tag" title={msg.modelMeta?.pinned ? "Admin-pinned model" : "Active model"}>
                  {msg.modelMeta?.pinned ? `${msg.modelMeta.provider}/${msg.modelMeta.model}` : `Luca ${msg.tier === "flash" ? "Flash" : "Pro"}`}
                </span>
              </>
            )}
            {dur && (
              <>
                <span className="msg-sep" aria-hidden="true">·</span>
                <span className="msg-dur" title="Response time">{dur}</span>
              </>
            )}
            {!msg.streaming && msg.artifactIds && msg.artifactIds.length > 0 && (
              <span className="artifact-links">
                {msg.artifactIds.map((aid) => (
                  <button key={aid} className="mini-btn" onClick={() => onOpenArtifact(aid)}>View artifact</button>
                ))}
              </span>
            )}
            {showVersion && (
              <span className="version-nav">
                <button className="icon-btn" disabled={idx === 0}
                  onClick={() => onVersion(session.id, msg.uid, idx - 1)} aria-label="Previous version">
                  <ChevronLeft size={13} />
                </button>
                <span aria-live="polite">{idx + 1}/{versions.length}</span>
                <button className="icon-btn" disabled={idx === versions.length - 1}
                  onClick={() => onVersion(session.id, msg.uid, idx + 1)} aria-label="Next version">
                  <ChevronRight size={13} />
                </button>
              </span>
            )}
          </div>
        )}
        {isLast && !msg.streaming && msg.followups && msg.followups.length > 0 && (
          <div className="followups">
            {msg.followups.slice(0, 3).map((s) => (
              <button key={s} className="followup-chip" onClick={() => onSelect(s)}>{s}</button>
            ))}
          </div>
        )}
    </div>
  );
}, (a, b) => a.msg === b.msg && a.isLast === b.isLast && a.session.id === b.session.id);
// patchMsg returns new objects only for the touched message, so identity
// comparison is exact and cheap. session.id covers regenerate targets.

const UserMsg = memo(function UserMsg({ msg, session, onEditResend, onToast }: {
  msg: LucaMessage; session: Session;
  onEditResend: (sid: string, uid: string, text: string) => void;
  onToast: (m: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(msg.content);
  const [copied, setCopied] = useState(false);
  const copyThis = async () => { if (await copyText(msg.content)) { setCopied(true); onToast("Copied"); setTimeout(() => setCopied(false), 1400); } };
  // Display trim: composer newlines leave a trailing gap in the bubble.
  const displayContent = msg.content.replace(/\s+$/, "");
  if (editing) {
    return (
      <div className="msg msg-user">
        <div style={{ maxWidth: "85%", width: "100%" }}>
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} className="edit-textarea"
            style={{ width: "100%", background: "var(--s1)", border: "1px solid var(--line2)", borderRadius: 12, padding: "10px 14px", resize: "vertical", color: "var(--txt)" }} />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
            <button className="mini-btn" style={{ padding: "6px 14px", fontSize: 12 }} onClick={() => setEditing(false)}>Cancel</button>
            <button className="btn-primary" style={{ width: "auto", padding: "6px 18px", fontSize: 12 }} onClick={() => { if (draft.trim()) { onEditResend(session.id, msg.uid, draft.trim()); setEditing(false); } }}>Save</button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="msg msg-user">
      <div className="bubble">
        <Suspense fallback={displayContent}><Markdown text={displayContent} /></Suspense>
      </div>
      {(msg.attachments?.length || 0) > 0 && (
        <div className="att-chips">
          {msg.attachments?.filter((a) => a.type.startsWith("image/")).map((a) => (
            <img key={a.id} className="msg-thumb" src={a.dataUrl} alt={a.name} />
          ))}
          {msg.attachments?.filter((a) => !a.type.startsWith("image/")).map((a) => (
            <span key={a.id} className="chip"><FileText size={11} />{a.name}</span>
          ))}
        </div>
      )}
      <div className="msg-time">{fmtTime(msg.ts)}</div>
      <div className="msg-meta hover-only">
        <span className="msg-actions">
          <button className="icon-btn" aria-label="Copy message" title="Copy" onClick={copyThis}>
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </button>
          <button className="icon-btn" aria-label="Edit and resend" onClick={() => { setDraft(msg.content); setEditing(true); }}>
            <Pencil size={13} />
          </button>
        </span>
      </div>
    </div>
  );
}, (a, b) => a.msg === b.msg && a.session.id === b.session.id);

export default function ChatArea({ session, settings, onSuggestion, onRegenerate, onEditResend, onVersion, onToast, onEditDraft, onOpenArtifact }: Props) {
  const threadRef = useRef<HTMLDivElement>(null);
  const prevKey = useRef("");
  // Scroll-down pill: visible only when the user has scrolled well above the
  // latest messages. Tapping glides back to the bottom.
  const [stuck, setStuck] = useState(false);
  const onThreadScroll = () => {
    const el = threadRef.current;
    if (!el) return;
    setStuck(el.scrollHeight - el.scrollTop - el.clientHeight > 400);
  };
  const jumpToBottom = () => {
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: reduce ? "auto" : "smooth" });
  };
  useEffect(() => {
    const el = threadRef.current;
    if (!el || !settings.autoScroll || !session) return;
    const last = session.messages[session.messages.length - 1];
    const key = session.messages.length + ":" + (last ? last.content.length : 0) + ":" + (last?.streaming ? "1" : "0");
    if (key === prevKey.current) return;
    prevKey.current = key;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
    if (nearBottom || (last && last.role === "assistant" && last.streaming)) {
      el.scrollTop = el.scrollHeight;
      setStuck(false);
    }
  }, [session, settings.autoScroll]);
  // Long threads (>60 messages) render only the visible window. Dynamic
  // measurement handles wildly varying message heights; streaming growth
  // re-measures via ResizeObserver and the auto-scroll effect below sticks.
  const msgs = session?.messages ?? [];
  const useVirtual = msgs.length > 60;
  const virtualizer = useVirtualizer({
    count: msgs.length,
    getScrollElement: () => threadRef.current,
    estimateSize: () => 240,
    overscan: 6,
  });
  const renderMsg = (m: LucaMessage, i: number) => m.role === "user"
    ? <UserMsg key={m.uid} msg={m} session={session!} onEditResend={onEditResend} onToast={onToast} />
    : <AssistantMsg key={m.uid} msg={m} session={session!} isLast={i === msgs.length - 1} onRegenerate={onRegenerate} onVersion={onVersion} onToast={onToast} onSelect={onSuggestion} onEditDraft={onEditDraft} onOpenArtifact={onOpenArtifact} />;
  // Screen-reader announcements for streaming — never on the message text
  // itself (that would read every token).
  const streaming = msgs.some((m) => m.streaming);
  const wasStreaming = useRef(false);
  const [announce, setAnnounce] = useState("");
  useEffect(() => {
    if (streaming && !wasStreaming.current) setAnnounce("Luca is responding");
    else if (!streaming && wasStreaming.current) setAnnounce("Response complete");
    wasStreaming.current = streaming;
  }, [streaming]);
  if (!session || msgs.length === 0) {
    return null;
  }
  return (
    <div className="thread-wrap">
      <div aria-live="polite" aria-atomic="true" className="sr-only">{announce}</div>
      <div className="thread thread-in" key="thread" ref={threadRef} onScroll={onThreadScroll}><div className="thread-inner">
      {useVirtual ? (
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((v) => {
            const m = msgs[v.index];
            if (!m) return null;
            return (
              <div
                key={m.uid}
                data-index={v.index}
                ref={(el) => { if (el) virtualizer.measureElement(el); }}
                style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${v.start}px)` }}
              >
                {renderMsg(m, v.index)}
              </div>
            );
          })}
        </div>
      ) : (
        msgs.map((m, i) => renderMsg(m, i))
      )}
      </div></div>
      {stuck && (
        <button className="jump-btn" onClick={jumpToBottom} aria-label="Scroll to latest messages">
          <ArrowDown size={17} />
        </button>
      )}
    </div>
  );
}
