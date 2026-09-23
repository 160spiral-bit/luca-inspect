import { useEffect, useRef, useState } from "react";
import { Check, Pencil, Pin, PinOff, Plus, Search, Settings as SettingsIcon, ShieldCheck, Trash2, X, PanelLeft } from "lucide-react";
import type { AuthUser, Profile, Session } from "../lib/store";

function relTime(ts: number): string {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return "now";
  if (s < 3600) return Math.floor(s / 60) + "m";
  if (s < 86400) return Math.floor(s / 3600) + "h";
  return Math.floor(s / 86400) + "d";
}

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "U";

interface Props {
  sessions: Session[]; activeId: string | null; search: string;
  onSearch: (q: string) => void; onSelect: (id: string) => void; onNew: () => void;
  onRename: (id: string, t: string) => void; onTogglePin: (id: string) => void; onDelete: (id: string) => void;
  onOpenSettings: () => void; onOpenProfile: () => void; onClearAll: () => void;
  isAdmin?: boolean; onOpenAdmin?: () => void;
  authUser: AuthUser | null; profile: Profile | null;
  mobileOpen: boolean; onCloseMobile: () => void;
  collapsed: boolean; onToggleSidebar: () => void;
}

export default function Sidebar(p: Props) {
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<Session | null>(null);
  const [userMenu, setUserMenu] = useState(false);
  const [armClear, setArmClear] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const renameRef = useRef<HTMLInputElement | null>(null);
  const confirmTimer = useRef<number | undefined>(undefined);

  const { mobileOpen, onCloseMobile } = p;
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCloseMobile(); };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); };
  }, [mobileOpen, onCloseMobile]);
  useEffect(() => {
    if (!menuFor) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) { setMenuFor(null); }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setMenuFor(null); setUserMenu(false); } };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [menuFor]);
  useEffect(() => {
    if (!userMenu) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setUserMenu(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [userMenu]);
  useEffect(() => { if (renamingId) { renameRef.current?.focus(); renameRef.current?.select(); } }, [renamingId]);
  useEffect(() => () => window.clearTimeout(confirmTimer.current), []);

  const q = p.search.trim().toLowerCase();
  const visible = (q ? p.sessions.filter((s) => s.title.toLowerCase().includes(q) || s.messages.some((m) => m.content.toLowerCase().includes(q))) : p.sessions)
    .sort((a, b) => Number(b.pinned || false) - Number(a.pinned || false) || (b.updatedAt || 0) - (a.updatedAt || 0));
  const commitRename = () => { if (renamingId && renameValue.trim()) p.onRename(renamingId, renameValue.trim()); setRenamingId(null); };
  const lastActivity = (s: Session) => s.messages.length ? (s.messages[s.messages.length - 1]?.ts || s.updatedAt || 0) : (s.createdAt || 0);

  useEffect(() => {
    if (!confirmDelete) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setConfirmDelete(null); };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); };
  }, [confirmDelete]);

  const displayName = (p.profile?.name || p.authUser?.name || "User").trim() || "User";

  return (
    <>
      <div className={`scrim sidebar-scrim ${p.mobileOpen ? "show" : ""}`} onClick={p.onCloseMobile} aria-hidden="true" />
      <aside className={`sidebar ${p.collapsed ? "hidden-side" : ""} ${p.mobileOpen ? "mobile-open" : ""}`} aria-label="Sidebar">
        <div className="sb-head">
          <button className="wordmark" onClick={() => { p.onNew(); p.onCloseMobile(); }} aria-label="Luca home">Luca</button>
          <button className="icon-btn only-desktop" onClick={p.onToggleSidebar} aria-label="Collapse sidebar"><PanelLeft size={16} /></button>
          <button className="icon-btn only-mobile" onClick={p.onCloseMobile} aria-label="Close sidebar"><X size={20} /></button>
        </div>
        <button className="new-chat" onClick={() => { p.onNew(); p.onCloseMobile(); }}>
          <Plus size={14} />New chat
        </button>
        <div className="search">
          <Search size={14} />
          <input value={p.search} onChange={(e) => p.onSearch(e.target.value)} placeholder="Search chats" aria-label="Search chats" />
        </div>
        <div className="label">Recents</div>
        <nav className="recents" aria-label="Recent chats">
          {visible.length === 0 && (
            <div className="empty-recents">{q ? "No chats found" : "No chats yet"}</div>
          )}
          {visible.map((s) => (
            <div key={s.id} style={{ position: "relative" }}>
              {renamingId === s.id ? (
                <div style={{ display: "flex", gap: 4, padding: "2px 0" }}>
                  <input ref={renameRef} value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitRename(); } if (e.key === "Escape") setRenamingId(null); }}
                    onBlur={commitRename} aria-label="Rename chat"
                    style={{ flex: 1, minWidth: 0, borderRadius: 8, border: "1px solid var(--line2)", background: "var(--s1)", padding: "6px 10px", fontSize: 13 }} />
                  <button className="icon-btn" style={{ width: 32, height: 32 }} onMouseDown={(e) => { e.preventDefault(); commitRename(); }} aria-label="Save name"><Check size={14} /></button>
                </div>
              ) : (
                <div
                  className={`chat-item ${s.id === p.activeId ? "active" : ""}`}
                  onClick={() => { p.onSelect(s.id); p.onCloseMobile(); }}
                  role="button" tabIndex={0} aria-label={`Open chat ${s.title}`}
                  onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) { p.onSelect(s.id); p.onCloseMobile(); } }}
                >
                  <span className="title">{s.title}</span>
                  {s.pinned && <Pin size={10} style={{ flexShrink: 0, color: "var(--fnt)" }} />}
                  <time>{relTime(lastActivity(s))}</time>
                  <button className="del del-delete" title="Delete" aria-label={`Delete chat ${s.title}`}
                    onClick={(e) => { e.stopPropagation(); setConfirmDelete(s); }}>
                    <Trash2 size={12} />
                  </button>
                  <button className="del del-more" title="More options" aria-label="Chat options"
                    onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === s.id ? null : s.id); }}>
                    <svg width={12} height={12} viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg>
                  </button>
                </div>
              )}
              {menuFor === s.id && (
                <div ref={menuRef} className="row-menu-pop" role="menu">
                  <button role="menuitem" onClick={() => { p.onTogglePin(s.id); setMenuFor(null); }}>{s.pinned ? <PinOff size={13} /> : <Pin size={13} />}{s.pinned ? "Unpin" : "Pin"}</button>
                  <button role="menuitem" onClick={() => { setRenamingId(s.id); setRenameValue(s.title); setMenuFor(null); }}><Pencil size={13} />Rename</button>
                </div>
              )}
            </div>
          ))}
        </nav>
        <div className="sb-foot">
          {p.isAdmin && p.onOpenAdmin && (
            <button className="foot-row" onClick={p.onOpenAdmin}>
              <ShieldCheck size={14} />Admin Panel
            </button>
          )}
          <button className="foot-row" onClick={p.onOpenSettings}>
            <SettingsIcon size={14} />Settings
          </button>
          <div className="user-wrap">
            <button className="foot-row" onClick={() => setUserMenu((v) => !v)} aria-expanded={userMenu} aria-haspopup="menu">
              <span className="avatar" aria-hidden="true">
                {p.profile?.avatar ? <img src={p.profile.avatar} alt="" /> : initials(displayName)}
              </span>
              <span className="user-meta"><strong>{displayName}</strong><small>{p.isAdmin ? "Admin" : "Free"}</small></span>
            </button>
            <div ref={menuRef} className={`user-menu ${userMenu ? "open" : ""}`} role="menu">
              <button role="menuitem" onClick={() => { setUserMenu(false); p.onOpenProfile(); }}>Profile</button>
              <button role="menuitem" onClick={() => {
                setUserMenu(false);
                const id = p.authUser?.id || "";
                if (id && navigator.clipboard) void navigator.clipboard.writeText(id);
              }}>Copy user ID</button>
              <button role="menuitem" onClick={() => {
                if (!armClear) {
                  setArmClear(true);
                  window.clearTimeout(confirmTimer.current);
                  confirmTimer.current = window.setTimeout(() => setArmClear(false), 2500);
                  return;
                }
                window.clearTimeout(confirmTimer.current);
                setArmClear(false); setUserMenu(false); p.onClearAll();
              }}>{armClear ? "Click again to confirm" : "Clear all chats"}</button>
              <button role="menuitem" onClick={() => { setUserMenu(false); window.location.hash = "#/about"; }}>About Luca</button>
            </div>
          </div>
        </div>
      </aside>
      {confirmDelete && (
        <div className="overlay open" onClick={() => setConfirmDelete(null)}>
          <div className="modal" role="alertdialog" aria-modal="true" aria-label="Delete chat" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><h2>Delete chat?</h2></div>
            <p style={{ fontSize: 13.5, color: "var(--mut)", margin: "0 0 18px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              “{confirmDelete.title}” will be gone for good.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn-ghost" style={{ width: "auto", padding: "9px 18px" }} onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button
                className="btn-ghost btn-danger" style={{ width: "auto", padding: "9px 18px" }}
                onClick={() => { p.onDelete(confirmDelete.id); setConfirmDelete(null); }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
