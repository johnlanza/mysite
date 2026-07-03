import { cosineSimilarity, type EmbeddingsIndex } from "./embeddings";
import type { Piece } from "./pieces";

const STOPWORDS = new Set([
  "about", "above", "after", "again", "against", "also", "always", "among",
  "another", "around", "because", "been", "before", "behind", "being",
  "below", "between", "both", "cannot", "could", "does", "doing", "done",
  "down", "during", "each", "either", "enough", "even", "ever", "every",
  "first", "from", "further", "gets", "give", "given", "going", "gone",
  "have", "having", "here", "hers", "himself", "into", "itself", "just",
  "keep", "kept", "know", "known", "lets", "like", "made", "make", "makes",
  "making", "many", "might", "more", "most", "much", "must", "myself",
  "never", "none", "nothing", "often", "only", "other", "others", "ourselves",
  "over", "quite", "rather", "said", "same", "says", "should", "since",
  "some", "something", "still", "such", "take", "taken", "takes", "taking",
  "than", "that", "their", "them", "themselves", "then", "there", "these",
  "they", "thing", "things", "think", "this", "those", "though", "through",
  "thus", "together", "under", "until", "upon", "very", "want", "wants",
  "were", "what", "when", "where", "whether", "which", "while", "whom",
  "whose", "will", "with", "within", "without", "would", "your", "yours",
  "yourself", "youre", "youve", "theyre", "weve", "dont", "doesnt", "didnt",
  "wont", "wouldnt", "couldnt", "shouldnt", "isnt", "arent", "wasnt",
  "werent", "hasnt", "havent", "hadnt",
]);

function tokenize(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 3 && !STOPWORDS.has(t));

  return new Set(tokens);
}

type ConnectionSignals = {
  sharesSource: boolean;
  sharesAttribution: boolean;
  sourceKey: string;
  tokenOverlap: number;
  tokenSignal: number;
  tagSignal: number;
};

type ScoredPiece = {
  piece: Piece;
  score: number;
  sharesSource: boolean;
  sourceKey: string;
};

function normalizeKey(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function getSourceKey(piece: Piece): string {
  return (
    normalizeKey(piece.context) ||
    normalizeKey(piece.sourceDisplay) ||
    normalizeKey(piece.originFile)
  );
}

function getOriginFileKey(piece: Piece): string {
  return normalizeKey(piece.originFile);
}

function getAttributionKey(piece: Piece): string {
  return normalizeKey(piece.attribution);
}

function getContentTokens(piece: Piece): Set<string> {
  return tokenize([piece.text, piece.note, piece.tags.join(" ")]
    .filter(Boolean)
    .join(" "));
}

function getTagTokens(piece: Piece): Set<string> {
  return new Set(piece.tags.map(normalizeKey).filter(Boolean));
}

function overlapCount(a: Set<string>, b: Set<string>): number {
  let count = 0;
  for (const token of a) {
    if (b.has(token)) count += 1;
  }
  return count;
}

function overlapSignal(
  overlap: number,
  a: Set<string>,
  b: Set<string>,
): number {
  if (overlap === 0 || a.size === 0 || b.size === 0) return 0;
  return overlap / Math.min(a.size, b.size);
}

function comparePieces(source: Piece, piece: Piece): ConnectionSignals {
  const sourceKey = getSourceKey(source);
  const pieceSourceKey = getSourceKey(piece);
  const sourceOriginKey = getOriginFileKey(source);
  const pieceOriginKey = getOriginFileKey(piece);
  const sourceAttributionKey = getAttributionKey(source);
  const pieceAttributionKey = getAttributionKey(piece);
  const sourceTokens = getContentTokens(source);
  const pieceTokens = getContentTokens(piece);
  const sourceTags = getTagTokens(source);
  const pieceTags = getTagTokens(piece);
  const tokenOverlap = overlapCount(sourceTokens, pieceTokens);
  const tagOverlap = overlapCount(sourceTags, pieceTags);

  return {
    sharesSource:
      Boolean(sourceKey && pieceSourceKey && sourceKey === pieceSourceKey) ||
      Boolean(sourceOriginKey && pieceOriginKey && sourceOriginKey === pieceOriginKey),
    sharesAttribution: Boolean(
      sourceAttributionKey &&
        pieceAttributionKey &&
        sourceAttributionKey === pieceAttributionKey,
    ),
    sourceKey: pieceSourceKey || pieceOriginKey,
    tokenOverlap,
    tokenSignal: overlapSignal(tokenOverlap, sourceTokens, pieceTokens),
    tagSignal: overlapSignal(tagOverlap, sourceTags, pieceTags),
  };
}

function scoreWithSignals(baseScore: number, signals: ConnectionSignals): number {
  let score = baseScore;
  score += signals.tokenSignal * 0.08;
  score += signals.tagSignal * 0.07;

  if (signals.sharesSource) {
    score -= 0.1;
  } else {
    score += 0.04;
  }

  if (signals.sharesAttribution) {
    score -= 0.025;
  }

  return score;
}

function rankByEmbeddings(
  source: Piece,
  candidates: Piece[],
  embeddings: EmbeddingsIndex,
): ScoredPiece[] {
  const sourceVec = embeddings.byId.get(source.id);
  if (!sourceVec) return [];

  const scored: ScoredPiece[] = [];
  for (const piece of candidates) {
    const vec = embeddings.byId.get(piece.id);
    if (!vec) continue;
    const sim = cosineSimilarity(sourceVec, vec);
    if (sim < 0.3) continue;

    const signals = comparePieces(source, piece);
    scored.push({
      piece,
      score: scoreWithSignals(sim, signals),
      sharesSource: signals.sharesSource,
      sourceKey: signals.sourceKey,
    });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

function rankByKeywords(source: Piece, candidates: Piece[]): ScoredPiece[] {
  const scored = candidates
    .map((piece) => {
      const signals = comparePieces(source, piece);
      const baseScore = signals.tokenSignal + signals.tagSignal * 0.7;
      return {
        piece,
        score: scoreWithSignals(baseScore, signals),
        sharesSource: signals.sharesSource,
        sourceKey: signals.sourceKey,
        tokenOverlap: signals.tokenOverlap,
      };
    })
    .filter((x) => x.tokenOverlap >= 2 || x.score >= 0.22)
    .map(({ piece, score, sharesSource, sourceKey }) => ({
      piece,
      score,
      sharesSource,
      sourceKey,
    }));

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

function selectDiverseEchoes(
  source: Piece,
  ranked: ScoredPiece[],
  limit: number,
): Piece[] {
  const selected: ScoredPiece[] = [];
  const selectedIds = new Set<string>();
  const selectedSourceKeys = new Set<string>();
  const bestSameSource = ranked.find((candidate) => candidate.sharesSource);
  const bestCrossSource = ranked.find((candidate) => !candidate.sharesSource);

  const add = (candidate: ScoredPiece, allowSourceRepeat = false): boolean => {
    if (selectedIds.has(candidate.piece.id)) return false;
    if (
      !allowSourceRepeat &&
      candidate.sourceKey &&
      selectedSourceKeys.has(candidate.sourceKey)
    ) {
      return false;
    }

    selected.push(candidate);
    selectedIds.add(candidate.piece.id);
    if (candidate.sourceKey) selectedSourceKeys.add(candidate.sourceKey);
    return true;
  };

  if (
    bestSameSource &&
    (!bestCrossSource || bestSameSource.score >= bestCrossSource.score + 0.08)
  ) {
    add(bestSameSource);
  }

  for (const candidate of ranked) {
    if (selected.length >= limit) break;
    if (candidate.sharesSource) continue;
    add(candidate);
  }

  for (const candidate of ranked) {
    if (selected.length >= limit) break;
    add(candidate);
  }

  for (const candidate of ranked) {
    if (selected.length >= limit) break;
    add(candidate, true);
  }

  return selected
    .filter((candidate) => candidate.piece.id !== source.id)
    .slice(0, limit)
    .map((candidate) => candidate.piece);
}

export function findEchoes(
  source: Piece,
  all: Piece[],
  embeddings: EmbeddingsIndex | null,
  limit = 3,
): Piece[] {
  const candidates = all.filter(
    (p) => p.id !== source.id && p.text.length >= 30,
  );

  const ranked =
    embeddings && embeddings.byId.has(source.id)
      ? rankByEmbeddings(source, candidates, embeddings)
      : rankByKeywords(source, candidates);

  return selectDiverseEchoes(source, ranked, limit);
}
