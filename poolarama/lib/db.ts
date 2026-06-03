import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";

declare global {
  // eslint-disable-next-line no-var
  var poolaramaMongooseCache:
    | {
        conn: typeof mongoose | null;
        promise: Promise<typeof mongoose> | null;
      }
    | undefined;
}

const cache = global.poolaramaMongooseCache ?? { conn: null, promise: null };
global.poolaramaMongooseCache = cache;

const allowedParentEnvKeys = new Set(["POOLARAMA_MONGODB_URI", "MONGODB_URI", "DB_URL", "POOLARAMA_DB_NAME"]);
let parentEnvCache: Record<string, string> | null = null;

function parseParentEnv() {
  if (parentEnvCache) return parentEnvCache;

  parentEnvCache = {};
  const parentEnvPath = path.resolve(process.cwd(), "..", ".env");

  if (!fs.existsSync(parentEnvPath)) {
    return parentEnvCache;
  }

  const lines = fs.readFileSync(parentEnvPath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith("#")) continue;

    const equalsIndex = trimmedLine.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = trimmedLine.slice(0, equalsIndex).trim();
    if (!allowedParentEnvKeys.has(key)) continue;

    let value = trimmedLine.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    parentEnvCache[key] = value;
  }

  return parentEnvCache;
}

function getEnvValue(key: string) {
  return process.env[key] || parseParentEnv()[key] || "";
}

function getMongoUri() {
  return getEnvValue("POOLARAMA_MONGODB_URI") || getEnvValue("MONGODB_URI") || getEnvValue("DB_URL");
}

export function hasMongoUri() {
  return Boolean(getMongoUri());
}

export async function connectToPoolaramaDatabase() {
  if (cache.conn) return cache.conn;

  const uri = getMongoUri();

  if (!uri) {
    return null;
  }

  if (!cache.promise) {
    const isLocalMongo = /^mongodb:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::|\/)/.test(uri);
    const options: mongoose.ConnectOptions = {
      dbName: getEnvValue("POOLARAMA_DB_NAME") || "poolarama",
      serverSelectionTimeoutMS: 5000
    };

    if (!isLocalMongo) {
      Object.assign(options, {
        retryWrites: true,
        w: "majority",
        tls: true
      });
    }

    cache.promise = mongoose.connect(uri, options);
  }

  try {
    cache.conn = await cache.promise;
    return cache.conn;
  } catch (error) {
    cache.promise = null;
    cache.conn = null;
    throw error;
  }
}
