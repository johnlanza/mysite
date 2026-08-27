'use client';

import { useEffect, useMemo, useState } from 'react';
import { PodcastListenChooser } from '@/components/PodcastListenChooser';
import type { MeetingPodcastSelection } from '@/lib/meeting-podcasts';

type ApplePodcastResult = {
  collectionName?: string;
  artworkUrl600?: string;
  artworkUrl100?: string;
};

const artworkCache = new Map<string, string | null>();

function normalizeMatchText(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function getApplePodcastCountry(link: string) {
  try {
    const url = new URL(link);
    if (url.hostname !== 'podcasts.apple.com') return null;
    return url.pathname.match(/^\/([a-z]{2})\/podcast\//i)?.[1]?.toLowerCase() || 'us';
  } catch {
    return null;
  }
}

function PodcastCoverFallback() {
  return (
    <span className="upcoming-podcast-cover-fallback" aria-hidden="true">
      <svg width="42" height="42" viewBox="0 0 48 48" fill="none">
        <circle cx="24" cy="18" r="7" stroke="currentColor" strokeWidth="3" />
        <path d="M14 19v2c0 5.5 4.5 10 10 10s10-4.5 10-10v-2" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <path d="M24 31v7M18 39h12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export function UpcomingPodcastLink({ podcast, position }: { podcast: MeetingPodcastSelection; position: number }) {
  const [artworkUrl, setArtworkUrl] = useState<string | null>(null);
  const appleCountry = useMemo(() => getApplePodcastCountry(podcast.link), [podcast.link]);
  const cacheKey = `${podcast.title}|${podcast.host || ''}|${appleCountry || ''}`;

  useEffect(() => {
    if (!appleCountry) return;

    if (artworkCache.has(cacheKey)) {
      setArtworkUrl(artworkCache.get(cacheKey) || null);
      return;
    }

    const controller = new AbortController();

    async function loadArtwork() {
      try {
        const query = new URLSearchParams({
          term: [podcast.title, podcast.host].filter(Boolean).join(' '),
          entity: 'podcast',
          limit: '5',
          country: appleCountry || 'us'
        });
        const response = await fetch(`https://itunes.apple.com/search?${query.toString()}`, {
          signal: controller.signal
        });
        if (!response.ok) throw new Error('Artwork lookup failed');

        const payload = (await response.json()) as { results?: ApplePodcastResult[] };
        const normalizedTitle = normalizeMatchText(podcast.title);
        const matchingPodcast = payload.results?.find(
          (result) => normalizeMatchText(result.collectionName || '') === normalizedTitle
        );
        const nextArtworkUrl = matchingPodcast?.artworkUrl600 || matchingPodcast?.artworkUrl100 || null;

        artworkCache.set(cacheKey, nextArtworkUrl);
        setArtworkUrl(nextArtworkUrl);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        artworkCache.set(cacheKey, null);
        setArtworkUrl(null);
      }
    }

    void loadArtwork();
    return () => controller.abort();
  }, [appleCountry, cacheKey, podcast.host, podcast.title]);

  const timeLabel = podcast.totalTimeMinutes ? `${podcast.totalTimeMinutes} min` : null;
  const hostLabel = podcast.host || null;

  return (
    <PodcastListenChooser
      className="upcoming-podcast-link"
      title={podcast.title}
      episodeNames={podcast.episodeNames}
      host={podcast.host}
      link={podcast.link}
    >
      <span className="upcoming-podcast-cover">
        {artworkUrl ? (
          // The artwork URL is supplied dynamically by Apple's catalog API, so a native image is the appropriate fallback-safe renderer.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={artworkUrl} alt="" loading="eager" decoding="async" onError={() => setArtworkUrl(null)} />
        ) : (
          <PodcastCoverFallback />
        )}
      </span>
      <span className="upcoming-podcast-copy">
        <span className="upcoming-podcast-kicker">Podcast {position}</span>
        <strong className="upcoming-podcast-title">{podcast.title}</strong>
        {podcast.episodeNames ? <small className="upcoming-podcast-episode">{podcast.episodeNames}</small> : null}
        {timeLabel || hostLabel ? (
          <small className="upcoming-podcast-meta">{[timeLabel, hostLabel].filter(Boolean).join(' · ')}</small>
        ) : null}
        <span className="upcoming-podcast-cta">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
            <path d="m10 8 6 4-6 4V8Z" fill="currentColor" />
          </svg>
          Choose where to listen
          <span className="listen-trigger-chevron" aria-hidden="true" />
        </span>
      </span>
    </PodcastListenChooser>
  );
}
