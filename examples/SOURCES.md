# 示例图片来源

README 中新增的三张样本均由 `annotate_screenshot` MCP 工具实际生成。下载日期：2026-10-31。源文件与 SHA-256 记录保存在 [sources/metadata.json](sources/metadata.json)；分压图 SVG 仅清理了行尾空白，同时记录下载内容与整理后文件的哈希。

| 原图 | 作者与来源 | 原图授权 | 本项目的修改 |
|---|---|---|---|
| [分压电路](sources/voltage-divider.svg) | [Wikimedia Commons 文件页](https://commons.wikimedia.org/wiki/File:Voltage_divider.svg) | 公有领域（文件页声明 PD-self） | 栅格化、留白、中文说明、框选、箭头、公式 |
| [Arduino Uno](sources/arduino-uno.jpg) | SparkFun Electronics，[Wikimedia Commons 文件页](https://commons.wikimedia.org/wiki/File:Arduino_Uno_-_R3.jpg) | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) | 缩放、留白、器件编号、中文说明、框选与引导线 |
| [Earthrise／地出](sources/earthrise.jpg) | NASA / Bill Anders，Apollo 8，1968-12-24，[Wikimedia Commons 文件页](https://commons.wikimedia.org/wiki/File:NASA-Apollo8-Dec24-Earthrise.jpg) | 公有领域（NASA 作品） | 缩放、裁切、聚光灯、中文说明、圆圈与箭头 |

原图的授权独立于项目代码的 MIT 许可证。Arduino 原图与标注版请保留 SparkFun Electronics 署名、上述来源及 CC BY 2.0 链接，并说明已经修改；标注不代表原作者认可或背书。

仓库原有的 `original.png` 与 `annotated.png` 保持原样。

复现所有新增样本（安装依赖后，无需再次联网）：

```bash
node examples/generate-gallery.js
```

脚本将调用本项目的 MCP 接口，并将结果写入 `examples/gallery/`。字体由运行机器提供，不同系统的文字外观可能略有区别。
