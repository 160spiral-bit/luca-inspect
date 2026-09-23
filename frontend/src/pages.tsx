export function About() {
  return (
    <div className="center-page" style={{ justifyContent: "flex-start", paddingTop: "10vh" }}>
      <div style={{ maxWidth: 620, width: "100%" }}>
        <a href="#/" className="sugg">← Back to Luca</a>
        <h1 style={{ fontSize: 36, letterSpacing: "-0.02em", margin: "26px 0 12px" }}>About Luca AI</h1>
        <p style={{ color: "var(--ink-2)", lineHeight: 1.75 }}>
          Luca is a fast, private AI chat with a Pro reasoning toggle and image generation.
          Flash answers up front, deeper thinking on demand.
        </p>
        <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
          <a href="#/chat" className="btn-primary" style={{ width: "auto", padding: "11px 26px", textDecoration: "none" }}>Open chat</a>
          <a href="#/" className="btn-ghost" style={{ width: "auto", padding: "11px 26px", textDecoration: "none" }}>Home</a>
        </div>
      </div>
    </div>
  );
}
