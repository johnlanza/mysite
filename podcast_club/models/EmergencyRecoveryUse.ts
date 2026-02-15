import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const EmergencyRecoveryUseSchema = new Schema(
  {
    codeHash: { type: String, required: true, unique: true, trim: true },
    usedAt: { type: Date, required: true },
    usedBy: { type: Schema.Types.ObjectId, ref: 'Member', required: true }
  },
  { timestamps: true }
);

export type EmergencyRecoveryUse = InferSchemaType<typeof EmergencyRecoveryUseSchema>;

const EmergencyRecoveryUseModel =
  (mongoose.models.EmergencyRecoveryUse as Model<EmergencyRecoveryUse>) ||
  mongoose.model<EmergencyRecoveryUse>('EmergencyRecoveryUse', EmergencyRecoveryUseSchema);

export default EmergencyRecoveryUseModel;
