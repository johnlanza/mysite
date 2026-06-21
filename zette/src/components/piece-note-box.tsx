import Link from "next/link";

import type { Piece } from "@/lib/pieces";

type PieceNoteBoxProps = {
  piece: Piece;
  href: string;
  className?: string;
};

function attributionParts(piece: Piece) {
  const attribution = piece.attribution?.trim() || null;
  const context = piece.context?.trim() || null;
  const showContext =
    context &&
    context.length > 0 &&
    context.toLowerCase() !== (attribution ?? "").toLowerCase();

  return {
    attribution,
    context: showContext ? context : null,
    fallback: !attribution && !showContext ? piece.sourceDisplay : null,
  };
}

export function PieceNoteBox({
  piece,
  href,
  className = "",
}: PieceNoteBoxProps) {
  const { attribution, context, fallback } = attributionParts(piece);

  return (
    <Link
      className={`block w-full rounded-[1.25rem] border border-line bg-card/78 px-5 py-4 shadow-[0_12px_30px_rgba(89,64,34,0.05)] transition active:scale-[0.99] hover:border-accent/60 hover:bg-accent-soft/35 ${className}`}
      href={href}
    >
      <p className="font-serif text-[1.05rem] leading-snug text-foreground">
        {piece.text}
      </p>

      {piece.note ? (
        <div className="mt-4 border-l-2 border-accent-soft pl-3 text-[0.82rem] leading-6 text-muted">
          <p className="mb-1 text-[0.62rem] font-semibold uppercase tracking-[0.2em] text-accent/85">
            My note
          </p>
          <p>{piece.note}</p>
        </div>
      ) : null}

      <div className="mt-4 space-y-1">
        {attribution ? (
          <p className="font-sans text-[0.65rem] font-semibold uppercase tracking-[0.24em] text-muted">
            — {attribution}
          </p>
        ) : null}
        {context ? (
          <p className="font-serif text-[0.9rem] italic leading-snug text-muted">
            from {context}
          </p>
        ) : null}
        {fallback ? (
          <p className="font-sans text-[0.65rem] font-semibold uppercase tracking-[0.24em] text-muted">
            {fallback}
          </p>
        ) : null}
      </div>
    </Link>
  );
}
