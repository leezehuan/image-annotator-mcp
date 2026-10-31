# Image Annotator MCP · 图片标注工具

中文 | [English](README.en.md)

通过 MCP 为本地图片、截图和对话附件添加箭头、编号、文字、说明框、高亮与模糊处理。可在 Cherry Studio 中找到聊天图片并临时保存，再直接标注；也可与 Playwright MCP 配合完成截图和标注。

当前版本：**1.4.2**。支持 Cherry Studio **2.1.8** 的本地 stdio 场景；已通过缓存导入、MCP 图片返回及文字布局回归测试。

![标注效果示例](examples/annotated.png)

- 项目仓库：[leezehuan/image-annotator-mcp](https://github.com/leezehuan/image-annotator-mcp)
- 英文使用示例：[USAGE.md](USAGE.md)
- Cherry Studio 附件机制说明：[研究记录](docs/research/cherry-studio-attachments.md)

## 功能

- **聊天图片导入**：通过 `list_cherry_images` 预览 Cherry Studio 的缓存图片，再按 ID 保存，无需手动提供路径或让模型转写 Base64。
- **临时保存附件**：支持 Base64 和 data URL，文件保存在项目的 `.image-annotator-tmp/` 中，单张最大 20 MB。
- **12 种标注**：编号、直箭头、曲箭头、说明框、矩形、圆形、文字、高亮、模糊、连接线、图标与聚光灯。
- **中文文字排版**：按实际渲染字形计算文字背景和自动宽度说明框，支持中文及中英文混排。
- **直接返回图片**：生成工具同时返回保存路径与 MCP 图片内容，支持客户端在工具结果中显示。
- **输出与外框**：支持 PNG、WebP、JPEG，以及缩放、留白、圆角、阴影和浏览器标题栏。
- **主题**：提供文档、教程、问题报告和重点高亮四种配色。

## 安装

需要 **Node.js 18 或更高版本**，并安装 Git。`sharp` 随依赖安装，用于图像合成和文字渲染。

```bash
git clone https://github.com/leezehuan/image-annotator-mcp.git
cd image-annotator-mcp
npm ci
```

无需额外构建。MCP 启动入口是项目中的 `server.js`，客户端应使用它的**绝对路径**。

### Cherry Studio：stdio 配置

在 Cherry Studio 的 MCP 设置中添加服务器：

| 设置项 | 值 |
|---|---|
| 名称 | `image-annotator` |
| 类型 | `stdio` |
| 命令 | `node`，或本机 `node.exe` 的绝对路径 |
| 参数 | `server.js` 的绝对路径，例如 `D:\Project\image-annotator-mcp\server.js` |

支持导入 MCP JSON 配置的客户端可使用下列内容，替换成自己的安装路径：

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

保存并启用服务器，确认工具列表包含 `list_cherry_images`、`save_attached_image` 和 `annotate_screenshot`。在当前助手或对话中启用这些工具；识别预览图片需要支持视觉的模型。

如果客户端找不到 `node`，将命令改为实际的 Node.js 可执行文件绝对路径。不要将命令设置为图片路径。

### 其他 MCP 客户端

Claude Code 可使用：

```bash
claude mcp add image-annotator -- node /absolute/path/to/image-annotator-mcp/server.js
```

Claude Desktop 或其他支持 stdio 的客户端可使用同样的 `mcpServers` 配置。Cherry Studio 缓存发现功能需要服务器能够访问安装了 Cherry Studio 的本机数据目录；其他客户端可使用本地图片路径，或在能够取得真实图片数据时调用 `save_attached_image`。

## 在 Cherry Studio 中标注聊天图片

Cherry Studio 2.1.8 不会自动把当前对话附件的文件路径或 Base64 传给外部 MCP。此项目通过读取 Cherry Studio 的本地图片缓存补全这一步。

### 推荐流程

1. 上传或粘贴图片，并要求模型使用 `image-annotator` 标注。
2. 调用 `list_cherry_images`，将返回的预览与用户附件匹配。
3. 将匹配项的 `id` 作为 `cherry_image_id` 传给 `save_attached_image`。
4. 使用返回的 `path` 和原图尺寸调用标注工具。
5. 展开生成工具的结果，查看图片；需要长期保留时将文件另存到临时目录之外。

可直接向模型发送：

> 请用 image-annotator 标注我刚发送的图片。如果没有本地路径，先调用 list_cherry_images，根据预览匹配这张附件，再调用 save_attached_image，使用返回的原图路径进行标注。按原图尺寸计算坐标，完成后提醒我展开工具结果查看图片。

缓存可能包含**不同对话**的图片，不能将最新的一张直接视为当前附件。预览经过缩小，标注坐标应以工具返回的**原图尺寸**为准。未找到时可使用 `next_offset` 翻页。

### 工具调用示例

先列出图片：

```json
{
  "limit": 5,
  "include_previews": true
}
```

对照预览后，调用 `save_attached_image`。下列 ID 仅为示例，应替换为上一步返回的真实 ID：

```json
{
  "cherry_image_id": "selected-image-id.png"
}
```

返回值包含 `path`、`filename`、`width`、`height`、`format`、`bytes` 和 `expires_at`。将其中的 `path` 用作后续工具的输入路径。

若客户端已经能提供真实 Base64 或 data URL，也可以直接保存：

```json
{
  "image_data": "data:image/png;base64,...",
  "filename": "circuit.png"
}
```

这里的 `...` 必须替换为真实图片数据。`image_data` 与 `cherry_image_id` **只能提供一个**。

### 缓存目录如何确定

服务器按以下顺序查找缓存：

1. 环境变量 `CHERRY_STUDIO_FILES_DIR`：直接指向 `Data/Files`。
2. `~/.cherrystudio/boot-config.json` 中 `app.user_data_path` 映射对应的可用 `Data/Files`。
3. 未配置自定义映射时，使用系统标准 CherryStudio 用户数据目录下的 `Data/Files`。

若配置了多个数据目录，或配置目录不可用，需显式指定正在使用的缓存。示例：

```json
{
  "mcpServers": {
    "image-annotator": {
      "command": "node",
      "args": ["D:\\Project\\image-annotator-mcp\\server.js"],
      "env": {
        "CHERRY_STUDIO_FILES_DIR": "D:\\CherryData\\Data\\Files"
      }
    }
  }
}
```

### 临时文件与图片显示

导入的原图和未另指定路径的标注结果保存在项目的 `.image-annotator-tmp/` 中。服务器**启动时**会清理该目录内修改时间超过 24 小时的文件，并非到期即时删除。此目录已被 Git 忽略，重要结果请及时另存。

图片生成工具返回两类内容：保存路径的文本，以及真正的 MCP `image` 图片内容。在 **Cherry Studio 2.1.8** 中，需要展开已完成工具卡片的 **Response／响应** 查看图片。助手正文中的 `![图片](D:/...)` 或 `file:///...` 不能作为该版本的本地图片展示方案；正文没有显示不代表生成失败。

## 坐标与中文文字框

- 所有坐标均使用**原图像素**，原点在左上角，横向向右、纵向向下。
- `get_image_dimensions` 返回原图尺寸。使用缓存预览定位时，要将预览坐标换算回原图坐标。
- Retina 截图可能是 CSS 尺寸的两倍，应按实际设备像素比换算。
- 字号、线宽、编号尺寸会随图像宽度自动缩放；设置 `scale: 1` 可使用原始装饰尺寸。坐标和矩形等区域尺寸不随该倍率缩放。
- `label` 的 `x`、`y` 表示**文字基线起点**，不是背景框左上角。
- 1.4.2 的图片生成流程按实际字体渲染结果计算 `label` 背景和自动宽度 `callout` 的大小及内边距，修复中文和宽字母溢出文字框的问题。
- `callout` 的 `x`、`y` 表示指针目标点；显式指定 `width` 时，仍使用调用者给定的宽度。
- 贴近图片边缘的标注可使用 `margin` 添加四周留白，避免裁切。

## MCP 工具参考

共 9 个工具。下表中的路径应使用本地绝对路径。

| 工具 | 用途 | 主要参数 |
|---|---|---|
| `list_cherry_images` | 查找缓存图片，返回 ID、原图尺寸和预览 | `limit`（默认 5，1–10）、`offset`（默认 0）、`include_previews`（默认 true） |
| `save_attached_image` | 将对话图片保存到项目临时目录 | `cherry_image_id` 或 `image_data` 二选一，`filename` 可选 |
| `get_image_dimensions` | 获取图片宽、高和格式 | `image_path` |
| `annotate_screenshot` | 一次组合多种标注 | `input_path`、`annotations`，可选输出、主题、缩放及外框设置 |
| `create_step_guide` | 添加步骤编号、文字与连接线 | `input_path`、`steps: [{x, y, label, color?}]`，`connect_steps` 默认 true |
| `highlight_area` | 快速高亮一个区域 | `input_path`、`shape`、`x`、`y`、`width`，可选 `height`、`color`、`label`、`label_position` |
| `add_callout` | 添加带指针的说明框 | `input_path`、`x`、`y`、`text`，可选 `pointer`、`color`、`background` |
| `blur_area` | 模糊一个矩形区域 | `input_path`、`x`、`y`、`width`、`height`，`intensity` 默认 8 |
| `frame_screenshot` | 为图片添加圆角、阴影和可选浏览器标题栏 | `input_path`，可选 `browser_bar`、`padding`、`background`、`radius`、`shadow`、输出设置 |

所有生成工具都支持可选 `output_path`，并返回生成图片内容。完整参数表见 [英文参考](README.en.md#mcp-tools)。

### `annotate_screenshot` 参数

| 参数 | 默认值 | 说明 |
|---|---|---|
| `input_path` | 必填 | 输入图片绝对路径 |
| `annotations` | 必填 | 标注对象数组，见下表 |
| `output_path` | 输入名加 `-annotated` 后缀 | 输出图片路径；建议显式指定扩展名 |
| `theme` | 无 | `documentation`、`tutorial`、`bugReport`、`highlight` |
| `scale` | 自动 | 装饰尺寸倍率；`1` 表示原始大小 |
| `margin` | `0` | 原图四周增加的留白像素 |
| `matte` | `#FFFFFF` | 留白背景色 |
| `frame` | 无 | 外框对象，支持 `browserBar`、`padding`、`background`、`radius`、`shadow` |
| `format` | 根据输出路径推断，默认 `png` | `png`、`webp`、`jpeg`、`jpg` |
| `quality` | `90` | WebP／JPEG 质量，1–100 |
| `downscale` | `1` | 最终输出缩放比例，例如 `0.5` |

### 标注类型

每个标注对象必须包含 `type`，再提供该类型所需字段。

| `type` | 作用 | 常用字段 |
|---|---|---|
| `marker` | 数字编号 | `number`，`x`／`y` 或 `target` + `offset`，`color`、`size`、`leader` |
| `arrow` | 直线箭头 | `from: [x,y]`、`to: [x,y]`、`color`、`strokeWidth` |
| `curved-arrow` | 曲线箭头 | `from`、`to`、`curve`、`color`、`strokeWidth` |
| `callout` | 带指针说明框 | `x`、`y`、`text`、`pointer`、`color`、`background`；支持 `\n` 换行 |
| `rect` | 矩形框 | `x`、`y`、`width`、`height`、`color`、`cornerRadius` |
| `circle` | 圆形框 | `x`、`y`（圆心）、`radius`、`color` |
| `label` | 文字标签 | `x`、`y`（基线）、`text`、`fontSize`、`color`、`background` |
| `highlight` | 半透明高亮 | `x`、`y`、`width`、`height`、`color`、`opacity` |
| `blur` | 区域模糊 | `x`、`y`、`width`、`height`、`intensity` |
| `connector` | 连接线 | `from`、`to`、`color`、`style` |
| `icon` | 状态图标 | `x`、`y`、`icon`（`check`／`x`／`warning`／`info`／`question`）、`color` |
| `spotlight` | 聚焦指定区域，压暗其他区域 | `target` 或 `x`／`y`，`width`、`height`、`shape`、`dim`、`feather`；放在标注数组最前面 |

主题配色为 `documentation`（蓝）、`tutorial`（绿）、`bugReport`（红）、`highlight`（黄）。单条标注中的设置可覆盖主题。

颜色支持十六进制（如 `#E53935`）和名称：`red`、`orange`、`yellow`、`green`、`blue`、`purple`、`pink`、`cyan`、`teal`、`white`、`black`、`gray`、`lightGray`、`darkGray`、`success`、`warning`、`error`、`info`、`primary`、`secondary`、`accent`。

### 示例：框选并添加中文说明

将 `input_path` 替换为实际图片路径，再调用 `annotate_screenshot`。示例坐标需根据原图调整。

```json
{
  "input_path": "D:\\Pictures\\circuit.png",
  "output_path": "D:\\Pictures\\circuit-annotated.png",
  "scale": 1,
  "annotations": [
    { "type": "rect", "x": 455, "y": 175, "width": 40, "height": 54, "color": "red", "strokeWidth": 3 },
    { "type": "label", "x": 230, "y": 218, "text": "双向稳压二极管", "fontSize": 20, "color": "red", "background": "white" },
    { "type": "arrow", "from": [403, 228], "to": [454, 204], "color": "red", "strokeWidth": 3 }
  ]
}
```

### 示例：聚光灯、编号与外框

```json
{
  "input_path": "D:\\Pictures\\screenshot.png",
  "theme": "documentation",
  "frame": { "browserBar": true, "padding": 64, "background": "#EEF1F5" },
  "format": "webp",
  "downscale": 0.6,
  "annotations": [
    { "type": "spotlight", "target": [500, 300], "width": 260, "height": 100, "dim": 0.6 },
    { "type": "marker", "number": 1, "target": [500, 300], "offset": [-80, -80] },
    { "type": "callout", "x": 500, "y": 240, "text": "点击这里打开设置", "pointer": "bottom" }
  ]
}
```

## 与 Playwright MCP 配合

先使用 Playwright 打开页面并截图，再用 `getBoundingClientRect()` 获取元素位置，将 CSS 坐标乘以 `window.devicePixelRatio` 换算为原图像素，最后调用 `annotate_screenshot`。应结合实际截图方式确认像素比和截图原点。

## 命令行使用

CLI 支持基本标注和主题；外框、留白、输出格式等完整设置可通过 MCP 使用。

```bash
node annotate.js input.png output.png --annotations '[{"type":"marker","x":100,"y":100,"number":1}]' --theme documentation
node annotate.js --help
```

上面的命令适用于 Bash；PowerShell 中建议直接通过 MCP 调用，避免不同版本的原生命令引号转义差异。

## 更新与验证

```bash
git pull --ff-only
npm ci
npm test
```

更新后在客户端重启 `image-annotator` MCP，以重新加载代码和工具描述。仅修改代码、依赖没有变化时，无需重新安装依赖；已生成的图片需要重新标注，旧文件不会自动变化。

测试覆盖附件保存、大小与格式校验、临时文件清理、Cherry Studio 缓存发现及导入、MCP 图片返回、EXIF 方向，以及中文／宽窄英文／混排／缩放／空白字符／多行说明框的像素布局。

## 常见问题

**模型仍要求提供本地路径或重新上传图片。** 确认客户端启动的是此仓库的 `server.js`，重启 MCP，并检查是否出现 `list_cherry_images`。在对话中明确要求先调用该工具匹配预览，再按 ID 保存。`save_attached_image` 不会自动接收到聊天附件。

**找不到 Cherry Studio 缓存。** 检查 Cherry Studio 正在使用的数据目录，并将 `CHERRY_STUDIO_FILES_DIR` 指向该目录下的 `Data/Files`，而非数据根目录。

**列表中没有当前图片。** 检查预览，使用 `next_offset` 继续翻页，并确认 MCP 与 Cherry Studio 在同一台机器上、使用同一个数据目录。

**标注成功但回答正文没有图片。** Cherry Studio 2.1.8 中请展开生成工具卡片的 Response／响应，查看返回的图片。不要依赖助手正文中的 Windows 路径图片链接。

**中文文字和背景框错位或溢出。** 确认版本为 1.4.2 或更新版本，重启 MCP 并重新生成。旧版本按 `字符数 × 字号 × 0.6` 估算宽度，会低估中文字宽；新版本按实际字形计算。自行指定过窄的 `callout.width` 仍会限制框宽。

**框选位置不对。** 检查是否误用了缩小预览或 CSS 坐标；以原图尺寸定位。`label.y` 是文字基线，`callout.x/y` 是指针目标点。

**临时图片找不到。** 临时目录会在服务器启动时清理超过 24 小时的文件。请重新导入原图，或将需要保留的结果另存到其他目录。

**中文显示为方框。** 运行服务器的系统需要安装可用的中文字体。图片文字由服务器所在系统渲染，不使用聊天客户端的字体。

## 更新记录

### 1.4.2

- 使用实际渲染字形计算文字背景与自动宽度说明框，修复中文和宽字符溢出。
- 保留标签基线坐标，统一测量与绘制的字体和缩放默认值。
- 处理零宽字符、首尾空行等布局边界情况，并补充像素回归测试。

### 1.4.1

- 图片生成工具同时返回 MCP 图片内容和保存路径。
- 补充 Cherry Studio 工具响应预览及正文中本地图片链接的显示限制说明。

### 1.4.0

- 新增 Cherry Studio 缓存图片发现与预览，支持按 ID 导入。
- 支持读取自定义数据目录及显式缓存目录环境变量。

### 1.3.0

- 新增对话图片 Base64／data URL 临时保存，限制 20 MB。
- 服务器启动时清理临时目录内超过 24 小时的文件。

### 1.2.0 及更早

- 增加聚光灯、浏览器外框、输出格式与缩放设置。
- 改进默认字体、编号引导线及 Retina 自动缩放。
- 提供基础箭头、文字、图形、高亮、模糊和主题功能。

## 许可证与来源

采用 [MIT 许可证](LICENSE)。本仓库基于 [vapvarun/image-annotator-mcp](https://github.com/vapvarun/image-annotator-mcp) 开发，原作者为 Varun Dubey，保留原始署名和许可证。

本仓库维护地址：[leezehuan/image-annotator-mcp](https://github.com/leezehuan/image-annotator-mcp)。
