import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const SubmissionSchema = new Schema(
  {
    poolSlug: { type: String, required: true, index: true, trim: true },
    participantCode: { type: String, required: true, trim: true },
    stage: {
      type: String,
      required: true,
      enum: ["preTournament", "r32", "r16", "qf", "sf", "final"],
      default: "preTournament"
    },
    locked: { type: Boolean, default: false },
    picks: {
      champion: { type: String, required: true, trim: true },
      goldenBoot: { type: String, required: true, trim: true },
      groupFilter: { type: String, default: "All", trim: true },
      roundOf32Winner: { type: String, default: "", trim: true },
      groupWinners: { type: Map, of: String, default: {} },
      groupRunnersUp: { type: Map, of: String, default: {} },
      matchWinners: { type: Map, of: String, default: {} }
    },
    submittedAt: { type: Date, required: true, default: Date.now }
  },
  { timestamps: true }
);

SubmissionSchema.index({ poolSlug: 1, participantCode: 1, stage: 1 }, { unique: true });

export type Submission = InferSchemaType<typeof SubmissionSchema>;

const SubmissionModel =
  (mongoose.models.Submission as Model<Submission>) ||
  mongoose.model<Submission>("Submission", SubmissionSchema);

export default SubmissionModel;
