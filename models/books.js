const { urlencoded } = require("express");
const mongoose = require("mongoose");
//just doing the next step so I can type Schema instead of mongoose.Schema every time.
const Schema = mongoose.Schema;

const bookSchema = new Schema({
  title: {
    type: String,
    required: true,
  },
  author: {
    type: String,
    required: true,
  },
  summary: {
    type: String,
    required: true,
  },
  notes: {
    type: String,
    required: false,
  },
  link: {
    type: String,
    required: true,
  },
  slug: {
    type: String,
    required: true,
    unique: true,
  },
});

module.exports = mongoose.model("Book", bookSchema);
