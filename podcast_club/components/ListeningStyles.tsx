'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { withBasePath } from '@/lib/base-path';
import type { Member, SessionMember } from '@/lib/types';

type PortraitWriteup = NonNullable<Member['adminRoast']>;

type HistoricalFigure = {
  name: string;
  years: string;
  portrait: string;
  rationale: string;
  sourceUrl: string;
};

type ListeningStyle = {
  id: string;
  name: string;
  title: string;
  shorthand: string;
  description: string;
  strength: string;
  historicalFigure: HistoricalFigure;
  writeup: PortraitWriteup;
};

const NAMED_STYLES: Record<string, Omit<ListeningStyle, 'id' | 'name'>> = {
  'john lanza': {
    title: 'The Agenda Architect',
    shorthand: 'Curious, organized, selective',
    description: 'Connects ideas across episodes and keeps the club moving.',
    strength: 'Finds useful connections',
    historicalFigure: {
      name: 'Henry Oldenburg',
      years: 'c. 1619–1677',
      portrait: '/listening-portraits/henry-oldenburg.webp',
      rationale: 'The Royal Society’s first secretary connected its far-flung thinkers, managed the correspondence, and turned a flood of ideas into a durable institution.',
      sourceUrl: 'https://royalsociety.org/journals/publishing-activities/publishing350/history-philosophical-transactions/'
    },
    writeup: {
      headline: 'Chairman of the Leisure Bureau',
      body: [
        'John treats podcast club the way other men treat zoning law. He did not join a hobby so much as accidentally become the superintendent of one.',
        'He says he wants surprise, but what he really wants is a very interesting thing that has already been properly labeled, introduced, and placed on the agenda.'
      ],
      charges: [
        'Turns a casual get-together into a pleasantly functioning institution.',
        'Has been known to mistake leisure for a governance opportunity.'
      ],
      mostLikelyTo: 'turn “let’s keep this casual” into a governance framework by dessert',
      zinger: 'This is what happens when a man tries to relax and accidentally starts a committee.'
    }
  },
  'charlie gilman': {
    title: 'The Gentle Provocateur',
    shorthand: 'Thoughtful, generous, challenging',
    description: 'Brings thoughtful picks and asks questions that improve the discussion.',
    strength: 'Raises the level of discussion',
    historicalFigure: {
      name: 'Bayard Rustin',
      years: '1912–1987',
      portrait: '/listening-portraits/bayard-rustin.webp',
      rationale: 'A humane strategist who sharpened ideas, challenged assumptions, and did the organizing that moved a larger conversation forward.',
      sourceUrl: 'https://www.nps.gov/subjects/civilrights/bayard-rustin.htm'
    },
    writeup: {
      headline: 'Dean of Gentle Improvement',
      body: [
        'Charlie recommends podcasts as if he is quietly trying to improve the group without making a big show of it. The picks are not assignments, exactly; they merely arrive with excellent bedside manner.',
        'Even his challenges feel generous. He can move a conversation somewhere more interesting without anyone noticing he has taken the wheel.'
      ],
      charges: [
        'Repeatedly introduces self-improvement under the cover of entertainment.',
        'Makes difficult questions sound suspiciously civilized.'
      ],
      mostLikelyTo: 'recommend something “challenging” that still somehow has perfect bedside manner',
      zinger: 'Charlie does not recommend podcasts. He assigns tasteful self-improvement.'
    }
  },
  'steve atlee': {
    title: 'The Considered Optimist',
    shorthand: 'Measured, humane, open-minded',
    description: 'Finds the strongest case and the detail others may have missed.',
    strength: 'Clarifies the argument',
    historicalFigure: {
      name: 'William James',
      years: '1842–1910',
      portrait: '/listening-portraits/william-james.webp',
      rationale: 'A humane pragmatist who tested ideas by their practical consequences while keeping an open mind about how people experience the world.',
      sourceUrl: 'https://psychology.fas.harvard.edu/people/william-james'
    },
    writeup: {
      headline: 'Patron Saint of “I Like It.”',
      body: [
        'Steve has built an entire worldview out of measured approval. His taste carries the calm energy of a man who would like the group to be smarter, but not at the cost of anybody raising his voice.',
        'He finds the sensible case, gives it a fair hearing, and somehow makes moderation feel like a fully considered position rather than an escape route.'
      ],
      charges: [
        'Maintains enthusiasm at a carefully climate-controlled temperature.',
        'Has never needed to make a scene in order to make a point.'
      ],
      mostLikelyTo: 'make the sensible recommendation and still sound faintly apologetic for its excellence',
      zinger: 'If enthusiasm had a thermostat, Steve keeps it set to “pleasantly convincing.”'
    }
  },
  'babak dadvand': {
    title: 'The Culture Cartographer',
    shorthand: 'Wide-ranging, discerning, unexpected',
    description: 'Brings books, films, and podcasts from outside the usual lanes.',
    strength: "Expands the club's range",
    historicalFigure: {
      name: 'Alain Locke',
      years: '1885–1954',
      portrait: '/listening-portraits/alain-locke.webp',
      rationale: 'A cosmopolitan philosopher, editor, and cultural scout who brought overlooked artists and ideas into a much wider conversation.',
      sourceUrl: 'https://nmaahc.si.edu/alain-locke'
    },
    writeup: {
      headline: 'Critic-at-Large, Contributor-in-Spirit',
      body: [
        'Babak has created a remarkable arrangement with podcast club: establish impeccable taste, then preserve the right to send everyone down three more interesting side streets.',
        'He likes culture the way some people like tapas—many plates, no final answer, and always one cooler alternative waiting just off menu.'
      ],
      charges: [
        'Maintains a side channel with more range than most public radio schedules.',
        'Treats commitment to one category as an unnecessary narrowing of options.'
      ],
      mostLikelyTo: 'dismiss your recommendation politely, then send three cooler alternatives before you sit down',
      zinger: 'Babak likes culture the way some people like tapas: many plates, no final answer.'
    }
  },
  'danny corwin': {
    title: 'The Curious Juror',
    shorthand: 'Open-minded, exacting, questioning',
    description: 'Tests the evidence and gives a strong episode a fair hearing.',
    strength: 'Tests whether ideas hold up',
    historicalFigure: {
      name: 'Edmond Locard',
      years: '1877–1966',
      portrait: '/listening-portraits/edmond-locard.webp',
      rationale: 'A forensic pioneer who built one of Europe’s first police laboratories around the idea that careful observation lets evidence speak.',
      sourceUrl: 'https://tsapps.nist.gov/publication/get_pdf.cfm?pub_id=960722'
    },
    writeup: {
      headline: 'Selective Enthusiasm, Mildly Armed',
      body: [
        'Danny listens like a juror: open to persuasion, visibly unconvinced, and ready with one more question before the verdict is entered.',
        'He is not harsh, exactly—just strategically unconvinced. A strong episode can win him over, but it will be expected to show its work.'
      ],
      charges: [
        'Keeps an internal standards committee in session throughout the episode.',
        'Can turn “interesting” into a complete appellate process with one change of tone.'
      ],
      mostLikelyTo: 'say “that was interesting” in a tone that suggests a full appeals process is still available',
      zinger: 'Danny can be won over. He just wants the podcast to show its work.'
    }
  }
};

const FALLBACK_STYLES = [
  {
    title: 'The Signal Scout',
    shorthand: 'Curious and quick to spot a good topic',
    description: 'Notices ideas that can support a strong discussion.',
    strength: 'Finds promising topics early',
    historicalFigure: NAMED_STYLES['john lanza'].historicalFigure
  },
  {
    title: 'The Thoughtful Contrarian',
    shorthand: 'Open, discerning, constructively skeptical',
    description: 'Makes sure an interesting claim can stand up to questions.',
    strength: 'Creates productive friction',
    historicalFigure: NAMED_STYLES['danny corwin'].historicalFigure
  },
  {
    title: 'The Rabbit-Hole Guide',
    shorthand: 'Wide-ranging, playful, unexpected',
    description: "Finds useful material outside the club's usual subjects.",
    strength: 'Makes curiosity contagious',
    historicalFigure: NAMED_STYLES['babak dadvand'].historicalFigure
  }
];

function stableIndex(value: string, length: number) {
  const hash = [...value].reduce((total, character) => total + character.charCodeAt(0), 0);
  return length ? hash % length : 0;
}

function buildStyle(member: Pick<Member, '_id' | 'name'>): ListeningStyle {
  const named = NAMED_STYLES[member.name.trim().toLowerCase()];
  if (named) return { id: member._id, name: member.name, ...named };
  const fallback = FALLBACK_STYLES[stableIndex(member.name, FALLBACK_STYLES.length)];
  return {
    id: member._id,
    name: member.name,
    ...fallback,
    writeup: {
      headline: fallback.title,
      body: [
        `${member.name}'s Society Portrait is a playful reading of the patterns currently visible in club submissions, ratings, and carve outs.`,
        'The portrait will become more specific as the club creates more history; it is a conversation starter, not a personality test.'
      ],
      charges: ['Maintains an identifiable podcast-club pattern.', 'Remains entitled to dispute the portrait in person.'],
      mostLikelyTo: 'complicate this profile with one unexpectedly excellent recommendation',
      zinger: 'The evidence is suggestive. The Society reserves the right to keep listening.'
    }
  };
}

function HistoricalPortrait({ style, large = false }: { style: ListeningStyle; large?: boolean }) {
  return (
    <span
      className={`listening-style-historical-portrait${large ? ' listening-style-historical-portrait-large' : ''}`}
    >
      <Image
        src={withBasePath(style.historicalFigure.portrait)}
        alt={`Pen-and-ink portrait of ${style.historicalFigure.name}, the historical counterpart for ${style.name}`}
        width={900}
        height={900}
        sizes={large ? '(max-width: 540px) 88px, 152px' : '68px'}
      />
    </span>
  );
}

export function ListeningStyles({ member, compact = false }: { member: SessionMember; compact?: boolean }) {
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
  const selectedMember = members.find((clubMember) => clubMember._id === selected.id);
  const selectedWriteup = selectedMember?.adminRoast || selected.writeup;

  function showDetails(id: string) {
    setSelectedId(id);
    window.requestAnimationFrame(() => summaryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  }

  if (compact) {
    return (
      <section className="listening-styles listening-styles-compact" aria-labelledby="compact-listening-style-title">
        <div className="listening-style-hero">
          <HistoricalPortrait style={current} large />
          <div>
            <p className="section-kicker">NEW! Your Society Portrait</p>
            <h3 id="compact-listening-style-title">{current.title}</h3>
            <p>{current.shorthand}.</p>
            <span className="listening-style-counterpart">Paired with <strong>{current.historicalFigure.name}</strong></span>
            <Link href="/more">Read your full portrait →</Link>
          </div>
        </div>
        <div className="listening-style-compact-roster" aria-label="Club listening styles">
          {styles.map((style) => (
            <span className="listening-style-roster-member" key={style.id}>
              <HistoricalPortrait style={style} />
              <small>{style.id === member._id ? 'You' : style.name.split(' ')[0]}</small>
            </span>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="listening-styles" aria-labelledby="listening-style-title">
      <div className="listening-style-hero">
        <HistoricalPortrait style={current} large />
        <div>
          <p className="section-kicker">NEW! Your Society Portrait</p>
          <h3 id="listening-style-title">{current.title}</h3>
          <p>{current.description}</p>
          <span className="listening-style-strength"><small>Club strength</small><strong>{current.strength}</strong></span>
          <span className="listening-style-counterpart">Historical counterpart · <strong>{current.historicalFigure.name}</strong></span>
        </div>
      </div>

      <div className="listening-style-method">
        <span className="new-feature-badge">NEW!</span>
        <p><strong>What is this?</strong> AI helped turn each member&apos;s activity already in the club—submissions, ratings, selected episodes, and carve outs—into a playful Society Portrait, then matched that working style with a real historical figure. The sketch depicts the historical figure, not the member. The pairing is about habits and temperament, not the figure&apos;s entire biography or beliefs.</p>
      </div>

      <div className="listening-style-summary" ref={summaryRef} aria-live="polite">
        <HistoricalPortrait style={selected} large />
        <div className="listening-style-overview">
          <small>{selected.id === member._id ? 'You' : selected.name} · Royal Podcast Society</small>
          <h4>{selected.title}</h4>
          <p>{selected.description}</p>
          <dl>
            <div><dt>Style</dt><dd>{selected.shorthand}</dd></div>
            <div><dt>Strength</dt><dd>{selected.strength}</dd></div>
          </dl>
          <div className="listening-style-figure-match">
            <small>Historical counterpart</small>
            <strong>{selected.historicalFigure.name} <span>{selected.historicalFigure.years}</span></strong>
            <p>{selected.historicalFigure.rationale}</p>
            <a href={selected.historicalFigure.sourceUrl} target="_blank" rel="noreferrer">Meet {selected.historicalFigure.name} ↗</a>
          </div>
        </div>
        <div className="listening-style-writeup">
          <p className="section-kicker">The Full, AI-Assisted Portrait</p>
          <h4>{selectedWriteup.headline}</h4>
          {selectedWriteup.body.map((paragraph, index) => <p key={`${selected.id}-portrait-${index}`}>{paragraph}</p>)}
          <div className="listening-style-charges">
            <strong>The evidence</strong>
            <ul>{selectedWriteup.charges.map((charge, index) => <li key={`${selected.id}-charge-${index}`}>{charge}</li>)}</ul>
          </div>
          <p><strong>Most likely to:</strong> {selectedWriteup.mostLikelyTo}</p>
          {selectedWriteup.zinger ? <blockquote>“{selectedWriteup.zinger}”</blockquote> : null}
          {selectedWriteup.insufficientData ? <p>{selectedWriteup.insufficientData}</p> : null}
          <small>AI-assisted and based only on activity already recorded in the Royal Podcast Society. Playful, revisable, and absolutely not a diagnosis.</small>
        </div>
      </div>

      <div className="listening-style-grid">
        {styles.map((style) => (
          <article key={style.id} className={style.id === selected.id ? 'is-selected' : ''}>
            <HistoricalPortrait style={style} />
            <div>
              <small>{style.id === member._id ? 'You · ' : ''}Royal Podcast Society</small>
              <b>{style.name}</b>
              <strong>{style.title}</strong>
              <span>{style.shorthand}</span>
              <span className="listening-style-card-counterpart">With {style.historicalFigure.name}</span>
            </div>
            <button type="button" aria-pressed={style.id === selected.id} onClick={() => showDetails(style.id)}>
              {style.id === selected.id ? 'Shown above ↑' : 'Read full portrait →'}
            </button>
          </article>
        ))}
      </div>
      <p className="listening-style-note"><strong>Why historical counterparts?</strong> A real life gives each portrait more character than an invented avatar. The match is intentionally narrow and playful: shared club habits, not identical lives.</p>
    </section>
  );
}
