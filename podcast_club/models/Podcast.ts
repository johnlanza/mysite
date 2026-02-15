import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const RatingSchema = new Schema(
  {
    member: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    value: { type: String, required: true, trim: true },
    points: { type: Number, required: true, default: 0 }
  },
  { _id: false }
);

const PodcastSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    host: { type: String, required: true, trim: true },
    episodeCount: { type: Number, required: true, min: 1 },
    episodeNames: { type: String, required: true, trim: true },
    totalTimeMinutes: { type: Number, required: true, min: 1 },
    link: { type: String, required: true, trim: true },
    notes: { type: String, trim: true },
    description: { type: String, trim: true }, // Legacy field retained for older records.
    submittedBy: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    ratings: { type: [RatingSchema], default: [] },
    status: { type: String, enum: ['pending', 'discussed'], default: 'pending' },
    discussedMeeting: { type: Schema.Types.ObjectId, ref: 'Meeting', default: null },
    importBatchId: { type: String, trim: true, default: null, index: true },
    importSource: { type: String, trim: true, default: null }
  },
  { timestamps: true }
);

export type Podcast = InferSchemaType<typeof PodcastSchema>;

const PodcastModel = (mongoose.models.Podcast as Model<Podcast>) || mongoose.model<Podcast>('Podcast', PodcastSchema);

export default PodcastModel;
