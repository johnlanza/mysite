import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const GroupStandingSchema = new Schema(
  {
    poolSlug: { type: String, required: true, index: true, trim: true },
    group: { type: String, required: true, trim: true },
    team: { type: String, required: true, trim: true },
    played: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    draws: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    goalsFor: { type: Number, default: 0 },
    goalsAgainst: { type: Number, default: 0 },
    goalDifference: { type: Number, default: 0 },
    points: { type: Number, default: 0 },
    rank: { type: Number, default: 0 }
  },
  { timestamps: true }
);

GroupStandingSchema.index({ poolSlug: 1, group: 1, team: 1 }, { unique: true });

export type GroupStanding = InferSchemaType<typeof GroupStandingSchema>;

const GroupStandingModel =
  (mongoose.models.GroupStanding as Model<GroupStanding>) ||
  mongoose.model<GroupStanding>("GroupStanding", GroupStandingSchema);

export default GroupStandingModel;
