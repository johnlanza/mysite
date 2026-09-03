const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const homekeeperSyncSchema = new Schema(
  {
    syncKeyHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    state: {
      type: Schema.Types.Mixed,
      required: true,
    },
    history: [
      {
        savedAt: {
          type: Date,
          required: true,
        },
        summary: {
          customTasks: { type: Number, default: 0 },
          completions: { type: Number, default: 0 },
          archivedTaskIds: { type: Number, default: 0 },
        },
        state: {
          type: Schema.Types.Mixed,
          required: true,
        },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("HomekeeperSync", homekeeperSyncSchema);
