'use client';

import { useEffect, useState } from 'react';
import { withBasePath } from '@/lib/base-path';

const INTRO_STORAGE_KEY = 'royal-podcast-society-brand-intro';

export function BrandIntro() {
  const [phase, setPhase] = useState<'idle' | 'enter' | 'settle' | 'done'>('idle');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const hasPlayed = window.sessionStorage.getItem(INTRO_STORAGE_KEY) === 'done';
    if (hasPlayed) {
      setPhase('done');
      return;
    }

    const enterTimer = window.setTimeout(() => setPhase('enter'), 40);
    const settleTimer = window.setTimeout(() => setPhase('settle'), 1760);
    const doneTimer = window.setTimeout(() => {
      window.sessionStorage.setItem(INTRO_STORAGE_KEY, 'done');
      setPhase('done');
    }, 2660);

    return () => {
      window.clearTimeout(enterTimer);
      window.clearTimeout(settleTimer);
      window.clearTimeout(doneTimer);
    };
  }, []);

  if (phase === 'done') return null;

  return (
    <div className={`brand-intro-overlay brand-intro-${phase}`} aria-hidden="true">
      <div className="brand-intro-mark">
        <img
          className="brand-intro-logo"
          src={withBasePath('/royal-podcast-society-logo.png')}
          alt=""
        />
      </div>
    </div>
  );
}
