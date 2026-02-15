import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
import { US_STATE_CODES } from '@/lib/address';

const MemberSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, default: null, select: false },
    address: { type: String, required: true, trim: true },
    addressLine1: { type: String, required: true, trim: true },
    addressLine2: { type: String, default: '', trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, uppercase: true, enum: US_STATE_CODES },
    postalCode: { type: String, required: true, trim: true },
    passwordChangedAt: { type: Date, default: null },
    isAdmin: { type: Boolean, default: false },
    accountStatus: { type: String, enum: ['pending', 'claimed'], default: 'claimed' },
    claimCodeHash: { type: String, default: null, select: false },
    claimCodeExpiresAt: { type: Date, default: null }
  },
  { timestamps: true }
);

export type Member = InferSchemaType<typeof MemberSchema>;

const MemberModel = (mongoose.models.Member as Model<Member>) || mongoose.model<Member>('Member', MemberSchema);

export default MemberModel;
