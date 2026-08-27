'use client';

import { CSSProperties, useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { withBasePath } from '@/lib/base-path';

const INTRO_STORAGE_KEY = 'royal-podcast-society-brand-intro-v4';
const INTRO_MAX_WIDTH_REM = 34;
const INTRO_MAX_WIDTH_REM_MOBILE = 24;

type Phase = 'idle' | 'enter' | 'playing' | 'settle' | 'done';
type LaunchState = 'choice' | 'attempting' | 'blocked';

function isStandaloneApp() {
  if (typeof window === 'undefined') return false;
  const standaloneNavigator = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || standaloneNavigator.standalone === true;
}

function getIntroLayout() {
  if (typeof window === 'undefined') return { width: 0, centerY: 0 };
  const rootFontSize = Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16;
  const mobile = window.matchMedia('(max-width: 640px)').matches;
  const compactLandscape = window.matchMedia('(max-height: 500px) and (orientation: landscape)').matches;
  return {
    width: Math.min(
      window.innerWidth * (compactLandscape ? 0.42 : mobile ? 0.68 : 0.82),
      rootFontSize * (compactLandscape ? 18 : mobile ? INTRO_MAX_WIDTH_REM_MOBILE : INTRO_MAX_WIDTH_REM)
    ),
    centerY: window.innerHeight * (compactLandscape ? 0.5 : mobile ? 0.36 : 0.4)
  };
}

export function BrandIntro() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [launchState, setLaunchState] = useState<LaunchState>('choice');
  const [settleTransform, setSettleTransform] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const primaryActionRef = useRef<HTMLButtonElement>(null);
  const doneTimerRef = useRef<number | null>(null);
  const introMarkStyle = {
    ...(settleTransform ? ({ ['--brand-intro-settle-transform' as string]: settleTransform } as CSSProperties) : {})
  } satisfies CSSProperties;

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const hasPlayed = window.sessionStorage.getItem(INTRO_STORAGE_KEY) === 'done';
    if (hasPlayed) {
      setPhase('done');
      return;
    }

    const target = document.querySelector<HTMLElement>('.brand-mark-wrap');
    if (target) {
      const rect = target.getBoundingClientRect();
      const { width: introWidth, centerY: introCenterY } = getIntroLayout();
      if (introWidth > 0 && rect.width > 0) {
        const dx = rect.left + rect.width / 2 - window.innerWidth / 2;
        const dy = rect.top + rect.height / 2 - introCenterY;
        const scale = rect.width / introWidth;
        setSettleTransform(`translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${scale})`);
      }
    }

    let disposed = false;
    const audio = audioRef.current;
    const enterTimer = window.setTimeout(() => {
      setPhase('enter');
      if (!isStandaloneApp()) return;

      setLaunchState('attempting');
      if (!audio) {
        setLaunchState('blocked');
        return;
      }

      audio.currentTime = 0;
      audio.volume = 0.72;
      void audio.play().then(() => {
        if (!disposed) setPhase('playing');
      }).catch(() => {
        if (!disposed) setLaunchState('blocked');
      });
    }, 40);

    return () => {
      disposed = true;
      window.clearTimeout(enterTimer);
      if (doneTimerRef.current !== null) window.clearTimeout(doneTimerRef.current);
      audio?.pause();
    };
  }, []);

  useEffect(() => {
    if (phase !== 'enter' || launchState === 'attempting') return;
    primaryActionRef.current?.focus({ preventScroll: true });
  }, [launchState, phase]);

  const finishIntro = useCallback((stopAudio = true) => {
    if (stopAudio && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    window.sessionStorage.setItem(INTRO_STORAGE_KEY, 'done');
    setPhase('settle');
    if (doneTimerRef.current !== null) window.clearTimeout(doneTimerRef.current);
    doneTimerRef.current = window.setTimeout(() => setPhase('done'), 980);
  }, []);

  const enterWithMusic = async () => {
    const audio = audioRef.current;
    if (!audio) {
      finishIntro();
      return;
    }

    audio.currentTime = 0;
    audio.volume = 0.72;
    try {
      await audio.play();
      setPhase('playing');
    } catch {
      setLaunchState('blocked');
    }
  };

  useEffect(() => {
    if (phase !== 'enter' && phase !== 'playing') return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finishIntro();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [finishIntro, phase]);

  if (phase === 'done') return null;

  return (
    <div
      className={`brand-intro-overlay brand-intro-${phase}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="brand-intro-title"
      aria-describedby="brand-intro-description"
      style={{ position: 'fixed', inset: 0, zIndex: 60 }}
    >
      <div className="brand-intro-mark" style={introMarkStyle}>
        <Image
          className="brand-intro-logo"
          src={withBasePath('/royal-podcast-society-logo-transparent.png')}
          alt=""
          width={1254}
          height={1254}
          priority
          style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
        />
      </div>
      <div className="brand-intro-copy">
        <p className="brand-intro-kicker">A Society Fanfare</p>
        <h2 id="brand-intro-title">Royal Podcast Society</h2>
        {phase === 'playing' ? (
          <>
            <p id="brand-intro-description" className="brand-intro-status" aria-live="polite">
              The Society is now in session.
            </p>
            <button className="brand-intro-skip" type="button" onClick={() => finishIntro()}>
              Enter now
            </button>
          </>
        ) : (
          <>
            <p id="brand-intro-description" aria-live="polite">
              {launchState === 'attempting' ? (
                'Opening with music…'
              ) : launchState === 'blocked' ? (
                'Your phone needs one tap before a web app can make sound.'
              ) : (
                <>Begin with Mouret’s 1729 <em>Rondeau</em> or enter quietly.</>
              )}
            </p>
            {launchState === 'attempting' ? (
              <button className="brand-intro-secondary" type="button" onClick={() => finishIntro()}>
                Enter quietly
              </button>
            ) : (
              <div className="brand-intro-actions">
                <button ref={primaryActionRef} className="brand-intro-primary" type="button" onClick={() => void enterWithMusic()}>
                  <span aria-hidden="true">♪</span>
                  {launchState === 'blocked' ? 'Tap for opening music' : 'Enter with music'}
                </button>
                <button className="brand-intro-secondary" type="button" onClick={() => finishIntro()}>
                  Enter quietly
                </button>
              </div>
            )}
          </>
        )}
        <small>New Royal Podcast Society performance · Jean-Joseph Mouret</small>
      </div>
      <audio
        ref={audioRef}
        src={withBasePath('/audio/rps-mouret-rondeau-opening.mp3')}
        preload="auto"
        onEnded={() => finishIntro(false)}
      />
    </div>
  );
}
