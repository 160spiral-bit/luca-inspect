import { Mermaid } from "./Mermaid";

interface ChartAnnotation { x: string; label: string }
interface ChartSpec { type: "bar" | "line" | "pie"; labels: string[]; values: number[]; title?: string; annotations?: ChartAnnotation[] }

export default function ChartBlock({ code }: { code: string }) {
  // xychart-beta is mermaid, not JSON chart — delegate to Mermaid with logging
  if (code.trim().startsWith("xychart-beta") || code.trim().startsWith("xychart")) {
    console.warn("[viz] ChartBlock received xychart mermaid syntax, delegating to Mermaid:", code.slice(0, 80));
    return <Mermaid code={code} />;
  }
  let spec: ChartSpec | null = null;
  try {
    let j = JSON.parse(code);
    if (j && j.data && Array.isArray(j.data.labels)) j = { type: j.type, labels: j.data.labels, values: j.data.values, title: j.title, annotations: j.annotations };
    if (j && (j.type === "bar" || j.type === "line" || j.type === "pie") &&
        Array.isArray(j.labels) && Array.isArray(j.values) && j.labels.length > 0) {
      const n = Math.min(j.labels.length, j.values.length, 8);
      const labels = j.labels.slice(0, n).map((l: unknown) => String(l));
      const values = j.values.slice(0, n).map((v: unknown) => Number(v)).filter((v: number) => Number.isFinite(v));
      if (values.length === n && n > 0) {
        let annotations: ChartAnnotation[] | undefined;
        if (Array.isArray(j.annotations)) {
          annotations = j.annotations
            .filter((a: unknown) => a && typeof (a as ChartAnnotation).x !== "undefined" && typeof (a as ChartAnnotation).label === "string")
            .slice(0, 5)
            .map((a: ChartAnnotation) => ({ x: String(a.x), label: String(a.label).slice(0, 60) }));
          if (annotations && !annotations.length) annotations = undefined;
        }
        spec = { type: j.type, labels, values, title: typeof j.title === "string" ? j.title : undefined, annotations };
      }
    }
  } catch (err) {
    console.error("[viz] ChartBlock JSON parse failed:", err, "code:", code.slice(0, 200));
  }
  if (!spec) {
    console.error("[viz] ChartBlock invalid spec, falling back to code:", code.slice(0, 200));
    return <pre><code>{code}</code></pre>;
  }
  const W = 560, H = 300, padL = 40, padB = 30, padT = 16;
  const plotW = W - padL - 12, plotH = H - padT - padB;
  const max = Math.max(...spec.values, 0) || 1;
  const X = (i: number) => padL + (plotW * (spec!.type === "line" ? i / Math.max(spec!.values.length - 1, 1) : (i + 0.5) / spec!.values.length));
  const Y = (v: number) => padT + plotH - (plotH * v) / max;
  const short = (l: string) => (l.length > 10 ? l.slice(0, 9) + "…" : l);
  // Event annotations: dashed vertical line at the matching x label with a
  // rotated text label. Bar/line only — meaningless on pie.
  const annotationLayer = spec.annotations && spec.type !== "pie" ? (
    <g>
      {spec.annotations.map((a, k) => {
        const i = spec!.labels.findIndex((l) => l === a.x);
        if (i < 0) return null;
        const lbl = a.label.length > 24 ? a.label.slice(0, 23) + "…" : a.label;
        return (
          <g key={k}>
            <title>{a.label}</title>
            <line x1={X(i)} x2={X(i)} y1={padT} y2={padT + plotH} style={{ stroke: "var(--ink-3)" }} strokeWidth={1} strokeDasharray="4 4" />
            <text x={X(i) + 5} y={padT + 5} fontSize={10} transform={`rotate(90 ${X(i) + 5} ${padT + 5})`} style={{ fill: "var(--ink-2)" }}>{lbl}</text>
          </g>
        );
      })}
    </g>
  ) : null;
  let body: React.ReactNode = null;
  if (spec.type === "bar") {
    const bw = (plotW / spec.values.length) * 0.55;
    body = (
      <g>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={padL} x2={W - 12} y1={padT + plotH * (1 - f)} y2={padT + plotH * (1 - f)} style={{ stroke: "var(--line-strong)", strokeWidth: 1 }} />
        ))}
        {spec.values.map((v, i) => (
          <g key={i}>
            <title>{spec!.labels[i]}: {v}</title>
            <rect x={X(i) - bw / 2} y={Y(v)} width={bw} height={Math.max(padT + plotH - Y(v), 2)} rx={3} style={{ fill: "var(--ink-2)" }} />
            <text x={X(i)} y={H - 8} textAnchor="middle" fontSize={10} style={{ fill: "var(--ink-3)" }}>{short(spec!.labels[i] ?? "")}</text>
          </g>
        ))}
        {annotationLayer}
      </g>
    );
  } else if (spec.type === "line") {
    const pts = spec.values.map((v, i) => `${X(i)},${Y(v)}`).join(" ");
    body = (
      <g>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={padL} x2={W - 12} y1={padT + plotH * (1 - f)} y2={padT + plotH * (1 - f)} style={{ stroke: "var(--line-strong)", strokeWidth: 1 }} />
        ))}
        <polyline points={pts} fill="none" style={{ stroke: "var(--ink)", strokeWidth: 2 }} strokeLinejoin="round" strokeLinecap="round" />
        {spec.values.map((v, i) => (
          <g key={i}>
            <title>{spec!.labels[i]}: {v}</title>
            <circle cx={X(i)} cy={Y(v)} r={3.5} style={{ fill: "var(--ink)" }} />
            <text x={X(i)} y={H - 8} textAnchor="middle" fontSize={10} style={{ fill: "var(--ink-3)" }}>{short(spec!.labels[i] ?? "")}</text>
          </g>
        ))}
        {annotationLayer}
      </g>
    );
  } else {
    const total = spec.values.reduce((a, b) => a + b, 0) || 1;
    const cx = 150, cy = H / 2, r = 95;
    let ang = -Math.PI / 2;
    const shades = [0.9, 0.7, 0.55, 0.42, 0.32, 0.24, 0.18, 0.12];
    body = (
      <g>
        {spec.values.map((v, i) => {
          const a0 = ang, a1 = ang + (v / total) * Math.PI * 2;
          ang = a1;
          const large = a1 - a0 > Math.PI ? 1 : 0;
          const d = `M ${cx} ${cy} L ${cx + r * Math.cos(a0)} ${cy + r * Math.sin(a0)} A ${r} ${r} 0 ${large} 1 ${cx + r * Math.cos(a1)} ${cy + r * Math.sin(a1)} Z`;
          return (
            <g key={i}>
              <title>{spec.labels[i]}: {v}</title>
              <path d={d} style={{ fill: "var(--ink)", opacity: shades[i % shades.length], stroke: "var(--bg)", strokeWidth: 2 }} />
            </g>
          );
        })}
        {spec.labels.map((l, i) => (
          <g key={i}>
            <rect x={280} y={40 + i * 26} width={12} height={12} rx={3} style={{ fill: "var(--ink)", opacity: shades[i % shades.length] }} />
            <text x={300} y={50 + i * 26} fontSize={12} style={{ fill: "var(--ink-2)" }}>{short(l)} ({spec!.values[i]})</text>
          </g>
        ))}
      </g>
    );
  }
  return (
    <div className="chart-block">
      {spec.title && <div className="chart-title">{spec.title}</div>}
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={spec.title || "chart"}>{body}</svg>
    </div>
  );
}
