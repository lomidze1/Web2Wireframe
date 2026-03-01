/**
 * Asset extraction using CDP
 */

import { CDPClient } from "./client";
import type { ExtractedAsset } from "@/shared/types";

/**
 * Extract all assets (images, SVGs, videos) from the page
 */
export async function extractAssets(client: CDPClient): Promise<ExtractedAsset[]> {
  const assets: ExtractedAsset[] = [];

  // Extract images
  const images = await extractImages(client);
  assets.push(...images);

  // Extract SVGs
  const svgs = await extractSVGs(client);
  assets.push(...svgs);

  // Extract background images
  const bgImages = await extractBackgroundImages(client);
  assets.push(...bgImages);

  // Extract videos (just metadata, not content)
  const videos = await extractVideos(client);
  assets.push(...videos);

  return assets;
}

/**
 * Extract img elements
 */
async function extractImages(client: CDPClient): Promise<ExtractedAsset[]> {
  const result = await client.send<{ result: { value: ExtractedAsset[] } }>(
    "Runtime.evaluate",
    {
      expression: `
        (function() {
          const images = [];
          const imgElements = document.querySelectorAll('img');

          for (const img of imgElements) {
            const rect = img.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              images.push({
                type: 'image',
                src: img.src || img.currentSrc,
                alt: img.alt || '',
                width: rect.width, /* was: Math.round(rect.width) */
                height: rect.height /* was: Math.round(rect.height) */
              });
            }
          }
          return images;
        })()
      `,
      returnByValue: true,
    }
  );

  return result.result.value;
}

/**
 * Extract SVG elements
 */
async function extractSVGs(client: CDPClient): Promise<ExtractedAsset[]> {
  const result = await client.send<{ result: { value: ExtractedAsset[] } }>(
    "Runtime.evaluate",
    {
      expression: `
        (function() {
          const svgs = [];
          const svgElements = document.querySelectorAll('svg');

          for (const svg of svgElements) {
            const rect = svg.getBoundingClientRect();
            if (rect.width > 10 && rect.height > 10) {
              // Clone and serialize the SVG
              const clone = svg.cloneNode(true);
              const svgString = new XMLSerializer().serializeToString(clone);

              svgs.push({
                type: 'svg',
                src: 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgString))),
                width: rect.width, /* was: Math.round(rect.width) */
                height: rect.height /* was: Math.round(rect.height) */
              });
            }
          }
          return svgs;
        })()
      `,
      returnByValue: true,
    }
  );

  return result.result.value;
}

/**
 * Extract background images from CSS
 */
async function extractBackgroundImages(client: CDPClient): Promise<ExtractedAsset[]> {
  const result = await client.send<{ result: { value: ExtractedAsset[] } }>(
    "Runtime.evaluate",
    {
      expression: `
        (function() {
          const bgImages = [];
          const allElements = document.querySelectorAll('*');

          for (const el of allElements) {
            const style = window.getComputedStyle(el);
            const bgImage = style.backgroundImage;

            if (bgImage && bgImage !== 'none' && bgImage.includes('url(')) {
              const rect = el.getBoundingClientRect();
              if (rect.width > 30 && rect.height > 30) {
                // Extract URL from url("...")
                const urlMatch = bgImage.match(/url\\(["']?([^"')]+)["']?\\)/);
                if (urlMatch && !urlMatch[1].startsWith('data:image/svg')) {
                  bgImages.push({
                    type: 'image',
                    src: urlMatch[1],
                    width: rect.width, /* was: Math.round(rect.width) */
                    height: rect.height /* was: Math.round(rect.height) */
                  });
                }
              }
            }
          }
          return bgImages;
        })()
      `,
      returnByValue: true,
    }
  );

  return result.result.value;
}

/**
 * Extract video elements (metadata only)
 */
async function extractVideos(client: CDPClient): Promise<ExtractedAsset[]> {
  const result = await client.send<{ result: { value: ExtractedAsset[] } }>(
    "Runtime.evaluate",
    {
      expression: `
        (function() {
          const videos = [];
          const videoElements = document.querySelectorAll('video');

          for (const video of videoElements) {
            const rect = video.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              videos.push({
                type: 'video',
                src: video.src || video.currentSrc || video.poster || '',
                width: rect.width, /* was: Math.round(rect.width) */
                height: rect.height /* was: Math.round(rect.height) */
              });
            }
          }
          return videos;
        })()
      `,
      returnByValue: true,
    }
  );

  return result.result.value;
}

/**
 * Convert image URL to base64 (if needed)
 */
export async function imageToBase64(
  client: CDPClient,
  url: string
): Promise<string | null> {
  try {
    const result = await client.send<{ result: { value: string } }>(
      "Runtime.evaluate",
      {
        expression: `
          (async function() {
            try {
              const response = await fetch('${url}');
              const blob = await response.blob();
              return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(blob);
              });
            } catch (e) {
              return null;
            }
          })()
        `,
        awaitPromise: true,
        returnByValue: true,
      }
    );
    return result.result.value;
  } catch {
    return null;
  }
}

/**
 * Take screenshot of a specific node
 */
export async function captureNodeScreenshot(
  client: CDPClient,
  nodeId: number
): Promise<string | null> {
  try {
    // Get the box model to know the clip region
    const boxModel = await client.send<{
      model: { content: number[]; width: number; height: number };
    }>("DOM.getBoxModel", { nodeId });

    const [x, y] = boxModel.model.content;
    const { width, height } = boxModel.model;

    // Capture screenshot
    const screenshot = await client.send<{ data: string }>("Page.captureScreenshot", {
      format: "png",
      clip: {
        x,
        y,
        width,
        height,
        scale: 1,
      },
    });

    return `data:image/png;base64,${screenshot.data}`;
  } catch {
    return null;
  }
}
