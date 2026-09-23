import { useEffect, useState } from "react";
import { Check, Copy, Download } from "lucide-react";
// Monospace ships with the lazy code chunk — the login page never fetches it.
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import { copyText } from "../lib/store";

// Build-time-light, runtime-lazy highlighting. Only these languages ship;
// anything else falls back to plain <pre>.
const LANGS = [
  "javascript", "typescript", "tsx", "jsx", "python", "bash",
  "json", "html", "css", "markdown", "yaml", "sql",
] as const;

import type { Highlighter } from "shiki";

let highlighter: Highlighter | null = null;

async function getHighlighter(): Promise<Highlighter> {
  if (!highlighter) {
    const { createHighlighter } = await import("shiki");
    highlighter = await createHighlighter({
      themes: ["github-dark", "github-light"],
      langs: [...LANGS],
    });
  }
  return highlighter;
}

function themeName() {
  try {
    return document.documentElement.getAttribute("data-theme") === "light" ? "github-light" : "github-dark";
  } catch {
    return "github-dark";
  }
}

export default function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const [html, setHtml] = useState<string | null>(null);
  const normLang = (lang || "").toLowerCase();

  useEffect(() => {
    let dead = false;
    setHtml(null);
    getHighlighter().then((hl) => {
      if (dead) return;
      try {
        if (!hl.getLoadedLanguages().includes(normLang)) throw new Error("unsupported lang");
        if (!dead) setHtml(hl.codeToHtml(code, { lang: normLang, theme: themeName() }));
      } catch {
        if (!dead) setHtml(null);
      }
    }).catch(() => { if (!dead) setHtml(null); });
    return () => { dead = true; };
  }, [normLang, code]);

  const download = () => {
    const blob = new Blob([code], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "luca-snippet." + (normLang || "txt");
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <pre>
      <div className="code-head">
        <span>{normLang || "code"}</span>
        <span style={{ display: "inline-flex", gap: 4 }}>
          <button onClick={async () => { if (await copyText(code)) { setCopied(true); setTimeout(() => setCopied(false), 1400); } }}>
            {copied ? <Check size={13} /> : <Copy size={13} />}{copied ? "Copied" : "Copy"}
          </button>
          <button onClick={download}>
            <Download size={13} />Download
          </button>
        </span>
      </div>
      {html
        ? <code className="shiki-wrap" dangerouslySetInnerHTML={{ __html: html }} />
        : <code>{code}</code>}
    </pre>
  );
}
