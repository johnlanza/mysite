import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const MatchSchema = new Schema(
  {
    poolSlug: { type: String, required: true, index: true, trim: true },
    stage: {
      type: String,
      required: true,
      enum: ["r32", "r16", "qf", "sf", "final"]
    },
    matchId: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    teamA: { type: String, required: true, trim: true },
    teamB: { type: String, required: true, trim: true },
    winner: { type: String, default: "", trim: true },
    source: { type: String, default: "generated", trim: true },
    order: { type: Number, default: 0 }
  },
  { timestamps: true }
);

MatchSchema.index({ poolSlug: 1, stage: 1, matchId: 1 }, { unique: true });

export type PoolMatch = InferSchemaType<typeof MatchSchema>;

const MatchModel =
  (mongoose.models.Match as Model<PoolMatch>) ||
  mongoose.model<PoolMatch>("Match", MatchSchema);

export default MatchModel;
