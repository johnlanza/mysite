export const CARVE_OUT_TYPES = ['article', 'book', 'movie', 'podcast', 'video', 'other'] as const;

export type CarveOutType = (typeof CARVE_OUT_TYPES)[number];

export const CARVE_OUT_TYPE_LABELS: Record<CarveOutType, string> = {
  article: 'Article',
  book: 'Book',
  movie: 'Movie',
  podcast: 'Podcast',
  video: 'Video',
  other: 'Other'
};

export const CARVE_OUT_SERVICE_OPTIONS: Record<CarveOutType, string[]> = {
  article: ['New York Times', 'The Atlantic', 'Substack', 'Medium', 'Wall Street Journal'],
  book: ['Audible', 'Kindle', 'Libby', 'Bookshop', 'Local library'],
  movie: ['Netflix', 'Max', 'Hulu', 'Disney+', 'Prime Video', 'Apple TV+'],
  podcast: ['Apple Podcasts', 'Spotify', 'Overcast', 'Pocket Casts', 'Audible'],
  video: ['YouTube', 'Vimeo', 'TikTok', 'Nebula', 'Instagram'],
  other: ['Newsletter', 'Website', 'App', 'Live event', 'Recommendation']
};

export const OTHER_SERVICE_VALUE = 'other';

export function getCarveOutTypeLabel(value: string) {
  if (!value) return 'Other';
  if (value in CARVE_OUT_TYPE_LABELS) {
    return CARVE_OUT_TYPE_LABELS[value as CarveOutType];
  }

  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(' ');
}

export function getCarveOutServiceOptions(type: string) {
  if (type in CARVE_OUT_SERVICE_OPTIONS) {
    return CARVE_OUT_SERVICE_OPTIONS[type as CarveOutType];
  }

  return CARVE_OUT_SERVICE_OPTIONS.other;
}

export function normalizeCarveOutServiceInput(service: unknown) {
  const normalized = String(service || '').trim();
  return normalized || '';
}

export function deriveServiceSelection(type: string, service: string) {
  const normalizedService = normalizeCarveOutServiceInput(service);
  if (!normalizedService) {
    return { serviceChoice: '', customService: '' };
  }

  const options = getCarveOutServiceOptions(type);
  if (options.includes(normalizedService)) {
    return { serviceChoice: normalizedService, customService: '' };
  }

  return { serviceChoice: OTHER_SERVICE_VALUE, customService: normalizedService };
}

export function resolveSelectedService(serviceChoice: string, customService: string) {
  if (serviceChoice === OTHER_SERVICE_VALUE) {
    return normalizeCarveOutServiceInput(customService);
  }

  return normalizeCarveOutServiceInput(serviceChoice);
}
