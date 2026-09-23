import { useMemo } from "react";

// Brand spark: main flare + small satellite spark. Twinkle runs on CSS
// keyframes (GPU-composited, randomised per mount) instead of the old
// setTimeout chains that wrote el.style on the main thread.
export default function Logo({ size = 18, twinkle = false }: { size?: number; twinkle?: boolean }) {
  const motion = useMemo(() => {
    if (!twinkle) return null;
    try {
      if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return null;
    } catch {
      /* fall through */
    }
    return {
      main: { animationDelay: `${(Math.random() * 1.6).toFixed(2)}s`, animationDuration: `${(2.2 + Math.random() * 1.2).toFixed(2)}s` },
      small: { animationDelay: `${(Math.random() * 1.4).toFixed(2)}s`, animationDuration: `${(1.8 + Math.random() * 1).toFixed(2)}s` },
    };
  }, [twinkle]);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ overflow: "visible" }} aria-hidden="true">
      <path
        fill="currentColor"
        className={motion ? "logo-flare" : undefined}
        style={motion ? { ...motion.main, opacity: 0.85 } : { opacity: 0.85 }}
        d="M12 3c.3 2.8 1 4.7 2.1 5.9C15.3 10 17.2 10.7 20 11c-2.8.3-4.7 1-5.9 2.1C12.9 14.3 12.2 16.2 12 19c-.3-2.8-1-4.7-2.1-5.9C8.7 12 6.8 11.3 4 11c2.8-.3 4.7-1 5.9-2.1C11 7.7 11.7 5.8 12 3z"
      />
      <path
        fill="currentColor"
        opacity="0.5"
        className={motion ? "logo-twinkle" : undefined}
        style={motion ? motion.small : undefined}
        d="M19 2c.15 1.3.5 2.2 1 2.7.5.5 1.4.85 2.7 1-1.3.15-2.2.5-2.7 1-.5.5-.85 1.4-1 2.7-.15-1.3-.5-2.2-1-2.7C17.5 6.2 16.6 5.85 15.3 5.7c1.3-.15 2.2-.5 2.7-1 .5-.5.85-1.4 1-2.7z"
      />
    </svg>
  );
}
