// models/games.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const gameSchema = new Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },

  // Optional short line that appears under the title
  tagline: {
    type: String,
    trim: true,
  },

  // Slug for /games/:slug links and sharing
  slug: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
  },

  // Structured metadata
  bestFor: {
    type: String,
    trim: true,
  },
  players: {
    type: String,
    trim: true,
  },
  playTime: {
    type: String,
    trim: true,
  },
  teachTime: {
    type: String,
    trim: true,
  },
  energy: {
    type: String,
    trim: true,
  },
  brainSpace: {
    type: String,
    trim: true,
  },
  spiceLevel: {
    type: String,
    trim: true,
  },

  // Longer text fields
  why: {
    type: String,
    trim: true,
  },
  whenToSkip: {
    type: String,
    trim: true,
  },
  howToPitch: {
    type: String,
    trim: true,
  },
  additionalNotes: {
    type: String,
    trim: true,
  },
  conversationSpark: {
    type: String,
    trim: true,
  },

  // Optional extra notes / HTML
  notes: String,

  // External link (BGG, publisher, etc.)
  link: {
    type: String,
    trim: true,
  },

  // Resized game box image URL (served from public/images/games)
  imageUrl: {
    type: String,
    trim: true,
  },

  // Stored copy so uploads survive redeploys
  imageFilename: String,
  imageContentType: String,
  imageData: Buffer,
});

module.exports = mongoose.model("Game", gameSchema);
