import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const MeetingSchema = new Schema(
  {
    date: { type: Date, required: true },
    host: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    podcast: { type: Schema.Types.ObjectId, ref: 'Podcast', default: null },
    location: { type: String, required: true, trim: true },
    notes: { type: String, trim: true },
    status: { type: String, enum: ['scheduled', 'completed'], default: 'scheduled' },
    completedAt: { type: Date, default: null },
    importBatchId: { type: String, trim: true, default: null, index: true },
    importSource: { type: String, trim: true, default: null }
  },
  { timestamps: true }
);

export type Meeting = InferSchemaType<typeof MeetingSchema>;

const existingMeetingModel = mongoose.models.Meeting as Model<Meeting> | undefined;
const existingPodcastRequired =
  (existingMeetingModel?.schema.path('podcast') as { options?: { required?: boolean } } | undefined)?.options?.required;

if (existingMeetingModel && existingPodcastRequired === true) {
  mongoose.deleteModel('Meeting');
}

const MeetingModel = (mongoose.models.Meeting as Model<Meeting>) || mongoose.model<Meeting>('Meeting', MeetingSchema);

export default MeetingModel;
