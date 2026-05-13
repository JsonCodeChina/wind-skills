---
name: aimarket
description: 全网金融能力一站式入口。安装后 AI 可按问题推荐合适的金融能力，并优先使用 Wind 万得数据底座真实取数。
---

# AIMarket - AI 金融能力市场

AIMarket 用来给 AI 客户端补齐金融数据和分析能力。推荐一次安装两个能力：

- `wind-find-finance-skill`：帮助 AI 发现、推荐合适的金融能力。
- `wind-mcp-skill`：Wind 万得数据底座，用于真实取数。

覆盖场景包括股票行情、基金、财务基本面、公告、财经新闻、宏观指标、板块复盘、选股、估值和研究分析等。

## Quick Start

首次接入请按 3 步走完，不要只停在安装：

1. 安装 AIMarket skills：安装 `wind-find-finance-skill` 和 `wind-mcp-skill`。
2. 配置 `WIND_API_KEY`：打开 AIMarket 开发者中心获取 Key，并写入全局配置。
3. 直接提金融问题：例如“贵州茅台最新股价”“看一下大盘和各板块”“从各个维度分析 600183”。

安装完成后必须继续引导用户配置 Key；否则真实取数时会提示 Key 未配置。

## Where to Start

- 第一次使用 / 没装 skill：执行“安装 AIMarket 能力”。
- 已安装但没有 Key：执行“获取并配置 WIND_API_KEY”。
- 用户问“能做什么 / 该用哪个能力”：使用 `wind-find-finance-skill` 做能力发现。
- 用户问行情、基金、财务、公告、新闻、宏观等取数问题：直接使用 `wind-mcp-skill`。
- 用户问分析、复盘、选股、估值、个股研究：先用 `wind-mcp-skill` 取数，再结合已安装的分析能力输出结论。
- 安装失败或客户端目录不确定：查看“安装失败时”和当前客户端的 skill / plugin / MCP 配置目录。

## 安装位置

下方命令默认带 `-g`，表示全局安装，适合多个项目或多个 AI 客户端复用。

如果只想安装到当前项目，把命令里的 `-g` 去掉即可。

## 安装 AIMarket 能力

优先使用 GitHub：

```bash
npx skills add Wind-Information-Co-Ltd/wind-skills --skill wind-find-finance-skill -g -y
npx skills add Wind-Information-Co-Ltd/wind-skills --skill wind-mcp-skill -g -y
```

国内网络不稳定时使用 Gitee 镜像：

```bash
npx skills add https://gitee.com/wind_info/wind-skills.git --skill wind-find-finance-skill -g -y
npx skills add https://gitee.com/wind_info/wind-skills.git --skill wind-mcp-skill -g -y
```

## 验证安装

在支持 skills 的客户端里，直接问一个金融问题即可，例如：

```text
贵州茅台最新股价
```

如果客户端支持查看本地 skill 目录，也可以确认已出现：

```text
wind-find-finance-skill
wind-mcp-skill
```

客户端请以自身配置目录为准。

## 获取并配置 WIND_API_KEY

首次真实取数时，如果还没有配置 Key，AI 应主动引导用户：

1. 调用 `wind-mcp-skill` 后触发未配置 Key 提示。
2. 询问是否打开浏览器。
3. 打开 `https://aimarket.wind.com.cn/#/user/overview`。
4. 登录后复制 `WIND_API_KEY`。
5. 根据用户系统给出配置命令。
6. 配置完成后做一次轻量取数验证。

推荐把 Key 配到全局位置，所有 Wind skill 都能复用。

macOS / Linux / Git Bash:

```bash
mkdir -p ~/.wind-aimarket
echo "WIND_API_KEY=ak_xxx" > ~/.wind-aimarket/config
```

Windows cmd:

```bat
if not exist "%USERPROFILE%\.wind-aimarket" mkdir "%USERPROFILE%\.wind-aimarket"
echo WIND_API_KEY=ak_xxx > "%USERPROFILE%\.wind-aimarket\config"
```

Windows PowerShell:

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.wind-aimarket"
Set-Content -Path "$env:USERPROFILE\.wind-aimarket\config" -Value "WIND_API_KEY=ak_xxx" -Encoding UTF8
```

不要把真实 Key 写进公开仓库、测试报告或聊天记录截图中。

## 安装失败时

如果 `npx skills add ...` 被 npm 私服、网络策略或权限拦截，可以手动从仓库安装对应 skill 目录。

Windows PowerShell 示例：

```powershell
git clone --depth 1 --filter=blob:none --sparse https://github.com/Wind-Information-Co-Ltd/wind-skills.git wind-skills-tmp
git -C wind-skills-tmp sparse-checkout set skills/wind-find-finance-skill skills/wind-mcp-skill
Copy-Item -Recurse -Force wind-skills-tmp\skills\wind-find-finance-skill "<你的客户端skills目录>\wind-find-finance-skill"
Copy-Item -Recurse -Force wind-skills-tmp\skills\wind-mcp-skill "<你的客户端skills目录>\wind-mcp-skill"
```

把 `<你的客户端skills目录>` 替换为当前客户端实际识别的目录。

## 使用方式

安装并配置 Key 后，直接向 AI 提金融问题：

```text
调用金融 skill 看一下大盘和各个板块怎么样
从各个维度分析 600183
查一下科创50ETF最近一个月走势
```

AI 会根据问题自动选择可用能力。取数类问题优先使用 `wind-mcp-skill`；需要选择分析工作流时，先通过 `wind-find-finance-skill` 推荐合适能力。

## 相关文件

- `wind-find-finance-skill`：能力发现与推荐。
- `wind-mcp-skill`：Wind 金融数据底座。

---

AIMarket 2026 | 反馈与贡献：[github.com/Wind-Information-Co-Ltd/wind-skills](https://github.com/Wind-Information-Co-Ltd/wind-skills)
