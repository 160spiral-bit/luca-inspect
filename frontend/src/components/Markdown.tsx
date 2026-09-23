import { memo, lazy, Suspense, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import DOMPurify from "dompurify";
import "katex/dist/katex.min.css";
import type { Source } from "../lib/store";

const Mermaid = lazy(() => import("./Mermaid").then((m) => ({ default: m.Mermaid })));
const CodeBlock = lazy(() => import("./CodeBlock"));
const ChartBlock = lazy(() => import("./ChartBlock"));

// Allow KaTeX's generated markup and our citation links, nothing else.
const schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    "*": [...(defaultSchema.attributes?.["*"] ?? []), "className"],
    span: [...(defaultSchema.attributes?.span ?? []), "className", "style"],
    a: [["href", /^https?:\/\//], "title", ["target", "_blank"], ["rel", "noreferrer noopener"]],
    img: [["src", /^https?:\/\//], "alt", "title", "loading"],
  },
  protocols: { ...defaultSchema.protocols, href: ["http", "https", "mailto"], src: ["http", "https"] },
};

// Citation binder: unknown ids are left untouched (arr[10] must survive).
export function bindCitations(text: string, sources?: Source[]): string {
  if (!sources?.length) return text;
  const byId = new Map(sources.map((s) => [s.id, s]));
  const bind = (_whole: string, n: string) => {
    const src = byId.get(Number(n));
    return src ? `[${n}](${src.url} "${src.domain} — ${src.title}")` : _whole; // ← was ""
  };
  return text
    .replace(/\[(\d{1,2})\](?!\()/g, bind)
    .replace(/【(\d{1,2})[^】]*】/g, bind);
}

type Fence =
  | { kind: "md"; body: string }
  | { kind: "mermaid"; code: string }
  | { kind: "chart"; code: string }
  | { kind: "viz"; vizType: string; code: string }
  | { kind: "code"; lang: string; code: string };

function splitFences(md: string): Fence[] {
  const out: Fence[] = [];
  const parts = md.split("```");
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i] ?? "";
    if (i % 2 === 1) {
      const nl = part.indexOf("\n");
      const lang = (nl === -1 ? "" : part.slice(0, nl)).trim().toLowerCase();
      const code = (nl === -1 ? part : part.slice(nl + 1)).replace(/\n$/, "");
      if (lang === "mermaid" || lang === "viz:mermaid" || lang.startsWith("xychart") || lang === "viz:xychart" || lang === "viz:xychart-beta") out.push({ kind: "mermaid", code });
      else if (lang === "chart-data" || lang === "viz:chart") out.push({ kind: "chart", code });
      else if (lang === "viz:svg" || lang === "viz:html") out.push({ kind: "viz", vizType: lang.split(":")[1] ?? "svg", code });
      else out.push({ kind: "code", lang, code });
      continue;
    }
    if (part) out.push({ kind: "md", body: part });
  }
  return out;
}

// viz:svg from model output — DOMPurify SVG profile, never regex-stripping.
function InlineSvg({ raw }: { raw: string }) {
  const clean = useMemo(() => {
    try {
      const out = DOMPurify.sanitize(raw, { USE_PROFILES: { svg: true } });
      if (!out.trim().toLowerCase().startsWith("<svg")) return null;
      return out;
    } catch {
      return null;
    }
  }, [raw]);
  if (!clean) return <pre className="viz-fallback"><code>{raw}</code></pre>;
  return <div className="inline-viz" dangerouslySetInnerHTML={{ __html: clean }} />;
}

function MdChunk({ body, sources }: { body: string; sources?: Source[] }) {
  const text = useMemo(() => bindCitations(body, sources), [body, sources]);
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex, [rehypeSanitize, schema]]}
      components={{
        // eslint-disable-next-line jsx-a11y/anchor-has-content -- link text comes from markdown at runtime
        a: (p) => <a {...p} target="_blank" rel="noreferrer noopener" />,
        table: (p) => <div className="table-wrap"><table {...p} /></div>,
        code({ className, children, ...rest }) {
          const m = /language-(\w+)/.exec(className || "");
          const raw = String(children ?? "").replace(/\n$/, "");
          if (!m) return <code className={className} {...rest}>{children}</code>;
          return <Suspense fallback={<pre>{raw}</pre>}><CodeBlock lang={m[1] ?? ""} code={raw} /></Suspense>;
        },
      }}
    >{text}</ReactMarkdown>
  );
}

export default memo(function Markdown({ text, sources }: { text: string; sources?: Source[] }) {
  const fences = useMemo(() => splitFences(text), [text]);
  return (
    <div className="md">
      {fences.map((f, i) => {
        if (f.kind === "mermaid") return <Suspense key={i} fallback={<pre>{f.code}</pre>}><Mermaid code={f.code} /></Suspense>;
        if (f.kind === "chart") return <Suspense key={i} fallback={<pre>{f.code}</pre>}><ChartBlock code={f.code} /></Suspense>;
        if (f.kind === "viz") {
          if (f.vizType === "svg") return <InlineSvg key={i} raw={f.code} />;
          return <pre key={i} className="viz-fallback"><code>{f.code}</code></pre>;
        }
        if (f.kind === "code") {
          if (!f.lang) return <pre key={i}><code>{f.code}</code></pre>;
          return <Suspense key={i} fallback={<pre>{f.code}</pre>}><CodeBlock lang={f.lang} code={f.code} /></Suspense>;
        }
        return <MdChunk key={i} body={f.body} sources={sources} />;
      })}
    </div>
  );
});
