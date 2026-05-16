import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
import { CARVE_OUT_TYPES } from '@/lib/carveout-meta';

const FistBumpSchema = new Schema(
  {
    member: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    createdAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const CarveOutSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: CARVE_OUT_TYPES,
      default: 'other'
    },
    service: { type: String, trim: true },
    url: { type: String, trim: true },
    notes: { type: String, trim: true },
    member: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    meeting: { type: Schema.Types.ObjectId, ref: 'Meeting', required: true },
    fistBumps: { type: [FistBumpSchema], default: [] },
    importBatchId: { type: String, trim: true, default: null, index: true },
    importSource: { type: String, trim: true, default: null }
  },
  { timestamps: true }
);

export type CarveOut = InferSchemaType<typeof CarveOutSchema>;

const existingCarveOutModel = mongoose.models.CarveOut as Model<CarveOut> | undefined;
const existingFistBumpsPath = existingCarveOutModel?.schema.path('fistBumps');
const existingServicePath = existingCarveOutModel?.schema.path('service');

if (existingCarveOutModel && (!existingFistBumpsPath || !existingServicePath)) {
  mongoose.deleteModel('CarveOut');
}

const CarveOutModel =
  (mongoose.models.CarveOut as Model<CarveOut>) || mongoose.model<CarveOut>('CarveOut', CarveOutSchema);

export default CarveOutModel;
