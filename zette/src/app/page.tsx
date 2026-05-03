import { notFound } from "next/navigation";

import { HeroView } from "@/components/hero-view";
import { findEchoes } from "@/lib/echoes";
import { readEmbeddings } from "@/lib/embeddings";
import { findPieceById, pickDailySeed, readAllPieces } from "@/lib/pieces";

export const dynamic = "force-dynamic";

type HomePageProps = {
  searchParams: Promise<{ p?: string; e?: string; tag?: string }>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const [pieces, embeddings] = await Promise.all([
    readAllPieces(),
    readEmbeddings(),
  ]);

  if (pieces.length === 0) {
    notFound();
  }

  const tags = [...new Set(pieces.flatMap((piece) => piece.tags))].sort();
  const selectedTag = params.tag && tags.includes(params.tag) ? params.tag : null;
  const filteredPieces = selectedTag
    ? pieces.filter((piece) => piece.tags.includes(selectedTag))
    : pieces;
  const discoveryPieces = filteredPieces.length > 0 ? filteredPieces : pieces;
  const requested = params.p ? findPieceById(pieces, params.p) : null;
  const current = requested ?? pickDailySeed(discoveryPieces);
  const isSeed = !params.p;
  const echoesOpen = params.e === "1";
  const echoes = findEchoes(current, discoveryPieces, embeddings, 3);

  return (
    <HeroView
      piece={current}
      echoes={echoes}
      pieces={discoveryPieces}
      tags={tags}
      selectedTag={selectedTag}
      isSeed={isSeed}
      echoesOpen={echoesOpen}
    />
  );
}
