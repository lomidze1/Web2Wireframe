import mongoose, { Schema, Document } from "mongoose";

// --- Subdocument interfaces ---

export interface IApiUsage {
  count?: number;
  reset?: Date;
}

// --- Main document interface ---

export interface IUserSettings extends Document {
  userId: string;
  defaultColorMode?: string;
  defaultViewports?: number[];
  defaultTypographyMode?: string;
  apiUsage?: IApiUsage;
  createdAt: Date;
  updatedAt: Date;
}

const userSettingsSchema = new Schema<IUserSettings>(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    defaultColorMode: {
      type: String,
      enum: ["website", "plugin"],
      default: "plugin",
    },
    defaultViewports: {
      type: [Number],
      default: [1440, 375],
    },
    defaultTypographyMode: {
      type: String,
      enum: ["website", "plugin", "lines"],
      default: "plugin",
    },
    apiUsage: {
      count: { type: Number, default: 0 },
      reset: { type: Date, default: Date.now },
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IUserSettings>(
  "UserSettings",
  userSettingsSchema
);
