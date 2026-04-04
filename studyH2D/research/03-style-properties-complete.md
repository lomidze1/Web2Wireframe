# h2d Style Properties — Complete List (80 properties)

## How Styles Work in h2d

- Styles are **raw CSS computed values** from `getComputedStyle()`
- Stored on FRAME nodes only (TEXT nodes inherit from parent)
- NOT all 80 properties on every node — only non-default values
- Figma plugin is responsible for CSS → Figma conversion

## Properties by Category

### Layout (12)
| Property | Nodes (Tesla) | Example Value |
|----------|---------------|---------------|
| display | 695 | "block", "flex", "grid", "inline-flex", "none" |
| flexDirection | 41 | "column", "row" |
| flexWrap | 5 | "wrap" |
| flexGrow | 695 | 0, 1 |
| flexShrink | 695 | 0, 1 |
| flexBasis | 12 | "0px", "auto" |
| alignItems | 83 | "center", "flex-start", "stretch" |
| alignSelf | 1 | "center" |
| justifyContent | 94 | "space-between", "center", "flex-end" |
| justifyItems | 17 | "center" |
| gap | 58 | "0px 24px", "16px", "8px 16px" |
| order | 695 | 0 |

### Grid (5)
| Property | Nodes | Example Value |
|----------|-------|---------------|
| gridArea | 34 | "tds-shell-content" |
| gridAutoFlow | 3 | "column" |
| gridTemplateAreas | 3 | '"tds-shell-masthead" "tds-shell-content" "tds-shell-footer"' |
| gridTemplateColumns | 19 | "auto", "repeat(4, 1fr)" |
| gridTemplateRows | 17 | "56px 1fr 52px" |

### Size (7)
| Property | Nodes | Example Value |
|----------|-------|---------------|
| width | 695 | "auto", "100%", "1440px", "fit-content" |
| height | 695 | "auto", "fit-content", "100%", "56px" |
| minWidth | 424 | "0px" |
| minHeight | 454 | "0px" |
| maxWidth | 156 | "1440px", "100%" |
| maxHeight | 47 | "100%" |
| aspectRatio | 17 | "auto 512 / 512", "16 / 9" |

### Position (6)
| Property | Nodes | Example Value |
|----------|-------|---------------|
| position | 254 | "relative", "absolute", "fixed", "sticky" |
| left | 695 | "auto", "0px", "50%" |
| top | 695 | "auto", "0px" |
| right | 695 | "auto", "0px" |
| bottom | 695 | "auto", "0px" |
| zIndex | 75 | 1000, 100, 1 |

### Spacing (7)
| Property | Nodes | Example Value |
|----------|-------|---------------|
| margin | 35 | "0px 4px 0px 0px" |
| marginTop | 18 | "4px" |
| marginRight | 31 | "4px" |
| marginBottom | 4 | "-1px" |
| marginLeft | 20 | "-12px" |
| padding | 106 | "0px 0px 0px 32px", "16px 24px" |
| boxSizing | 4 | "content-box" |

### Background (4)
| Property | Nodes | Example Value |
|----------|-------|---------------|
| backgroundColor | 695 | "rgba(0, 0, 0, 0)", "rgb(255, 255, 255)" |
| backgroundPosition | 1 | "6px 50%" |
| backgroundRepeat | 1 | "no-repeat" |
| backgroundSize | 1 | "28px" |

**Note:** h2d does NOT store `backgroundImage` in styles — images are extracted via `$url` and `Page.getResourceContent`.

### Border (11)
| Property | Nodes | Example Value |
|----------|-------|---------------|
| borderWidth | 33 | "3px", "1px" |
| borderStyle | 662 | "none", "solid" |
| borderTopStyle | 662 | "none", "solid" |
| borderRightStyle | 662 | "none" |
| borderBottomStyle | 662 | "none" |
| borderLeftStyle | 662 | "none" |
| borderColor | 695 | "rgb(57, 60, 65)", "rgb(0, 0, 0)" |
| borderTopLeftRadius | 79 | "4px", "8px", "50%" → resolved to px |
| borderTopRightRadius | 81 | "4px" |
| borderBottomLeftRadius | 79 | "4px" |
| borderBottomRightRadius | 81 | "4px" |

### Typography (12)
| Property | Nodes | Example Value |
|----------|-------|---------------|
| fontFamily | 695 | '"Universal Sans Text", -apple-system, Arial, sans-serif' |
| fontSize | 695 | "14px", "40px" |
| fontWeight | 107 | "500", "700", "400" |
| lineHeight | 695 | "20px", "normal", "48px" |
| color | 695 | "rgb(57, 60, 65)", "rgb(255, 255, 255)" |
| textAlign | 117 | "center", "left", "right" |
| textDecoration | 695 | "none", "underline" |
| whiteSpace | 28 | "nowrap", "pre-wrap" |
| listStyleType | 298 | "none", "disc", "decimal" |
| verticalAlign | 8 | "middle" |
| webkitTextFillColor | 689 | "rgb(57, 60, 65)" |
| webkitTextStrokeColor | 689 | "rgb(57, 60, 65)" |

### Visual Effects (12)
| Property | Nodes | Example Value |
|----------|-------|---------------|
| opacity | 695 | 1, 0, 0.5 |
| boxShadow | 52 | "rgb(255, 255, 255) 0px 2px 0px -1px" |
| backdropFilter | 6 | "blur(0px)", "blur(20px)" |
| clipPath | 1 | "inset(100%)" |
| transform | 28 | "matrix(1, 0, 0, 1, -864, -540)" |
| transform2 | 12 | "translate(-50%, -50%)" |
| transformOrigin2 | 12 | "864px 540px" |
| overflow | 113 | "hidden auto", "hidden" |
| overflowX | 113 | "hidden" |
| overflowY | 112 | "auto", "hidden" |
| pointerEvents | 174 | "none", "auto" |
| appearance | 23 | "button", "none" |

### Other (4)
| Property | Nodes | Example Value |
|----------|-------|---------------|
| content | 12 | '""' (pseudo-elements) |
| outlineColor | 695 | "rgb(57, 60, 65)" |
| outlineOffset | 680 | "2px" |
| objectFit | 9 | "cover", "contain" |

## Special Properties

### transform vs transform2
- `transform` = resolved matrix form: `matrix(1, 0, 0, 1, -864, -540)`
- `transform2` = original CSS form: `translate(-50%, -50%)`
- `transformOrigin2` = original transform-origin

h2d stores BOTH because the matrix loses the original intent.

### quad[] coordinates
```json
"quad": [x1,y1, x2,y2, x3,y3, x4,y4]
```
4-corner coordinates in clockwise order: topLeft, topRight, bottomRight, bottomLeft.
Supports rotated/skewed elements where x,y,w,h is insufficient.

## What h2d Does NOT Capture in Styles

- `backgroundImage` — handled via `$url` + `assets{}`
- `cursor` — not relevant for Figma
- `transition`, `animation` — not applicable
- `visibility` — filtered (hidden elements skipped)
- Individual `paddingTop/Right/Bottom/Left` — uses shorthand `padding`
- Individual `borderTopWidth` etc. — uses shorthand `borderWidth`
