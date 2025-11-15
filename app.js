// Load environment variables except during tests
if (process.env.NODE_ENV !== "test") {
  require("dotenv").config();
}

// -----------------------
// Imports
// -----------------------
const express = require("express");
const path = require("path");
const slugify = require("slugify");
const expressLayouts = require("express-ejs-layouts");
const mongoose = require("mongoose");
const methodOverride = require("method-override");
const flash = require("connect-flash");
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const session = require("express-session");
const MongoStore = require("connect-mongo");

// Models
const Event = require("./models/events");
const Idea = require("./models/ideas");
const Book = require("./models/books");
const User = require("./models/users");

// Middleware
const { isLoggedIn } = require("./middleware");
const userRoutes = require("./routes/users");

// -----------------------
// Express App Init
// -----------------------
const app = express();

// -----------------------
// Improved MongoDB Connection
// -----------------------
async function connectDB() {
  try {
    await mongoose.connect(process.env.DB_URL, {
      serverSelectionTimeoutMS: 30000,
      retryWrites: true,
      w: "majority",
      tls: true,
    });

    console.log("✅ MongoDB connected successfully");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err.message);
    console.log("Retrying in 5 seconds...");
    setTimeout(connectDB, 5000);
  }
}

connectDB();

// Handle SIGTERM (Render sends this on deploy)
process.on("SIGTERM", () => {
  mongoose.connection.close(() => {
    console.log("MongoDB connection closed due to SIGTERM");
    process.exit(0);
  });
});

// -----------------------
// Middleware Setup
// -----------------------
app.use(expressLayouts);
app.use(express.static("public"));
app.use(methodOverride("_method"));
app.use(express.urlencoded({ extended: true }));

// -----------------------
// Session Store
// -----------------------
app.use(
  session({
    secret: process.env.SESSION_KEY,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.DB_URL,
      ttl: 24 * 60 * 60, // 1 day
    }),
    cookie: {
      secure: process.env.NODE_ENV === "production", // true on Render
      maxAge: 1000 * 60 * 60 * 24,
    },
  })
);

// Flash Messages
app.use(flash());
app.use((req, res, next) => {
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  next();
});

// -----------------------
// Passport Auth
// -----------------------
app.use(passport.initialize());
app.use(passport.session());

passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

// Expose currentUser to templates
app.use((req, res, next) => {
  res.locals.currentUser = req.user;
  next();
});

// -----------------------
// View Engine
// -----------------------
app.set("layout", "layouts/boilerplate");
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// -----------------------
// Routes
// -----------------------
app.use("/", userRoutes);

// Home route (fixed — no double-send)
app.get("/", (req, res) => {
  res.render("home");
});

// -----------------------
// Event Routes
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
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).send("Invalid Event ID");

    const event = await Event.findById(id);
    if (!event) return res.status(404).send("Event not found");

    res.render("editevent", { event });
  } catch (err) {
    next(err);
  }
});

app.put("/events/:id", isLoggedIn, async (req, res) => {
  const { id } = req.params;
  await Event.findByIdAndUpdate(id, req.body.event, { new: true });
  res.redirect("/events");
});

app.delete("/events/:id", isLoggedIn, async (req, res) => {
  try {
    await Event.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: "Event deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete event" });
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
// Books Routes
// -----------------------
app.get("/books", async (req, res, next) => {
  try {
    const books = await Book.find({}).sort({ author: 1 });
    res.render("books", { books, sharedSlug: null });
  } catch (err) {
    next(err);
  }
});

app.get("/books/newbook", isLoggedIn, (req, res) => {
  res.render("newbook");
});

app.post("/books", isLoggedIn, async (req, res, next) => {
  try {
    const data = req.body.book;
    data.slug = slugify(data.title, { lower: true, strict: true });

    await new Book(data).save();
    res.redirect("/books");
  } catch (err) {
    next(err);
  }
});

app.get("/books/book-id-from-slug/:slug", async (req, res) => {
  try {
    const book = await Book.findOne({ slug: req.params.slug });
    if (!book) return res.status(404).json({ error: "Book not found" });
    res.json({ id: book._id });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/books/:slug", async (req, res, next) => {
  try {
    const books = await Book.find({}).sort({ author: 1 });
    res.render("books", { books, sharedSlug: req.params.slug });
  } catch (err) {
    next(err);
  }
});

app.get("/books/:id/editbook", isLoggedIn, async (req, res, next) => {
  try {
    const book = await Book.findById(req.params.id);
    if (!book) return res.status(404).send("Book not found");
    res.render("editbook", { book });
  } catch (err) {
    next(err);
  }
});

app.put("/books/:id", isLoggedIn, async (req, res) => {
  await Book.findByIdAndUpdate(req.params.id, req.body.book, { new: true });
  res.redirect("/books");
});

app.delete("/books/:id", isLoggedIn, async (req, res) => {
  try {
    await Book.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: "Book deleted successfully" });
  } catch {
    res.status(500).json({ message: "Failed to delete book" });
  }
});

// -----------------------
// Ideas Routes
// -----------------------
app.get("/ideas", async (req, res, next) => {
  try {
    const ideas = await Idea.find({}).sort({});
    res.render("ideas", { ideas });
  } catch (err) {
    next(err);
  }
});

app.get("/ideas/newidea", isLoggedIn, (req, res) => {
  res.render("newidea");
});

app.get("/ideas/:id/editidea", isLoggedIn, async (req, res, next) => {
  try {
    const idea = await Idea.findById(req.params.id);
    if (!idea) return res.status(404).send("Idea not found");
    res.render("editidea", { idea });
  } catch (err) {
    next(err);
  }
});

app.put("/ideas/:id", isLoggedIn, async (req, res) => {
  await Idea.findByIdAndUpdate(req.params.id, req.body.idea, { new: true });
  res.redirect("/ideas");
});

app.delete("/ideas/:id", isLoggedIn, async (req, res) => {
  try {
    await Idea.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: "Idea deleted successfully" });
  } catch {
    res.status(500).json({ message: "Failed to delete idea" });
  }
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
// Global Error Handler
// -----------------------
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).send("Something went wrong!");
});

// -----------------------
// Start Server
// -----------------------
app.listen(3000, () => console.log("Server running 3000"));
