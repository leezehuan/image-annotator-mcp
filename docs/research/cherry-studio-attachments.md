# Cherry Studio 2.1.8 图片附件与 MCP：源码核查

核查日期：2026-10-31。范围限于官方 `CherryHQ/cherry-studio` 的 v2.1.8 和本机同版本程序代码；未读取聊天正文、API key、认证数据或数据库记录。

## 版本与证据边界

- 官方 Git ref API 返回 `refs/tags/v2.1.8` 的类型为 `commit`，SHA 为 **`9e7bb8a17d002c31bfb83ea4acd6c3b501bf40f1`**。以下 GitHub 链接全部固定到该 SHA。[官方 tag API](https://api.github.com/repos/CherryHQ/cherry-studio/git/ref/tags/v2.1.8)
- 本机 `C:\Program Files\Cherry Studio\Cherry Studio.exe` 的 ProductVersion 是 `2.1.8.0`；`resources\app.asar` 中 `package.json` 的 version 是 `2.1.8`。本机程序包可读，初期网络连接失败后曾只读提取程序 JS 到临时目录交叉核对；随后成功直接下载固定 SHA 的官方源码。
- 产品版本相同不等于已经验证本机安装包与 GitHub commit 逐字节一致；本次没有作这种断言。下面的代码结论以固定 SHA 官方源码为准。

## 1. 数据目录与本机实际配置

| 项目 | 已核实的事实 | 证据 |
|---|---|---|
| 启动配置文件 | 打包版 `CHERRY_HOME` 是 `os.homedir()/.cherrystudio`，`BOOT_CONFIG_PATH` 是其下 `boot-config.json` | [constants.ts L21-L40](https://github.com/CherryHQ/cherry-studio/blob/9e7bb8a17d002c31bfb83ea4acd6c3b501bf40f1/src/main/core/paths/constants.ts#L21) |
| JSON 访问形态 | key 是扁平字符串 **`json['app.user_data_path']`**，值为 `Record<executablePath, userDataPath>`，不是 `json.app.user_data_path` | [bootConfigSchemas.ts L30-L47](https://github.com/CherryHQ/cherry-studio/blob/9e7bb8a17d002c31bfb83ea4acd6c3b501bf40f1/src/shared/data/bootConfig/bootConfigSchemas.ts#L30)、[BootConfigService.ts L61](https://github.com/CherryHQ/cherry-studio/blob/9e7bb8a17d002c31bfb83ea4acd6c3b501bf40f1/src/main/data/bootConfig/BootConfigService.ts#L61) |
| 选择规则 | 按标准化后的当前 exe 路径取映射值；目录可读、可写、可搜索时执行 `app.setPath('userData', resolved)` | [userDataLocation.ts L60-L73](https://github.com/CherryHQ/cherry-studio/blob/9e7bb8a17d002c31bfb83ea4acd6c3b501bf40f1/src/main/core/preboot/userDataLocation.ts#L60)、[L80-L89](https://github.com/CherryHQ/cherry-studio/blob/9e7bb8a17d002c31bfb83ea4acd6c3b501bf40f1/src/main/core/preboot/userDataLocation.ts#L80) |
| 便携版差异 | Windows portable 的 exe 身份由 `PORTABLE_EXECUTABLE_DIR/cherry-studio-portable.exe` 标准化；无可用映射时 portable 使用其 `data` 目录 | [userDataLocation.ts L20-L28](https://github.com/CherryHQ/cherry-studio/blob/9e7bb8a17d002c31bfb83ea4acd6c3b501bf40f1/src/main/core/preboot/userDataLocation.ts#L20)、[L68-L72](https://github.com/CherryHQ/cherry-studio/blob/9e7bb8a17d002c31bfb83ea4acd6c3b501bf40f1/src/main/core/preboot/userDataLocation.ts#L68) |
| 文件缓存 | `feature.files.data = path.join(userData, 'Data', 'Files')`，精确拼写为 **`Data/Files`** | [pathRegistry.ts L49-L50](https://github.com/CherryHQ/cherry-studio/blob/9e7bb8a17d002c31bfb83ea4acd6c3b501bf40f1/src/main/core/paths/pathRegistry.ts#L49)、[L244-L245](https://github.com/CherryHQ/cherry-studio/blob/9e7bb8a17d002c31bfb83ea4acd6c3b501bf40f1/src/main/core/paths/pathRegistry.ts#L244) |
| SQLite | v2 数据库路径是 `userData/Data/cherrystudio.sqlite` | [pathRegistry.ts L97](https://github.com/CherryHQ/cherry-studio/blob/9e7bb8a17d002c31bfb83ea4acd6c3b501bf40f1/src/main/core/paths/pathRegistry.ts#L97) |

本机只选读上述路径配置字段，获得：

```json
{
  "app.user_data_path": {
    "C:\\Program Files\\Cherry Studio\\Cherry Studio.exe": "G:\\CherryStudio"
  }
}
```

因此该安装的配置文件根是 `G:\CherryStudio\Data\Files`。核查时该目录存在，目录 LastWriteTime 为 2026-10-30；同根 SQLite 文件存在，LastWriteTime 为 2026-10-31。旧的 `%APPDATA%\CherryStudio\Data\Files` 虽存在，不能据此覆盖当前 exe 的有效映射。这里只检查路径和文件元信息，没有打开数据库记录。

## 2. 图片文件名、id 与元数据

- 内部文件名是 **`{fileEntryId}.{ext}`**；无扩展名时只有 id。`ext` 不含点号。磁盘缓存名不使用原始显示文件名。[pathResolver.ts L17-L57](https://github.com/CherryHQ/cherry-studio/blob/9e7bb8a17d002c31bfb83ea4acd6c3b501bf40f1/src/main/services/file/utils/pathResolver.ts#L17)
- `createInternal` 创建 UUIDv7，按上述规则写入物理文件，并把显示名、扩展名、size、contentHash 写入 FileEntry。上传 intake 的发布过程也使用 UUIDv7，并使用同一物理命名规则。[create.ts L161-L196](https://github.com/CherryHQ/cherry-studio/blob/9e7bb8a17d002c31bfb83ea4acd6c3b501bf40f1/src/main/services/file/internal/entry/create.ts#L161)、[FileIntakeService.ts L329-L344](https://github.com/CherryHQ/cherry-studio/blob/9e7bb8a17d002c31bfb83ea4acd6c3b501bf40f1/src/main/services/file/FileIntakeService.ts#L329)、[publishIntake.ts L22-L35](https://github.com/CherryHQ/cherry-studio/blob/9e7bb8a17d002c31bfb83ea4acd6c3b501bf40f1/src/main/services/file/internal/entry/publishIntake.ts#L22)
- id 不能仅按 v7 校验：源码说明迁移条目会保留 UUIDv4，`FileEntryIdSchema` 实际是版本无关的 `z.uuid()`。[file.ts L160-L172](https://github.com/CherryHQ/cherry-studio/blob/9e7bb8a17d002c31bfb83ea4acd6c3b501bf40f1/src/shared/data/types/file.ts#L160)
- SQLite 表名为 **`file_entry`**，字段包括 id、origin、name、ext、size、contentHash、externalPath、cleanupPolicy 和时间戳。内部文件 `name` 是不带扩展名的显示名。`origin='external'` 的文件直接引用 externalPath，不必在 `Data/Files` 有副本。[数据库 schema L21-L65](https://github.com/CherryHQ/cherry-studio/blob/9e7bb8a17d002c31bfb83ea4acd6c3b501bf40f1/src/main/data/db/schemas/file.ts#L21)、[pathResolver.ts L41-L57](https://github.com/CherryHQ/cherry-studio/blob/9e7bb8a17d002c31bfb83ea4acd6c3b501bf40f1/src/main/services/file/utils/pathResolver.ts#L41)
- 聊天文件关联另存 `chat_message_file_ref`，Agent 会话有 `agent_session_message_file_ref`；绘图等也有不同关联表。因此单独枚举 `Data/Files` 不能证明某个文件是“当前聊天的本次附件”。[fileRelations.ts L42-L112](https://github.com/CherryHQ/cherry-studio/blob/9e7bb8a17d002c31bfb83ea4acd6c3b501bf40f1/src/main/data/db/schemas/fileRelations.ts#L42)
- 官方 composer 的图片后缀白名单为 **`.jpg .jpeg .png .gif .bmp .webp`**。[fileExtensions.ts L3](https://github.com/CherryHQ/cherry-studio/blob/9e7bb8a17d002c31bfb83ea4acd6c3b501bf40f1/src/shared/utils/file/fileExtensions.ts#L3)

## 3. 构造给模型的消息

- 持久化文件 part 可带 `providerMetadata.cherry.fileEntryId`；程序内部也兼容 legacy/external 的 `file://` URL。发送前 FileManager 读取原始字节，转换为 **`data:<mime>;base64,...`**。这不是让语言模型生成 Base64，而是客户端读取文件进行编码。[fileProcessor.ts L1-L17](https://github.com/CherryHQ/cherry-studio/blob/9e7bb8a17d002c31bfb83ea4acd6c3b501bf40f1/src/main/ai/messages/fileProcessor.ts#L1)、[L67-L73](https://github.com/CherryHQ/cherry-studio/blob/9e7bb8a17d002c31bfb83ea4acd6c3b501bf40f1/src/main/ai/messages/fileProcessor.ts#L67)、[L123-L150](https://github.com/CherryHQ/cherry-studio/blob/9e7bb8a17d002c31bfb83ea4acd6c3b501bf40f1/src/main/ai/messages/fileProcessor.ts#L123)
- 普通聊天的附件工具 handle 根据显示文件名生成；重名时附加 ` (2)`、` (3)`。内部允许列表保存 handle 到 fileEntryId 的映射。[attachmentRouting.ts L89-L118](https://github.com/CherryHQ/cherry-studio/blob/9e7bb8a17d002c31bfb83ea4acd6c3b501bf40f1/src/main/ai/messages/attachmentRouting.ts#L89)
- 官方附件规范明确声明 **`fileEntryId never reaches the model (filename in, filename out)`**。视觉模型接收原生图片 part；非视觉模型走 OCR，无法获取有效 OCR 时在 provider 请求前报错。上述 id 指客户端内部标识，不能因为模型能看图片就推断模型知道缓存路径/id。[官方附件规范](https://github.com/CherryHQ/cherry-studio/blob/9e7bb8a17d002c31bfb83ea4acd6c3b501bf40f1/docs/references/ai/chat-attachments.md)
- 普通 `read_file` 根据该请求的附件允许列表、按 filename handle 查找，返回提取/OCR文本并分页；不是返回图片原始字节或绝对路径的工具。[ReadFileTool.ts L82-L121](https://github.com/CherryHQ/cherry-studio/blob/9e7bb8a17d002c31bfb83ea4acd6c3b501bf40f1/src/main/ai/tools/adapters/aiSdk/builtin/ReadFileTool.ts#L82)、[L137-L159](https://github.com/CherryHQ/cherry-studio/blob/9e7bb8a17d002c31bfb83ea4acd6c3b501bf40f1/src/main/ai/tools/adapters/aiSdk/builtin/ReadFileTool.ts#L137)

这里描述的是模型可用的附件内容/handle，不声称已经审计每种 provider 的全部 wire metadata。没有证据支持模型可从图片附件恢复 Cherry 内部 id 或本地绝对路径。

## 4. 外部 MCP 的调用边界

- AI SDK MCP wrapper 把工具名和模型给出的 `args` 交给 McpRuntimeService；interaction context 包括 windowId、topicId、model、roots，不包含附件字节列表或 fileEntryId 列表。[mcpTools.ts L34-L44](https://github.com/CherryHQ/cherry-studio/blob/9e7bb8a17d002c31bfb83ea4acd6c3b501bf40f1/src/main/ai/tools/adapters/aiSdk/mcp/mcpTools.ts#L34)、[L61-L79](https://github.com/CherryHQ/cherry-studio/blob/9e7bb8a17d002c31bfb83ea4acd6c3b501bf40f1/src/main/ai/tools/adapters/aiSdk/mcp/mcpTools.ts#L61)
- Runtime 只对字符串 args 做 JSON.parse 等处理，再调用 connection.callTool。ClientMcpConnection 最终构造 **`{ name, arguments: args ?? {} }`**。modern 协议的 `_meta` 增补日志等级、elicitation/sampling/roots 能力，不增补聊天附件。[McpRuntimeService.ts L716-L743](https://github.com/CherryHQ/cherry-studio/blob/9e7bb8a17d002c31bfb83ea4acd6c3b501bf40f1/src/main/ai/mcp/McpRuntimeService.ts#L716)、[ClientMcpConnection.ts L297-L334](https://github.com/CherryHQ/cherry-studio/blob/9e7bb8a17d002c31bfb83ea4acd6c3b501bf40f1/src/main/ai/mcp/connections/ClientMcpConnection.ts#L297)
- 因此已审计的普通聊天外部 MCP 路径没有“自动把当前聊天图片传给工具”的行为。工具参数含图片路径/id/字节，仍需要某个明确来源提供该值，不能由当前附件的存在自动推导。

## 5. MCP 返回缩略图的支持情况

- MCP result 的 `{type:'image', data, mimeType}` 会被转换为 AI SDK **`image-data`** 内容，保留图片供请求级媒体路由使用；文本与图片可同时出现在同一个工具结果中。[mcp/utils.ts L67-L100](https://github.com/CherryHQ/cherry-studio/blob/9e7bb8a17d002c31bfb83ea4acd6c3b501bf40f1/src/main/ai/tools/adapters/aiSdk/mcp/utils.ts#L67)
- 对工具结果不能直接放图的 OpenAI 式 wire，如果模型本身支持视觉，Cherry 会把工具结果图片移到紧随工具结果之后的合成 user 消息。模型不支持的媒体则由能力过滤处理。[messageCapabilities.ts L109-L196](https://github.com/CherryHQ/cherry-studio/blob/9e7bb8a17d002c31bfb83ea4acd6c3b501bf40f1/src/main/ai/messages/messageCapabilities.ts#L109)
- 因此源码支持工具返回服务端生成的缩略图/联系表供视觉模型辨认；这项结论不保证每一个模型、provider、endpoint 配置都启用了视觉能力。本次没有向实际 provider 发请求做运行时验证。

## 6. 已找到的本地读取接口与适用范围

| 接口 | 能力与边界 | 证据 |
|---|---|---|
| File IPC `file.read` | 接受 file handle；可按 entryId 或 path 读取，支持 encoding 与 range。是应用内部 Electron IPC | [file handler L52-L69](https://github.com/CherryHQ/cherry-studio/blob/9e7bb8a17d002c31bfb83ea4acd6c3b501bf40f1/src/main/ipc/handlers/file.ts#L52)、[schema L135](https://github.com/CherryHQ/cherry-studio/blob/9e7bb8a17d002c31bfb83ea4acd6c3b501bf40f1/src/shared/ipc/schemas/file.ts#L135) |
| Data API `/files/entries` 等 | 只读数据库元数据，明确不做 FS IO；不能把此路径当成已公开的本机 HTTP 附件下载 URL。Data API IpcAdapter 挂在 Electron `ipcMain.handle` 且检查应用来源 | [files.ts L1-L17](https://github.com/CherryHQ/cherry-studio/blob/9e7bb8a17d002c31bfb83ea4acd6c3b501bf40f1/src/main/data/api/handlers/files.ts#L1)、[L32-L46](https://github.com/CherryHQ/cherry-studio/blob/9e7bb8a17d002c31bfb83ea4acd6c3b501bf40f1/src/main/data/api/handlers/files.ts#L32)、[IpcAdapter.ts L49](https://github.com/CherryHQ/cherry-studio/blob/9e7bb8a17d002c31bfb83ea4acd6c3b501bf40f1/src/main/data/api/core/adapters/IpcAdapter.ts#L49) |
| Cherry Assistant `assistant-files` MCP server | 当前 session 的附件允许列表上提供 `read_file` 和 `save_attachment`。后者按 handle 复制原始字节到当前 workspace 内新路径，不覆盖已有文件 | [AssistantFileToolsServer.ts L44-L74](https://github.com/CherryHQ/cherry-studio/blob/9e7bb8a17d002c31bfb83ea4acd6c3b501bf40f1/src/main/ai/mcp/servers/AssistantFileToolsServer.ts#L44)、[saveAttachment.ts L23-L47](https://github.com/CherryHQ/cherry-studio/blob/9e7bb8a17d002c31bfb83ea4acd6c3b501bf40f1/src/main/ai/tools/saveAttachment.ts#L23)、[L60-L98](https://github.com/CherryHQ/cherry-studio/blob/9e7bb8a17d002c31bfb83ea4acd6c3b501bf40f1/src/main/ai/tools/saveAttachment.ts#L60) |
| Assistant handle | `file_` 加 fileEntryId 的 SHA-256 前 16 个十六进制字符；不是磁盘 id，不能当缓存文件名使用。该能力限 Cherry Assistant，不给普通 Agents/共享聊天 runtime 注入同样的附件状态 | [assistantFileAttachments.ts L10-L13](https://github.com/CherryHQ/cherry-studio/blob/9e7bb8a17d002c31bfb83ea4acd6c3b501bf40f1/src/main/ai/messages/assistantFileAttachments.ts#L10)、[官方附件规范](https://github.com/CherryHQ/cherry-studio/blob/9e7bb8a17d002c31bfb83ea4acd6c3b501bf40f1/docs/references/ai/chat-attachments.md) |
| API Gateway | 核查的公开 HTTP 路由列出 chat/messages/responses/models/knowledge/MCP；没有在这组路由中找到本机聊天附件字节下载接口 | [app.ts L40-L60](https://github.com/CherryHQ/cherry-studio/blob/9e7bb8a17d002c31bfb83ea4acd6c3b501bf40f1/src/main/features/apiGateway/app.ts#L40)、[L174-L190](https://github.com/CherryHQ/cherry-studio/blob/9e7bb8a17d002c31bfb83ea4acd6c3b501bf40f1/src/main/features/apiGateway/app.ts#L174) |

没有把内部 IPC 或 Assistant 专用 MCP 视为任意外部 MCP 进程可直接调用的通用公共 API。本次未研究已配对 remote channel 的全部文件协议，因此“不存在任何其他附件接口”不是本报告的结论。

## 已确定的实施约束

1. 固定默认 `%APPDATA%` 会漏掉当前 G 盘配置；必须区分 userData 根与 `Data/Files` 根。
2. 内部缓存图片可以由确定的 UUID 与扩展名定位；原始显示名通常需要 file_entry 元数据，不能从 UUID 文件名反推。
3. 缓存目录的最近文件不能证明是当前聊天附件；不同安装、绘图、其他聊天和历史文件可能共享候选集合。
4. 从磁盘直接读取图片并在 MCP result 返回图片内容，是源码支持的方向；要求模型自己复述原图 Base64 并不构成可靠的客户端附件桥接。
5. 若需要精确的“当前会话附件”边界，已知结构是客户端请求内的附件允许列表；普通外部 MCP 调用没有自动收到该列表。

## 7. 标注结果显示：最终 Markdown 与工具卡是两条路径

补充核查日期：2026-10-31。以下证据仍全部对应 commit `9e7bb8a17d002c31bfb83ea4acd6c3b501bf40f1`；这里只读程序与测试源码，没有读取用户聊天。

### 最终回复的本地图片路径

- **`![](D:/Project/xxx-annotated.png)` 不能作为 Cherry 2.1.8 普通聊天的可靠图片显示方式，改成 `file:///D:/...` 也不能解决。** 官方测试明确输入 `![f](file:///x/a.png)`，断言没有 `img`、没有 `file://`；另一个测试在开启相对图片保留功能时输入 `C:/docs/x.png`，仍断言没有 `img`。无 alt 的无效图片还会被直接丢弃，这能解释 `![](...)` 看起来完全没有输出的情况。[markdown.test.tsx L175-L192](https://github.com/CherryHQ/cherry-studio/blob/9e7bb8a17d002c31bfb83ea4acd6c3b501bf40f1/packages/ui/src/components/composites/markdown/__tests__/markdown.test.tsx#L175)、[L281-L293](https://github.com/CherryHQ/cherry-studio/blob/9e7bb8a17d002c31bfb83ea4acd6c3b501bf40f1/packages/ui/src/components/composites/markdown/__tests__/markdown.test.tsx#L281)
- 静态和流式 Markdown 共用 MarkdownCore：先执行 URL sanitize，再 harden。Cherry 的扩展 sanitize schema 只给 `src` 增加 `data`；urlTransform 只显式放行 `data:image/png;` 和 `data:image/jpeg;`，其他交给默认 transform。图片 renderer 不会把 `D:/...` 自动转成 file URL，只把有效 src 交给 ImageViewer。[internal.tsx L173-L211](https://github.com/CherryHQ/cherry-studio/blob/9e7bb8a17d002c31bfb83ea4acd6c3b501bf40f1/packages/ui/src/components/composites/markdown/internal.tsx#L173)、[sanitize.ts L245-L251](https://github.com/CherryHQ/cherry-studio/blob/9e7bb8a17d002c31bfb83ea4acd6c3b501bf40f1/packages/ui/src/components/composites/markdown/utils/sanitize.ts#L245)、[MarkdownRenderers.tsx L188-L225](https://github.com/CherryHQ/cherry-studio/blob/9e7bb8a17d002c31bfb83ea4acd6c3b501bf40f1/src/renderer/components/markdown/MarkdownRenderers.tsx#L188)
- 本地文件**链接**和本地图片不同。文件 href 的保留插件只对 `a` 元素保留 Windows 盘符/无 scheme 路径，不给 `img src` 开同样的例外。聊天宿主具备 openArtifactFile 时会提供 openFilePath；`[打开图片](D:/Project/xxx.png)` 可走这套文件打开路径，但它表示点击打开，不表示正文内嵌。[rehype-preserve-file-links.ts L19-L48](https://github.com/CherryHQ/cherry-studio/blob/9e7bb8a17d002c31bfb83ea4acd6c3b501bf40f1/packages/ui/src/components/composites/markdown/plugins/rehype-preserve-file-links.ts#L19)、[ChatMarkdownRuntime.tsx L60-L89](https://github.com/CherryHQ/cherry-studio/blob/9e7bb8a17d002c31bfb83ea4acd6c3b501bf40f1/src/renderer/components/chat/messages/markdown/ChatMarkdownRuntime.tsx#L60)、[MarkdownRenderers.tsx L102-L115](https://github.com/CherryHQ/cherry-studio/blob/9e7bb8a17d002c31bfb83ea4acd6c3b501bf40f1/src/renderer/components/markdown/MarkdownRenderers.tsx#L102)
- 未在已核查的该版本 Markdown/媒体协议实现找到可推荐的 `local-image://` 本地路径协议。现有 **`cherry-media://image/<id>`** 来自主进程 MediaProtocolService 的内存 buffer 注册表，id 是该服务 store 生成的随机 id；请求必须命中内存记录，否则 404。它不是将任意磁盘路径拼到 URL 后就能读取的文件服务，也不是 fileEntryId 的通用替代 URL。[MediaProtocolService.ts L64-L103](https://github.com/CherryHQ/cherry-studio/blob/9e7bb8a17d002c31bfb83ea4acd6c3b501bf40f1/src/main/services/mediaProtocol/MediaProtocolService.ts#L64)
- 附件区 ImageBlock 可以使用客户端解析后的 `file://`，但它没有经过最终 Markdown 的同一 URL 清洗流程。MessageImageBlock 有 fileEntry handle 时查询当前物理路径，无 handle 时仍使用 source.url；因此“最终 Markdown 不显示”不能归结为“必须先登记 fileEntryId”，也不能从附件区支持 file URL 推导正文支持 file URL。[MessageImageBlock.tsx L31-L60](https://github.com/CherryHQ/cherry-studio/blob/9e7bb8a17d002c31bfb83ea4acd6c3b501bf40f1/src/renderer/components/chat/messages/blocks/MessageImageBlock.tsx#L31)、[ImageBlock.tsx L24-L40](https://github.com/CherryHQ/cherry-studio/blob/9e7bb8a17d002c31bfb83ea4acd6c3b501bf40f1/src/renderer/components/chat/messages/blocks/ImageBlock.tsx#L24)

### MCP `type: image` 对用户可见，但在折叠工具卡中

- 工具卡会按 SDK CallToolResult schema 读取响应，收集 `content.type === 'image'` 的 data 和 mimeType，随后实际渲染 `<img src="data:<mime>;base64,<data>">`，最大宽度 300。**这不只是给 LLM 的图片输入，也是用户可见的工具 Response 预览。** `[text, image]` 的同一结果可以同时显示文本和图片。[MessageMcpTool.tsx L192-L238](https://github.com/CherryHQ/cherry-studio/blob/9e7bb8a17d002c31bfb83ea4acd6c3b501bf40f1/src/renderer/components/chat/messages/tools/mcp/MessageMcpTool.tsx#L192)、[L442-L460](https://github.com/CherryHQ/cherry-studio/blob/9e7bb8a17d002c31bfb83ea4acd6c3b501bf40f1/src/renderer/components/chat/messages/tools/mcp/MessageMcpTool.tsx#L442)
- 工具状态变为 done/error 时会自动折叠；未展开时 ToolResponseContent 直接返回 null。用户需要展开对应工具卡，在 Response 里查看图片。它不会因为工具返回了 image 就自动在最终助理正文追加同一张图片。[MessageMcpTool.tsx L71-L79](https://github.com/CherryHQ/cherry-studio/blob/9e7bb8a17d002c31bfb83ea4acd6c3b501bf40f1/src/renderer/components/chat/messages/tools/mcp/MessageMcpTool.tsx#L71)、[L287-L302](https://github.com/CherryHQ/cherry-studio/blob/9e7bb8a17d002c31bfb83ea4acd6c3b501bf40f1/src/renderer/components/chat/messages/tools/mcp/MessageMcpTool.tsx#L287)

### 由上述实现支持的最小交互

生成工具把服务端从原输出文件读取的图片作为 MCP `type: image` 返回，同时保留原有输出路径文本；用户展开该工具的 Response 查看标注结果。最终回复可以说明图片位于工具 Response，并提供本地文件路径/文件打开链接。**不能承诺仅返回 image block 就让最终回复正文内嵌，也不能推荐把路径统一改成 `file:///` 来绕过这项限制。**

真正的正文图片仍要使用其 Markdown 管线允许的内容来源（例如已存在的可访问 HTTP(S) 图片或明确放行的 PNG/JPEG data URI），但本次任务不因此引入 HTTP 服务、不要求模型重写整张图片 Base64，也不修改/绕过 Cherry 的 sanitizer。这里只作源码级结论，没有在 Cherry 用户 UI 中重放这次显示场景。
