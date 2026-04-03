import mongoose, { Schema, Document } from "mongoose";

// --- Subdocument interfaces ---

export interface IWireframeElement {
  type?: string; // 'div', 'heading', 'text', 'image', 'icon', 'video'
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  backgroundColor?: string;
  textColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderStyle?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  textAlign?: string;
  content?: string; // placeholder text
  gradient?: string;
  shadow?: string;
  opacity?: number;
  borderRadius?: number;
}

export interface IWireframeFrame {
  viewportWidth?: number;
  viewportHeight?: number;
  backgroundColor?: string;
  elements?: IWireframeElement[];
}

export interface ILocalColor {
  id?: string;
  name?: string;
  value?: string;
}

export interface ILocalTypography {
  id?: string;
  name?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
}

export interface ILocalStyles {
  colors?: ILocalColor[];
  typography?: ILocalTypography[];
}

// --- Main document interface ---

export interface IWireframe extends Document {
  userId: string;
  sourceUrl: string;
  viewports?: (375 | 768 | 1024 | 1440 | 1920)[];
  colorMode?: string;
  typographyMode?: string;
  wireframeData?: {
    frames?: IWireframeFrame[];
  };
  localStyles?: ILocalStyles;
  status?: string;
  error?: string;
  figmaFrameId?: string;
  figmaFileId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const wireframeSchema = new Schema<IWireframe>(
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
      enum: ["website", "plugin"],
      default: "plugin",
    },
    typographyMode: {
      type: String,
      enum: ["website", "plugin", "lines"],
      default: "plugin",
    },
    wireframeData: {
      frames: [
        {
          viewportWidth: Number,
          viewportHeight: Number,
          backgroundColor: String,
          elements: [
            {
              type: String,
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
              content: String,
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

export default mongoose.model<IWireframe>("Wireframe", wireframeSchema);
