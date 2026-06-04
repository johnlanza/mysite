import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const ParticipantSchema = new Schema(
  {
    poolSlug: { type: String, required: true, index: true, trim: true },
    participantCode: { type: String, required: true, trim: true },
    inviteCode: { type: String, trim: true },
    name: { type: String, required: true, trim: true },
    nickname: { type: String, required: true, trim: true },
    venmoPaid: { type: Boolean, default: false },
    paidAt: { type: Date, default: null },
    isAdmin: { type: Boolean, default: false }
  },
  { timestamps: true }
);

ParticipantSchema.index({ poolSlug: 1, participantCode: 1 }, { unique: true });
ParticipantSchema.index({ poolSlug: 1, inviteCode: 1 }, { unique: true, sparse: true });

export type Participant = InferSchemaType<typeof ParticipantSchema>;

const ParticipantModel =
  (mongoose.models.Participant as Model<Participant>) ||
  mongoose.model<Participant>("Participant", ParticipantSchema);

export default ParticipantModel;
