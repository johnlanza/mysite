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

// MODELS
const Event = require("./models/events");
const Idea = require("./models/ideas");
const Book = require("./models/books");
const User = require("./models/users");
const Game = require("./models/games");

const { isLoggedIn } = require("./middleware");
const userRoutes = require("./routes/users");

// -----------------------
// App Init
// -----------------------
const app = express();

// -----------------------
// DB Connection
// -----------------------
async function connectDB() {
  try {
    await mongoose.connect(process.env.DB_URL, {
      serverSelectionTimeoutMS: 30000,
      retryWrites: true,
      w: "majority",
      tls: true,
    });
  } catch (err) {
    console.error("MongoDB connection error:", err.message);
    setTimeout(connectDB, 5000);
  }
}
connectDB();

// Graceful shutdown for Render
process.on("SIGTERM", () => {
  mongoose.connection.close(() => {
    process.exit(0);
  });
});

// -----------------------
// Middleware
// -----------------------
app.use(expressLayouts);
app.use(express.static("public"));
app.use(methodOverride("_method"));
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
    const books = await Book.find({}).sort({ author: 1 });
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
    const books = await Book.find({}).sort({ author: 1 });
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
app.listen(PORT, () => console.log(`Server running on ${PORT}`));
