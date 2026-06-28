import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const PoolSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, trim: true },
    title: { type: String, required: true, trim: true },
    entryFee: { type: Number, required: true, default: 10 },
    status: {
      type: String,
      enum: ["setup", "open", "locked", "scoring", "final"],
      default: "setup"
    },
    currentStage: {
      type: String,
      enum: ["preTournament", "r32", "r16", "qf", "sf", "final"],
      default: "preTournament"
    },
    preTournamentStatus: {
      type: String,
      enum: ["open", "locked"],
      default: "open"
    },
    preTournamentLockedAt: { type: Date, default: null },
    r32Status: {
      type: String,
      enum: ["setup", "open", "locked"],
      default: "setup"
    },
    r32OpenedAt: { type: Date, default: null },
    r32LockedAt: { type: Date, default: null },
    r16Status: {
      type: String,
      enum: ["setup", "open", "locked"],
      default: "setup"
    },
    r16OpenedAt: { type: Date, default: null },
    r16LockedAt: { type: Date, default: null },
    qfStatus: {
      type: String,
      enum: ["setup", "open", "locked"],
      default: "setup"
    },
    qfOpenedAt: { type: Date, default: null },
    qfLockedAt: { type: Date, default: null },
    scoringRules: {
      champion: { type: Number, default: 6 },
      groupWinner: { type: Number, default: 2 },
      groupRunnerUp: { type: Number, default: 1 },
      r32: { type: Number, default: 1 },
      r16: { type: Number, default: 2 },
      qf: { type: Number, default: 3 },
      sf: { type: Number, default: 4 },
      final: { type: Number, default: 5 }
    }
  },
  { timestamps: true }
);

export type Pool = InferSchemaType<typeof PoolSchema>;

const PoolModel = (mongoose.models.Pool as Model<Pool>) || mongoose.model<Pool>("Pool", PoolSchema);

export default PoolModel;
