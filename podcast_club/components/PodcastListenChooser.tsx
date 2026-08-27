'use client';

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MediaArtwork } from '@/components/MediaArtwork';

type PodcastListenChooserProps = {
  title: string;
  episodeNames?: string;
  host?: string;
  link: string;
  className?: string;
  children?: ReactNode;
};

function safeWebUrl(value: string) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

function getProvider(value: string) {
  const hostname = safeWebUrl(value)?.hostname.replace(/^www\./, '').toLowerCase() || '';
  if (hostname === 'podcasts.apple.com') return 'apple';
  if (hostname === 'open.spotify.com') return 'spotify';
  return 'other';
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

export function PodcastListenChooser({
  title,
  episodeNames = '',
  host = '',
  link,
  className = 'podcast-listen-button',
  children
}: PodcastListenChooserProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = `listen-choice-${useId().replace(/:/g, '')}`;
  const provider = useMemo(() => getProvider(link), [link]);
  const submittedUrl = useMemo(() => safeWebUrl(link)?.toString() || null, [link]);
  const searchTerms = [episodeNames, title, host].filter(Boolean).join(' ');
  const spotifyUrl = provider === 'spotify' && submittedUrl
    ? submittedUrl
    : `https://open.spotify.com/search/${encodeURIComponent(searchTerms)}`;
  const appleUrl = provider === 'apple' && submittedUrl
    ? submittedUrl
    : `https://podcasts.apple.com/us/search?term=${encodeURIComponent(searchTerms)}`;
  const showSubmittedFallback = Boolean(submittedUrl && provider === 'other');

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        window.setTimeout(() => triggerRef.current?.focus(), 0);
      }
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
        </div>

        <p className="listen-choice-note">
          Apple and Spotify use exact episode links when available; otherwise they open a focused search.
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
        {children || <>Choose where to listen <span className="listen-trigger-chevron" aria-hidden="true" /></>}
        <span className="sr-only"> for {episodeNames || title}</span>
      </button>
      {typeof document !== 'undefined' && dialog ? createPortal(dialog, document.body) : null}
    </>
  );
}
