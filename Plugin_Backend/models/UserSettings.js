const mongoose = require("mongoose");

// User Settings Schema
const userSettingsSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    defaultColorMode: {
      type: String,
      enum: [
        "website-colors",
        "plugin-colors",
        "figma-styles",
        "create-styles",
      ],
      default: "plugin-colors",
    },
    defaultViewports: {
      type: [Number],
      default: [1440, 375],
    },
    defaultTypographyMode: {
      type: String,
      enum: ["website-fonts", "plugin-fonts", "figma-styles"],
      default: "plugin-fonts",
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

module.exports = mongoose.model("UserSettings", userSettingsSchema);
