export type Member = {
  _id: string;
  name: string;
  email: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  address: string;
  isAdmin: boolean;
  accountStatus?: 'pending' | 'claimed';
};

export type SessionMember = Member & {
  isImpersonating?: boolean;
  impersonatorId?: string;
  impersonatorName?: string;
};

export type PodcastRating = {
  member: { _id: string; name: string };
  value: string;
  points: number;
};

export type Podcast = {
  _id: string;
  title: string;
  host: string;
  episodeCount: number;
  episodeNames: string;
  totalTimeMinutes: number;
  link: string;
  notes?: string;
  status: 'pending' | 'discussed';
  submittedBy: { _id: string; name: string };
  ratings: PodcastRating[];
  rankingScore: number;
  missingVoters: string[];
  discussedMeeting?: string | null;
  discussedMeetingDate?: string | null;
};

export type Meeting = {
  _id: string;
  date: string;
  host: { _id: string; name: string; address?: string };
  podcast?: {
    _id: string;
    title: string;
    link: string;
    host?: string;
    episodeCount?: number;
    episodeNames?: string;
    totalTimeMinutes?: number;
    notes?: string;
  } | null;
  location: string;
  status?: 'scheduled' | 'completed';
  completedAt?: string | null;
  notes?: string;
};

export type CarveOut = {
  _id: string;
  title: string;
  type: string;
  url?: string;
  notes?: string;
  member: { _id: string; name: string };
  meeting: { _id: string; date: string };
};
