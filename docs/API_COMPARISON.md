# 英文面试朗读应用：API 与价格对比

调研日期：2026-10-30。价格均为官方公开的美元标准价，不含税、汇率、网络出口费用和可能的套餐最低消费；服务商可能随时调整，购买前请以链接中的最新价格为准。

## 结论先行

- **原型阶段**：当前使用微软 Edge Read Aloud 在线 Neural 语音，成本为 0，服务端生成 MP3。它的美式发音比浏览器系统语音稳定，但属于非 SLA 接口，适合个人原型。
- **个人长期使用**：优先选 Azure AI Speech。`en-US` Neural 声音稳定、语速与 SSML 控制完整，按 10 分钟/天估算，有每月 50 万字符免费额度时通常为 **0 美元**；超过免费额度后约 **2.63 美元/月**（30 分钟/天场景）。
- **更自然、更像真人面试官**：优先试听 ElevenLabs 和 Google Chirp 3 HD。ElevenLabs 的声音质感与风格更强，但成本高；Google 当前 Chirp 3 HD 有每月 100 万字符额度，个人练习量通常可覆盖。
- **低延迟实时对话**：Deepgram Aura-2 更有优势，但如果只是“点一下读一段”，不必为实时能力付费。
- **不建议新项目直接依赖 OpenAI 旧 TTS 接口**：官方文档明确 `/v1/audio/speech` 的 `tts-1`、`tts-1-hd`、`gpt-4o-mini-tts` 将于 **2027-01-06** 停用，并要求迁移到 `gpt-realtime-2.1-mini` 的 Realtime API 工作流。若已有 OpenAI 基础设施，可再评估，但不是本项目的最小实现路径。

## 朗读 TTS API

| 服务 | 适合本应用的美式声音/能力 | 计费与公开价格 | 免费额度或试用 | 评价 |
| --- | --- | --- | --- | --- |
| Microsoft Edge Read Aloud（当前原型） | `en-US-AvaMultilingualNeural`、Andrew、Aria、Guy 等 | 0 美元 | 无需 Key，但无官方 SLA，服务可能调整 | 当前默认方案；仅在 Node 服务端调用，播报稳定，适合个人原型 |
| 浏览器 Web Speech API | 系统 `en-US` 声音，可调语速；不依赖云端 | 0 美元 | 无 API 费用 | 最快落地，但音质因 Windows/macOS 和浏览器而异，无法保证一致 |
| Azure AI Speech | Neural 美式声音，如 Ava、Andrew、Jenny、Guy；支持 SSML、语速、风格 | **15 美元/100 万字符** | Neural 每月 50 万字符 | 个人项目性价比最高，声音稳定，企业文档完善 |
| Amazon Polly | Neural 与 Generative 美式声音，如 Danielle、Joanna、Matthew | Neural **16 美元/100 万字符**；Generative **30 美元/100 万字符**；Standard 4 美元/100 万字符 | Standard 500 万/月；Neural 100 万/月、Generative 10 万/月，均为新账户前 12 个月权益 | 若已经在 AWS 中，接入方便；Generative 更自然但更贵 |
| Google Cloud Text-to-Speech | Chirp 3 HD、Neural2、Studio 等 `en-US` 声音 | Neural2 **16 美元/100 万字符**；Chirp 3 HD **30 美元/100 万字符**；Standard 4 美元/100 万字符 | Chirp 3 HD 当前为每月 100 万字符以内免费（以官方表格为准） | 可选声音多；Chirp 3 HD 自然度和成本平衡好 |
| ElevenLabs | 大量美式预置声音，情绪和表达力强 | 官方 FAQ 列 Multilingual TTS **0.08 美元/1000 字符**（80 美元/100 万字符）；Flash/Turbo **0.04 美元/1000 字符**（40 美元/100 万字符）；API 套餐从 6 美元/月起 | Free 套餐可用，但额度和商用限制随套餐变化 | 试听最像真人，适合“面试官模拟”；成本明显高于云厂商 |
| Deepgram Aura-2 | 美式低延迟 TTS，适合实时对话 | Aura-2 **0.03 美元/1000 字符**（30 美元/100 万字符）；Aura-1 15 美元/100 万字符 | 新账户 200 美元额度 | 朗读段落也用得上，但优势主要在实时语音代理 |
| OpenAI TTS（旧接口） | 多款英文声音，`gpt-4o-mini-tts` 支持通过 instructions 控制口音、语气 | `tts-1` 15 美元/100 万字符；`tts-1-hd` 30 美元/100 万字符；新模型按 token 计费 | 无固定免费字符额度 | 旧接口倒计时停用；新 Realtime API 集成复杂度更高，不作为首选 |

### 个人使用量估算

按英文面试稿平均每分钟 150 词、每词约 5 个字符（含空格）估算：

- **10 分钟/天**：约 22.5 万字符/月。
- **30 分钟/天**：约 67.5 万字符/月。

| 方案 | 22.5 万字符/月 | 67.5 万字符/月 | 说明 |
| --- | ---: | ---: | --- |
| Edge Read Aloud（当前原型） | 0 美元 | 0 美元 | 无 Key；无 SLA，正式产品应替换 |
| 浏览器 Web Speech | 0 美元 | 0 美元 | 无云端调用 |
| Azure Neural | 0 美元 | 2.63 美元 | 已扣除每月 50 万免费字符 |
| Amazon Polly Neural | 首年 0 美元 | 首年 0 美元 | 首年每月 100 万免费；之后 3.60 / 10.80 美元 |
| Google Chirp 3 HD | 0 美元 | 0 美元 | 当前每月免费额度为 100 万字符 |
| ElevenLabs Flash/Turbo | 9 美元 | 27 美元 | 按 0.04 美元/1000 字符估算，套餐费用另按账户规则 |
| ElevenLabs Multilingual | 18 美元 | 54 美元 | 按 0.08 美元/1000 字符估算 |
| Deepgram Aura-2 | 6.75 美元 | 20.25 美元 | 按 0.03 美元/1000 字符估算 |
| OpenAI `tts-1`（停用倒计时） | 3.38 美元 | 10.13 美元 | 仅便于比较旧接口价格，不建议新接入 |

## 查词 API

| 服务 | 美式音标/发音 | 价格 | 适合场景 |
| --- | --- | --- | --- |
| 有道词典网页 JSON（当前原型） | 美式/英式音标和外链发音 | **免费**，无需 API Key | 中文释义、英文 WordNet 释义和中英例句完整；无官方 SLA，适合个人原型 |
| DictionaryAPI | 通常包含音标和部分音频 | **免费**，无需 API Key | 英文释义后备；缺少 SLA，且部分网络环境会触发 Cloudflare 验证 |
| Datamuse | 有词性、释义，没有词典音频 | **免费**，无需 API Key，有限流 | 当前原型的自动回退，释义可独立完成查词 |
| Merriam-Webster | 权威美式释义、音标和发音音频 | 非商业使用 **0 美元**；每 Key 每天最多 1,000 次，限两个 reference API；商业授权按询价 | 个人面试工具足够，需注册 Key |
| Oxford Dictionaries | 英式/美式发音、释义、例句，词库更完整 | 以官方套餐/询价为准，提供试用 | 需要考试词典信息或商业授权时再选 |

对本应用的组合建议：

1. 当前原型：有道词典网页 JSON → DictionaryAPI → Datamuse 自动回退，保持 0 成本并优先返回中英例句。
2. 个人正式版：Merriam-Webster 免费非商业 Key，配合有道智云补充中文释义。
3. 产品化：Oxford 或 Merriam-Webster 商业授权，配合自有缓存和用量监控。

## 推荐架构

浏览器直接保存第三方 API Key 会泄露密钥，正式版应加一个很薄的服务端代理：

```text
Markdown 文件 ──> 浏览器渲染
选中文本 ──> /api/tts ──> Edge Read Aloud / Azure / Google
右键单词 ──> /api/dictionary ──> 有道 / Merriam-Webster / fallback
```

代理层需要做三件事：

- 把 API Key 保存在服务端环境变量，不进入前端构建产物。
- 按“文本哈希 + voice + rate”缓存音频，重复朗读同一段不再付费。
- 限制单次文本长度、每日字数和并发，防止误操作产生账单。

## 官方价格来源

- [Azure AI Speech pricing](https://azure.microsoft.com/en-us/pricing/details/cognitive-services/speech-services/)
- [Amazon Polly pricing](https://aws.amazon.com/polly/pricing/)
- [Google Cloud Text-to-Speech pricing](https://cloud.google.com/text-to-speech/pricing)
- [ElevenLabs API pricing](https://elevenlabs.io/pricing/api)
- [Deepgram pricing](https://deepgram.com/pricing)
- [OpenAI API pricing](https://platform.openai.com/docs/pricing)
- [OpenAI Text-to-Speech guide and deprecation notice](https://platform.openai.com/docs/guides/text-to-speech)
- [Merriam-Webster API](https://dictionaryapi.com/)
- [Oxford Dictionaries API](https://developer.oxforddictionaries.com/)
- [Datamuse API](https://www.datamuse.com/api/)
- [DictionaryAPI](https://dictionaryapi.dev/)
- [有道词典](https://dict.youdao.com/)
- [node-edge-tts](https://github.com/SchneeHertz/node-edge-tts)（当前 Edge 在线语音的服务端实现）
