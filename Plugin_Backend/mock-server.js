// Simple Mock Backend for Testing Web2Wireframe Plugin
// This is a minimal version for quick testing - uses mock data instead of real extraction

const http = require("http");
const url = require("url");

const PORT = 3002;

// Mock wireframe data
function generateMockWireframe(sourceUrl, viewports, colorMode) {
  const frames = viewports.map((width) => ({
    viewportWidth: width,
    viewportHeight:
      width > 768 ? Math.round(width * 0.6) : Math.round(width * 1.2),
    backgroundColor: colorMode === "website-colors" ? "#ffffff" : "#f5f5f5",
    elements: [
      {
        id: 1,
        type: "heading",
        x: 20,
        y: 20,
        width: width - 40,
        height: 40,
        backgroundColor: colorMode === "plugin-colors" ? "#2a9d8f" : "#3b82f6",
        textColor: "#ffffff",
        borderColor: "transparent",
        borderWidth: 0,
        borderStyle: "solid",
        fontFamily: "Montserrat",
        fontSize: 24,
        fontWeight: 600,
        textAlign: "left",
        content: "Website Header",
        gradient: "",
        shadow: "",
        opacity: 1,
        borderRadius: 0,
      },
      {
        id: 2,
        type: "image",
        x: 20,
        y: 80,
        width: width - 40,
        height: 200,
        backgroundColor: "#e0e0e0",
        textColor: "#999999",
        borderColor: "#cccccc",
        borderWidth: 1,
        borderStyle: "solid",
        fontFamily: "Open Sans",
        fontSize: 14,
        fontWeight: 400,
        textAlign: "center",
        content: "Hero Image",
        gradient: "",
        shadow: "0 2px 4px rgba(0,0,0,0.1)",
        opacity: 1,
        borderRadius: 4,
      },
      {
        id: 3,
        type: "text",
        x: 20,
        y: 300,
        width: width - 40,
        height: 60,
        backgroundColor: "#ffffff",
        textColor: "#333333",
        borderColor: "transparent",
        borderWidth: 0,
        borderStyle: "solid",
        fontFamily: "Open Sans",
        fontSize: 14,
        fontWeight: 400,
        textAlign: "left",
        content:
          "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
        gradient: "",
        shadow: "",
        opacity: 1,
        borderRadius: 0,
      },
      {
        id: 4,
        type: "text",
        x: 20,
        y: 380,
        width: width - 40,
        height: 40,
        backgroundColor: colorMode === "plugin-colors" ? "#f4a261" : "#fbbf24",
        textColor: "#ffffff",
        borderColor: "transparent",
        borderWidth: 0,
        borderStyle: "solid",
        fontFamily: "Open Sans",
        fontSize: 14,
        fontWeight: 600,
        textAlign: "center",
        content: "Call to Action Button",
        gradient: "",
        shadow: "",
        opacity: 1,
        borderRadius: 6,
      },
    ],
  }));

  return frames;
}

// Request handler
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const query = parsedUrl.query;

  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  // Health check
  if (pathname === "/api/health") {
    res.writeHead(200);
    res.end(
      JSON.stringify({ status: "ok", timestamp: new Date().toISOString() })
    );
    return;
  }

  // Import URL endpoint
  if (pathname === "/api/import-url" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });

    req.on("end", () => {
      try {
        const data = JSON.parse(body);
        const { userId, sourceUrl, viewports, colorMode, typographyMode } =
          data;

        // Validate
        if (!userId || !sourceUrl) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: "Missing userId or sourceUrl" }));
          return;
        }

        // Generate mock wireframe
        const frames = generateMockWireframe(
          sourceUrl,
          viewports || [1440],
          colorMode || "plugin-colors"
        );

        const response = {
          success: true,
          wireframeId: Math.random().toString(36).substring(7),
          sourceUrl: sourceUrl,
          viewports: viewports || [1440],
          colorMode: colorMode,
          frames: frames.length,
          wireframeData: { frames: frames },
          localStyles: {
            colors: [
              { id: "color-primary", name: "Primary", value: "#264653" },
              { id: "color-accent", name: "Accent", value: "#2a9d8f" },
              { id: "color-additional", name: "Additional", value: "#e9c46a" },
            ],
            typography: [
              {
                id: "typography-heading",
                name: "Heading",
                fontFamily: "Montserrat",
                fontSize: 24,
                fontWeight: 600,
              },
              {
                id: "typography-body",
                name: "Body",
                fontFamily: "Open Sans",
                fontSize: 14,
                fontWeight: 400,
              },
            ],
          },
        };

        res.writeHead(200);
        res.end(JSON.stringify(response));
      } catch (error) {
        console.error("Error:", error);
        res.writeHead(500);
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  // 404
  res.writeHead(404);
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, () => {
});
