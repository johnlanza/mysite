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
  hostExamples: string[];
  dominantCarveOutType: string | null;
  totalListeningMinutesSubmitted: number;
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
    submissionExamples: submitted.map((podcast) => podcast.title).slice(0, 4),
    carveOutExamples: memberCarveOuts.map((carveOut) => cleanExample(carveOut.title)).filter(Boolean).slice(0, 4),
    hostExamples,
    dominantCarveOutType: getDominantType(memberCarveOuts),
    totalListeningMinutesSubmitted: submitted.reduce((total, podcast) => total + Number(podcast.totalTimeMinutes || 0), 0)
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

  if (persona === 'architect') {
    charges[1] = `${summary.likesALot} ecstatic vote${summary.likesALot === 1 ? '' : 's'} out of ${summary.ratedCount} ratings. Approval is being issued like wartime rations.`;
  } else if (persona === 'enthusiast') {
    charges[1] = `Zero “Meh” ratings. Even the criticism arrives wearing a hostess smile.`;
  } else if (persona === 'grazer') {
    charges[0] = `${summary.submittedCount} submission${summary.submittedCount === 1 ? '' : 's'} versus ${summary.carveOutCount} carve-outs. The commitment ratio here is spiritually freelance.`;
  } else if (persona === 'moderate') {
    charges[1] = `${summary.likes} plain “I like it” votes. You have turned mild approval into an organizing principle.`;
  }

  return charges.slice(0, 3);
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
  const carveOuts = summary.carveOutExamples.map(quoteTitle);
  const hosts = summary.hostExamples.map(quoteTitle);
  const dominant = CARVE_OUT_TYPE_LABELS[summary.dominantCarveOutType || 'other'] || 'miscellaneous object lesson';

  switch (persona) {
    case 'architect':
      return {
        headline: 'Chairman of the Leisure Bureau',
        body: [
          `${summary.member.name} does not attend podcast club so much as administer it from inside a paneled office. ${summary.submittedCount} submissions and ${summary.carveOutCount} carve-outs means the man said “let’s keep this casual” and then immediately built a municipal code around ${oxford(submissions.slice(0, 3))}.`,
          `The funniest part is the rating posture: ${summary.likesALot} full-throated endorsement${summary.likesALot === 1 ? '' : 's'} out of ${summary.ratedCount} ratings, plus ${summary.myPodcast} uses of “My podcast.” That is not open-minded listening. That is a constitutional monarchy pretending to be a town hall. Even the side interests, like ${oxford(carveOuts.slice(0, 3))}, feel like agenda items for a salon with attendance tracking.`
        ],
        charges: buildCharges(summary, persona),
        mostLikelyTo: 'say he wants spontaneity, then publish a framework for it',
        zinger: `When your recent syllabus runs through ${oxford(submissions.slice(0, 3))}, you are not curating a vibe. You are staffing a think tank.`
      };
    case 'enthusiast':
      return {
        headline: 'The Department of Earnest Approval',
        body: [
          `${summary.member.name} submits recommendations the way a beloved humanities teacher assigns summer reading: with absolute sincerity and the quiet belief that all of us can still be improved. The trail from ${oxford(submissions.slice(0, 3))} says culture, empathy, and uplift are not preferences here. They are a municipal service.`,
          `Then come the ratings: ${summary.likesALot} “I like it a lot,” ${summary.likes} “I like it,” and exactly ${summary.meh} “Meh.” That is less a taste profile than a public-relations strategy. Even the carve-outs, from ${oxford(carveOuts.slice(0, 3))}, suggest someone who wants stimulation, but only if it arrives upholstered, house-trained, and carrying a nice tote.`
        ],
        charges: buildCharges(summary, persona),
        mostLikelyTo: 'describe a recommendation as “challenging,” then make sure it also has excellent manners',
        zinger: 'This is not indecision. This is a total refusal to be rude to content.'
      };
    case 'grazer':
      return {
        headline: 'Critic-at-Large, Contributor-in-Spirit',
        body: [
          `${summary.member.name} has created a remarkable arrangement with podcast club: contribute just enough to establish taste, then spend the rest of the time grading everyone else from a tasteful distance. ${summary.submittedCount} submission${summary.submittedCount === 1 ? '' : 's'} against ${summary.carveOutCount} carve-outs is a portfolio strategy, not participation.`,
          `The pattern is all there. ${summary.meh} “Meh” votes, only ${summary.submittedCount} owned recommendation${summary.submittedCount === 1 ? '' : 's'}, and a side-channel full of ${dominant} detours like ${oxford(carveOuts.slice(0, 3))}. It reads like someone who wants to be known as eclectic without ever being trapped by full commitment.`
        ],
        charges: buildCharges(summary, persona),
        mostLikelyTo: 'reject your recommendation politely, then send three better links fifteen minutes later',
        zinger: 'The vibe is not “I have one recommendation.” The vibe is “I have a queue, and you are lucky to be near it.”'
      };
    case 'moderate':
      return {
        headline: 'Patron Saint of “I Like It.”',
        body: [
          `${summary.member.name} has the calm, unnerving energy of someone who thinks moderation is not just a virtue but a full personality. ${summary.likes} plain “I like it” votes is an astonishing commitment to middle-register approval. The feed says yes, the face says maybe, and the actual opinion quietly goes home by 9:30.`,
          `The supporting evidence is weirdly endearing: submissions like ${oxford(submissions.slice(0, 3))}, carve-outs like ${oxford(carveOuts.slice(0, 3))}, and a general refusal to behave as though taste should ever need a dramatic flourish. This is the audio equivalent of bringing exactly the right bottle of wine and then making no speech about it.`
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
          `${summary.member.name} gives off the distinct impression of wanting to appear adventurous while remaining within a carefully supervised radius of coherence. Submissions like ${oxford(submissions.slice(0, 3))} are smart, competent, and just edgy enough to claim range without ever threatening the furniture.`,
          `The larger profile is pure orderliness: ${summary.likesALot} big endorsements, ${summary.likes} measured approvals, ${summary.meh} controlled dismissals, and a carve-out list that wanders through ${oxford(carveOuts.slice(0, 3))}. Nothing here is chaotic. It is the work of someone who wants to be surprised, but only after the surprise has been peer reviewed.`
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
