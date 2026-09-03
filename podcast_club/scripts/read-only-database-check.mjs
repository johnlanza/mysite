#!/usr/bin/env node

import mongoose from 'mongoose';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || 'podcast_club';

if (!uri) {
  console.error('MONGODB_URI is required. No connection was attempted.');
  process.exit(1);
}

await mongoose.connect(uri, { dbName, autoCreate: false, autoIndex: false });

try {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database connection is unavailable.');

  const members = db.collection('members');
  const podcasts = db.collection('podcasts');
  const meetings = db.collection('meetings');
  const carveOuts = db.collection('carveouts');
  const resetTokens = db.collection('passwordresettokens');

  const [memberDocs, podcastDocs, meetingDocs, carveOutDocs] = await Promise.all([
    members.find({}, { projection: { _id: 1 } }).toArray(),
    podcasts.find({}, { projection: { _id: 1, submittedBy: 1, ratings: 1, status: 1, totalTimeMinutes: 1 } }).toArray(),
    meetings.find({}, { projection: { _id: 1, host: 1, podcast: 1, podcasts: 1, status: 1 } }).toArray(),
    carveOuts.find({}, { projection: { _id: 1, member: 1, meeting: 1 } }).toArray()
  ]);

  const memberIds = new Set(memberDocs.map((member) => String(member._id)));
  const podcastIds = new Set(podcastDocs.map((podcast) => String(podcast._id)));
  const meetingIds = new Set(meetingDocs.map((meeting) => String(meeting._id)));
  const invalidDurations = podcastDocs.filter(
    (podcast) => !Number.isFinite(Number(podcast.totalTimeMinutes)) || Number(podcast.totalTimeMinutes) <= 1
  ).length;
  const duplicateMemberEmails = await members.aggregate([
    { $group: { _id: { $toLower: '$email' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $count: 'groups' }
  ]).toArray();
  const reminderKeyTypes = await members.aggregate([
    { $group: { _id: { $type: '$weeklyPodcastReminderKey' }, count: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ]).toArray();
  const resetTokenIndexes = await resetTokens.indexes();
  const resetTokenExpiryIndex = resetTokenIndexes.find((index) => index.key?.expiresAt === 1);

  const orphanCounts = {
    podcastSubmitters: podcastDocs.filter((podcast) => !memberIds.has(String(podcast.submittedBy))).length,
    podcastRatingMembers: podcastDocs.reduce(
      (count, podcast) => count + (podcast.ratings || []).filter((rating) => !memberIds.has(String(rating.member))).length,
      0
    ),
    meetingHosts: meetingDocs.filter((meeting) => !memberIds.has(String(meeting.host))).length,
    meetingPodcasts: meetingDocs.reduce((count, meeting) => {
      const ids = meeting.podcasts?.length ? meeting.podcasts : meeting.podcast ? [meeting.podcast] : [];
      return count + ids.filter((podcastId) => !podcastIds.has(String(podcastId))).length;
    }, 0),
    carveOutMembers: carveOutDocs.filter((carveOut) => !memberIds.has(String(carveOut.member))).length,
    carveOutMeetings: carveOutDocs.filter((carveOut) => !meetingIds.has(String(carveOut.meeting))).length
  };

  const summary = {
    counts: {
      members: memberDocs.length,
      podcasts: podcastDocs.length,
      pendingPodcasts: podcastDocs.filter((podcast) => podcast.status === 'pending').length,
      discussedPodcasts: podcastDocs.filter((podcast) => podcast.status === 'discussed').length,
      meetings: meetingDocs.length,
      carveOuts: carveOutDocs.length
    },
    invalidDurations,
    duplicateMemberEmailGroups: duplicateMemberEmails[0]?.groups || 0,
    orphanCounts,
    weeklyReminderKeyTypes: Object.fromEntries(reminderKeyTypes.map((entry) => [entry._id, entry.count])),
    passwordResetExpiryTtlSeconds: resetTokenExpiryIndex?.expireAfterSeconds ?? null
  };

  console.log(JSON.stringify(summary, null, 2));

  const criticalFailures = [
    invalidDurations,
    summary.duplicateMemberEmailGroups,
    orphanCounts.podcastSubmitters,
    orphanCounts.podcastRatingMembers,
    orphanCounts.meetingHosts,
    orphanCounts.meetingPodcasts,
    orphanCounts.carveOutMembers
  ].reduce((total, count) => total + count, 0);

  if (criticalFailures > 0) {
    throw new Error(`Read-only database check found ${criticalFailures} critical integrity issue(s).`);
  }
  if (orphanCounts.carveOutMeetings > 0) {
    console.warn(`WARN ${orphanCounts.carveOutMeetings} carve-out(s) reference a missing meeting.`);
  }
  if (summary.passwordResetExpiryTtlSeconds !== 0) {
    console.warn('WARN Password reset expiry index is not configured as a TTL index.');
  }
  if (summary.weeklyReminderKeyTypes.array) {
    console.warn(`WARN ${summary.weeklyReminderKeyTypes.array} weekly reminder key(s) retain the temporary array lock shape.`);
  }

  console.log('Read-only database check passed with any known warnings shown above.');
} finally {
  await mongoose.disconnect();
}
