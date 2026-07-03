import mongoose from 'mongoose';

declare global {
  var mongooseCache: {
    conn: typeof mongoose | null;
    promise: Promise<typeof mongoose> | null;
  } | undefined;
}

const cache = global.mongooseCache ?? { conn: null, promise: null };
global.mongooseCache = cache;

export async function connectToDatabase() {
  if (cache.conn) return cache.conn;

  if (!cache.promise) {
    const mongoUri = process.env.MONGODB_URI || '';
    if (!mongoUri) {
      throw new Error('Missing MONGODB_URI in environment variables');
    }

    cache.promise = mongoose.connect(mongoUri, {
      dbName: process.env.MONGODB_DB || 'podcast_club'
    });
  }

  cache.conn = await cache.promise;
  return cache.conn;
}
