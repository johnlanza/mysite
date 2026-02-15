import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const JoinCodeSchema = new Schema(
  {
    codeHash: { type: String, required: true, unique: true, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    usedBy: { type: Schema.Types.ObjectId, ref: 'Member', default: null },
    usedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

export type JoinCode = InferSchemaType<typeof JoinCodeSchema>;

const JoinCodeModel = (mongoose.models.JoinCode as Model<JoinCode>) || mongoose.model<JoinCode>('JoinCode', JoinCodeSchema);

export default JoinCodeModel;
