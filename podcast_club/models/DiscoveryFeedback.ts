import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
import {
  DISCOVERY_DISCUSSION_LEVELS,
  DISCOVERY_LISTEN_STATES,
  DISCOVERY_REACTIONS,
  DISCOVERY_REVIEW_LEVELS
} from '@/lib/discovery-feedback';

export { DISCOVERY_REACTIONS } from '@/lib/discovery-feedback';

const DiscoveryFeedbackSchema = new Schema(
  {
    member: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    recommendationKey: { type: String, required: true, trim: true, maxlength: 240 },
    title: { type: String, required: true, trim: true, maxlength: 240 },
    href: { type: String, trim: true, maxlength: 2000 },
    reaction: { type: String, enum: DISCOVERY_REACTIONS },
    themes: [{ type: String, trim: true, maxlength: 120 }],
    discussionSignals: { type: Number, min: 0, max: 3, default: 0 },
    sourceKey: { type: String, trim: true, maxlength: 240 },
    listenState: { type: String, enum: DISCOVERY_LISTEN_STATES },
    attention: { type: String, enum: DISCOVERY_REVIEW_LEVELS },
    subjectFit: { type: String, enum: DISCOVERY_REVIEW_LEVELS },
    guestValue: { type: String, enum: DISCOVERY_REVIEW_LEVELS },
    hostQuality: { type: String, enum: DISCOVERY_REVIEW_LEVELS },
    discussionPotential: { type: String, enum: DISCOVERY_DISCUSSION_LEVELS },
    findGuestElsewhere: { type: Boolean, default: false },
    guestName: { type: String, trim: true, maxlength: 120 },
    note: { type: String, trim: true, maxlength: 600 }
  },
  { timestamps: true }
);

DiscoveryFeedbackSchema.index({ member: 1, recommendationKey: 1 }, { unique: true });

export type DiscoveryFeedback = InferSchemaType<typeof DiscoveryFeedbackSchema>;

const DiscoveryFeedbackModel =
  (mongoose.models.DiscoveryFeedback as Model<DiscoveryFeedback>) ||
  mongoose.model<DiscoveryFeedback>('DiscoveryFeedback', DiscoveryFeedbackSchema);

export default DiscoveryFeedbackModel;
