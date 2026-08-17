'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { withBasePath } from '@/lib/base-path';
import type { Member, SessionMember } from '@/lib/types';

type ListeningStyle = {
  id: string;
  name: string;
  title: string;
  shorthand: string;
  description: string;
  strength: string;
  portraitIndex: number;
};

const NAMED_STYLES: Record<string, Omit<ListeningStyle, 'id' | 'name'>> = {
  'john lanza': {
    title: 'The Agenda Architect',
    shorthand: 'Curious, organized, selective',
    description: 'Connects ideas across episodes and keeps the club moving.',
    strength: 'Finds useful connections',
    portraitIndex: 0
  },
  'charlie gilman': {
    title: 'The Gentle Provocateur',
    shorthand: 'Thoughtful, generous, challenging',
    description: 'Brings thoughtful picks and asks questions that improve the discussion.',
    strength: 'Raises the level of discussion',
    portraitIndex: 1
  },
  'steve atlee': {
    title: 'The Considered Optimist',
    shorthand: 'Measured, humane, open-minded',
    description: 'Finds the strongest case and the detail others may have missed.',
    strength: 'Clarifies the argument',
    portraitIndex: 2
  },
  'babak dadvand': {
    title: 'The Culture Cartographer',
    shorthand: 'Wide-ranging, discerning, unexpected',
    description: 'Brings books, films, and podcasts from outside the usual lanes.',
    strength: "Expands the club's range",
    portraitIndex: 3
  },
  'danny corwin': {
    title: 'The Curious Juror',
    shorthand: 'Open-minded, exacting, questioning',
    description: 'Tests the evidence and gives a strong episode a fair hearing.',
    strength: 'Tests whether ideas hold up',
    portraitIndex: 4
  }
};

const FALLBACK_STYLES = [
  {
    title: 'The Signal Scout',
    shorthand: 'Curious and quick to spot a good topic',
    description: 'Notices ideas that can support a strong discussion.',
    strength: 'Finds promising topics early'
  },
  {
    title: 'The Thoughtful Contrarian',
    shorthand: 'Open, discerning, constructively skeptical',
    description: 'Makes sure an interesting claim can stand up to questions.',
    strength: 'Creates productive friction'
  },
  {
    title: 'The Rabbit-Hole Guide',
    shorthand: 'Wide-ranging, playful, unexpected',
    description: "Finds useful material outside the club's usual subjects.",
    strength: 'Makes curiosity contagious'
  }
];

function stableIndex(value: string, length: number) {
  const hash = [...value].reduce((total, character) => total + character.charCodeAt(0), 0);
  return length ? hash % length : 0;
}

function buildStyle(member: Pick<Member, '_id' | 'name'>): ListeningStyle {
  const named = NAMED_STYLES[member.name.trim().toLowerCase()];
  if (named) return { id: member._id, name: member.name, ...named };
  const index = stableIndex(member.name, FALLBACK_STYLES.length);
  return {
    id: member._id,
    name: member.name,
    ...FALLBACK_STYLES[index],
    portraitIndex: stableIndex(member.name, 5)
  };
}

function Portrait({ style, large = false }: { style: ListeningStyle; large?: boolean }) {
  const column = style.portraitIndex % 3;
  const row = Math.floor(style.portraitIndex / 3);
  return (
    <span
      className={`listening-style-portrait${large ? ' listening-style-portrait-large' : ''}`}
      role="img"
      aria-label={`Illustration for ${style.title}`}
    >
      {/* The source is a five-portrait sprite; the wrapper crops one square without stretching it. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={withBasePath('/listening-style-portraits.webp')}
        alt=""
        style={{ left: `${column * -100}%`, top: `${row * -100}%` }}
      />
    </span>
  );
}

export function ListeningStyles({ member }: { member: SessionMember }) {
  const [members, setMembers] = useState<Member[]>([member]);
  const [selectedId, setSelectedId] = useState(member._id);
  const summaryRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(withBasePath('/api/members'), { cache: 'no-store', signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((payload: Member[] | null) => {
        if (payload?.length) setMembers(payload);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const styles = useMemo(() => members.map(buildStyle), [members]);
  const current = styles.find((style) => style.id === member._id) || buildStyle(member);
  const selected = styles.find((style) => style.id === selectedId) || current;

  function showDetails(id: string) {
    setSelectedId(id);
    window.requestAnimationFrame(() => summaryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  }

  return (
    <section className="listening-styles" aria-labelledby="listening-style-title">
      <div className="listening-style-hero">
        <Portrait style={current} large />
        <div>
          <p className="section-kicker">Your Listening Style</p>
          <h3 id="listening-style-title">{current.title}</h3>
          <p>{current.description}</p>
          <span className="listening-style-strength"><small>Club strength</small><strong>{current.strength}</strong></span>
        </div>
      </div>

      <div className="listening-style-summary" ref={summaryRef} aria-live="polite">
        <Portrait style={selected} />
        <div>
          <small>{selected.id === member._id ? 'You' : selected.name}</small>
          <h4>{selected.title}</h4>
          <p>{selected.description}</p>
          <dl>
            <div><dt>Style</dt><dd>{selected.shorthand}</dd></div>
            <div><dt>Strength</dt><dd>{selected.strength}</dd></div>
          </dl>
        </div>
      </div>

      <div className="listening-style-grid">
        {styles.map((style) => (
          <article key={style.id} className={style.id === selected.id ? 'is-selected' : ''}>
            <Portrait style={style} />
            <div>
              <small>{style.id === member._id ? 'You' : style.name}</small>
              <strong>{style.title}</strong>
              <span>{style.shorthand}</span>
            </div>
            <button type="button" aria-pressed={style.id === selected.id} onClick={() => showDetails(style.id)}>
              {style.id === selected.id ? 'Showing details' : 'See details'}
            </button>
          </article>
        ))}
      </div>
      <p className="listening-style-note">A playful snapshot of how each member adds to the conversation—not a personality test.</p>
    </section>
  );
}
