if (process.env.NODE_ENV !== "test") {
  require("dotenv").config();
}

const express = require("express");
const path = require("path");
const app = express();
const expressLayouts = require("express-ejs-layouts");
const mongoose = require("mongoose");
const Event = require("./models/events");
const Book = require("./models/books");
const methodOverride = require("method-override");
const flash = require("connect-flash");
const passport = require("passport");
const localStrategy = require("passport-local").Strategy;
const User = require("./models/users");
const userRoutes = require("./routes/users");
const session = require("express-session");
const { isLoggedIn } = require("./middleware");

const dbUrl = process.env.DB_URL;
// const dbUrl = "mongodb://localhost:27017/mysite";

mongoose.connect(dbUrl);

const db = mongoose.connection;
db.on("error", console.error.bind(console, "connection error:"));
db.once("open", () => {
  console.log("Database connected");
});

// Use express-ejs-layouts
app.use(expressLayouts);
app.use(express.static("public"));
app.use(methodOverride("_method"));

app.use(
  session({
    secret: process.env.SESSION_KEY, // Replace with a strong secret key
    resave: false, // Prevents session being saved on every request
    saveUninitialized: false, // Prevents saving unmodified sessions
    cookie: {
      secure: false, // Set to `true` if using HTTPS
      maxAge: 1000 * 60 * 60 * 24, // Optional: 1-day cookie expiration
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

app.use(passport.initialize());
app.use(passport.session());
passport.use(new localStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

//gives access to info in all my templates
app.use((req, res, next) => {
  res.locals.currentUser = req.user;
  next();
});

// Specify the default layout
app.set("layout", "layouts/boilerplate");
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

//need this to parse the res. send in the post request below
app.use(express.urlencoded({ extended: true }));

app.use("/", userRoutes);

app.get("/", (req, res, next) => {
  res.render("home", (err, html) => {
    if (err) {
      console.error("Error rendering view:", err);
      return next(err);
    }
    res.send(html);
  });
});

app.get("/events", async (req, res) => {
  try {
    const events = await Event.find({}).sort({ year: 1 }); // Sort by year (ascending)
    res.render("events", { events }); //pass events to template ejs page
  } catch (err) {
    console.error("Error fetching events:", err);
    next(err);
  }
});

app.get("/events/newevent", isLoggedIn, (req, res) => {
  res.render("newevent");
});

app.get("/events/:id/editevent", isLoggedIn, async (req, res, next) => {
  try {
    const { id } = req.params;
    // Validate ID format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).send("Invalid Event ID");
    }
    const event = await Event.findById(id);
    // Handle case where the event doesn't exist
    if (!event) {
      return res.status(404).send("Event not found");
    }
    res.render("editevent", { event });
  } catch (err) {
    console.error("Error fetching event:", err);
    next(err);
  }
});

app.put("/events/:id", isLoggedIn, async (req, res) => {
  //params returns the id
  const { id } = req.params;
  const updatedEvent = req.body.event;
  await Event.findByIdAndUpdate(id, updatedEvent, { new: true });
  res.redirect("/events");
});

app.delete("/events/:id", isLoggedIn, async (req, res) => {
  try {
    const { id } = req.params;
    await Event.findByIdAndDelete(id);
    res.status(200).json({ message: "Event deleted successfully" });
  } catch (error) {
    console.error("Error deleting event:", error);
    res.status(500).json({ message: "Failed to delete event" });
  }
});

app.post("/events", isLoggedIn, async (req, res, next) => {
  try {
    const event = new Event(req.body.event);
    await event.save();
    res.redirect("/events");
  } catch (err) {
    console.error("Error saving event:", err);
    next(err);
  }
});

app.get("/books", async (req, res) => {
  try {
    const books = await Book.find({}).sort({ author: 1 }); // Sort by author (ascending)
    res.render("books", { books });
  } catch (err) {
    console.error("Error fetching events:", err);
    next(err);
  }
});

app.get("/books/newbook", isLoggedIn, (req, res) => {
  res.render("newbook");
});

app.post("/books", isLoggedIn, async (req, res, next) => {
  try {
    const book = new Book(req.body.book);
    await book.save();
    res.redirect("/books");
  } catch (err) {
    console.error("Error saving event:", err);
    next(err);
  }
});

app.get("/books/:id/editbook", isLoggedIn, async (req, res, next) => {
  try {
    const { id } = req.params;
    // Validate ID format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).send("Invalid Event ID");
    }
    const book = await Book.findById(id);
    // Handle case where the book doesn't exist
    if (!book) {
      return res.status(404).send("Book not found");
    }
    res.render("editbook", { book });
  } catch (err) {
    console.error("Error fetching book:", err);
    next(err);
  }
});

app.put("/books/:id", isLoggedIn, async (req, res) => {
  //params returns the id
  const { id } = req.params;
  const updatedBook = req.body.book;
  await Book.findByIdAndUpdate(id, updatedBook, { new: true });
  res.redirect("/books");
});

app.delete("/books/:id", isLoggedIn, async (req, res) => {
  try {
    const { id } = req.params;
    await Book.findByIdAndDelete(id);
    res.status(200).json({ message: "Book deleted successfully" });
  } catch (error) {
    console.error("Error deleting event:", error);
    res.status(500).json({ message: "Failed to delete book" });
  }
});

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).send("Something went wrong!");
});

app.listen(3000, () => console.log("Server running 3000"));
