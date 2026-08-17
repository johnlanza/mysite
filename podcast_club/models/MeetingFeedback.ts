import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

export const MEETING_FEEDBACK_OPTIONS = ['listen', 'discussion', 'surprise'] as const;

const MeetingFeedbackSchema = new Schema(
  {
    member: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    podcast: { type: Schema.Types.ObjectId, ref: 'Podcast', required: true },
    meeting: { type: Schema.Types.ObjectId, ref: 'Meeting', default: null },
    selections: {
      type: [{ type: String, enum: MEETING_FEEDBACK_OPTIONS }],
      default: []
    }
  },
  { timestamps: true }
);

MeetingFeedbackSchema.index({ member: 1, podcast: 1 }, { unique: true });

export type MeetingFeedback = InferSchemaType<typeof MeetingFeedbackSchema>;

const MeetingFeedbackModel =
  (mongoose.models.MeetingFeedback as Model<MeetingFeedback>) ||
  mongoose.model<MeetingFeedback>('MeetingFeedback', MeetingFeedbackSchema);

export default MeetingFeedbackModel;
