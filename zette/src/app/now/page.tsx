import { notFound } from "next/navigation";

import { HeroView } from "@/components/hero-view";
import { findEchoes } from "@/lib/echoes";
import { readEmbeddings } from "@/lib/embeddings";
import { findPieceById, pickDailySeed, readAllPieces } from "@/lib/pieces";

export const dynamic = "force-dynamic";

type NowPageProps = {
  searchParams: Promise<{ p?: string; e?: string }>;
};

export default async function NowPage({ searchParams }: NowPageProps) {
  const params = await searchParams;
  const [pieces, embeddings] = await Promise.all([
    readAllPieces(),
    readEmbeddings(),
  ]);

  if (pieces.length === 0) {
    notFound();
  }

  const requested = params.p ? findPieceById(pieces, params.p) : null;
  const current = requested ?? pickDailySeed(pieces);
  const isSeed = !params.p;
  const echoesOpen = params.e === "1";
  const echoes = findEchoes(current, pieces, embeddings, 3);

  return (
    <HeroView
      piece={current}
      echoes={echoes}
      isSeed={isSeed}
      echoesOpen={echoesOpen}
    />
  );
}
