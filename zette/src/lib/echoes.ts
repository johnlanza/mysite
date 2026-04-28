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

type ScoredPiece = { piece: Piece; score: number };

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
    if (sim > 0.35) scored.push({ piece, score: sim });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

function rankByKeywords(source: Piece, candidates: Piece[]): ScoredPiece[] {
  const sourceTokens = tokenize(source.text);
  const sourceTags = new Set(source.tags.map((t) => t.toLowerCase()));
  const sourceAttribution = source.attribution?.toLowerCase().trim() ?? "";

  const scored = candidates
    .map((piece) => {
      const pieceTokens = tokenize(piece.text);
      let tokenOverlap = 0;
      for (const t of pieceTokens) {
        if (sourceTokens.has(t)) tokenOverlap += 1;
      }

      let tagOverlap = 0;
      for (const t of piece.tags) {
        if (sourceTags.has(t.toLowerCase())) tagOverlap += 1;
      }

      let attributionBoost = 0;
      if (
        sourceAttribution &&
        piece.attribution?.toLowerCase().trim() === sourceAttribution
      ) {
        attributionBoost = 2;
      }

      const score = tokenOverlap + tagOverlap * 4 + attributionBoost;
      return { piece, score };
    })
    .filter((x) => x.score >= 3);

  scored.sort((a, b) => b.score - a.score);
  return scored;
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

  return ranked.slice(0, limit).map((x) => x.piece);
}
