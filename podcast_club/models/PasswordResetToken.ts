import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const PasswordResetTokenSchema = new Schema(
  {
    member: { type: Schema.Types.ObjectId, ref: 'Member', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, trim: true },
    expiresAt: { type: Date, required: true, index: true },
    usedAt: { type: Date, default: null },
    requestedIpHash: { type: String, default: null, trim: true }
  },
  { timestamps: true }
);

PasswordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type PasswordResetToken = InferSchemaType<typeof PasswordResetTokenSchema>;

const PasswordResetTokenModel =
  (mongoose.models.PasswordResetToken as Model<PasswordResetToken>) ||
  mongoose.model<PasswordResetToken>('PasswordResetToken', PasswordResetTokenSchema);

export default PasswordResetTokenModel;
