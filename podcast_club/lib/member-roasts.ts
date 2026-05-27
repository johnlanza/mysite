type MemberLite = {
  _id: string;
  name: string;
  email: string;
  isAdmin: boolean;
};

type PodcastLite = {
  title: string;
  host?: string;
  notes?: string | null;
  episodeNames?: string | null;
  totalTimeMinutes?: number | null;
  submittedBy: string;
  ratings?: { member: string; value: string; points: number }[];
};

type CarveOutLite = {
  title: string;
  type?: string | null;
  service?: string | null;
  notes?: string | null;
  member: string;
  fistBumps?: { member: string }[];
};

export type MemberRoast = {
  headline: string;
  body: string[];
  charges: string[];
  mostLikelyTo: string;
  zinger?: string;
  insufficientData?: string;
};

type MemberSummary = {
  member: MemberLite;
  submittedCount: number;
  ratedCount: number;
  carveOutCount: number;
  fistBumpsGiven: number;
  likesALot: number;
  likes: number;
  meh: number;
  myPodcast: number;
  noSelection: number;
  submissionExamples: string[];
  carveOutExamples: string[];
  nonUrlCarveOutExamples: string[];
  hostExamples: string[];
  dominantCarveOutType: string | null;
  totalListeningMinutesSubmitted: number;
  duplicateSubmissionTitles: string[];
};

type Persona = 'architect' | 'enthusiast' | 'grazer' | 'moderate' | 'centrist';

const CARVE_OUT_TYPE_LABELS: Record<string, string> = {
  book: 'book',
  video: 'video',
  movie: 'movie',
  podcast: 'podcast',
  article: 'article',
  other: 'miscellaneous object lesson'
};

function oxford(items: string[]) {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`;
}

function quoteTitle(value: string) {
  return `“${value}”`;
}

function cleanExample(value?: string | null) {
  if (!value) return '';
  return value.replace(/\s+/g, ' ').trim();
}

function looksLikeUrl(value: string) {
  return /^https?:\/\//i.test(value) || /^www\./i.test(value);
}

function compactTitle(value: string) {
  const cleaned = cleanExample(value);
  if (!cleaned) return '';
  if (looksLikeUrl(cleaned)) return '';
  return cleaned.length > 90 ? `${cleaned.slice(0, 87).trimEnd()}...` : cleaned;
}

function getDominantType(carveOuts: CarveOutLite[]) {
  const counts = new Map<string, number>();
  for (const carveOut of carveOuts) {
    const type = String(carveOut.type || 'other');
    counts.set(type, (counts.get(type) || 0) + 1);
  }

  let top: string | null = null;
  let topCount = -1;
  for (const [type, count] of counts) {
    if (count > topCount) {
      top = type;
      topCount = count;
    }
  }
  return top;
}

function summarizeMember(member: MemberLite, podcasts: PodcastLite[], carveOuts: CarveOutLite[]): MemberSummary {
  const memberId = member._id;
  const submitted = podcasts.filter((podcast) => podcast.submittedBy === memberId);
  const ratings = podcasts.flatMap((podcast) =>
    (podcast.ratings || [])
      .filter((rating) => rating.member === memberId)
      .map((rating) => ({ ...rating, title: podcast.title }))
  );
  const memberCarveOuts = carveOuts.filter((carveOut) => carveOut.member === memberId);
  const fistBumpsGiven = carveOuts.reduce(
    (count, carveOut) => count + (carveOut.fistBumps || []).filter((entry) => entry.member === memberId).length,
    0
  );

  const hostCounts = new Map<string, number>();
  for (const podcast of submitted) {
    const host = cleanExample(podcast.host);
    if (host) {
      hostCounts.set(host, (hostCounts.get(host) || 0) + 1);
    }
  }

  const hostExamples = [...hostCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([host]) => host);

  const titleCounts = new Map<string, number>();
  for (const podcast of submitted) {
    titleCounts.set(podcast.title, (titleCounts.get(podcast.title) || 0) + 1);
  }
  const duplicateSubmissionTitles = [...titleCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([title]) => title);

  const carveOutExamples = memberCarveOuts.map((carveOut) => cleanExample(carveOut.title)).filter(Boolean);
  const nonUrlCarveOutExamples = carveOutExamples.filter((title) => !looksLikeUrl(title));

  return {
    member,
    submittedCount: submitted.length,
    ratedCount: ratings.length,
    carveOutCount: memberCarveOuts.length,
    fistBumpsGiven,
    likesALot: ratings.filter((rating) => rating.value === 'I like it a lot.').length,
    likes: ratings.filter((rating) => rating.value === 'I like it.').length,
    meh: ratings.filter((rating) => rating.value === 'Meh').length,
    myPodcast: ratings.filter((rating) => rating.value === 'My podcast').length,
    noSelection: ratings.filter((rating) => /No selection/i.test(rating.value)).length,
    submissionExamples: submitted.map((podcast) => compactTitle(podcast.title)).filter(Boolean).slice(0, 4),
    carveOutExamples: carveOutExamples.slice(0, 4),
    nonUrlCarveOutExamples: nonUrlCarveOutExamples.map(compactTitle).filter(Boolean).slice(0, 4),
    hostExamples,
    dominantCarveOutType: getDominantType(memberCarveOuts),
    totalListeningMinutesSubmitted: submitted.reduce((total, podcast) => total + Number(podcast.totalTimeMinutes || 0), 0)
    ,
    duplicateSubmissionTitles
  };
}

function choosePersona(summary: MemberSummary): Persona {
  if (summary.submittedCount >= 20 || summary.myPodcast >= 8) return 'architect';
  if (summary.likesALot >= 5 && summary.meh === 0) return 'enthusiast';
  if (summary.submittedCount <= 1 && summary.carveOutCount >= 12 && summary.meh >= 6) return 'grazer';
  if (summary.likes >= 12 && summary.likesALot <= 2) return 'moderate';
  return 'centrist';
}

function buildCharges(summary: MemberSummary, persona: Persona) {
  const charges: string[] = [];

  if (summary.submittedCount > 0) {
    charges.push(
      `${summary.submittedCount} podcast submission${summary.submittedCount === 1 ? '' : 's'}, which is less a hobby and more a voting bloc.`
    );
  }

  if (summary.likesALot + summary.likes > 0 || summary.meh > 0) {
    charges.push(
      `${summary.likesALot} “I like it a lot,” ${summary.likes} “I like it,” and ${summary.meh} “Meh” votes, which is basically a written constitution.`
    );
  }

  if (summary.carveOutCount > 0) {
    const dominant = CARVE_OUT_TYPE_LABELS[summary.dominantCarveOutType || 'other'] || 'miscellaneous object lesson';
    charges.push(
      `${summary.carveOutCount} carve-outs, with a noticeable dependence on the ${dominant} aisle.`
    );
  }

  if (summary.fistBumpsGiven > 0) {
    charges.push(`${summary.fistBumpsGiven} fist bump${summary.fistBumpsGiven === 1 ? '' : 's'} issued in the carve-out economy.`);
  }

  if (summary.duplicateSubmissionTitles.length > 0) {
    charges.push(
      `Repeat-submitter behavior detected: ${summary.duplicateSubmissionTitles.map(quoteTitle).join(', ')} came back for another tour.`
    );
  }

  if (summary.totalListeningMinutesSubmitted > 0) {
    charges.push(`${summary.totalListeningMinutesSubmitted} total submitted minutes of audio. Leisure has become an assignment.`);
  }

  if (persona === 'architect') {
    charges[1] = `${summary.likesALot} ecstatic vote${summary.likesALot === 1 ? '' : 's'} out of ${summary.ratedCount} ratings. Approval is being issued like wartime rations.`;
  } else if (persona === 'enthusiast') {
    charges[1] = `Zero “Meh” ratings. Even the criticism arrives wearing a hostess smile.`;
  } else if (persona === 'grazer') {
    charges[0] = `${summary.submittedCount} submission${summary.submittedCount === 1 ? '' : 's'} versus ${summary.carveOutCount} carve-outs. The commitment ratio here is spiritually freelance.`;
  } else if (persona === 'moderate') {
    charges[1] = `${summary.likes} plain “I like it” votes. You have turned mild approval into an organizing principle.`;
  }

  return charges.slice(0, 6);
}

function roastFromSummary(summary: MemberSummary): MemberRoast {
  const signalCount = summary.submittedCount + summary.ratedCount + summary.carveOutCount;
  if (signalCount < 5) {
    return {
      headline: 'Insufficient Ammunition',
      body: [
        `${summary.member.name} has not generated enough podcast-club evidence yet to support a responsible character assassination.`,
        'There is activity, but not enough to make the jokes specific without inventing facts.'
      ],
      charges: ['Insufficient real data to roast cleanly.'],
      mostLikelyTo: 'escape roast jurisdiction by participating less',
      insufficientData: 'Not enough real submissions, ratings, or carve-outs yet.'
    };
  }

  const persona = choosePersona(summary);
  const submissions = summary.submissionExamples.map(quoteTitle);
  const carveOuts = summary.nonUrlCarveOutExamples.map(quoteTitle);
  const hosts = summary.hostExamples.map(quoteTitle);
  const dominant = CARVE_OUT_TYPE_LABELS[summary.dominantCarveOutType || 'other'] || 'miscellaneous object lesson';

  if (summary.member.name === 'John Lanza') {
    return {
      headline: 'Chairman of the Leisure Bureau',
      body: [
        `${summary.member.name} says “podcast club” the way other people say “nation-state.” ${summary.submittedCount} submissions, ${summary.carveOutCount} carve-outs, and a lineup that runs through ${oxford(submissions.slice(0, 3))} say he did not join a hobby. He founded an institution.`,
        `${summary.likesALot} ecstatic vote out of ${summary.ratedCount} ratings is the giveaway. He wants surprise, but only after it has passed governance review. Even the side menu, like ${oxford(carveOuts.slice(0, 3))}, feels less like leisure than a curriculum annex.`
      ],
      charges: buildCharges(summary, 'architect'),
      mostLikelyTo: 'turn “let’s keep this casual” into a governance framework by dessert',
      zinger: 'This is not curation. This is municipal planning with better microphones.'
    };
  }

  if (summary.member.name === 'Charlie Gilman') {
    return {
      headline: 'Dean of Gentle Improvement',
      body: [
        `${summary.member.name} submits podcasts like she is trying to save the room without embarrassing anyone. ${oxford(submissions.slice(0, 3))} are not a feed. They are an intervention conducted with excellent posture.`,
        `The ratings are even funnier: ${summary.likesALot} “I like it a lot,” ${summary.likes} “I like it,” and ${summary.meh} “Meh.” Charlie is not indecisive. She is committed to the belief that even criticism should arrive with a blanket and herbal tea.`
      ],
      charges: buildCharges(summary, 'enthusiast'),
      mostLikelyTo: 'recommend something “challenging” that still somehow has perfect bedside manner',
      zinger: 'Her taste says growth, but in a room with very flattering lighting.'
    };
  }

  if (summary.member.name === 'Steve Atlee') {
    return {
      headline: 'Patron Saint of “I Like It.”',
      body: [
        `${summary.member.name} has built an entire worldview out of moderate approval. ${summary.likes} plain “I like it” votes is not a pattern. It is a constitutional amendment.`,
        `Even his submissions, like ${oxford(submissions.slice(0, 3))}, carry the energy of a man who would like the group to be smarter, but not at the cost of anybody raising their voice. The carve-outs only deepen the case: taste, competence, and a complete refusal to make a scene.`
      ],
      charges: buildCharges(summary, 'moderate'),
      mostLikelyTo: 'make the sensible recommendation and still somehow sound like he is apologizing for its excellence',
      zinger: 'If enthusiasm had a thermostat, Steve keeps it set to “pleasantly convincing.”'
    };
  }

  if (summary.member.name === 'Babak Dadvand') {
    return {
      headline: 'Critic-at-Large, Contributor-in-Spirit',
      body: [
        `${summary.member.name} has created a remarkable arrangement with podcast club: contribute just enough to establish taste, then spend the rest of the time grading everyone else from a tasteful distance. ${summary.submittedCount} submission against ${summary.carveOutCount} carve-outs is not a ratio. It is a tax shelter.`,
        `${summary.meh} “Meh” votes and a side channel full of ${dominant} detours like ${oxford(carveOuts.slice(0, 3))} suggest a man who wants range without captivity. He does not want one lane. He wants plausible deniability across all lanes.`
      ],
      charges: buildCharges(summary, 'grazer'),
      mostLikelyTo: 'dismiss your recommendation politely, then send three cooler alternatives before you sit down',
      zinger: 'Babak does not overcommit. He curates exits.'
    };
  }

  if (summary.member.name === 'Danny Corwin') {
    return {
      headline: 'Selective Enthusiasm, Mildly Armed',
      body: [
        `${summary.member.name} behaves like a man who wants to seem open-minded while quietly keeping receipts. ${oxford(submissions.slice(0, 3))} are a strong case for curiosity, but the rating sheet keeps revealing the internal standards committee.`,
        `He is not harsh exactly, just strategically unconvinced. ${summary.likesALot} big endorsements, ${summary.likes} measured approvals, and ${summary.meh} pieces of calibrated skepticism. Danny will meet you halfway, but only after inspecting the road surface.`
      ],
      charges: buildCharges(summary, 'centrist'),
      mostLikelyTo: 'say “that was interesting” in a tone that suggests a full appeals process is still available',
      zinger: 'Danny’s taste is curious, but it wears a helmet.'
    };
  }

  switch (persona) {
    case 'architect':
      return {
        headline: 'Chairman of the Leisure Bureau',
        body: [
          `${summary.member.name} does not attend podcast club so much as chair it from inside a paneled office. ${summary.submittedCount} submissions around ${oxford(submissions.slice(0, 3))} is not casual participation. It is agenda control.`,
          `${summary.likesALot} full-throated endorsement${summary.likesALot === 1 ? '' : 's'} out of ${summary.ratedCount} ratings, plus ${summary.myPodcast} uses of “My podcast,” says the open-mindedness is mostly decorative.`
        ],
        charges: buildCharges(summary, persona),
        mostLikelyTo: 'say he wants spontaneity, then publish a framework for it',
        zinger: `When your recent syllabus runs through ${oxford(submissions.slice(0, 3))}, you are not curating a vibe. You are staffing a think tank.`
      };
    case 'enthusiast':
      return {
        headline: 'The Department of Earnest Approval',
        body: [
          `${summary.member.name} submits recommendations with the quiet confidence of someone assigning enrichment. ${oxford(submissions.slice(0, 3))} says growth, taste, and a refusal to be tacky about either.`,
          `${summary.likesALot} “I like it a lot,” ${summary.likes} “I like it,” and exactly ${summary.meh} “Meh” is less a taste profile than a hospitality strategy.`
        ],
        charges: buildCharges(summary, persona),
        mostLikelyTo: 'describe a recommendation as “challenging,” then make sure it also has excellent manners',
        zinger: 'This is not indecision. This is a total refusal to be rude to content.'
      };
    case 'grazer':
      return {
        headline: 'Critic-at-Large, Contributor-in-Spirit',
        body: [
          `${summary.member.name} has created a remarkable arrangement with podcast club: establish taste, then outsource commitment. ${summary.submittedCount} submission${summary.submittedCount === 1 ? '' : 's'} against ${summary.carveOutCount} carve-outs is a portfolio strategy, not participation.`,
          `${summary.meh} “Meh” votes and a side-channel full of ${dominant} detours like ${oxford(carveOuts.slice(0, 3))} read like someone preserving optionality at all costs.`
        ],
        charges: buildCharges(summary, persona),
        mostLikelyTo: 'reject your recommendation politely, then send three better links fifteen minutes later',
        zinger: 'The vibe is not “I have one recommendation.” The vibe is “I have a queue, and you are lucky to be near it.”'
      };
    case 'moderate':
      return {
        headline: 'Patron Saint of “I Like It.”',
        body: [
          `${summary.member.name} has the calm energy of someone who thinks moderation is a full personality. ${summary.likes} plain “I like it” votes is an astonishing commitment to middle-register approval.`,
          `Submissions like ${oxford(submissions.slice(0, 3))} and carve-outs like ${oxford(carveOuts.slice(0, 3))} only strengthen the case: taste, competence, and no interest whatsoever in making a scene.`
        ],
        charges: buildCharges(summary, persona),
        mostLikelyTo: 'make the most sensible choice in the room and somehow still seem faintly disappointed by it',
        zinger: 'If enthusiasm were a dimmer switch, this is the man who keeps it set at “tasteful restaurant.”'
      };
    case 'centrist':
    default:
      return {
        headline: 'Reasonable Taste, Excessively Managed',
        body: [
          `${summary.member.name} wants to appear adventurous while remaining within a carefully supervised radius of coherence. ${oxford(submissions.slice(0, 3))} is range with excellent supervision.`,
          `${summary.likesALot} big endorsements, ${summary.likes} measured approvals, ${summary.meh} dismissals, and carve-outs drifting through ${oxford(carveOuts.slice(0, 3))} suggest someone who wants surprise only after it has been peer reviewed.`
        ],
        charges: buildCharges(summary, persona),
        mostLikelyTo: 'call something “interesting” in a tone that means it survived a very careful screening process',
        zinger: `With hosts like ${oxford(hosts.slice(0, 2)) || 'this lineup'}, the taste is less wild than professionally laminated.`
      };
  }
}

export function buildAdminRoasts(params: {
  members: MemberLite[];
  podcasts: PodcastLite[];
  carveOuts: CarveOutLite[];
}) {
  const roasts: Record<string, MemberRoast> = {};

  for (const member of params.members) {
    const summary = summarizeMember(member, params.podcasts, params.carveOuts);
    roasts[member._id] = roastFromSummary(summary);
  }

  return roasts;
}
