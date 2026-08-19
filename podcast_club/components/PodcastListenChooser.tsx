'use client';

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MediaArtwork } from '@/components/MediaArtwork';

type ApplePodcastResult = {
  artistName?: string;
  collectionId?: number;
  collectionName?: string;
  trackId?: number;
  trackName?: string;
};

type PodcastListenChooserProps = {
  title: string;
  episodeNames?: string;
  host?: string;
  link: string;
  className?: string;
  children?: ReactNode;
};

const appleIdRequests = new Map<string, Promise<string | null>>();

function normalizeMatchText(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function meaningfulTokens(value: string) {
  const stopWords = new Set(['a', 'an', 'and', 'at', 'for', 'from', 'in', 'of', 'on', 'the', 'to', 'with']);
  return normalizeMatchText(value).split(' ').filter((token) => token.length > 1 && !stopWords.has(token));
}

function matchScore(query: string, candidate: string) {
  const normalizedQuery = normalizeMatchText(query);
  const normalizedCandidate = normalizeMatchText(candidate);
  if (!normalizedQuery || !normalizedCandidate) return 0;
  if (normalizedQuery === normalizedCandidate) return 1;

  const queryTokens = new Set(meaningfulTokens(query));
  const candidateTokens = new Set(meaningfulTokens(candidate));
  if (!queryTokens.size || !candidateTokens.size) return 0;
  const overlap = [...queryTokens].filter((token) => candidateTokens.has(token)).length;
  const coverage = overlap / queryTokens.size;
  const precision = overlap / candidateTokens.size;
  const contained = normalizedQuery.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedQuery);
  return Math.max(coverage * 0.72 + precision * 0.28, contained ? 0.86 : 0);
}

function safeWebUrl(value: string) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

function getApplePodcastId(value: string) {
  const url = safeWebUrl(value);
  if (!url || url.hostname.replace(/^www\./, '') !== 'podcasts.apple.com') return null;
  return url.pathname.match(/\/id(\d+)(?:\/|$)/i)?.[1] || null;
}

function getProvider(value: string) {
  const hostname = safeWebUrl(value)?.hostname.replace(/^www\./, '').toLowerCase() || '';
  if (hostname === 'podcasts.apple.com') return 'apple';
  if (hostname === 'open.spotify.com') return 'spotify';
  return 'other';
}

async function resolveApplePodcastId(title: string, host: string) {
  const cacheKey = normalizeMatchText(`${title}|${host}`);
  const cached = appleIdRequests.get(cacheKey);
  if (cached) return cached;

  const request = (async () => {
    try {
      const query = new URLSearchParams({
        term: [title, host].filter(Boolean).join(' '),
        country: 'US',
        media: 'podcast',
        entity: 'podcast',
        limit: '8'
      });
      const response = await fetch(`https://itunes.apple.com/search?${query.toString()}`, {
        signal: AbortSignal.timeout(8000)
      });
      if (!response.ok) return null;
      const payload = (await response.json()) as { results?: ApplePodcastResult[] };
      const ranked = (payload.results || [])
        .map((result) => {
          const candidateTitle = result.collectionName || result.trackName || '';
          const titleScore = matchScore(title, candidateTitle);
          const hostScore = host ? matchScore(host, result.artistName || '') : 0;
          return { result, titleScore, score: titleScore * 0.9 + hostScore * 0.1 };
        })
        .sort((a, b) => b.score - a.score);
      const match = ranked[0];
      if (!match || match.titleScore < 0.58) return null;
      const id = match.result.collectionId || match.result.trackId;
      return id ? String(id) : null;
    } catch {
      return null;
    }
  })();

  appleIdRequests.set(cacheKey, request);
  return request;
}

function SpotifyMark() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="15" fill="currentColor" />
      <path d="M8.5 12.2c5.2-1.5 11.3-1.1 15.4 1.2M9.6 16.5c4.5-1.2 9.8-.8 13.4 1.1M10.7 20.5c3.7-.9 8-.6 11 1" fill="none" stroke="white" strokeWidth="2.1" strokeLinecap="round" />
    </svg>
  );
}

function ApplePodcastsMark() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="15" fill="currentColor" />
      <circle cx="16" cy="13" r="2.6" fill="white" />
      <path d="M12.3 22.7 14 16.8c.3-1 1-1.5 2-1.5s1.7.5 2 1.5l1.7 5.9c.3 1-.4 1.9-1.4 1.9h-4.6c-1 0-1.7-.9-1.4-1.9Z" fill="white" />
      <path d="M10.7 17.7a7.4 7.4 0 1 1 10.6 0M8.1 20.1a10.7 10.7 0 1 1 15.8 0" fill="none" stroke="white" strokeWidth="1.55" strokeLinecap="round" />
    </svg>
  );
}

function CastroMark() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="15" fill="currentColor" />
      <path d="M20.9 11.6a7 7 0 1 0 .2 8.6" fill="none" stroke="white" strokeWidth="3.1" strokeLinecap="round" />
      <path d="M15 12.3a4.3 4.3 0 1 0 .1 7.5" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function PodcastListenChooser({
  title,
  episodeNames = '',
  host = '',
  link,
  className = 'podcast-listen-button',
  children
}: PodcastListenChooserProps) {
  const [open, setOpen] = useState(false);
  const [resolvedAppleId, setResolvedAppleId] = useState<string | null>(null);
  const [castroStatus, setCastroStatus] = useState<'idle' | 'loading' | 'ready' | 'unavailable'>('idle');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = `listen-choice-${useId().replace(/:/g, '')}`;
  const provider = useMemo(() => getProvider(link), [link]);
  const directAppleId = useMemo(() => getApplePodcastId(link), [link]);
  const submittedUrl = useMemo(() => safeWebUrl(link)?.toString() || null, [link]);
  const searchTerms = [episodeNames, title, host].filter(Boolean).join(' ');
  const spotifyUrl = provider === 'spotify' && submittedUrl
    ? submittedUrl
    : `https://open.spotify.com/search/${encodeURIComponent(searchTerms)}`;
  const appleUrl = provider === 'apple' && submittedUrl
    ? submittedUrl
    : `https://podcasts.apple.com/us/search?term=${encodeURIComponent(searchTerms)}`;
  const applePodcastId = directAppleId || resolvedAppleId;
  const castroUrl = applePodcastId ? `https://castro.fm/itunes/${applePodcastId}` : null;
  const showSubmittedFallback = Boolean(submittedUrl && provider === 'other');

  useEffect(() => {
    setResolvedAppleId(null);
    setCastroStatus(directAppleId ? 'ready' : 'idle');
  }, [directAppleId, link]);

  useEffect(() => {
    if (!open || directAppleId) return;
    let cancelled = false;
    setCastroStatus('loading');
    void resolveApplePodcastId(title, host).then((id) => {
      if (cancelled) return;
      setResolvedAppleId(id);
      setCastroStatus(id ? 'ready' : 'unavailable');
    });
    return () => { cancelled = true; };
  }, [directAppleId, host, open, title]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    const focusTimer = window.setTimeout(() => closeRef.current?.focus(), 0);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.clearTimeout(focusTimer);
    };
  }, [open]);

  function closeDialog() {
    setOpen(false);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }

  const dialog = open ? (
    <div className="modal-backdrop listen-choice-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) closeDialog();
    }}>
      <section className="modal-card listen-choice-card" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <button ref={closeRef} className="listen-choice-close" type="button" onClick={closeDialog} aria-label="Close player choices">×</button>
        <div className="listen-choice-heading">
          <MediaArtwork
            url={link}
            title={title}
            creator={host}
            kind="podcast"
            className="listen-choice-artwork"
            fallback="🎧"
            eager
          />
          <div>
            <p className="section-kicker">Choose your player</p>
            <h2 id={titleId}>{title}</h2>
            {episodeNames ? <p>{episodeNames}</p> : null}
          </div>
        </div>

        <div className="listen-choice-options">
          <a className="listen-choice-option" data-player="spotify" href={spotifyUrl} target="_blank" rel="noreferrer" onClick={closeDialog}>
            <span className="listen-choice-mark"><SpotifyMark /></span>
            <span><strong>Spotify</strong><small>{provider === 'spotify' ? 'Open the submitted episode' : 'Search for this episode'}</small></span>
            <span aria-hidden="true">→</span>
          </a>
          <a className="listen-choice-option" data-player="apple" href={appleUrl} target="_blank" rel="noreferrer" onClick={closeDialog}>
            <span className="listen-choice-mark"><ApplePodcastsMark /></span>
            <span><strong>Apple Podcasts</strong><small>{provider === 'apple' ? 'Open the submitted episode' : 'Search for this episode'}</small></span>
            <span aria-hidden="true">→</span>
          </a>
          {castroUrl ? (
            <a className="listen-choice-option" data-player="castro" href={castroUrl} target="_blank" rel="noreferrer" onClick={closeDialog}>
              <span className="listen-choice-mark"><CastroMark /></span>
              <span><strong>Castro</strong><small>Open the show, then choose this episode</small></span>
              <span aria-hidden="true">→</span>
            </a>
          ) : (
            <div className="listen-choice-option is-disabled" data-player="castro" aria-live="polite">
              <span className="listen-choice-mark"><CastroMark /></span>
              <span>
                <strong>Castro</strong>
                <small>{castroStatus === 'unavailable' ? 'No confident catalog match found' : 'Finding this podcast in Castro…'}</small>
              </span>
              <span aria-hidden="true">{castroStatus === 'loading' ? '···' : '—'}</span>
            </div>
          )}
        </div>

        <p className="listen-choice-note">
          Exact episode links are used when available. Other choices open a focused search; Castro opens the matching show.
        </p>
        {showSubmittedFallback ? (
          <a className="listen-choice-original" href={submittedUrl || '#'} target="_blank" rel="noreferrer" onClick={closeDialog}>
            Use the submitted link instead <span aria-hidden="true">↗</span>
          </a>
        ) : null}
      </section>
    </div>
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`podcast-listen-trigger ${className}`.trim()}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        {children || <>Choose where to listen <span aria-hidden="true">→</span></>}
      </button>
      {typeof document !== 'undefined' && dialog ? createPortal(dialog, document.body) : null}
    </>
  );
}
