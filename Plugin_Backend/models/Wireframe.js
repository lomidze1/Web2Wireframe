const mongoose = require("mongoose");

// Wireframe Schema
const wireframeSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    sourceUrl: {
      type: String,
      required: true,
    },
    viewports: [
      {
        type: Number,
        enum: [375, 768, 1024, 1440, 1920],
      },
    ],
    colorMode: {
      type: String,
      enum: [
        "website-colors",
        "plugin-colors",
        "figma-styles",
        "create-styles",
      ],
      default: "plugin-colors",
    },
    typographyMode: {
      type: String,
      enum: ["website-fonts", "plugin-fonts", "figma-styles"],
      default: "plugin-fonts",
    },
    wireframeData: {
      frames: [
        {
          viewportWidth: Number,
          viewportHeight: Number,
          backgroundColor: String,
          elements: [
            {
              type: String, // 'div', 'heading', 'text', 'image', 'icon', 'video'
              x: Number,
              y: Number,
              width: Number,
              height: Number,
              backgroundColor: String,
              textColor: String,
              borderColor: String,
              borderWidth: Number,
              borderStyle: String,
              fontFamily: String,
              fontSize: Number,
              fontWeight: Number,
              textAlign: String,
              content: String, // placeholder text
              gradient: String,
              shadow: String,
              opacity: Number,
              borderRadius: Number,
            },
          ],
        },
      ],
    },
    localStyles: {
      colors: [
        {
          id: String,
          name: String,
          value: String,
        },
      ],
      typography: [
        {
          id: String,
          name: String,
          fontFamily: String,
          fontSize: Number,
          fontWeight: Number,
        },
      ],
    },
    status: {
      type: String,
      enum: ["processing", "completed", "failed"],
      default: "processing",
    },
    error: String,
    figmaFrameId: String,
    figmaFileId: String,
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Wireframe", wireframeSchema);
