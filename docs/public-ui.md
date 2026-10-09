# JWT 分析公共 UI

JWT 工作区、结果筛选、证据与报告详情、账号设置采用 `@xsec/ui-react` 0.1.7、
`@xsec/design-tokens` 0.1.2 和 React 18.3.1。控件跟随 Host 的主题、密度、
字号及减少动效偏好。源码位于 `frontend-src/`，manifest 指向编译后的单文件 ESM。

## 行为与边界

任务列表、解析结果、测试矩阵和阶段事件从真实 Sidecar MCP 响应取得。
桥接层先校验 MCP envelope，再解析业务数据；工具错误进入页面错误状态。
原入口直接读取 envelope 的 `items`，会把真实任务显示为空列表，现已修正。
设置页使用实际数字输入、范围校验和公共选择控件；原入口生成的 `number`
元素无法提供数字输入。保存成功前重新读取账号存储并核对字段。

Controller 持有读取和写入生命周期。项目切换、关闭详情及销毁使旧响应失效；
读取失败显示操作编号，并由用户显式重新读取。成功的周期刷新保持当前筛选。
详情使用公共 Drawer，支持 Escape 与焦点恢复。

报告下载通过 `xsec.jwt-analysis.report.download` 委托 Host。它使用既有
`filesystem.workspace.write` 权限、`context` binding 和 `jwt_analysis_report`
工具，声明权限总数保持 11。Host 从授权会话重新取得 Markdown；原生导出写入
账号 exports，Web 导出使用客户端所有的 resource，宿主下载后显式释放。
Python 业务源码与持久化格式沿用现有契约。

## 验证

验收证据目录：
`/Users/xiaosong/.codex/visualizations/2026/10/02/01a0faad-6517-7cd3-90b5-b818bc64660d/plugin-jwt-analysis-ui`。

`jwt-real-ui-v7-ui-report.json` 的 17 项真实浏览器检查通过，覆盖设置读写回读、
非法数值阻止写入、真实任务和矩阵、脱敏证据、报告预览与下载一致、异常任务、
项目切换、晚到响应、停用后清空与停止轮询、日志及释放。Server 使用实际 OMP、
SQLite、Sidecar 和 loopback HTTP，验证项目授权及下载 resource 的 HTTP DELETE。
页面错误为空，日志传输 failed/dropped 为 0。

五种视口样张已检查：1280 浅色和深色、768 浅色 18px、390 浅色及 320 深色 18px。
页面布局、换行和控件适配正常。截图检查范围记录在 `visual-review-v1.json`。

实际构建和契约命令包括 `rtk npm run check`、`rtk npm run check:generated`、
`rtk npm run test:frontend`，以及 `scripts/verify_package.py`。
`jwt-export-build-v3-resource-report.json`、`mcp-plugin-check-v3-contracts.json`、
`mcp-plugin-check-v3-generated.json` 和 `mcp-plugin-check-v3-host-source.json`
记录结果。检查使用真实 Python/SQLite、文件与 engine，生成前端、许可证和 SBOM
与源码一致。CI 配置三平台、四个测试目标的源码检查。

macOS arm64 隔离 Desktop 快照采用相同 `9a1d1654…` 制品摘要，实际 Host
检查 11 项权限并附加 stdio MCP 插件。`native-jwt-settings-acceptance-v3.json`
的 7 项检查通过：系统键盘非法输入阻止写入、保存后实际存储回读、Host 重载保留
设置、深色 compact / 18px、损坏配置显示错误与操作编号、显式重新读取恢复、
frontend / Host 日志及 sandbox 释放。25 条最终日志，传输 failed/dropped 为 0。
`native-jwt-settings-saved-v1.png`、`native-jwt-settings-dark18-v2.png` 和
`native-jwt-settings-error-v2.png` 已实际检查。验收控件从真实 AX 树定位，键盘
通过 System Events 输入；RPC 与持久化来自实际 Desktop。

第一次全窗口 AX 遍历在重载后得到失效的窗口控件引用；限定 Web 内容树后继续
验证成功。首次直接移除 iframe 后未观察到 dispose 日志；补验在发送正式 sandbox
释放消息并观察该日志后移除 iframe，frameCount 为 0。原始失败及后续证据保留。
原生分析工作区与报告导出需隔离 ACP profile 的实际会话验证；本批浏览器成功
流程使用真实授权 OMP / SQLite 会话，原生结果限定上述设置与 Host 边界。
Windows、Linux、macOS Intel Host、系统中文输入法、读屏、原生性能和长会话
需对应环境验证。源码检查与浏览器结果分别记录。

共享 Host 把账号配置、JWT 字典、项目文件和抓包读取服务纳入 Runtime，Desktop
与 Server 使用相同公开契约。真实 SQLite 回归证明原抓包读取入口会把数据库错误
转换为“记录不存在”；JWT 改用 checked 读取并返回 `JWT_TRAFFIC_FLOW_READ_FAILED`
及 cause。首次配置的默认值分支通过明确的 Some/None 表达，存储错误持续传播。
Server 注册包括四项 JWT / 配置命令与现有归档命令，最终总数为 193。

共享 Host workspace 427 项测试及 doctest、最终整合 169 项 Server 测试、workspace
Clippy（含 JWT feature）、fmt 和 fail-fast 检查通过，结果记录在
`shared-host-integrated-v1-*.json` 与 `jwt-host-resource-repair-v2-*.json`。Native 构建报告
`4578dd63-516e-4fe3-9885-9750f4344f87`：86.254 秒、峰值采样 RSS
3,475,750,912 B、整卷净增量 1,812,533,248 B，swap 59,894,661.12 B 保持。
缓存为 `.worktree-cache/build-resources/targets/189d6404…`，使用 dev 档。
系统 AX 验收为已构建快照的交互，未额外采样原生性能。

## 性能决定

`jwt-real-perf-v1-perf-report.json` 与 `performance-decision-v1.json` 记录同一
Host 和真实数据的测量。gzip 从 5,715 B 增至 113,898 B。新版设置页 6 个正式样本
的就绪中位数为 90.45 ms，保存含真实回读为 75.85 ms，父 renderer heap 为
3,939,226 B；工作区 8 个正式样本的就绪为 142.35 ms、刷新为 95.90 ms、
heap 为 4,016,408 B。

旧版数字输入和任务列表的功能缺陷使等价交互比较状态为 `INVALID_COMPARISON`。
上述新版绝对值包含 locator 观察与绘制，父 renderer heap 包含公共 Host 和 iframe，
并不代表原生进程 RSS。工程决定接受公共控件和 React 的已测成本，状态为
`ACCEPTED_WITH_MEASUREMENT_LIMITS`。

## 本地集成与回滚

产品提交、Host 配套提交、主分支回读和任务资源清理由本批最终回执记录。
回滚撤销本批产品及 Host 提交后重新构建 frontend、许可证和 SBOM。
设置采用原有账号持久化格式；需要恢复某次设置写入时，使用相应账号的显式
设置写入操作并回读。全工作区公共 UI 迁移继续按设计系统台账推进。
