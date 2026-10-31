# Usage Guide — Image Annotator MCP

A task-oriented cookbook. For the full parameter reference, see [docs/REFERENCE.en.md](docs/REFERENCE.en.md).

Every recipe is a JSON payload you pass to a tool (`annotate_screenshot` unless noted). All coordinates are in **image pixels** — read [the coordinate model](docs/REFERENCE.en.md#coordinate-model-read-this-first) first.

## Save an image attached in the conversation

For Cherry Studio, first call `list_cherry_images` with `{}`. Match the image previews to the user's attachment, then import the selected candidate with `save_attached_image`:

```json
{
  "cherry_image_id": "<id including extension returned by list_cherry_images>"
}
```

The cache spans multiple chats, so identify the image visually instead of assuming the newest file is the current attachment. Use the returned `next_offset` to find older images. Annotation coordinates use the original dimensions, not the resized preview dimensions. See [Cherry Studio configuration](docs/REFERENCE.en.md#cherry-studio-stdio) if the cache is missing or stored on another drive.

When the client already supplies image data, pass Base64 or a data URL instead:

```json
{
  "image_data": "data:image/png;base64,iVBORw0KGgo...",
  "filename": "image.png"
}
```

The response includes an absolute `path`. Use it in the existing image tools, for example:

```json
{ "image_path": "<path returned by save_attached_image>" }
```

for `get_image_dimensions`, or:

```json
{
  "input_path": "<path returned by save_attached_image>",
  "annotations": [
    { "type": "rect", "x": 100, "y": 80, "width": 160, "height": 90, "color": "pink" }
  ]
}
```

for `annotate_screenshot`. Attachments larger than 20 MB are rejected. Temporary files are stored in `.image-annotator-tmp/`; files older than 24 hours are removed at server startup.

---

## Contents

- [Save an image attached in the conversation](#save-an-image-attached-in-the-conversation)
- [Find the right coordinates](#1-find-the-right-coordinates)
- [Numbered steps that don't cover the UI](#2-numbered-steps-that-dont-cover-the-ui)
- [Spotlight a single feature](#3-spotlight-a-single-feature)
- [A framed hero screenshot](#4-a-framed-hero-screenshot)
- [Call out a detail](#5-call-out-a-detail)
- [Outline / highlight a region](#6-outline--highlight-a-region)
- [Blur sensitive data](#7-blur-sensitive-data)
- [Optimized output for docs sites](#8-optimized-output-for-docs-sites)
- [Quick one-liners](#9-quick-one-liners)
- [Troubleshooting](#10-troubleshooting)

---

## 1. Find the right coordinates

Before annotating, get the real pixel size:

```json
// get_image_dimensions
{ "image_path": "/path/to/screenshot.png" }
// → { "width": 3450, "height": 1760, "format": "png" }
```

If you captured with Playwright, measure the element's center and multiply by the device pixel ratio (usually 2 on retina). See the [Playwright workflow](docs/REFERENCE.en.md#workflow-with-playwright-mcp).

Rule of thumb: **point `target` at the element's center**, and let markers/spotlights offset themselves.

---

## 2. Numbered steps that don't cover the UI

The most common doc need. Give each marker a `target` (the element) and an `offset` (where the badge sits). The badge lands in clear space and draws a leader line back to the element.

```json
{
  "input_path": "/path/to/screenshot.png",
  "theme": "documentation",
  "annotations": [
    {"type": "marker", "number": 1, "target": [1010, 627], "offset": [-80, -110]},
    {"type": "marker", "number": 2, "target": [800, 802],  "offset": [-90,  90]},
    {"type": "marker", "number": 3, "target": [1230, 802], "offset": [80,  -90]}
  ]
}
```

- `offset` is `[dx, dy]` from the target. Negative `dy` = above, negative `dx` = left.
- Set `"leader": false` on a marker to drop the connecting line.
- Prefer this over placing markers directly on `x`/`y` — that buries the thing you're documenting.

For a fully automatic version (markers + text labels + connectors), use `create_step_guide`:

```json
// create_step_guide
{
  "input_path": "/path/to/screenshot.png",
  "steps": [
    {"x": 1010, "y": 627, "label": "Open the Library tab"},
    {"x": 800,  "y": 802, "label": "Search your references"},
    {"x": 1490, "y": 802, "label": "Apply a filter"}
  ]
}
```

---

## 3. Spotlight a single feature

Dim everything except one area. Put the `spotlight` **first** so markers/callouts render on top of the dimmed layer.

```json
{
  "input_path": "/path/to/screenshot.png",
  "theme": "documentation",
  "annotations": [
    {"type": "spotlight", "target": [1010, 627], "width": 1700, "height": 120, "dim": 0.6},
    {"type": "callout", "x": 1010, "y": 430, "text": "Everything starts here", "pointer": "bottom"}
  ]
}
```

- `shape`: `rect` (default), `ellipse`, or `circle`.
- `dim`: `0`–`1` darkness of the dimmed area (`0.6` is a good start).
- `feather`: edge softness (default `10`; raise for a softer glow).
- For a round spotlight on an icon: `{"type": "spotlight", "target": [x, y], "shape": "circle", "radius": 60}`.

---

## 4. A framed hero screenshot

Wrap the whole thing in browser chrome with a drop shadow — the "floating screenshot" look. Combine with a spotlight for a landing-page-grade figure.

```json
{
  "input_path": "/path/to/screenshot.png",
  "theme": "documentation",
  "frame": { "browserBar": true, "padding": 90, "background": "#E9EDF2" },
  "downscale": 0.6,
  "annotations": [
    {"type": "spotlight", "target": [1010, 627], "width": 1700, "height": 120, "dim": 0.62},
    {"type": "marker", "number": 1, "target": [1010, 627], "offset": [-80, -110]},
    {"type": "callout", "x": 1010, "y": 430, "text": "Open the Library tab", "pointer": "bottom", "color": "primary"}
  ]
}
```

To frame a screenshot you already annotated (or a raw one) without re-annotating, use `frame_screenshot`:

```json
// frame_screenshot
{ "input_path": "/path/to/screenshot.png", "browser_bar": true, "format": "webp", "downscale": 0.6 }
```

> Note the casing: `annotate_screenshot` uses `frame: { browserBar: true }` (camelCase); `frame_screenshot` uses `browser_bar` (snake_case).

---

## 5. Call out a detail

A callout is a speech bubble; the `pointer` is the side the tail comes from.

```json
{
  "input_path": "/path/to/screenshot.png",
  "annotations": [
    {"type": "callout", "x": 640, "y": 470, "text": "Type a keyword,\nthen press Filter", "pointer": "top", "color": "primary"}
  ]
}
```

- `\n` makes multi-line callouts.
- For a plain text label instead of a bubble, use `label`. With no `background`, it gets a white halo so it stays readable over busy pixels:
  `{"type": "label", "x": 640, "y": 900, "text": "Search box", "color": "darkGray"}`

---

## 6. Outline / highlight a region

Ring a group of controls, or wash a color over them.

```json
{
  "input_path": "/path/to/screenshot.png",
  "annotations": [
    {"type": "rect", "x": 1000, "y": 760, "width": 960, "height": 95, "color": "warning", "style": "dashed"},
    {"type": "highlight", "x": 1000, "y": 760, "width": 960, "height": 95, "color": "yellow", "opacity": 0.25}
  ]
}
```

Or the one-liner `highlight_area`:

```json
// highlight_area
{ "input_path": "/path/to/screenshot.png", "shape": "rect", "x": 1000, "y": 760, "width": 960, "height": 95, "color": "warning", "label": "Filters" }
```

> `rect`/`circle`/`highlight` `width`/`height`/`radius` are in **image pixels and never auto-scale** — they describe the region. Only the outline thickness scales.

---

## 7. Blur sensitive data

Hide emails, keys, or customer data before publishing.

```json
// blur_area
{ "input_path": "/path/to/screenshot.png", "x": 1500, "y": 60, "width": 360, "height": 44, "intensity": 12 }
```

Or as part of a larger composition: `{"type": "blur", "x": 1500, "y": 60, "width": 360, "height": 44, "intensity": 12}`.

---

## 8. Optimized output for docs sites

Ship light, crisp images. A 2x capture downscaled to ~1.2x stays sharp at half the file size.

```json
{
  "input_path": "/path/to/screenshot.png",
  "annotations": [ /* ... */ ],
  "format": "webp",
  "quality": 82,
  "downscale": 0.6
}
```

- `format`: `webp` (best for docs), `jpeg` (photos, no transparency), `png` (default, lossless).
- `quality`: 80–85 is usually indistinguishable from lossless for UI screenshots.
- `downscale`: `0.5` for a true 2x→1x; `0.6`–`0.7` keeps a little extra crispness.
- If you set `format` without an `output_path`, the extension is fixed automatically.

---

## 9. Quick one-liners

When you don't need a full composition:

| Goal | Tool | Minimal call |
|---|---|---|
| Ring one area | `highlight_area` | `{ input_path, shape: "rect", x, y, width }` |
| One callout | `add_callout` | `{ input_path, x, y, text }` |
| Hide data | `blur_area` | `{ input_path, x, y, width, height }` |
| Frame only | `frame_screenshot` | `{ input_path, browser_bar: true }` |
| Numbered steps | `create_step_guide` | `{ input_path, steps: [{x, y, label}] }` |

---

## 10. Troubleshooting

**The annotated image is saved but not visible in Cherry's final reply.** Starting with 1.5.0, generating tools return a local HTTP image URL and ready-to-copy Markdown. Restart the MCP server, regenerate the image, and have the model copy that Markdown unchanged into its final reply outside a code block. The URL works on the same computer for up to 24 hours while this MCP server is running; it expires on shutdown or restart. Use the actual returned URL, not a disk path such as `D:/...` or `file:///...`. Cherry Studio 2.1.8 inline HTTP rendering still requires UI verification. The tool response also contains the actual MCP image as a fallback; expand it if the URL cannot be displayed.

**Cherry still asks for a path or re-upload.** Restart the MCP server so `list_cherry_images` is loaded, then ask the model to use that tool before `save_attached_image`. Version 1.3.0 only accepted Base64; the cache integration requires 1.4.0. The MCP command must run this local `server.js`, rather than an older published package. A model that can process image previews is needed to match a candidate to the attachment.

**Cherry cache is missing or ambiguous.** Set `CHERRY_STUDIO_FILES_DIR` in the MCP environment to the active `Data/Files` directory and restart the server. Automatic discovery reads Cherry's custom-directory boot configuration before the default location.

**Annotations look tiny.** The image is probably retina (2x). Sizing auto-scales by width, but if you passed explicit `size`/`fontSize`/`strokeWidth` they're used as-is — raise them, or pass a higher `scale`.

**A marker/callout is cut off at the edge.** Add a `margin` (e.g. `60`) so the canvas expands and the gutter has room. Set `matte` for the padding color.

**Text isn't the font I expect.** Output uses the host's `system-ui` (SF Pro on macOS, Segoe UI on Windows, Roboto on Linux). On a server with no UI fonts, install a sans family (e.g. `fonts-roboto`) so librsvg can resolve it.

**Spotlight dims the marker too.** Put the `spotlight` object **first** in the `annotations` array — everything after it renders on top.

**Colors look off in JPEG.** JPEG has no transparency; the matte is flattened to white. Use `png` or `webp` if you need transparency.

**Coordinates are wrong.** Re-check with `get_image_dimensions` and remember the 2x retina factor — DOM coordinates are half the image pixels.

**Chinese text extends beyond its label box.** Versions before 1.4.2 estimated every character as 0.6 times the font size, which underestimates Chinese and wide letters. Update and restart the MCP server, then regenerate the image. Label backgrounds and automatically sized callouts now use actual rendered text bounds; label `x`/`y` remain text baseline coordinates.
