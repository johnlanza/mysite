// models/books.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const bookSchema = new Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },

  author: {
    type: String,
    required: true,
    trim: true,
  },

  summary: {
    type: String,
    trim: true,
  },

  // HTML allowed, rendered with <%- %> in books.ejs
  notes: String,

  // External link (Goodreads, etc.)
  link: {
    type: String,
    trim: true,
  },

  // Slug for /books/:slug pretty permalinks
  slug: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
  },

  // Resized cover image URL (served from public/images/books)
  imageUrl: {
    type: String,
    trim: true,
  },
});

module.exports = mongoose.model("Book", bookSchema);
