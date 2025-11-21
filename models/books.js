const mongoose = require("mongoose");

const bookSchema = new mongoose.Schema({
  title: { type: String, required: true },
  author: String,
  summary: String,
  notes: String,
  slug: { type: String, unique: true },
  link: String,
});

module.exports = mongoose.model("Book", bookSchema);
