import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

export const DISCOVERY_REACTIONS = ['listen', 'discuss', 'less'] as const;

const DiscoveryFeedbackSchema = new Schema(
  {
    member: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    recommendationKey: { type: String, required: true, trim: true, maxlength: 240 },
    title: { type: String, required: true, trim: true, maxlength: 240 },
    href: { type: String, trim: true, maxlength: 2000 },
    reaction: { type: String, enum: DISCOVERY_REACTIONS, required: true }
  },
  { timestamps: true }
);

DiscoveryFeedbackSchema.index({ member: 1, recommendationKey: 1 }, { unique: true });

export type DiscoveryFeedback = InferSchemaType<typeof DiscoveryFeedbackSchema>;

const DiscoveryFeedbackModel =
  (mongoose.models.DiscoveryFeedback as Model<DiscoveryFeedback>) ||
  mongoose.model<DiscoveryFeedback>('DiscoveryFeedback', DiscoveryFeedbackSchema);

export default DiscoveryFeedbackModel;
