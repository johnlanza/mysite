import { notFound } from "next/navigation";

import { HeroView } from "@/components/hero-view";
import { findEchoes } from "@/lib/echoes";
import { readEmbeddings } from "@/lib/embeddings";
import {
  findPieceById,
  getDailyCardTimeZone,
  getDailySeedKey,
  pickDailySeedForDateKey,
  readBrowsePieces,
  readFeaturedPieces,
  readSearchPieces,
} from "@/lib/pieces";

export const dynamic = "force-dynamic";

type NowPageProps = {
  searchParams: Promise<{ p?: string; e?: string; tags?: string; day?: string }>;
};

export default async function NowPage({ searchParams }: NowPageProps) {
  const params = await searchParams;
  const [searchPieces, browsePieces, featuredPieces, embeddings] = await Promise.all([
    readSearchPieces(),
    readBrowsePieces(),
    readFeaturedPieces(),
    readEmbeddings(),
  ]);

  if (featuredPieces.length === 0) {
    notFound();
  }

  const tags = [...new Set(browsePieces.flatMap((piece) => piece.tags))].sort();
  const selectedTags = (params.tags ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tags.includes(tag));
  const dailySeedTimeZone = getDailyCardTimeZone();
  const dailySeedKey = getDailySeedKey(new Date(), dailySeedTimeZone);
  const drawDayKey = params.day?.trim() || null;
  const hasStaleDraw =
    Boolean(params.p) && Boolean(drawDayKey) && drawDayKey !== dailySeedKey;
  const requested =
    params.p && !hasStaleDraw ? findPieceById(searchPieces, params.p) : null;
  const current = requested ?? pickDailySeedForDateKey(featuredPieces, dailySeedKey);
  const isSeed = !requested;
  const echoesOpen = params.e === "1";
  const echoes = findEchoes(current, searchPieces, embeddings, 3);

  return (
    <HeroView
      piece={current}
      echoes={echoes}
      pieces={browsePieces}
      tags={tags}
      selectedTags={selectedTags}
      isSeed={isSeed}
      echoesOpen={echoesOpen}
      dailySeedKey={dailySeedKey}
      dailySeedTimeZone={dailySeedTimeZone}
      drawDayKey={requested && drawDayKey === dailySeedKey ? drawDayKey : null}
      shouldResetMainCardUrl={hasStaleDraw}
      dailyPath="/now"
    />
  );
}
