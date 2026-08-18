import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const EmailLoginTokenSchema = new Schema(
  {
    member: { type: Schema.Types.ObjectId, ref: 'Member', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, trim: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
    requestedIpHash: { type: String, default: null, trim: true },
    persistent: { type: Boolean, default: true }
  },
  { timestamps: true }
);

EmailLoginTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type EmailLoginToken = InferSchemaType<typeof EmailLoginTokenSchema>;

const EmailLoginTokenModel =
  (mongoose.models.EmailLoginToken as Model<EmailLoginToken>) ||
  mongoose.model<EmailLoginToken>('EmailLoginToken', EmailLoginTokenSchema);

export default EmailLoginTokenModel;
