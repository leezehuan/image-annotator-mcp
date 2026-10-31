# Image Annotator MCP Server

[中文](../README.md) | English

Professional MCP server for annotating screenshots with markers, arrows, callouts, spotlights, and premium framing. Built for documentation, tutorials, and bug reports — works seamlessly with the Playwright MCP for an end-to-end "capture → annotate → ship" workflow.

![Example Annotation](../examples/annotated.png?v=3)

- **Reference:** this README (all tools + parameters)
- **Cookbook:** [USAGE.md](../USAGE.md) (step-by-step recipes)
- **Repository:** [leezehuan/image-annotator-mcp](https://github.com/leezehuan/image-annotator-mcp)

---

## Features

- **12 annotation types** — markers, arrows, curved arrows, callouts, rectangles, circles, labels, highlights, blur, connectors, icons, and spotlight
- **Premium, doc-ready output by default** — clean professional font (no handwriting), retina auto-scaling, marker leader lines that never cover the UI, and text halos for legibility over busy screenshots
- **Spotlight focus** — dim the whole screenshot and softly highlight one area
- **Screenshot framing** — rounded browser chrome + drop shadow + matte padding
- **Output control** — PNG / WebP / JPEG, quality, and downscale for crisp, light web images
- **Theme support** — pre-built themes for documentation, tutorials, bug reports, and highlights
- **9 MCP tools** — including Cherry Studio image discovery and temporary saving of conversation images

---

## What's new in 1.5.0 (local image URLs)

- Generated images include a loopback HTTP URL and ready-to-copy Markdown for the final reply.
- A local-only server starts lazily on an available port and serves registered image snapshots. URLs expire after 24 hours or when the MCP connection closes.
- Original files and MCP image content remain available. Cherry Studio 2.1.8 inline HTTP rendering still requires UI verification.

---

## What's new in 1.4.2 (text layout and image results)

- **Measured text boxes** — label backgrounds and automatically sized callouts use rendered glyph bounds for Chinese, Latin, and mixed text, while preserving label baselines.
- **MCP image results** — generated images are returned with their saved paths. In Cherry Studio 2.1.8, expand the tool response to view the image.

---

## What's new in 1.4.0 (Cherry Studio images)

- **`list_cherry_images`** — find cached Cherry Studio images with IDs, original dimensions, and previews, without asking the model to supply Base64.
- **Import by ID** — pass a selected `cherry_image_id` to `save_attached_image` to copy the original into the project temporary directory.
- **Custom data directories** — respect Cherry's boot configuration and an optional `CHERRY_STUDIO_FILES_DIR` override.

---

## What's new in 1.3.0 (conversation attachments)

- **`save_attached_image`** — save a Base64 image attachment to the project temporary directory and use its returned path with the existing tools.
- **Temporary-file limits** — accept supported image formats up to 20 MB and remove files older than 24 hours when the server starts.

---

## What's new in 1.2.0 (premium quality)

These defaults make output look like a real product doc out of the box:

- **Clean font by default** — replaced the Comic Sans handwriting default with a professional `system-ui / SF Pro / Segoe UI / Roboto` stack. `handwriting` is now opt-in.
- **Retina auto-scale** — annotation sizes scale to the image resolution automatically (override with `scale`).
- **Non-covering markers** — give a marker a `target: [x, y]` and it sits in a clear area, drawing a leader line to the element instead of burying it.
- **`spotlight` type** — placed first, dims everything except a soft-edged focus area.
- **`frame`** — wraps the result in rounded browser chrome with a soft shadow.
- **`margin` / `matte`** — pad the canvas so edge callouts are never clipped.
- **`format` / `quality` / `downscale`** — emit optimized WebP/JPEG and downscale 2x captures.
- **New `frame_screenshot` tool** — frame a raw or already-annotated screenshot.

See [CHANGELOG](#changelog) for the full history.

---

## Installation

### Requirements

- **Node.js** >= 18
- **[sharp](https://sharp.pixelplumbing.com/)** (installed automatically) — handles image compositing and SVG rendering via librsvg

### Install dependencies

```bash
git clone https://github.com/leezehuan/image-annotator-mcp.git
cd image-annotator-mcp
npm ci
```

### Claude Code

```bash
claude mcp add image-annotator -- node /absolute/path/to/image-annotator-mcp/server.js
```

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "image-annotator": {
      "command": "node",
      "args": ["/absolute/path/to/image-annotator-mcp/server.js"]
    }
  }
}
```

> After updating the server, **restart Claude Code / Claude Desktop** so the new tool schema is loaded.

### Cherry Studio (stdio)

Point Cherry's MCP configuration at this local checkout:

```json
{
  "mcpServers": {
    "image-annotator": {
      "command": "node",
      "args": ["D:\\Project\\image-annotator-mcp\\server.js"]
    }
  }
}
```

Restart the MCP server and check that `list_cherry_images` appears in its tool list. No new dependencies are needed. Ask the model to call `list_cherry_images`, identify your image from the previews, call `save_attached_image` with that image's ID, then annotate the returned path.

Cherry Studio 2.1.8 does not automatically send current chat attachments to external MCP tools. This integration reads its local image cache, shared across chats. A vision-capable model must identify the matching preview; listing the newest file alone does not identify the current attachment. Previews are resized: annotation coordinates must use the original dimensions.

The cache directory is resolved in order:

1. `CHERRY_STUDIO_FILES_DIR`, if set, pointing directly to `Data/Files`.
2. The single available directory from `~/.cherrystudio/boot-config.json`'s `app.user_data_path` mappings.
3. The standard CherryStudio user-data directory's `Data/Files`, when no custom mapping is configured.

If multiple configured caches exist, set an explicit override in the MCP configuration, for example `"env": { "CHERRY_STUDIO_FILES_DIR": "D:\\CherryData\\Data\\Files" }`. The integration copies selected originals into the project; it never infers a current conversation from cache order. Source investigation: [Cherry Studio 2.1.8 attachment handling](../docs/research/cherry-studio-attachments.md).

---

## Coordinate model (read this first)

- All `x` / `y` / `from` / `to` / `target` values are in **image pixel space** (the screenshot's actual pixels).
- A retina capture is typically **2x** its CSS size — a button at CSS `(505, 313)` is at pixel `(1010, 626)`. Use `get_image_dimensions` to confirm the real size, or multiply DOM coordinates by the device pixel ratio.
- **Decorative sizes** (marker size, stroke width, font size) **auto-scale** to the image width so they aren't tiny on retina captures. **Region sizes** (rect/circle/highlight/blur width, height, radius) and **coordinates** never scale — they describe the screenshot itself. Pass `scale: 1` to disable auto-scaling.

---

## MCP Tools

Image-generating tools (`annotate_screenshot`, `create_step_guide`, `highlight_area`, `add_callout`, `blur_area`, and `frame_screenshot`) return the saved path, MCP image content, a local HTTP image URL, and ready-to-copy Markdown. Copy the returned Markdown unchanged into the final reply, outside a code block. Use the actual URL returned by the tool, not a disk path.

The server starts on demand, binds only to `127.0.0.1` on an available port, and serves independent image snapshots from `.image-annotator-tmp/`. It never exposes arbitrary files or directory listings. URLs last up to 24 hours and stop working when the MCP process or connection closes; restarting the server does not restore old URLs. The client must run on the same computer. Files stay local and no extra dependencies are needed.

HTTP bytes, MIME types, concurrency, snapshot stability, expiration, and shutdown are covered by integration tests. **Cherry Studio 2.1.8 inline HTTP rendering has not yet been UI-verified.** If the client blocks the URL or the local listener cannot start, expand the tool response to see its MCP image. Markdown images pointing to `D:/...` or `file:///...` remain unsupported there.

### `list_cherry_images`

List Cherry Studio cached image candidates ordered by modification time, with original dimensions and labeled image previews. Use when the conversation contains an image but the model has neither a local path nor Base64.

| Param | Type | Default | Description |
|---|---|---|---|
| `limit` | integer | `5` | Images per page, from 1 to 10 |
| `offset` | integer | `0` | Use `next_offset` from the preceding result to page through older images |
| `include_previews` | boolean | `true` | Return previews for matching the user's image |

The text result contains `cache_directory`, `images` with `id`, dimensions, format, size, and timestamp, and `next_offset` (`null` at the end). Follow the text labels to associate previews with IDs. Corrupt or unsupported images are skipped. Select the matching candidate and pass its ID to `save_attached_image`.

### `save_attached_image`

Save a conversation image attachment to `.image-annotator-tmp/` and receive an absolute path for the existing image tools. Supply exactly one of `cherry_image_id` or `image_data`; saved files are limited to 20 MB and are eligible for cleanup after 24 hours. Expired files are removed when the server starts.

| Param | Type | Description |
|---|---|---|
| `cherry_image_id` | string | Image ID including extension from `list_cherry_images`; supply this or `image_data` |
| `image_data` | string | Base64 image data or a data URL such as `data:image/png;base64,...`; supply this or `cherry_image_id` |
| `filename` | string | Optional filename hint; path segments are removed and the actual image format determines the extension |

Example input:

```json
{
  "image_data": "data:image/png;base64,iVBORw0KGgo...",
  "filename": "image.png"
}
```

The result is JSON with `path`, `filename`, `width`, `height`, `format`, `bytes`, and `expires_at`. Pass `path` to `get_image_dimensions` or any annotation tool.

### `annotate_screenshot`

The main composition tool. Apply any number of annotations, optional theme, framing, and output settings.

Backgrounds for `label` and automatically sized `callout` annotations are measured using the actual rendered font, including Chinese and mixed text. A label's `x`/`y` still marks the text baseline; its background is sized around the glyphs.

| Param | Type | Default | Description |
|---|---|---|---|
| `input_path` | string | — | Absolute path to the input screenshot (**required**) |
| `annotations` | array | — | Array of annotation objects (**required**) — see [Annotation types](#annotation-types) |
| `output_path` | string | Input name with `-annotated` suffix | Where to write the result; specify the extension to select a format |
| `theme` | string | — | `documentation` \| `tutorial` \| `bugReport` \| `highlight` |
| `scale` | number | auto | Annotation size multiplier. Omit to auto-scale from image width; `1` = raw sizes |
| `margin` | number | `0` | Padding (px) added around the screenshot so gutter annotations aren't clipped |
| `matte` | string | `#FFFFFF` | Background color for the margin area |
| `frame` | object | — | Premium frame, e.g. `{ "browserBar": true }` — see [frame options](#frame-options) |
| `format` | string | `png` | `png` \| `webp` \| `jpeg` \| `jpg` (also inferred from `output_path`) |
| `quality` | number | `90` | Quality (1–100) for webp/jpeg |
| `downscale` | number | `1` | Resize factor for the final image, e.g. `0.5` halves a 2x capture |

### `get_image_dimensions`

Returns `{ width, height, format }`. Use this before annotating to compute coordinates.

| Param | Type | Description |
|---|---|---|
| `image_path` | string | Absolute path to the image (**required**) |

### `create_step_guide`

Drops numbered markers with labels and connecting lines in one call — ideal for tutorials.

| Param | Type | Default | Description |
|---|---|---|---|
| `input_path` | string | — | Input screenshot (**required**) |
| `steps` | array | — | `[{ x, y, label, color? }]` (**required**) |
| `connect_steps` | boolean | `true` | Draw dashed connectors between consecutive steps |
| `theme` | string | — | Optional theme |
| `output_path` | string | `<input>-guide.png` | Output path |

### `highlight_area`

One-liner to ring a region with a shape and optional label.

| Param | Type | Default | Description |
|---|---|---|---|
| `input_path` | string | — | **required** |
| `shape` | string | — | `circle` \| `rect` \| `highlight` (**required**) |
| `x`, `y` | number | — | Top-left of the region (**required**) |
| `width` | number | — | Width (or diameter for circle) (**required**) |
| `height` | number | `= width` | Height (rect only) |
| `color` | string | `red` | Outline color |
| `label` | string | — | Optional text label |
| `label_position` | string | `right` | `top` \| `bottom` \| `left` \| `right` |
| `output_path` | string | `<input>-highlighted.png` | Output path |

### `add_callout`

A speech-bubble callout pointing at a location.

| Param | Type | Default | Description |
|---|---|---|---|
| `input_path` | string | — | **required** |
| `x`, `y` | number | — | Point the pointer aims at (**required**) |
| `text` | string | — | Callout text (`\n` for newlines) (**required**) |
| `pointer` | string | `left` | `top` \| `bottom` \| `left` \| `right` |
| `color` | string | `primary` | Border color |
| `background` | string | `white` | Fill color |
| `output_path` | string | `<input>-callout.png` | Output path |

### `blur_area`

Blur a rectangle to hide sensitive data.

| Param | Type | Default | Description |
|---|---|---|---|
| `input_path` | string | — | **required** |
| `x`, `y`, `width`, `height` | number | — | Region to blur (**required**) |
| `intensity` | number | `8` | Blur strength |
| `output_path` | string | `<input>-blurred.png` | Output path |

### `frame_screenshot`

Wrap a raw or annotated screenshot in a premium frame.

| Param | Type | Default | Description |
|---|---|---|---|
| `input_path` | string | — | **required** |
| `browser_bar` | boolean | `false` | Add a browser title bar with traffic-light dots |
| `padding` | number | `64` | Padding around the screenshot |
| `background` | string | `#EEF1F5` | Matte color behind the frame |
| `radius` | number | `14` | Corner radius |
| `shadow` | boolean | `true` | Drop shadow |
| `format` | string | `png` | `png` \| `webp` \| `jpeg` \| `jpg` |
| `quality` | number | `90` | Quality 1–100 for webp/jpeg |
| `downscale` | number | `1` | Resize factor |
| `output_path` | string | `<input>-framed.png` | Output path |

---

## Annotation types

Each entry in `annotations[]` has a `type` plus type-specific fields.

| Type | Key fields | Notes |
|---|---|---|
| `marker` | `number`, `x`,`y` **or** `target`+`offset`, `color`, `size`, `style`, `leader` | Numbered badge. With `target`, sits in a clear area and draws a leader to the element. `style`: `filled` (default) \| `outline` \| `badge` |
| `arrow` | `from`,`to`, `color`, `strokeWidth`, `style` | `style`: `solid` \| `dashed` |
| `curved-arrow` | `from`,`to`, `curve`, `color`, `strokeWidth` | Bezier arrow; `curve` = bow amount |
| `callout` | `x`,`y`, `text`, `pointer`, `color`, `background` | Speech bubble; `text` supports `\n` |
| `rect` | `x`,`y`, `width`, `height`, `color`, `cornerRadius`, `style` | Outline box |
| `circle` | `x`,`y`, `radius`, `color`, `style` | Outline ring |
| `label` | `x`,`y`, `text`, `color`, `fontSize`, `background` | No `background` → white halo for legibility |
| `highlight` | `x`,`y`, `width`, `height`, `color`, `opacity` | Semi-transparent overlay |
| `blur` | `x`,`y`, `width`, `height`, `intensity` | Hide sensitive content |
| `connector` | `from`,`to`, `color`, `style` | Dashed line between elements |
| `icon` | `x`,`y`, `icon`, `color`, `size` | `icon`: `check` \| `x` \| `warning` \| `info` \| `question` |
| `spotlight` | `target` **or** `x`,`y`+`width`,`height`, `shape`, `dim`, `feather` | Place **first**. Dims everything but the focus area. `shape`: `rect` (default) \| `ellipse` \| `circle` |

### Frame options

Used by `annotate_screenshot`'s `frame` object (camelCase) and `frame_screenshot`'s top-level params (snake_case): `browserBar`/`browser_bar`, `padding`, `background`, `radius`, `shadow`.

### Themes

`documentation` (blue), `tutorial` (green), `bugReport` (red), `highlight` (amber). A theme sets default color/size/font for `marker`, `arrow`, `label`, and `callout`; per-annotation fields still override.

### Colors

Named: `red`, `orange`, `yellow`, `green`, `blue`, `purple`, `pink`, `cyan`, `teal`, `white`, `black`, `gray`, `lightGray`, `darkGray`, `success`, `warning`, `error`, `info`, `primary`, `secondary`, `accent`. Any hex value (`#1976D2`) also works.

---

## Quick examples

### Basic annotations

```json
{
  "input_path": "/path/to/screenshot.png",
  "theme": "documentation",
  "annotations": [
    {"type": "marker", "number": 1, "target": [1010, 627], "offset": [-80, -110]},
    {"type": "callout", "x": 300, "y": 200, "text": "Important!", "pointer": "left", "color": "orange"},
    {"type": "rect", "x": 50, "y": 250, "width": 200, "height": 100, "color": "green", "style": "dashed"},
    {"type": "icon", "x": 400, "y": 100, "icon": "check", "color": "success"}
  ]
}
```

### Premium: spotlight + frame + optimized output

```json
{
  "input_path": "/path/to/screenshot.png",
  "theme": "documentation",
  "frame": { "browserBar": true, "padding": 90, "background": "#E9EDF2" },
  "format": "webp",
  "downscale": 0.6,
  "annotations": [
    {"type": "spotlight", "target": [1010, 627], "width": 1700, "height": 120, "dim": 0.62},
    {"type": "marker", "number": 1, "target": [1010, 627], "offset": [-80, -110]},
    {"type": "callout", "x": 1010, "y": 430, "text": "Open the Library tab", "pointer": "bottom", "color": "primary"}
  ]
}
```

More recipes in **[USAGE.md](../USAGE.md)**.

---

## Workflow with Playwright MCP

For pixel-accurate positions, drive Playwright to capture and measure, then annotate.

**1. Navigate & screenshot** — `browser_navigate` → `browser_take_screenshot`

**2. Measure the element** with `browser_evaluate`:

```javascript
() => {
  const el = document.querySelector('[role="tab"]');
  const r = el.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, dpr: window.devicePixelRatio };
}
```

**3. Convert to image pixels** — multiply by `dpr` (usually 2 on retina): `target = [x * dpr, y * dpr]`.

**4. Annotate** with `annotate_screenshot`, passing the measured `target`.

**5. Ship** — upload the result (e.g. Basecamp `comment_with_file`, or into your docs repo).

---

## CLI usage

The bundled CLI covers basic annotation (full options like `frame`/`margin`/`format` are MCP-only):

```bash
# Annotate
node annotate.js input.png output.png --annotations '[{"type":"marker","x":100,"y":100,"number":1}]' --theme documentation

# Show all annotation types and options
node annotate.js --help
```

`package.json` also exposes bins: `image-annotator` (the MCP server) and `annotate` (the CLI).

---

## Changelog

### 1.5.0
- Return loopback HTTP image URLs and final-reply Markdown from all six generating tools
- Serve registered snapshots through local-only GET/HEAD routes with a 24-hour lifetime
- Close the listener with the MCP connection and retain saved paths and MCP image content

### 1.4.2
- Measure rendered text to size label backgrounds and callout boxes for Chinese and mixed text
- Preserve label baseline coordinates and use actual glyph bounds for balanced padding

### 1.4.1
- Return generated images as MCP image content, alongside saved paths, so clients can display them
- Document Cherry Studio's tool-result image preview and final-message local-path limitation

### 1.4.0
- Discover Cherry Studio image attachments from its configured cache and return labeled previews
- Import a selected cached image by ID without supplying a local path or Base64
- Add MCP integration tests for discovery, import, and annotation

### 1.3.0
- Add `save_attached_image` for Base64 images attached in a conversation
- Validate and limit temporary images to 20 MB; clean up files older than 24 hours at startup

### 1.2.0
- Add `spotlight` annotation type (dim + soft focus hole)
- Add premium framing (`frame` option + `frame_screenshot` tool): rounded corners, drop shadow, matte padding, optional browser bar
- Add output control: `format` (png/webp/jpeg), `quality`, `downscale`

### 1.1.0
- Replace Comic Sans handwriting default with a clean professional font stack (handwriting now opt-in)
- Add marker `target`/`offset`/`leader` so badges point to the UI instead of covering it
- Auto-scale decorative sizes to image resolution (retina-aware)
- Add white text halo for legibility; add `margin`/`matte` canvas expansion to prevent edge clipping

### 1.0.0
- Initial release: markers, arrows, callouts, shapes, labels, highlights, blur, connectors, icons, themes

---

## License

MIT License — see [LICENSE](../LICENSE).

## Author

Varun Dubey <varun@wbcomdesigns.com> · [github.com/vapvarun/image-annotator-mcp](https://github.com/vapvarun/image-annotator-mcp)
