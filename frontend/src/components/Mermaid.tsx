import { useEffect, useRef, useState } from "react";

// Mermaid loads dynamically on first diagram — never in the eager bundle.
// Theme-aware (was hardcoded dark) and securityLevel strict (was loose,
// which allowed HTML injection through diagram labels).
export function Mermaid({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const trimmed = code.trim();
  useEffect(() => {
    if (!trimmed) { setFailed(true); return; }
    let dead = false;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        const dark = document.documentElement.getAttribute("data-theme") !== "light";
        mermaid.initialize({ startOnLoad: false, theme: dark ? "dark" : "default", securityLevel: "strict" });
        // mermaid v10 API: render(id, code) returns { svg }. Unique id per
        // render; empty code guarded above with a <pre> fallback below.
        const id = "mmd-" + Math.random().toString(36).slice(2) + "-" + Date.now().toString(36);
        const { svg } = await mermaid.render(id, trimmed);
        if (!dead && ref.current) ref.current.innerHTML = svg;
      } catch (err) {
        console.error("[viz] mermaid render failed:", err, "\ncode:", trimmed.slice(0, 400));
        if (!dead) setFailed(true);
      }
    })();
    return () => { dead = true; };
  }, [trimmed]);
  if (failed || !trimmed) return <pre><code>{code}</code></pre>;
  return <div ref={ref} style={{ minHeight: 40, display: "flex", justifyContent: "center", overflowX: "auto" }} />;
}
