import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const BackupSchema = new Schema(
  {
    poolSlug: { type: String, required: true, index: true, trim: true },
    reason: { type: String, required: true, trim: true },
    snapshot: { type: Schema.Types.Mixed, required: true }
  },
  { timestamps: true }
);

BackupSchema.index({ poolSlug: 1, createdAt: -1 });

export type Backup = InferSchemaType<typeof BackupSchema>;

const BackupModel =
  (mongoose.models.Backup as Model<Backup>) ||
  mongoose.model<Backup>("Backup", BackupSchema);

export default BackupModel;
