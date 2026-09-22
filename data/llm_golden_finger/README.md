# LLM 金手指 (llm_golden_finger)

本目录是大模型（LLM / Multi-Modal Agent）与 freeEngine 交互的唯一中枢。

## 核心规划：
1. `mcp/`: 暴露符合 Model Context Protocol 的标准 Tool Calling 接口。
2. `prompts/`: 为 Agent 提供的引擎组件编写、WGSL 材质编写模版与上下文提示词。
3. `diagnostics_listener/`: 监听 `data/diagnostics/` 错误快照，触发自动纠错自愈。
