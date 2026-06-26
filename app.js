// Load environment variables except during tests
if (process.env.NODE_ENV !== "test") {
  require("dotenv").config();
}

// -----------------------
// Imports
// -----------------------
const express = require("express");
const path = require("path");
const fs = require("fs");
const slugify = require("slugify");
const expressLayouts = require("express-ejs-layouts");
const mongoose = require("mongoose");
const methodOverride = require("method-override");
const flash = require("connect-flash");
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const session = require("express-session");
const MongoStore = require("connect-mongo");
const multer = require("multer");
const sharp = require("sharp");
const { createRequire } = require("module");
const http = require("http");
const { spawn } = require("child_process");

// MODELS
const Event = require("./models/events");
const Idea = require("./models/ideas");
const Book = require("./models/books");
const User = require("./models/users");
const Game = require("./models/games");
const HomekeeperSync = require("./models/homekeeperSync");

const { isLoggedIn } = require("./middleware");
const userRoutes = require("./routes/users");

// -----------------------
// App Init
// -----------------------
const app = express();

const zetteDir = path.join(__dirname, "zette");
process.env.ZETTE_ROOT = zetteDir;
process.env.NEXT_PUBLIC_ZETTE_BASE_PATH =
  process.env.NEXT_PUBLIC_ZETTE_BASE_PATH || "/zette";
const runZetteOutOfProcess = process.env.NODE_ENV === "production";
const zettePort = Number(process.env.ZETTE_PORT || 3101);
let zetteProcess;
let zetteApp;
let zetteHandler;

if (!runZetteOutOfProcess) {
  const zetteRequire = createRequire(path.join(zetteDir, "package.json"));
  const zetteNext = zetteRequire("next");
  zetteApp = zetteNext({
    dev: true,
    dir: zetteDir,
  });
  zetteHandler = zetteApp.getRequestHandler();
}

const podcastClubDir = path.join(__dirname, "podcast_club");
process.env.NEXT_PUBLIC_BASE_PATH =
  process.env.NEXT_PUBLIC_BASE_PATH || "/podcastclub";
const podcastRequire = createRequire(path.join(podcastClubDir, "package.json"));
const next = podcastRequire("next");
const nextApp = next({
  dev: process.env.NODE_ENV !== "production",
  dir: podcastClubDir
});
const nextHandler = nextApp.getRequestHandler();

const poolaramaDir = path.join(__dirname, "poolarama");
process.env.NEXT_PUBLIC_POOLARAMA_BASE_PATH =
  process.env.NEXT_PUBLIC_POOLARAMA_BASE_PATH || "/poolarama";
const poolaramaRequire = createRequire(path.join(poolaramaDir, "package.json"));
const poolaramaNext = poolaramaRequire("next");
const poolaramaApp = poolaramaNext({
  dev: process.env.NODE_ENV !== "production",
  dir: poolaramaDir
});
const poolaramaHandler = poolaramaApp.getRequestHandler();
const poolaramaSyncIntervalMs = Number(
  process.env.POOLARAMA_SYNC_INTERVAL_MS || 3 * 60 * 1000
);

// -----------------------
// DB Connection
// -----------------------
async function connectDB() {
  try {
    const isLocalMongo =
      /^mongodb:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::|\/)/.test(
        process.env.DB_URL || ""
      );
    const dbOptions = {
      serverSelectionTimeoutMS: 30000,
    };

    if (!isLocalMongo) {
      Object.assign(dbOptions, {
        retryWrites: true,
        w: "majority",
        tls: true,
      });
    }

    await mongoose.connect(process.env.DB_URL, dbOptions);
  } catch (err) {
    console.error("MongoDB connection error:", err.message);
    setTimeout(connectDB, 5000);
  }
}
connectDB();

// Graceful shutdown for Render
async function shutdown() {
  try {
    await mongoose.connection.close();
  } finally {
    process.exit(0);
  }
}

process.on("SIGTERM", () => {
  shutdown();
});

process.on("SIGINT", () => {
  shutdown();
});

// -----------------------
// Middleware
// -----------------------
app.all("/poolarama*", (req, res) => {
  return poolaramaHandler(req, res);
});

// -----------------------
// Podcast Club (Next.js)
// -----------------------
app.all("/podcastclub*", (req, res) => {
  return nextHandler(req, res);
});

app.use(expressLayouts);
app.use(express.static("public"));
app.use("/music", express.static("music"));
app.use(methodOverride("_method"));
app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: true }));
app.set("trust proxy", 1);

// -----------------------
// Session Store
// -----------------------
const sessionConfig = {
  secret: process.env.SESSION_KEY || "fallbacksecret",
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.DB_URL,
    dbName: "mysite",
    collectionName: "sessions",
    ttl: 24 * 60 * 60,
    autoRemove: "native",
  }),
  cookie: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 24,
  },
};
app.use(session(sessionConfig));

// Flash
app.use(flash());

// -----------------------
// Passport
// -----------------------
app.use(passport.initialize());
app.use(passport.session());

passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

// -----------------------
// Locals
// -----------------------
app.use((req, res, next) => {
  res.locals.currentUser = req.user;
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  next();
});

// -----------------------
// View Engine
// -----------------------
app.set("layout", "layouts/boilerplate");
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// -----------------------
// File Upload Setup (Games & Books Images)
// -----------------------
const upload = multer({ storage: multer.memoryStorage() });

// Game images: public/images/games → /images/games/...
const GAME_IMAGE_DIR = path.join(__dirname, "public", "images", "games");
if (!fs.existsSync(GAME_IMAGE_DIR)) {
  fs.mkdirSync(GAME_IMAGE_DIR, { recursive: true });
}

async function processGameImage(fileBuffer) {
  const filename = `game-${Date.now()}.jpg`;
  const outPath = path.join(GAME_IMAGE_DIR, filename);

  // Only constrain height; width adjusts to preserve aspect ratio.
  const processedBuffer = await sharp(fileBuffer)
    .resize({ height: 300 }) // no width, no cropping
    .toFormat("jpeg")
    .jpeg({ quality: 80 })
    .toBuffer();

  // Keep a local copy for fast serving in dev; DB stores the durable copy.
  await fs.promises.writeFile(outPath, processedBuffer);

  return {
    imageUrl: `/images/games/${filename}`,
    imageFilename: filename,
    imageContentType: "image/jpeg",
    imageData: processedBuffer,
  };
}

// Book images: public/images/books → /images/books/...
const BOOK_IMAGE_DIR = path.join(__dirname, "public", "images", "books");
if (!fs.existsSync(BOOK_IMAGE_DIR)) {
  fs.mkdirSync(BOOK_IMAGE_DIR, { recursive: true });
}

async function processBookImage(fileBuffer) {
  const filename = `book-${Date.now()}.jpg`;
  const outPath = path.join(BOOK_IMAGE_DIR, filename);

  // Only constrain height; width adjusts to preserve aspect ratio.
  const processedBuffer = await sharp(fileBuffer)
    .resize({ height: 300 }) // no width, no cropping
    .toFormat("jpeg")
    .jpeg({ quality: 80 })
    .toBuffer();

  // Keep a local copy for fast serving in dev; DB stores the durable copy.
  await fs.promises.writeFile(outPath, processedBuffer);

  return {
    imageUrl: `/images/books/${filename}`,
    imageFilename: filename,
    imageContentType: "image/jpeg",
    imageData: processedBuffer,
  };
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Serve images from Mongo if the on-disk copy disappeared (e.g., after a redeploy)
async function serveImageFromDb(Model, dirPath, filename, res, next) {
  const match = await Model.findOne({
    $or: [
      { imageFilename: filename },
      { imageUrl: new RegExp(`${escapeRegex(filename)}$`) },
    ],
  });

  if (!match || !match.imageData) return next();

  const contentType = match.imageContentType || "image/jpeg";
  res.set("Content-Type", contentType);

  // Write a fresh copy to disk so subsequent requests can be served statically.
  if (dirPath) {
    const filePath = path.join(dirPath, filename);
    try {
      await fs.promises.mkdir(dirPath, { recursive: true });
      await fs.promises.writeFile(filePath, match.imageData);
    } catch (err) {
      console.error("Could not persist image to disk:", err.message);
    }
  }

  return res.send(match.imageData);
}

app.get("/images/books/:filename", async (req, res, next) => {
  try {
    await serveImageFromDb(Book, BOOK_IMAGE_DIR, req.params.filename, res, next);
  } catch (err) {
    next(err);
  }
});

app.get("/images/games/:filename", async (req, res, next) => {
  try {
    await serveImageFromDb(Game, GAME_IMAGE_DIR, req.params.filename, res, next);
  } catch (err) {
    next(err);
  }
});

// -----------------------
// Routes
// -----------------------
app.use("/", userRoutes);

app.get("/", (req, res) => {
  res.render("home");
});

app.get("/joes-money-quest", (req, res) => {
  res.sendFile(path.join(__dirname, "joes-money-quest.html"));
});

// -----------------------
// EVENTS
// -----------------------
app.get("/events", async (req, res, next) => {
  try {
    const events = await Event.find({}).sort({ year: 1 });
    res.render("events", { events });
  } catch (err) {
    next(err);
  }
});

app.get("/events/newevent", isLoggedIn, (req, res) => {
  res.render("newevent");
});

app.get("/events/:id/editevent", isLoggedIn, async (req, res, next) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).send("Event not found");
    res.render("editevent", { event });
  } catch (err) {
    next(err);
  }
});

app.put("/events/:id", isLoggedIn, async (req, res) => {
  await Event.findByIdAndUpdate(req.params.id, req.body.event, { new: true });
  res.redirect("/events");
});

app.delete("/events/:id", isLoggedIn, async (req, res) => {
  try {
    await Event.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: "Event deleted" });
  } catch {
    res.status(500).json({ message: "Delete failed" });
  }
});

app.post("/events", isLoggedIn, async (req, res, next) => {
  try {
    await new Event(req.body.event).save();
    res.redirect("/events");
  } catch (err) {
    next(err);
  }
});

// -----------------------
// BOOKS + SLUG + IMAGE
// -----------------------
app.get("/books", async (req, res, next) => {
  try {
    const books = await Book.find({})
      .collation({ locale: "en", strength: 2 })
      .sort({ author: 1 });
    const events = await Event.find({}).sort({ year: 1 });
    res.render("books", {
      books,
      events,
      sharedSlug: null,
      errorMessage: null,
    });
  } catch (err) {
    next(err);
  }
});

app.get("/books/newbook", isLoggedIn, (req, res) => {
  res.render("newbook", { errorMessage: null });
});

app.post(
  "/books",
  isLoggedIn,
  upload.single("image"),
  async (req, res, next) => {
    try {
      const data = req.body.book;
      data.slug = slugify(data.title, { lower: true, strict: true });

      if (req.file && req.file.buffer) {
        const processedImage = await processBookImage(req.file.buffer);
        data.imageUrl = processedImage.imageUrl;
        data.imageFilename = processedImage.imageFilename;
        data.imageContentType = processedImage.imageContentType;
        data.imageData = processedImage.imageData;
      }

      await new Book(data).save();
      res.redirect("/books");
    } catch (err) {
      next(err);
    }
  }
);

app.get("/books/:id/editbook", isLoggedIn, async (req, res, next) => {
  const book = await Book.findById(req.params.id);
  if (!book) return res.status(404).send("Book not found");
  res.render("editbook", { book, errorMessage: null });
});

app.put(
  "/books/:id",
  isLoggedIn,
  upload.single("image"),
  async (req, res, next) => {
    try {
      const data = req.body.book;
      data.slug = slugify(data.title, { lower: true, strict: true });

      if (req.file && req.file.buffer) {
        const processedImage = await processBookImage(req.file.buffer);
        data.imageUrl = processedImage.imageUrl;
        data.imageFilename = processedImage.imageFilename;
        data.imageContentType = processedImage.imageContentType;
        data.imageData = processedImage.imageData;
      }

      await Book.findByIdAndUpdate(req.params.id, data);
      res.redirect("/books");
    } catch (err) {
      next(err);
    }
  }
);

app.delete("/books/:id", isLoggedIn, async (req, res) => {
  await Book.findByIdAndDelete(req.params.id);
  res.status(200).json({ message: "Book deleted" });
});

// Slug → ID for books
app.get("/books/book-id-from-slug/:slug", async (req, res) => {
  try {
    const book = await Book.findOne({ slug: req.params.slug });
    if (!book) return res.status(404).json({ error: "Book not found" });
    res.json({ id: book._id });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Pretty Permalink for books
app.get("/books/:slug", async (req, res) => {
  try {
    const book = await Book.findOne({ slug: req.params.slug });
    const books = await Book.find({})
      .collation({ locale: "en", strength: 2 })
      .sort({ author: 1 });
    const events = await Event.find({}).sort({ year: 1 });

    if (!book) {
      return res.status(404).render("books", {
        books,
        events,
        sharedSlug: null,
        errorMessage: "Sorry — that book doesn't exist.",
      });
    }

    res.render("books", {
      books,
      events,
      sharedSlug: req.params.slug,
      errorMessage: null,
    });
  } catch (err) {
    res.status(500).send("Server error");
  }
});

// -----------------------
// GAMES
// -----------------------
app.get("/games", async (req, res, next) => {
  try {
    const games = await Game.find({}).sort({ title: 1 });
    res.render("games", {
      games,
      sharedSlug: null,
      errorMessage: null,
    });
  } catch (err) {
    next(err);
  }
});

app.get("/games/newgame", isLoggedIn, (req, res) => {
  res.render("newgame", { errorMessage: null });
});

app.post(
  "/games",
  isLoggedIn,
  upload.single("image"),
  async (req, res, next) => {
    try {
      const data = req.body.game;
      if (!data || !data.title) {
        return res.render("newgame", {
          errorMessage: "Title is required.",
        });
      }

      data.slug = slugify(data.title, { lower: true, strict: true });

      if (req.file && req.file.buffer) {
        const processedImage = await processGameImage(req.file.buffer);
        data.imageUrl = processedImage.imageUrl;
        data.imageFilename = processedImage.imageFilename;
        data.imageContentType = processedImage.imageContentType;
        data.imageData = processedImage.imageData;
      }

      await new Game(data).save();
      res.redirect("/games");
    } catch (err) {
      next(err);
    }
  }
);

app.get("/games/:id/editgame", isLoggedIn, async (req, res, next) => {
  try {
    const game = await Game.findById(req.params.id);
    if (!game) return res.status(404).send("Game not found");
    res.render("editgame", { game, errorMessage: null });
  } catch (err) {
    next(err);
  }
});

app.put(
  "/games/:id",
  isLoggedIn,
  upload.single("image"),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const data = req.body.game;

      if (!data || !data.title) {
        const game = await Game.findById(id);
        return res.render("editgame", {
          game,
          errorMessage: "Title is required.",
        });
      }

      data.slug = slugify(data.title, { lower: true, strict: true });

      if (req.file && req.file.buffer) {
        const processedImage = await processGameImage(req.file.buffer);
        data.imageUrl = processedImage.imageUrl;
        data.imageFilename = processedImage.imageFilename;
        data.imageContentType = processedImage.imageContentType;
        data.imageData = processedImage.imageData;
      }

      const game = await Game.findByIdAndUpdate(id, data, {
        new: true,
        runValidators: true,
      });

      if (!game) {
        return res.redirect("/games");
      }

      res.redirect(`/games?game=${game._id}#${game._id}`);
    } catch (err) {
      next(err);
    }
  }
);

app.delete("/games/:id", isLoggedIn, async (req, res) => {
  try {
    await Game.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: "Game deleted" });
  } catch (err) {
    res.status(500).json({ message: "Delete failed" });
  }
});

// Slug → ID for games
app.get("/games/game-id-from-slug/:slug", async (req, res) => {
  try {
    const game = await Game.findOne({ slug: req.params.slug });
    if (!game) return res.status(404).json({ error: "Game not found" });
    res.json({ id: game._id });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Pretty permalink for games
// NOTE: this must come AFTER the more specific /games/... routes above.
app.get("/games/:slug", async (req, res) => {
  try {
    const game = await Game.findOne({ slug: req.params.slug });
    const games = await Game.find({}).sort({ title: 1 });

    if (!game) {
      return res.status(404).render("games", {
        games,
        sharedSlug: null,
        errorMessage: "Sorry — that game doesn't exist.",
      });
    }

    res.render("games", {
      games,
      sharedSlug: req.params.slug,
      errorMessage: null,
    });
  } catch (err) {
    res.status(500).send("Server error");
  }
});

// -----------------------
// IDEAS
// -----------------------
app.get("/ideas", async (req, res, next) => {
  try {
    const ideas = await Idea.find({});
    res.render("ideas", { ideas });
  } catch (err) {
    next(err);
  }
});

app.get("/ideas/newidea", isLoggedIn, (req, res) => {
  res.render("newidea");
});

app.get("/ideas/:id/editidea", isLoggedIn, async (req, res, next) => {
  const idea = await Idea.findById(req.params.id);
  if (!idea) return res.status(404).send("Idea not found");
  res.render("editidea", { idea });
});

app.put("/ideas/:id", isLoggedIn, async (req, res) => {
  await Idea.findByIdAndUpdate(req.params.id, req.body.idea);
  res.redirect("/ideas");
});

app.delete("/ideas/:id", isLoggedIn, async (req, res) => {
  await Idea.findByIdAndDelete(req.params.id);
  res.status(200).json({ message: "Idea deleted" });
});

app.post("/ideas", isLoggedIn, async (req, res, next) => {
  try {
    await new Idea(req.body.idea).save();
    res.redirect("/ideas");
  } catch (err) {
    next(err);
  }
});

// -----------------------
// Homekeeper sync
// -----------------------
function isValidSyncKeyHash(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

function isDatabaseReady() {
  return mongoose.connection.readyState === 1;
}

app.get("/api/homekeeper-sync", async (req, res, next) => {
  try {
    const syncKeyHash = req.query.key;
    if (!isValidSyncKeyHash(syncKeyHash)) {
      return res.status(400).json({ error: "Invalid sync key." });
    }

    if (!isDatabaseReady()) {
      return res.status(503).json({ error: "Sync storage is unavailable." });
    }

    const backup = await HomekeeperSync.findOne({ syncKeyHash }).lean();
    if (!backup) {
      return res.json({ exists: false });
    }

    res.json({
      exists: true,
      state: backup.state,
      updatedAt: backup.updatedAt,
    });
  } catch (err) {
    next(err);
  }
});

app.put("/api/homekeeper-sync", async (req, res, next) => {
  try {
    const { syncKeyHash, state } = req.body || {};
    if (!isValidSyncKeyHash(syncKeyHash)) {
      return res.status(400).json({ error: "Invalid sync key." });
    }

    if (!state || typeof state !== "object" || Array.isArray(state)) {
      return res.status(400).json({ error: "Invalid backup state." });
    }

    if (JSON.stringify(state).length > 200000) {
      return res.status(413).json({ error: "Backup state is too large." });
    }

    if (!isDatabaseReady()) {
      return res.status(503).json({ error: "Sync storage is unavailable." });
    }

    const backup = await HomekeeperSync.findOneAndUpdate(
      { syncKeyHash },
      { $set: { state } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    res.json({
      ok: true,
      updatedAt: backup.updatedAt,
    });
  } catch (err) {
    next(err);
  }
});

// -----------------------
// Zette (Next.js)
// -----------------------
app.all("/zette*", (req, res) => {
  if (runZetteOutOfProcess) {
    return proxyToZette(req, res);
  }
  return zetteHandler(req, res);
});

// -----------------------
// Error Handler
// -----------------------
app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(500).send("Something went wrong!");
});

// -----------------------
// Start Server
// -----------------------
const PORT = process.env.PORT || 3000;

async function startServer() {
  if (runZetteOutOfProcess) {
    await startZetteProcess();
  } else {
    await zetteApp.prepare();
  }
  await nextApp.prepare();
  await poolaramaApp.prepare();
  app.listen(PORT, () => {
    console.log(`Server running on ${PORT}`);
    startPoolaramaLiveSync();
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

function startPoolaramaLiveSync() {
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.POOLARAMA_DISABLE_AUTO_SYNC === "true") return;
  if (poolaramaSyncIntervalMs <= 0) return;
  if (!process.env.POOLARAMA_ADMIN_TOKEN) {
    console.error("Poolarama live sync disabled: missing POOLARAMA_ADMIN_TOKEN.");
    return;
  }

  const sync = () => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: "/poolarama/api/admin/sync-standings",
        method: "POST",
        timeout: 30000,
        headers: {
          "x-poolarama-admin": process.env.POOLARAMA_ADMIN_TOKEN
        }
      },
      (res) => {
        res.resume();
        if (!res.statusCode || res.statusCode >= 400) {
          console.error(`Poolarama live sync failed with status ${res.statusCode}`);
        }
      }
    );

    req.on("error", (err) => {
      console.error("Poolarama live sync error:", err.message);
    });
    req.on("timeout", () => {
      req.destroy();
      console.error("Poolarama live sync timed out");
    });
    req.end();
  };

  setTimeout(sync, 15000);
  setInterval(sync, poolaramaSyncIntervalMs);
}

function startZetteProcess() {
  if (zetteProcess) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(zettePort),
      NEXT_PUBLIC_ZETTE_BASE_PATH:
        process.env.NEXT_PUBLIC_ZETTE_BASE_PATH || "/zette",
    };
    zetteProcess = spawn(
      "npm",
      ["run", "start", "--", "--hostname", "127.0.0.1", "--port", String(zettePort)],
      {
        cwd: zetteDir,
        env,
        stdio: "inherit",
      }
    );

    zetteProcess.once("error", reject);
    zetteProcess.once("exit", (code, signal) => {
      if (code !== 0 && code !== null) {
        reject(new Error(`Zette exited during startup with code ${code}`));
      } else if (signal) {
        reject(new Error(`Zette exited during startup from signal ${signal}`));
      }
    });

    waitForZette()
      .then(resolve)
      .catch(reject);
  });
}

function waitForZette(attempt = 1) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: zettePort,
        path: "/zette/manifest.webmanifest",
        method: "GET",
        timeout: 1000,
      },
      (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) return resolve();
        retry();
      }
    );

    req.on("error", retry);
    req.on("timeout", () => {
      req.destroy();
      retry();
    });
    req.end();

    function retry() {
      if (attempt >= 40) {
        reject(new Error("Timed out waiting for Zette to start"));
        return;
      }
      setTimeout(() => waitForZette(attempt + 1).then(resolve, reject), 500);
    }
  });
}

function proxyToZette(req, res) {
  const proxyReq = http.request(
    {
      hostname: "127.0.0.1",
      port: zettePort,
      method: req.method,
      path: req.originalUrl,
      headers: {
        ...req.headers,
        host: `127.0.0.1:${zettePort}`,
      },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );

  proxyReq.on("error", (err) => {
    console.error("Zette proxy error:", err.message);
    if (!res.headersSent) {
      res.status(502).send("Zette is unavailable");
    } else {
      res.end();
    }
  });

  req.pipe(proxyReq);
}

process.on("SIGTERM", () => {
  if (zetteProcess && !zetteProcess.killed) zetteProcess.kill("SIGTERM");
});
