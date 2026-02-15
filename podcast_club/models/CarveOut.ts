import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const CarveOutSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ['book', 'video', 'movie', 'podcast', 'article', 'other'],
      default: 'other'
    },
    url: { type: String, trim: true },
    notes: { type: String, trim: true },
    member: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    meeting: { type: Schema.Types.ObjectId, ref: 'Meeting', required: true },
    importBatchId: { type: String, trim: true, default: null, index: true },
    importSource: { type: String, trim: true, default: null }
  },
  { timestamps: true }
);

export type CarveOut = InferSchemaType<typeof CarveOutSchema>;

const CarveOutModel =
  (mongoose.models.CarveOut as Model<CarveOut>) || mongoose.model<CarveOut>('CarveOut', CarveOutSchema);

export default CarveOutModel;
