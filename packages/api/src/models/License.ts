import mongoose, { Schema, type Document } from "mongoose";

export interface ILicense extends Document {
  createdAt: Date;
  updatedAt: Date;
  userId: string;
  plan: "free" | "plus" | "pro";
  status: "trial" | "active" | "expired" | "canceled";
  expiresAt?: Date;
  limits: {
    importsPerDay: number;
    aiGenerationsPerDay: number;
    librarySaves: number;
  };
  usage: {
    importsToday: number;
    aiGenerationsToday: number;
    librarySavesTotal: number;
    lastResetDate: string; // YYYY-MM-DD for daily reset
  };
}

const PLAN_LIMITS = {
  free: { importsPerDay: 10, aiGenerationsPerDay: 5, librarySaves: 20 },
  plus: { importsPerDay: 50, aiGenerationsPerDay: 25, librarySaves: 100 },
  pro: { importsPerDay: 999, aiGenerationsPerDay: 999, librarySaves: 999 },
} as const;

const LicenseSchema = new Schema<ILicense>(
  {
    userId: { type: String, required: true, unique: true, index: true },
    plan: {
      type: String,
      enum: ["free", "plus", "pro"],
      default: "free",
    },
    status: {
      type: String,
      enum: ["trial", "active", "expired", "canceled"],
      default: "trial",
    },
    expiresAt: Date,
    limits: {
      importsPerDay: { type: Number, default: 10 },
      aiGenerationsPerDay: { type: Number, default: 5 },
      librarySaves: { type: Number, default: 20 },
    },
    usage: {
      importsToday: { type: Number, default: 0 },
      aiGenerationsToday: { type: Number, default: 0 },
      librarySavesTotal: { type: Number, default: 0 },
      lastResetDate: {
        type: String,
        default: () => new Date().toISOString().slice(0, 10),
      },
    },
  },
  { timestamps: true }
);

/** Reset daily usage if lastResetDate is not today */
LicenseSchema.methods.resetDailyUsageIfNeeded = function () {
  const today = new Date().toISOString().slice(0, 10);
  if (this.usage.lastResetDate !== today) {
    this.usage.importsToday = 0;
    this.usage.aiGenerationsToday = 0;
    this.usage.lastResetDate = today;
  }
};

export const License = mongoose.model<ILicense>("License", LicenseSchema);
export { PLAN_LIMITS };
