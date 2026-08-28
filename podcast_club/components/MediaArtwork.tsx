'use client';

import { useEffect, useState } from 'react';
import { withBasePath } from '@/lib/base-path';

type ArtworkMetadata = { imageUrl?: string | null };
type ArtworkProps = {
  url?: string;
  title?: string;
  kind?: string;
  creator?: string;
  fallback?: string;
  className?: string;
  eager?: boolean;
};

const artworkRequests = new Map<string, Promise<ArtworkMetadata | null>>();

function publicArtworkUrl(value?: string) {
  const candidate = value?.trim();
  if (!candidate) return '';
  try {
    const parsed = new URL(candidate);
    return ['http:', 'https:'].includes(parsed.protocol) ? candidate : '';
  } catch {
    return '';
  }
}

function loadArtwork(props: ArtworkProps) {
  const params = new URLSearchParams();
  params.set('v', '4');
  const artworkUrl = publicArtworkUrl(props.url);
  if (artworkUrl) params.set('url', artworkUrl);
  if (props.title) params.set('title', props.title);
  if (props.kind) params.set('kind', props.kind);
  if (props.creator) params.set('creator', props.creator);
  const cacheKey = params.toString();
  const cached = artworkRequests.get(cacheKey);
  if (cached) return cached;
  const request = fetch(withBasePath(`/api/artwork?${cacheKey}`))
    .then((response) => response.ok ? response.json() : null)
    .catch(() => null);
  artworkRequests.set(cacheKey, request);
  return request;
}

export function MediaArtwork({ url, title, kind, creator, fallback = '▶', className = '', eager = false }: ArtworkProps) {
  const artworkUrl = publicArtworkUrl(url);
  const hasLookup = Boolean(artworkUrl || title);
  const [metadata, setMetadata] = useState<ArtworkMetadata | null | undefined>(hasLookup ? undefined : null);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setImageFailed(false);
    if (!hasLookup) {
      setMetadata(null);
      return () => { cancelled = true; };
    }
    setMetadata(undefined);
    void loadArtwork({ url: artworkUrl, title, kind, creator }).then((result) => {
      if (!cancelled) setMetadata(result);
    });
    return () => { cancelled = true; };
  }, [artworkUrl, creator, hasLookup, kind, title]);

  const src = imageFailed ? '' : metadata?.imageUrl || '';
  const artworkKind = kind?.trim().toLowerCase() || 'other';
  return (
    <span
      className={`media-artwork ${src ? 'has-image' : ''} ${hasLookup && metadata === undefined ? 'is-loading' : ''} ${className}`.trim()}
      data-artwork-kind={artworkKind}
      aria-hidden="true"
    >
      <span>{fallback}</span>
      {src ? (
        // External artwork comes from the linked publisher or public media catalog.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading={eager ? 'eager' : 'lazy'} decoding="async" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} />
      ) : null}
    </span>
  );
}
