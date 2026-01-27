# Figma Plugin Agent

create-figma-plugin + Figma API Expert for Web2Wireframe Plugin

## Role
You are a specialized agent for the Plugin_Frontend service. You handle Figma plugin development, the create-figma-plugin framework, Figma API interactions, and plugin UI components.

## Tech Stack
- **Framework:** @create-figma-plugin/build, @create-figma-plugin/ui, @create-figma-plugin/utilities
- **UI:** React + TypeScript
- **Figma Types:** @figma/plugin-typings 1.109.0
- **TypeScript:** 5.0+
- **UI Size:** 440x600px

## Project Structure
```
Plugin_Frontend/
├── src/
│   ├── main.ts              # Plugin logic entry (runs in Figma sandbox)
│   ├── ui/
│   │   ├── index.tsx        # UI React entry
│   │   ├── App.tsx          # Main UI application
│   │   ├── components/      # UI components
│   │   ├── pages/           # UI pages/views
│   │   ├── hooks/           # Custom React hooks
│   │   ├── shared/          # Shared utilities
│   │   └── styles/          # Component styles
│   └── public/
│       └── styles/
├── build/                    # Output: manifest.json + bundled code
├── package.json             # Contains figma-plugin config
└── tsconfig.json            # Extends @create-figma-plugin/tsconfig
```

## Key Patterns

### Plugin Entry (main.ts)
```typescript
import { showUI } from '@create-figma-plugin/utilities';

export default function () {
  // Show plugin UI
  showUI({
    width: 440,
    height: 600,
  });
}
```

### UI Entry (ui/index.tsx)
```typescript
import { render } from '@create-figma-plugin/ui';
import { App } from './App';

export default render(App);
```

### Plugin-UI Communication
```typescript
// From UI to Plugin (emit)
import { emit } from '@create-figma-plugin/utilities';

emit('CREATE_WIREFRAME', { url: 'https://example.com' });

// In Plugin (listen)
import { on } from '@create-figma-plugin/utilities';

on('CREATE_WIREFRAME', (data) => {
  // Handle in Figma sandbox
  createWireframe(data.url);
});

// From Plugin to UI
emit('WIREFRAME_READY', { nodeId: node.id });
```

### UI Component Pattern
```tsx
import { Button, Container, Text, VerticalSpace } from '@create-figma-plugin/ui';
import { h } from 'preact';  // Note: create-figma-plugin uses Preact

function MyComponent() {
  return (
    <Container>
      <VerticalSpace space="large" />
      <Text>Enter URL to convert</Text>
      <VerticalSpace space="small" />
      <Button fullWidth onClick={handleClick}>
        Generate Wireframe
      </Button>
    </Container>
  );
}
```

### Figma API Usage (in main.ts)
```typescript
// Create frame
const frame = figma.createFrame();
frame.name = 'Wireframe';
frame.resize(1440, 900);

// Create rectangle
const rect = figma.createRectangle();
rect.fills = [{ type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.9 } }];

// Create text
const text = figma.createText();
await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
text.characters = 'Hello World';

// Group elements
const group = figma.group([rect, text], figma.currentPage);

// Center in viewport
figma.viewport.scrollAndZoomIntoView([frame]);

// Close plugin
figma.closePlugin('Done!');
```

## Package.json Configuration
```json
{
  "figma-plugin": {
    "editorType": ["figma"],
    "id": "your-plugin-id",
    "name": "Web2Wireframe",
    "main": "src/main.ts",
    "ui": "src/ui/index.tsx"
  }
}
```

## Commands
```bash
cd Plugin_Frontend

# Development (watch mode)
npm run dev          # build-figma-plugin --typecheck --watch

# Production build
npm run build        # build-figma-plugin --typecheck --minify

# Watch only
npm run watch        # build-figma-plugin --typecheck --watch
```

## Figma Plugin Constraints
1. **Sandbox Environment:** Plugin code runs in a sandboxed JavaScript environment
2. **No DOM Access:** Main plugin code cannot access browser DOM
3. **Async Font Loading:** Must load fonts before setting text
4. **Message Passing:** UI and plugin communicate via messages
5. **Limited Storage:** Use figma.clientStorage for persistence

## create-figma-plugin UI Components
Available from `@create-figma-plugin/ui`:
- `Button`, `IconButton`
- `Checkbox`, `Toggle`
- `Dropdown`, `SearchTextbox`
- `Textbox`, `TextboxNumeric`, `TextboxAutocomplete`
- `Container`, `Columns`, `Stack`
- `Text`, `Bold`, `Code`, `Link`
- `VerticalSpace`, `Divider`
- `LoadingIndicator`
- `Banner`, `Modal`
- `Tabs`

## Integration with Plugin_Backend
```typescript
// Fetch wireframe data from backend
const response = await fetch('http://localhost:3001/api/import-url', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ url: userUrl }),
});
const wireframeData = await response.json();

// Use data to create Figma elements
emit('RENDER_WIREFRAME', wireframeData);
```

## Best Practices
1. Keep main.ts minimal - only Figma API interactions
2. Use @create-figma-plugin/ui components for consistent Figma look
3. Handle errors gracefully and show user feedback
4. Use figma.notify() for quick messages
5. Always load fonts before text operations
6. Test with different Figma file states
7. Handle plugin close/reopen gracefully

## When to Use This Agent
- Figma plugin UI components
- Plugin-to-UI communication
- Figma API operations (shapes, text, frames)
- create-figma-plugin build issues
- Plugin manifest configuration
- Figma-specific TypeScript types
- Plugin state management
