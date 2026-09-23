import { Suspense, lazy, useState } from "react";
import type { Artifact, ArtifactVersion } from "../lib/store";

const Mermaid = lazy(() => import("./Mermaid").then((m) => ({ default: m.Mermaid })));

function CodeView({ code, language }: { code: string; language: string }) {
  return <pre style={{ margin: 0, padding: 16, overflow: "auto" }}><code>{code}</code><div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 8 }}>{language}</div></pre>;
}
function ArtifactPreview({ type, content }: { type: string; content: string }) {
  if (type === "html" || type === "svg") {
    return (
      <iframe
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        {...{ csp: "default-src 'none'; style-src 'unsafe-inline'; img-src data:" }}
        srcDoc={content}
        className="artifact-iframe"
        title="Artifact preview"
      />
    );
  }
  if (type === "markdown") {
    // simple markdown fallback — reuse same container styling
    return <div style={{ padding: 16, whiteSpace: "pre-wrap", fontSize: 14 }}>{content}</div>;
  }
  if (type === "mermaid" || content.trim().startsWith("xychart")) {
    return <div style={{ padding: 16 }}><Suspense fallback={<pre>{content}</pre>}><Mermaid code={content} /></Suspense></div>;
  }
  return <CodeView code={content} language={type} />;
}
function VersionScrubber({ versions, index, onChange }: { versions: Artifact["versions"]; index: number; onChange: (i: number) => void }) {
  if (versions.length <= 1) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: "1px solid var(--line)" }}>
      <span style={{ fontSize: 12, color: "var(--ink-3)" }}>v{index + 1}/{versions.length}</span>
      <input type="range" min={0} max={versions.length - 1} value={index} onChange={(e) => onChange(Number(e.target.value))} style={{ flex: 1 }} />
    </div>
  );
}
export default function ArtifactPanel({ artifact, onClose }: { artifact: Artifact; onClose: () => void }) {
  const [view, setView] = useState<"preview" | "code">("preview");
  // Follow the latest unless the user scrubbed back (pinned). No setState
  // during render; combined with key={artifact.id} this never shows stale v1.
  const [pinned, setPinned] = useState<number | null>(null);
  const lastIdx = artifact.versions.length - 1;
  const versionIdx = pinned === null || pinned > lastIdx ? lastIdx : pinned;
  const version: ArtifactVersion = artifact.versions[versionIdx] || artifact.versions[lastIdx] || { version: 0, content: "", createdAt: "" };
  return (
    <div className="artifact-panel">
      <div className="artifact-panel__header">
        <span className="artifact-panel__title">{artifact.title}</span>
        <div className="artifact-panel__tabs">
          <button onClick={() => setView("preview")} aria-pressed={view === "preview"}>Preview</button>
          <button onClick={() => setView("code")} aria-pressed={view === "code"}>Code</button>
          <button onClick={onClose} aria-label="Close artifact" style={{ marginLeft: 8 }}>✕</button>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <VersionScrubber versions={artifact.versions} index={versionIdx} onChange={setPinned} />
        </div>
        {pinned !== null && pinned < lastIdx && (
          <button className="mini-btn" onClick={() => setPinned(null)}>Latest</button>
        )}
      </div>
      <div className="artifact-panel__body">
        {view === "preview" ? <ArtifactPreview type={artifact.artifactType} content={version.content} /> : <CodeView code={version.content} language={artifact.artifactType} />}
      </div>
    </div>
  );
}
