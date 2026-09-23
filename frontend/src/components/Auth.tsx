import { useEffect, useRef, useState } from "react";
import Logo from "./Logo";
import { base, verifyToken } from "../lib/api";
import { saveAuthUser, saveToken, setGuest } from "../lib/store";
import type { AuthUser } from "../lib/store";

interface Props { onAuth: (token: string, user: AuthUser) => void; onGuest: () => void; }

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.85A11 11 0 0012 23z" />
      <path fill="#FBBC05" d="M5.84 14.09A6.6 6.6 0 015.5 12c0-.73.13-1.43.34-2.09V7.06H2.18A11 11 0 001 12c0 1.77.42 3.45 1.18 4.94l3.66-2.85z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 002.18 7.06l3.66 2.85C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}

function GithubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.57.1.78-.25.78-.55 0-.27-.01-1.17-.02-2.12-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.75 2.69 1.25 3.34.96.1-.75.4-1.25.73-1.54-2.56-.29-5.25-1.28-5.25-5.7 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 015.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.24 2.76.12 3.05.74.81 1.18 1.84 1.18 3.1 0 4.43-2.7 5.4-5.27 5.69.42.36.78 1.07.78 2.15 0 1.56-.01 2.81-.01 3.19 0 .3.2.66.79.55A10.52 10.52 0 0023.5 12c0-6.35-5.15-11.5-11.5-11.5z" />
    </svg>
  );
}

type Mode = "signin" | "signup" | "verify" | "forgot" | "reset";

export default function Auth({ onAuth, onGuest }: Props) {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [oauth, setOauth] = useState<{ google: boolean; github: boolean }>({ google: false, github: false });
  const [oauthLoaded, setOauthLoaded] = useState(false);
  const [checking, setChecking] = useState(false);
  const [imgOk, setImgOk] = useState(true);
  const [avail, setAvail] = useState<{ available: boolean | null; reason: string | null }>({ available: null, reason: null });
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    fetch(base() + "/api/auth/config").then((r) => r.json())
      .then((j) => setOauth({ google: !!j.google, github: !!j.github }))
      .catch(() => {})
      .finally(() => setOauthLoaded(true));
  }, []);
  useEffect(() => {
    const u = username.trim().toLowerCase();
    if (!u || u.length < 3) { setAvail({ available: null, reason: null }); return; }
    if (!/^[a-z0-9_]+$/.test(u)) { setAvail({ available: false, reason: "Only letters, numbers, underscore" }); return; }
    window.clearTimeout(timer.current);
    setChecking(true);
    timer.current = window.setTimeout(async () => {
      try {
        const j = await (await fetch(base() + "/api/auth/check-username?username=" + encodeURIComponent(u))).json();
        setAvail({ available: j.available, reason: j.reason || null });
      } catch { setAvail({ available: null, reason: null }); }
      finally { setChecking(false); }
    }, 400);
    return () => window.clearTimeout(timer.current);
  }, [username]);

  const fail = (m: string) => { setErr(m); setOk(null); };
  const authed = async (token: string, user: AuthUser) => {
    const u = (await verifyToken(token)) || user;
    saveToken(token); saveAuthUser(u); setGuest(false);
    onAuth(token, u);
  };
  const signin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return fail("Email and password are required");
    setBusy(true); setErr(null);
    try {
      const r = await fetch(base() + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim(), password }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Login failed");
      await authed(j.token, j.user);
    } catch (e2) { fail(e2 instanceof Error ? e2.message : "Login failed"); }
    finally { setBusy(false); }
  };
  const signup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password || !name.trim() || !username.trim()) return fail("Please fill in all fields");
    if (avail.available === false) return fail(avail.reason || "Username not available");
    setBusy(true); setErr(null);
    try {
      const r = await fetch(base() + "/api/auth/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim(), password, name: name.trim(), username: username.trim().toLowerCase() }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Signup failed");
      if (j.needsVerification) { setMode("verify"); setOk("Verification code sent — check your email."); }
      else if (j.token) { await authed(j.token, j.user); }
    } catch (e2) { fail(e2 instanceof Error ? e2.message : "Signup failed"); }
    finally { setBusy(false); }
  };
  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return fail("Enter the 6-digit code");
    setBusy(true); setErr(null);
    try {
      const r = await fetch(base() + "/api/auth/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, code: code.trim() }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Verification failed");
      await authed(j.token, j.user);
    } catch (e2) { fail(e2 instanceof Error ? e2.message : "Verification failed"); }
    finally { setBusy(false); }
  };
  const forgot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return fail("Enter your email first");
    setBusy(true); setErr(null);
    try {
      await fetch(base() + "/api/auth/forgot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim() }) });
      setMode("reset");
      setOk("If that address has an account, a reset code is on its way.");
    } catch { fail("Couldn't send the code — try again"); }
    finally { setBusy(false); }
  };
  const reset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !password) return fail("Enter the code and a new password");
    if (password.length < 6) return fail("Password must be at least 6 characters");
    setBusy(true); setErr(null);
    try {
      const r = await fetch(base() + "/api/auth/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim(), code: code.trim(), password }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Reset failed");
      setMode("signin");
      setPassword("");
      setOk("Password updated — sign in with the new one.");
    } catch (e2) { fail(e2 instanceof Error ? e2.message : "Reset failed"); }
    finally { setBusy(false); }
  };
  const resend = async () => {
    if (!email.trim() || busy) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch(base() + "/api/auth/resend", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim() }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Couldn't resend");
      setOk("Fresh code sent — check your email.");
    } catch (e2) { fail(e2 instanceof Error ? e2.message : "Couldn't resend"); }
    finally { setBusy(false); }
  };
  const oauthGo = (p: "google" | "github") => {
    if ((p === "google" && !oauth.google) || (p === "github" && !oauth.github)) return fail(`${p === "google" ? "Google" : "GitHub"} sign-in is not configured on the server yet`);
    // Tell the backend where to land after OAuth so sign-in doesn't yank
    // you onto a different frontend (e.g. Vercel -> github.io).
    window.location.href = base() + `/api/auth/${p}?redirect=${encodeURIComponent(window.location.origin)}`;
  };
  const switchMode = (m: Mode) => { setMode(m); setErr(null); setOk(null); };

  const oauthButtons = !oauthLoaded || (!oauth.google && !oauth.github) ? null : (
    <>
      {oauth.google && <button type="button" className="luca-btn" onClick={() => oauthGo("google")}><GoogleIcon />Continue with Google</button>}
      {oauth.github && <button type="button" className="luca-btn" onClick={() => oauthGo("github")}><GithubIcon />Continue with GitHub</button>}
      <div className="luca-or"><div /><span>or</span><div /></div>
    </>
  );

  return (
    <div className="luca-auth">
      <div className="luca-auth-left">
        <div className="luca-auth-inner">
          <div className="luca-brand"><Logo size={20} /><span>Luca</span></div>
          <h1 className="luca-headline">Think further</h1>
          <p className="luca-sub">Next-generation intelligence for engineering, reasoning, and research.</p>
          <div className="luca-card">
            {err && <div className="luca-err">{err}</div>}
            {ok && <div className="luca-ok">{ok}</div>}
            {mode === "signin" && (
              <form onSubmit={signin} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {oauthButtons}
                <input className="luca-input" type="text" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter your email" autoComplete="username" aria-label="Email or username" />
                <input className="luca-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" autoComplete="current-password" aria-label="Password" />
                <div className="luca-row">
                  <span />
                  <button type="button" className="luca-link" onClick={() => switchMode("forgot")}>
                    Forgot password?
                  </button>
                </div>
                <button className="luca-btn luca-btn-solid" disabled={busy}>{busy ? "Signing in…" : "Continue with email"}</button>
                <p className="luca-signup-hint">
                  Don't have an account? <button type="button" className="luca-link" onClick={() => switchMode("signup")}>Sign up</button>
                </p>
              </form>
            )}
            {mode === "signup" && (
              <form onSubmit={signup} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {oauthButtons}
                <input className="luca-input" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" aria-label="Full name" />
                <input className="luca-input" type="text" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} placeholder="Pick a username" autoComplete="username" aria-label="Username" />
                {(checking || avail.available !== null) && (
                  <div className={avail.available === false ? "luca-avail bad" : "luca-avail ok"}>
                    {checking ? "checking…" : avail.available === true ? "Username is available" : avail.reason || ""}
                  </div>
                )}
                <input className="luca-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter your email" autoComplete="email" aria-label="Email" />
                <input className="luca-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Create a password (6+ characters)" autoComplete="new-password" aria-label="Password" />
                <button className="luca-btn luca-btn-solid" disabled={busy}>{busy ? "Creating account…" : "Continue with email"}</button>
                <div className="luca-row">
                  <span />
                  <button type="button" className="luca-link" onClick={() => switchMode("signin")}>Have an account? Sign in</button>
                </div>
              </form>
            )}
            {mode === "verify" && (
              <form onSubmit={verify} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <p className="luca-hint">Enter the 6-digit code sent to {email || "your email"}.</p>
                <input className="luca-input luca-code" type="text" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="123456" inputMode="numeric" aria-label="Verification code" />
                <button className="luca-btn luca-btn-solid" disabled={busy}>{busy ? "Verifying…" : "Verify email"}</button>
                <div className="luca-row">
                  <button type="button" className="luca-link" onClick={resend}>Resend code</button>
                  <button type="button" className="luca-link" onClick={() => switchMode("signup")}>Back</button>
                </div>
              </form>
            )}
            {mode === "forgot" && (
              <form onSubmit={forgot} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <p className="luca-hint">Enter your account email and a reset code will be sent to it.</p>
                <input className="luca-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter your email" autoComplete="email" aria-label="Email" />
                <button className="luca-btn luca-btn-solid" disabled={busy}>{busy ? "Sending…" : "Send reset code"}</button>
                <div className="luca-row">
                  <span />
                  <button type="button" className="luca-link" onClick={() => switchMode("signin")}>Back to sign in</button>
                </div>
              </form>
            )}
            {mode === "reset" && (
              <form onSubmit={reset} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <p className="luca-hint">Enter the code from your email, then pick a new password.</p>
                <input className="luca-input luca-code" type="text" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="123456" inputMode="numeric" aria-label="Reset code" />
                <input className="luca-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password (6+ characters)" autoComplete="new-password" aria-label="New password" />
                <button className="luca-btn luca-btn-solid" disabled={busy}>{busy ? "Saving…" : "Set new password"}</button>
                <div className="luca-row">
                  <span />
                  <button type="button" className="luca-link" onClick={() => switchMode("signin")}>Back to sign in</button>
                </div>
              </form>
            )}
            <div className="luca-or"><div /><span>Explore instantly</span><div /></div>
            <button type="button" className="luca-guest-btn" onClick={onGuest}>
              Continue as Guest
              <span className="luca-guest-hint">No sign-in needed · Local device storage</span>
            </button>
          </div>
          <p className="luca-micro">By continuing, you agree to Luca's <a href="#/about">Terms of Service</a> and <a href="#/about">Privacy Policy</a>.</p>
        </div>
      </div>
      <div className="luca-auth-right">
        <div className="luca-photo">
          {imgOk && <img src="https://picsum.photos/id/60/1000/1300" alt="" onError={() => setImgOk(false)} />}
        </div>
      </div>
    </div>
  );
}
