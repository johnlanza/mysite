'use client';

import { CSSProperties, useEffect, useState } from 'react';
import { withBasePath } from '@/lib/base-path';

const INTRO_STORAGE_KEY = 'royal-podcast-society-brand-intro';
const INTRO_MAX_WIDTH_REM = 34;
const INTRO_MAX_WIDTH_REM_MOBILE = 24;

type Phase = 'idle' | 'enter' | 'settle' | 'done';

function getIntroWidth() {
  if (typeof window === 'undefined') return 0;
  const rootFontSize = Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16;
  const mobile = window.matchMedia('(max-width: 640px)').matches;
  return Math.min(
    window.innerWidth * (mobile ? 0.68 : 0.82),
    rootFontSize * (mobile ? INTRO_MAX_WIDTH_REM_MOBILE : INTRO_MAX_WIDTH_REM)
  );
}

export function BrandIntro() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [settleTransform, setSettleTransform] = useState<string | null>(null);
  const introMarkStyle = settleTransform
    ? ({ ['--brand-intro-settle-transform' as string]: settleTransform } as CSSProperties)
    : undefined;

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
      const introWidth = getIntroWidth();
      if (introWidth > 0 && rect.width > 0) {
        const dx = rect.left + rect.width / 2 - window.innerWidth / 2;
        const dy = rect.top + rect.height / 2 - window.innerHeight / 2;
        const scale = rect.width / introWidth;
        setSettleTransform(`translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${scale})`);
      }
    }

    const enterTimer = window.setTimeout(() => setPhase('enter'), 40);
    const settleTimer = window.setTimeout(() => setPhase('settle'), 2760);
    const doneTimer = window.setTimeout(() => {
      window.sessionStorage.setItem(INTRO_STORAGE_KEY, 'done');
      setPhase('done');
    }, 3660);

    return () => {
      window.clearTimeout(enterTimer);
      window.clearTimeout(settleTimer);
      window.clearTimeout(doneTimer);
    };
  }, []);
  if (phase === 'done') return null;

  return (
    <div className={`brand-intro-overlay brand-intro-${phase}`} aria-hidden="true">
      <div className="brand-intro-mark" style={introMarkStyle}>
        <img
          className="brand-intro-logo"
          src={withBasePath('/royal-podcast-society-logo-transparent.png')}
          alt=""
        />
      </div>
    </div>
  );
}
