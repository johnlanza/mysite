type ThemeRule = {
  label: string;
  terms: string[];
};

type CredibilityRule = {
  label: string;
  terms: string[];
  weight: number;
};

type CredibilityLevel = 'Strong' | 'Adequate' | 'Watchlist';
type VettingLevel = 'Strong' | 'Adequate' | 'Thin';

type WeightedText = {
  text: string;
  weight: number;
  title?: string;
  status?: 'pending' | 'discussed';
  sourceKey?: string;
};

type ApplePodcastResult = {
  collectionId?: number;
  collectionName?: string;
  trackId?: number;
  trackName?: string;
  artistName?: string;
  collectionViewUrl?: string;
  trackViewUrl?: string;
  episodeUrl?: string;
  feedUrl?: string;
  primaryGenreName?: string;
  genres?: string[];
  trackCount?: number;
  trackTimeMillis?: number;
  releaseDate?: string;
  shortDescription?: string;
  description?: string;
  searchRank?: number;
};

export type IntelligencePodcastInput = {
  _id: string;
  title: string;
  host?: string;
  episodeNames?: string;
  notes?: string;
  status: 'pending' | 'discussed';
  link?: string;
  totalTimeMinutes?: number;
  rankingScore?: number;
  missingVoters?: string[];
  ratings?: { value: string; points: number }[];
  submittedBy?: { name: string };
  createdAt?: string;
  discussedMeetingDate?: string | null;
  meetingNotes?: string[];
};

export type IntelligenceCarveOutInput = {
  _id: string;
  title: string;
  type: string;
  service?: string;
  url?: string;
  notes?: string;
  member?: { name: string };
  meeting?: { date: string };
  fistBumps?: { member: { name: string } }[];
  createdAt?: string;
};

export type IntelligenceRecommendation = {
  id: string;
  title: string;
  subtitle: string;
  href?: string;
  score: number;
  confidence: 'High' | 'Medium' | 'Exploratory';
  badges: string[];
  themes: string[];
  reasons: string[];
  notesPreview?: string;
  credibility?: {
    level: CredibilityLevel;
    score: number;
    reasons: string[];
  };
  vetting?: {
    level: VettingLevel;
    score: number;
    reasons: string[];
  };
};

export type IntelligenceReport = {
  generatedAt: string;
  sourceStatus: {
    podcasts: string;
    carveOuts: string;
  };
  stats: {
    podcastsReviewed: number;
    discussedPodcastsWeighted: number;
    pendingPodcastsWeighted: number;
    podcastNotesReviewed: number;
    meetingNotesReviewed: number;
    carveOutsReviewed: number;
    fistBumpedCarveOutsWeighted: number;
  };
  profile: {
    topThemes: string[];
    topTerms: string[];
    discoveryQueries: string[];
  };
  podcasts: IntelligenceRecommendation[];
  carveOuts: IntelligenceRecommendation[];
};

const STOP_WORDS = new Set([
  'about',
  'after',
  'again',
  'also',
  'and',
  'are',
  'because',
  'been',
  'but',
  'can',
  'could',
  'did',
  'does',
  'episode',
  'episodes',
  'for',
  'from',
  'had',
  'has',
  'have',
  'his',
  'how',
  'into',
  'its',
  'just',
  'like',
  'more',
  'not',
  'now',
  'one',
  'our',
  'out',
  'over',
  'podcast',
  'podcasts',
  'show',
  'shows',
  'she',
  'that',
  'the',
  'their',
  'them',
  'then',
  'there',
  'this',
  'through',
  'was',
  'what',
  'when',
  'where',
  'who',
  'why',
  'with',
  'you',
  'your'
]);

const THEME_RULES: ThemeRule[] = [
  {
    label: 'Human behavior',
    terms: ['behavior', 'brain', 'family', 'habit', 'habits', 'human', 'mind', 'psychology', 'relationship', 'relationships']
  },
  {
    label: 'Story and culture',
    terms: ['art', 'book', 'culture', 'film', 'interview', 'media', 'music', 'narrative', 'story', 'stories', 'writer']
  },
  {
    label: 'Business and work',
    terms: ['brand', 'business', 'company', 'creative', 'founder', 'leadership', 'marketing', 'startup', 'work']
  },
  {
    label: 'Science and technology',
    terms: ['ai', 'climate', 'data', 'internet', 'medicine', 'science', 'space', 'technology', 'tech']
  },
  {
    label: 'History and power',
    terms: ['america', 'government', 'history', 'historical', 'justice', 'politics', 'power', 'war']
  },
  {
    label: 'Money and economics',
    terms: ['economics', 'economy', 'finance', 'investing', 'market', 'money', 'wealth']
  },
  {
    label: 'Mystery and investigation',
    terms: ['crime', 'detective', 'investigation', 'mystery', 'scandal', 'secret', 'true crime']
  },
  {
    label: 'Comedy and offbeat',
    terms: ['comedy', 'funny', 'humor', 'odd', 'strange', 'weird']
  }
];

const APPLE_SEARCH_LIMIT = 12;
const MAX_DISCOVERY_QUERIES = 7;
const MIN_DISCUSSION_DURATION_MINUTES = 50;
const IDEAL_MAX_DISCUSSION_DURATION_MINUTES = 130;
const MAX_PROFILE_SOURCE_WEIGHT = 22;
const EMPTY_TERM_SET = new Set<string>();
const LOW_SIGNAL_GENRES = new Set(['society & culture', 'society and culture']);
const CREDIBILITY_BASELINE = 58;

const CREDIBILITY_GRAVITAS_RULES: CredibilityRule[] = [
  {
    label: 'research or evidence',
    terms: [
      'academic',
      'data',
      'evidence',
      'experiment',
      'peer reviewed',
      'professor',
      'research',
      'researcher',
      'science',
      'scientist',
      'study',
      'studies'
    ],
    weight: 7
  },
  {
    label: 'historical grounding',
    terms: ['archive', 'archives', 'biography', 'historian', 'historical', 'history', 'oral history', 'primary source', 'records'],
    weight: 6
  },
  {
    label: 'reported or documentary framing',
    terms: ['documentary', 'documents', 'interview', 'investigation', 'investigative', 'journalist', 'longform', 'reported', 'reporting'],
    weight: 5
  },
  {
    label: 'skeptical review',
    terms: ['debunk', 'debunked', 'fact check', 'fact-check', 'misinformation', 'myth', 'scrutiny', 'skeptical', 'verification'],
    weight: 8
  }
];

const CREDIBILITY_RISK_RULES: CredibilityRule[] = [
  {
    label: 'miracle or health-cure claims',
    terms: [
      'anti aging',
      'biohack cure',
      'cure cancer',
      'cures cancer',
      'detox',
      'frequency healing',
      'miracle cure',
      'quantum healing',
      'secret cure'
    ],
    weight: 22
  },
  {
    label: 'unsupported pseudo-history or pseudo-science',
    terms: [
      'ancient aliens',
      'free energy',
      'lost civilization proves',
      'moon landing hoax',
      'proof of aliens',
      'rewrite history',
      'suppressed archaeology'
    ],
    weight: 18
  },
  {
    label: 'conspiratorial framing',
    terms: [
      'cabal',
      'deep state',
      'false flag',
      'globalists',
      'illuminati',
      'mainstream media won t tell you',
      'plandemic',
      'they don t want you to know'
    ],
    weight: 18
  },
  {
    label: 'guru-style certainty',
    terms: [
      'forbidden truth',
      'get rich',
      'guaranteed wealth',
      'law of attraction',
      'manifest anything',
      'red pill',
      'secret system',
      'secret truth',
      'truth bomb'
    ],
    weight: 14
  },
  {
    label: 'overheated claim language',
    terms: ['banned', 'cover up', 'cover-up', 'exposed', 'exposes', 'hidden truth', 'hoax', 'shocking truth', 'suppressed', 'truth about', 'wake up'],
    weight: 8
  }
];

function compactText(parts: Array<string | undefined | null>) {
  return parts
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' ');
}

function tokenize(text: string, ignoredTerms: Set<string> = EMPTY_TERM_SET) {
  return (text.toLowerCase().match(/[a-z][a-z0-9']{2,}/g) || []).filter(
    (token) => !STOP_WORDS.has(token) && !ignoredTerms.has(token)
  );
}

function normalizeKey(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getWeightedTopTerms(items: WeightedText[], limit: number, ignoredTerms: Set<string> = EMPTY_TERM_SET) {
  const counts = new Map<string, number>();

  items.forEach((item) => {
    tokenize(item.text, ignoredTerms).forEach((token) => {
      counts.set(token, (counts.get(token) || 0) + item.weight);
    });
  });

  return [...counts.entries()]
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })
    .slice(0, limit)
    .map(([term]) => term);
}

function getDiversifiedTopTerms(items: WeightedText[], limit: number, ignoredTerms: Set<string> = EMPTY_TERM_SET) {
  const stats = new Map<string, { score: number; sourceKeys: Set<string> }>();
  const sourceKeys = new Set(items.map((item, index) => item.sourceKey || item.title || `source-${index}`));

  items.forEach((item, index) => {
    const sourceKey = item.sourceKey || item.title || `source-${index}`;
    tokenize(item.text, ignoredTerms).forEach((token) => {
      const current = stats.get(token) || { score: 0, sourceKeys: new Set<string>() };
      current.score += item.weight;
      current.sourceKeys.add(sourceKey);
      stats.set(token, current);
    });
  });

  const entries = [...stats.entries()];
  const multiSourceEntries = entries.filter(([, stat]) => stat.sourceKeys.size > 1);
  const preferMultiSource = sourceKeys.size >= 3 && multiSourceEntries.length >= Math.min(5, limit);

  const rankedEntries = entries
    .map(([term, stat]) => {
      const sourceCount = stat.sourceKeys.size;
      const diversityBoost = 1 + Math.min(4, sourceCount) * 0.22;
      const singleSourcePenalty = sourceCount > 1 || !preferMultiSource ? 1 : 0.28;
      return {
        term,
        sourceCount,
        adjustedScore: stat.score * diversityBoost * singleSourcePenalty
      };
    })
    .sort((a, b) => {
      if (b.adjustedScore !== a.adjustedScore) return b.adjustedScore - a.adjustedScore;
      if (b.sourceCount !== a.sourceCount) return b.sourceCount - a.sourceCount;
      return a.term.localeCompare(b.term);
    });
  const preferredEntries = preferMultiSource ? rankedEntries.filter((entry) => entry.sourceCount > 1) : rankedEntries;
  const fallbackEntries = preferMultiSource ? rankedEntries.filter((entry) => entry.sourceCount === 1) : [];
  const selectedEntries =
    preferMultiSource && preferredEntries.length >= Math.min(5, limit) ? preferredEntries : [...preferredEntries, ...fallbackEntries];

  return selectedEntries
    .slice(0, limit)
    .map((entry) => entry.term);
}

function getTopTerms(text: string, limit: number, ignoredTerms: Set<string> = EMPTY_TERM_SET) {
  return getWeightedTopTerms([{ text, weight: 1 }], limit, ignoredTerms);
}

function getThemeScores(text: string) {
  const normalized = text.toLowerCase();

  return THEME_RULES.map((theme) => ({
    label: theme.label,
    score: theme.terms.reduce((total, term) => (normalized.includes(term) ? total + 1 : total), 0)
  }))
    .filter((theme) => theme.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.label.localeCompare(b.label);
    });
}

function getConfidence(score: number): IntelligenceRecommendation['confidence'] {
  if (score >= 82) return 'High';
  if (score >= 58) return 'Medium';
  return 'Exploratory';
}

function normalizeCredibilityText(text: string) {
  return ` ${text
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9']+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\bwon't\b/g, 'won t')
    .replace(/\bdon't\b/g, 'don t')} `;
}

function getCredibilityRuleHits(text: string, rules: CredibilityRule[]) {
  const normalizedText = normalizeCredibilityText(text);

  return rules
    .map((rule) => {
      const matchedTerms = rule.terms.filter((term) => {
        const normalizedTerm = normalizeCredibilityText(term).trim();
        return normalizedTerm.length > 0 && normalizedText.includes(` ${normalizedTerm} `);
      });

      return matchedTerms.length > 0
        ? {
            label: rule.label,
            weight: rule.weight,
            matchedTerms
          }
        : null;
    })
    .filter((hit): hit is { label: string; weight: number; matchedTerms: string[] } => Boolean(hit));
}

function getCredibilityAssessment(text: string) {
  const gravitasHits = getCredibilityRuleHits(text, CREDIBILITY_GRAVITAS_RULES);
  const riskHits = getCredibilityRuleHits(text, CREDIBILITY_RISK_RULES);
  const gravitasScore = Math.min(36, gravitasHits.reduce((total, hit) => total + hit.weight, 0));
  const riskScore = Math.min(60, riskHits.reduce((total, hit) => total + hit.weight, 0));
  const hasSkepticalContext = gravitasHits.some((hit) => hit.label === 'skeptical review');
  const score = Math.max(0, Math.min(100, CREDIBILITY_BASELINE + gravitasScore + (hasSkepticalContext ? 8 : 0) - riskScore));
  const unsupportedMajorClaim = riskHits.some((hit) => hit.weight >= 18) && gravitasScore < 8 && !hasSkepticalContext;
  const unsupportedStackedRisk = riskScore >= 22 && gravitasScore < 12 && !hasSkepticalContext;
  const level: CredibilityLevel = score >= 78 ? 'Strong' : score >= 56 ? 'Adequate' : 'Watchlist';
  const reasons = [
    gravitasHits.length > 0
      ? `Gravitas signals: ${gravitasHits
          .slice(0, 2)
          .map((hit) => hit.label)
          .join(', ')}.`
      : 'No explicit research or reporting signal in the public episode metadata.',
    riskHits.length > 0
      ? `Claim-risk language detected: ${riskHits
          .slice(0, 2)
          .map((hit) => hit.label)
          .join(', ')}.`
      : 'No obvious unsupported-claim language in the public episode metadata.'
  ];

  return {
    level,
    score,
    scoreAdjustment: Math.max(-28, Math.min(16, Math.round((score - CREDIBILITY_BASELINE) / 2))),
    shouldFilter: unsupportedMajorClaim || unsupportedStackedRisk || score < 38,
    reasons
  };
}

function getDurationMinutes(result: ApplePodcastResult) {
  return result.trackTimeMillis ? Math.round(result.trackTimeMillis / 60000) : 0;
}

function getVettingAssessment(result: ApplePodcastResult, durationMinutes: number, credibility: ReturnType<typeof getCredibilityAssessment>) {
  const reasons: string[] = [];
  let score = 0;

  if (durationMinutes > 0) {
    if (durationMinutes < MIN_DISCUSSION_DURATION_MINUTES) {
      reasons.push(`Known duration is ${durationMinutes} minutes, below the club's ${MIN_DISCUSSION_DURATION_MINUTES}-minute discussion floor.`);
    } else if (durationMinutes <= IDEAL_MAX_DISCUSSION_DURATION_MINUTES) {
      score += 14;
      reasons.push(`Length is discussion-ready at about ${durationMinutes} minutes.`);
    } else {
      score += 8;
      reasons.push(`Length clears the discussion floor at about ${durationMinutes} minutes.`);
    }
  } else {
    score -= 4;
    reasons.push('Apple did not expose a duration, so length is not fully vetted.');
  }

  if (result.searchRank && result.searchRank <= 4) {
    score += 9;
    reasons.push(`Apple returned it in the top ${result.searchRank} for a club-profile query.`);
  } else if (result.searchRank && result.searchRank <= 8) {
    score += 5;
    reasons.push(`Apple returned it in the top ${result.searchRank} for a club-profile query.`);
  } else if (result.searchRank) {
    score += 2;
    reasons.push(`Apple returned it at rank ${result.searchRank} for a club-profile query.`);
  }

  if ((result.trackCount || 0) >= 100) {
    score += 8;
    reasons.push('The parent show has a deep catalog on Apple Podcasts.');
  } else if ((result.trackCount || 0) >= 40) {
    score += 5;
    reasons.push('The parent show has a substantial catalog on Apple Podcasts.');
  } else if ((result.trackCount || 0) >= 15) {
    score += 2;
    reasons.push('The parent show has some Apple Podcasts catalog depth.');
  }

  const descriptionLength = compactText([result.shortDescription, result.description]).length;
  if (descriptionLength >= 260) {
    score += 4;
    reasons.push('The public description has enough detail to vet the premise.');
  } else if (descriptionLength >= 120) {
    score += 2;
    reasons.push('The public description gives some premise detail.');
  }

  if (credibility.level === 'Strong') score += 7;
  if (credibility.level === 'Adequate') score += 4;
  if (credibility.level === 'Watchlist') score -= 8;

  const level: VettingLevel = score >= 26 ? 'Strong' : score >= 16 ? 'Adequate' : 'Thin';

  return {
    level,
    score,
    scoreAdjustment: Math.max(-18, Math.min(18, score - 16)),
    shouldFilter: (durationMinutes > 0 && durationMinutes < MIN_DISCUSSION_DURATION_MINUTES) || (level === 'Thin' && credibility.level !== 'Strong'),
    reasons: reasons.slice(0, 3)
  };
}

function formatCount(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function truncateText(text: string, maxLength = 190) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trim()}...`;
}

function getTermOverlap(text: string, profileTerms: string[], ignoredTerms: Set<string> = EMPTY_TERM_SET) {
  const tokens = new Set(tokenize(text, ignoredTerms));
  return profileTerms.filter((term) => tokens.has(term));
}

function getPodcastSignalWeight(podcast: IntelligencePodcastInput) {
  const positiveRatings = (podcast.ratings || []).filter((rating) => rating.points > 0);
  const loveCount = (podcast.ratings || []).filter((rating) => rating.value === 'I like it a lot.').length;
  const ratingScore = Math.max(0, podcast.rankingScore || 0);

  if (podcast.status === 'discussed') {
    const hasRatingEraSignal = (podcast.ratings || []).length > 0 || ratingScore > 0;
    const chosenByRoomWeight = hasRatingEraSignal ? 8 : 12;
    return chosenByRoomWeight + ratingScore * 2 + positiveRatings.length * 2 + loveCount;
  }

  if (ratingScore > 0 || positiveRatings.length > 0) {
    return 2 + ratingScore + positiveRatings.length;
  }

  return 0.5;
}

function getPodcastText(podcast: IntelligencePodcastInput) {
  return compactText([podcast.title, podcast.host, podcast.episodeNames, podcast.notes, ...(podcast.meetingNotes || [])]);
}

function getEpisodeSignalText(podcast: IntelligencePodcastInput) {
  return compactText([podcast.episodeNames, podcast.notes, ...(podcast.meetingNotes || [])]);
}

function getRepeatedSourceTerms(podcasts: IntelligencePodcastInput[]) {
  const sourceCounts = new Map<string, { count: number; label: string }>();
  const minimumRepeatCount = podcasts.length >= 5 ? 3 : 2;

  podcasts.forEach((podcast) => {
    [podcast.title, podcast.host]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .forEach((label) => {
        const key = normalizeKey(label);
        const current = sourceCounts.get(key);
        sourceCounts.set(key, { count: (current?.count || 0) + 1, label });
      });
  });

  const ignoredTerms = new Set<string>();
  sourceCounts.forEach(({ count, label }) => {
    if (count >= minimumRepeatCount) {
      tokenize(label).forEach((token) => ignoredTerms.add(token));
    }
  });

  return ignoredTerms;
}

function getSourceTexts(podcasts: IntelligencePodcastInput[]) {
  return podcasts.flatMap((podcast) => {
    const weight = Math.min(MAX_PROFILE_SOURCE_WEIGHT, getPodcastSignalWeight(podcast));
    if (weight <= 0) return [];

    const episodeSignal = getEpisodeSignalText(podcast);
    const sourceSignal = compactText([podcast.title, podcast.host]);
    const sourceWeight = episodeSignal ? weight * 0.15 : weight * 0.35;
    const sourceKey = podcast._id || normalizeKey(podcast.title);

    const weightedTexts: Array<WeightedText | null> = [
      episodeSignal ? { text: episodeSignal, title: podcast.title, status: podcast.status, sourceKey, weight: weight * 1.35 } : null,
      sourceSignal ? { text: sourceSignal, title: podcast.title, status: podcast.status, sourceKey, weight: sourceWeight } : null
    ];

    return weightedTexts.filter((item): item is WeightedText => Boolean(item?.text));
  });
}

function getProfileThemes(sourceTexts: WeightedText[]) {
  const repeatedThemeText = sourceTexts
    .map((item) => Array.from({ length: Math.max(1, Math.round(item.weight)) }, () => item.text).join(' '))
    .join(' ');

  return getThemeScores(repeatedThemeText)
    .slice(0, 4)
    .map((theme) => theme.label);
}

function buildDiscoveryQueries(podcasts: IntelligencePodcastInput[], topTerms: string[], ignoredTerms: Set<string>) {
  const queries = new Set<string>();
  const profileTermSet = new Set(topTerms);
  const addQuery = (query: string) => {
    const normalized = query.replace(/\s+/g, ' ').trim();
    if (normalized.length >= 3) queries.add(normalized);
  };

  if (topTerms.length >= 2) addQuery(topTerms.slice(0, 2).join(' '));
  if (topTerms.length >= 4) addQuery(topTerms.slice(2, 4).join(' '));

  podcasts
    .filter((podcast) => podcast.status === 'discussed')
    .sort((a, b) => getPodcastSignalWeight(b) - getPodcastSignalWeight(a))
    .slice(0, 4)
    .forEach((podcast) => {
      const terms = getTopTerms(getEpisodeSignalText(podcast), 5, ignoredTerms).filter((term) => profileTermSet.has(term));
      if (terms.length >= 2) addQuery(terms.slice(0, 2).join(' '));
    });

  return [...queries].slice(0, MAX_DISCOVERY_QUERIES);
}

function getExistingPodcastKeys(podcasts: IntelligencePodcastInput[]) {
  const keys = new Set<string>();

  podcasts.forEach((podcast) => {
    [podcast.title, podcast.episodeNames, podcast.link].forEach((value) => {
      if (!value) return;
      keys.add(normalizeKey(value));
    });
  });

  return keys;
}

function isExistingPodcast(result: ApplePodcastResult, existingKeys: Set<string>) {
  const candidateKeys = [result.trackName, result.trackViewUrl, result.episodeUrl]
    .filter((value): value is string => Boolean(value))
    .map(normalizeKey);

  return candidateKeys.some((key) => key && existingKeys.has(key));
}

async function fetchApplePodcastResults(query: string) {
  const params = new URLSearchParams({
    term: query,
    country: 'US',
    media: 'podcast',
    entity: 'podcastEpisode',
    limit: String(APPLE_SEARCH_LIMIT)
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch(`https://itunes.apple.com/search?${params.toString()}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });

    if (!response.ok) return [];
    const payload = (await response.json()) as { results?: ApplePodcastResult[] };
    return Array.isArray(payload.results) ? payload.results.map((result, index) => ({ ...result, searchRank: index + 1 })) : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

function getDiscussedSourceMatches(
  candidateText: string,
  podcasts: IntelligencePodcastInput[],
  ignoredTerms: Set<string>
) {
  const candidateTokens = new Set(tokenize(candidateText, ignoredTerms));

  return podcasts
    .filter((podcast) => podcast.status === 'discussed')
    .map((podcast) => {
      const podcastText = getEpisodeSignalText(podcast) || getPodcastText(podcast);
      const podcastTokens = new Set(tokenize(podcastText, ignoredTerms));
      const overlap = [...candidateTokens].filter((token) => podcastTokens.has(token)).length;
      return {
        title: podcast.episodeNames || podcast.title,
        overlap,
        weight: Math.min(MAX_PROFILE_SOURCE_WEIGHT, getPodcastSignalWeight(podcast))
      };
    })
    .filter((source) => source.overlap > 0)
    .sort((a, b) => {
      const aScore = a.overlap * a.weight;
      const bScore = b.overlap * b.weight;
      if (bScore !== aScore) return bScore - aScore;
      return a.title.localeCompare(b.title);
    });
}

function buildAppleRecommendation({
  result,
  query,
  podcasts,
  profileTerms,
  ignoredTerms
}: {
  result: ApplePodcastResult;
  query: string;
  podcasts: IntelligencePodcastInput[];
  profileTerms: string[];
  ignoredTerms: Set<string>;
}): IntelligenceRecommendation | null {
  if (!result.trackName) return null;

  const genre = result.primaryGenreName || '';
  const isLowSignalGenre = LOW_SIGNAL_GENRES.has(genre.toLowerCase());
  const candidateText = compactText([result.trackName, result.shortDescription, result.description]);
  const credibility = getCredibilityAssessment(compactText([candidateText, result.collectionName, result.artistName]));
  if (credibility.shouldFilter) return null;

  const durationMinutes = getDurationMinutes(result);
  const vetting = getVettingAssessment(result, durationMinutes, credibility);
  if (vetting.shouldFilter) return null;

  const overlap = getTermOverlap(candidateText, profileTerms, ignoredTerms);
  const themeScores = getThemeScores(candidateText);
  const themes = themeScores.slice(0, 2).map((theme) => theme.label);
  const sourceMatches = getDiscussedSourceMatches(candidateText, podcasts, ignoredTerms);
  const closestSource = sourceMatches[0];
  const queryTerms = tokenize(query, ignoredTerms);
  const queryHits = queryTerms.filter((term) => candidateText.toLowerCase().includes(term)).length;
  const descriptionScore = result.shortDescription || result.description ? 5 : 0;
  const sourceDiversityScore = Math.min(12, Math.max(0, sourceMatches.length - 1) * 5);
  const score = Math.round(
    28 +
      overlap.length * 10 +
      themeScores.reduce((total, theme) => total + theme.score, 0) * 5 +
      queryHits * 4 +
      descriptionScore +
      sourceDiversityScore +
      (closestSource ? Math.min(10, closestSource.overlap * 2 + closestSource.weight / 4) : 0) +
      credibility.scoreAdjustment +
      vetting.scoreAdjustment
  );
  const reasons = [
    overlap.length > 0 ? `Episode-level match on weighted club terms: ${overlap.slice(0, 4).join(', ')}.` : '',
    sourceMatches.length > 1
      ? `Matches ${formatCount(sourceMatches.length, 'distinct archive discussion')} instead of leaning on one prior episode.`
      : closestSource
        ? `Closest archive signal is ${closestSource.title}, with single-source influence capped.`
        : '',
    `Vetting screen: ${vetting.reasons[0]}`,
    `Credibility screen: ${credibility.reasons[0]}`,
    `Discovered from the weighted episode query "${query}".`,
  ].filter(Boolean);
  const badges = [
    'Episode candidate',
    `Signal ${Math.max(0, score)}`,
    `Vetted ${vetting.level}`,
    `Credibility ${credibility.level}`,
    durationMinutes > 0 ? `${durationMinutes} min` : '',
    genre && !isLowSignalGenre ? genre : ''
  ].filter(Boolean);

  return {
    id: result.trackId ? String(result.trackId) : normalizeKey(`${result.trackName} ${result.collectionName || ''}`),
    title: result.trackName,
    subtitle: compactText([result.collectionName, result.artistName]) || 'Apple Podcasts episode',
    href: result.trackViewUrl || result.collectionViewUrl || result.episodeUrl,
    score,
    confidence: getConfidence(score),
    badges,
    themes,
    reasons: reasons.slice(0, 4),
    notesPreview: result.shortDescription || result.description ? truncateText(result.shortDescription || result.description || '') : undefined,
    credibility: {
      level: credibility.level,
      score: credibility.score,
      reasons: credibility.reasons
    },
    vetting: {
      level: vetting.level,
      score: vetting.score,
      reasons: vetting.reasons
    }
  };
}

async function buildPodcastDiscoveries({
  podcasts,
  profileTerms,
  discoveryQueries,
  ignoredTerms
}: {
  podcasts: IntelligencePodcastInput[];
  profileTerms: string[];
  discoveryQueries: string[];
  ignoredTerms: Set<string>;
}) {
  const existingKeys = getExistingPodcastKeys(podcasts);
  const resultsById = new Map<string, IntelligenceRecommendation>();

  await Promise.all(
    discoveryQueries.map(async (query) => {
      const results = await fetchApplePodcastResults(query);
      results.forEach((result) => {
        if (isExistingPodcast(result, existingKeys)) return;
        const recommendation = buildAppleRecommendation({ result, query, podcasts, profileTerms, ignoredTerms });
        if (!recommendation) return;

        const existing = resultsById.get(recommendation.id);
        if (!existing || recommendation.score > existing.score) {
          resultsById.set(recommendation.id, recommendation);
        }
      });
    })
  );

  return [...resultsById.values()]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.title.localeCompare(b.title);
    })
    .slice(0, 8);
}

function buildCarveOutDiscoveryPrompts(
  carveOuts: IntelligenceCarveOutInput[],
  profileTerms: string[]
): IntelligenceRecommendation[] {
  return carveOuts
    .filter((carveOut) => (carveOut.fistBumps?.length || 0) > 0)
    .map((carveOut) => {
      const fistBumpCount = carveOut.fistBumps?.length || 0;
      const text = compactText([carveOut.title, carveOut.type, carveOut.service, carveOut.notes]);
      const overlap = getTermOverlap(text, profileTerms);
      const themeScores = getThemeScores(text);
      const themes = themeScores.slice(0, 2).map((theme) => theme.label);
      const score = Math.round(36 + fistBumpCount * 18 + overlap.length * 5 + themeScores.length * 4);

      return {
        id: carveOut._id,
        title: `Find more like ${carveOut.title}`,
        subtitle: compactText([carveOut.type, carveOut.service, carveOut.member?.name ? `seeded by ${carveOut.member.name}` : '']) || 'Carve out seed',
        score,
        confidence: getConfidence(score),
        badges: ['Fist-bumped seed', `Signal ${Math.max(0, score)}`, formatCount(fistBumpCount, 'fist bump'), carveOut.type].filter(Boolean),
        themes,
        reasons: [
          `The seed carve out drew ${formatCount(fistBumpCount, 'fist bump')}.`,
          overlap.length > 0 ? `Use ${overlap.slice(0, 4).join(', ')} as follow-up search language.` : '',
          carveOut.notes ? 'The original notes give useful context for finding an adjacent article, book, video, or movie.' : ''
        ].filter(Boolean),
        notesPreview: carveOut.notes ? truncateText(carveOut.notes) : undefined
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.title.localeCompare(b.title);
    })
    .slice(0, 5);
}

export async function buildClubIntelligenceReport({
  podcasts,
  carveOuts
}: {
  podcasts: IntelligencePodcastInput[];
  carveOuts: IntelligenceCarveOutInput[];
}): Promise<IntelligenceReport> {
  const ignoredTerms = getRepeatedSourceTerms(podcasts);
  const sourceTexts = getSourceTexts(podcasts);
  const topTerms = getDiversifiedTopTerms(sourceTexts, 10, ignoredTerms);
  const topThemes = getProfileThemes(sourceTexts);
  const discoveryQueries = buildDiscoveryQueries(podcasts, topTerms, ignoredTerms);
  const podcastDiscoveries =
    discoveryQueries.length > 0
      ? await buildPodcastDiscoveries({ podcasts, profileTerms: topTerms, discoveryQueries, ignoredTerms })
      : [];
  const carveOutPrompts = buildCarveOutDiscoveryPrompts(carveOuts, topTerms);

  return {
    generatedAt: new Date().toISOString(),
    sourceStatus: {
      podcasts:
        podcastDiscoveries.length > 0
          ? 'New episode candidates from Apple Podcasts Search, ranked against diversified club signals, minimum discussion length, and vetting proxies.'
          : 'No new episode candidates found from the current weighted profile.',
      carveOuts: 'Lightweight prompts from fist-bumped carve outs; lower priority than podcast discovery.'
    },
    stats: {
      podcastsReviewed: podcasts.length,
      discussedPodcastsWeighted: podcasts.filter((podcast) => podcast.status === 'discussed').length,
      pendingPodcastsWeighted: podcasts.filter((podcast) => podcast.status === 'pending' && (podcast.rankingScore || 0) > 0).length,
      podcastNotesReviewed: podcasts.filter((podcast) => podcast.notes?.trim()).length,
      meetingNotesReviewed: podcasts.reduce((total, podcast) => total + (podcast.meetingNotes || []).filter(Boolean).length, 0),
      carveOutsReviewed: carveOuts.length,
      fistBumpedCarveOutsWeighted: carveOuts.filter((carveOut) => (carveOut.fistBumps?.length || 0) > 0).length
    },
    profile: {
      topThemes,
      topTerms,
      discoveryQueries
    },
    podcasts: podcastDiscoveries,
    carveOuts: carveOutPrompts
  };
}
