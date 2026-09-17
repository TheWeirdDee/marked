/**
 * Product repair — original Marked symbol, replacing Gate 9R's first mark
 * with a more distinctive construction. Three strokes — standing in for
 * Authorized / Executed / Observed, the product's own three-truths idea —
 * fall from three separated points and converge on a single vertex; a
 * fourth, shorter stroke continues past that vertex as the mark itself,
 * the decisive act that only happens once the three truths reconcile.
 * The outer two strokes bend on the way down (so the silhouette also
 * reads as an M at a glance), the middle one falls straight, and the tail
 * breaks the symmetry so it never collapses into a generic checkmark,
 * chevron, or arrow. Built as plain stroked line segments (no fills, no
 * gradients, one weight) so it stays legible at 16-24px and works in a
 * single color.
 */
export function MarkedMark({ className = "", size = 24 }: { className?: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="Marked"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M8,8 L8,24 L24,38 M24,8 L24,38 M40,8 L40,24 L24,38 M24,38 L32,46"
        fill="none"
        stroke="currentColor"
        strokeWidth={6}
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    </svg>
  );
}

export function MarkedWordmark({ className = "", markClassName = "text-[var(--accent)]" }: { className?: string; markClassName?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <MarkedMark size={22} className={markClassName} />
      <span className="font-display text-lg font-bold uppercase tracking-[0.06em]">Marked</span>
    </span>
  );
}
