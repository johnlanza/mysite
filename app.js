// if (process.env.NODE_ENV !== "test") {
require("dotenv").config();
// }

const express = require("express");
const path = require("path");
const app = express();
const expressLayouts = require("express-ejs-layouts");
const mongoose = require("mongoose");
const Event = require("./models/events");
const Book = require("./models/books");
const methodOverride = require("method-override");
const dbUrl = process.env.DB_URL;
// const dbUrl = "mongodb://localhost:27017/mysite"

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

// Specify the default layout
app.set("layout", "layouts/boilerplate");
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

//need this to parse the res. send in the post request below
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.render("home");
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

app.get("/events/newevent", (req, res) => {
  res.render("newevent");
});

app.get("/events/:id/editevent", async (req, res, next) => {
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

app.put("/events/:id", async (req, res) => {
  //params returns the id
  const { id } = req.params;
  const updatedEvent = req.body.event;
  await Event.findByIdAndUpdate(id, updatedEvent, { new: true });
  res.redirect("/events");
});

app.delete("/events/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await Event.findByIdAndDelete(id);
    res.status(200).json({ message: "Event deleted successfully" });
  } catch (error) {
    console.error("Error deleting event:", error);
    res.status(500).json({ message: "Failed to delete event" });
  }
});

app.post("/events", async (req, res, next) => {
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

app.get("/books/newbook", (req, res) => {
  res.render("newbook");
});

app.post("/books", async (req, res, next) => {
  try {
    const book = new Book(req.body.book);
    await book.save();
    res.redirect("/books");
  } catch (err) {
    console.error("Error saving event:", err);
    next(err);
  }
});

app.get("/books/:id/editbook", async (req, res, next) => {
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

app.put("/books/:id", async (req, res) => {
  //params returns the id
  const { id } = req.params;
  const updatedBook = req.body.book;
  await Book.findByIdAndUpdate(id, updatedBook, { new: true });
  res.redirect("/books");
});

app.delete("/books/:id", async (req, res) => {
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
  res.status(500).send("Something went wrong!");
});

app.listen(3000, () => console.log("Server running 3000"));
