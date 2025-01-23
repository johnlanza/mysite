const mongoose = require("mongoose");
//just doing the next step so I can type Schema instead of mongoose.Schema every time.
const Schema = mongoose.Schema;

const eventSchema = new Schema({
  year: {
    type: Number,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
});

module.exports = mongoose.model("Event", eventSchema);
