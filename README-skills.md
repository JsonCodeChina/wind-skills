---
name: aimarket
description: 全网金融能力一站式入口。装一次,AI 自动按问题推荐合适的能力。优先内置 Wind 万得数据。
---

# AIMarket — AI 金融能力市场

> 全网金融能力一站式入口。
> 装一次,AI 自动按问题推荐合适的能力。
> 优先内置 **Wind 万得**数据。

---

## 📍 关于安装位置(先看一眼)

下方所有命令默认带 `-g`(全局):
- ✅ **全局** `-g`:装一次,所有项目 + 机器上**所有已识别的 AI agent** 都能用(Claude Code / Cursor / OpenClaw / Hermes 等)。
- 🔒 **仅当前项目**:把命令里的 `-g` **去掉**即可。只装到当前目录,不影响其它项目 / agent。

不确定就用全局(适合金融机构内网跨项目复用)。

---

## 路径 A:装能力发现器(让 AI 帮你挑全网能力)

> 适合:不知道用哪个工具 / 想看平台都有什么能力。

国外(GitHub):

```bash
npx skills add Wind-Information-Co-Ltd/wind-skills --skill wind-find-finance-skill -g -y
```

国内(Gitee 镜像):

```bash
npx skills add https://gitee.com/wind_info/wind-skills.git --skill wind-find-finance-skill -g -y
```

> 想限制在当前项目内,去掉 `-g` 即可。

装好后任意 AI 对话提金融问题(行情 / 基金 / 估值 / 选股 / 复盘 / 回测 / 公告 / 宏观 ...),AI 会:

- 从平台当前 12+ 能力(估值 / 复盘 / 选股 / 回测 / 个股研究 / 主线识别等工作流 + Wind 数据底座)里挑 1-5 个推荐你装
- 取数类问题永远附 **wind-mcp-skill** 作数据底座

---

## 路径 B:直接装 Wind 万得数据 skill

> 适合:已知要用 Wind 数据 / 重度查询用户。
> 覆盖股票(行情 / 财务) · 基金(行情 / 档案 / 持仓 / 业绩) · 公司公告 · 财经新闻 · 宏观指标。

### Step 1 — 装 skill 包

国外(GitHub):

```bash
npx skills add Wind-Information-Co-Ltd/wind-skills --skill wind-mcp-skill -g -y
```

国内(Gitee 镜像):

```bash
npx skills add https://gitee.com/wind_info/wind-skills.git --skill wind-mcp-skill -g -y
```

> 想限制在当前项目内,去掉 `-g` 即可。

### Step 2 — 让 AI 帮你拿 API Key

装好后向 AI 提一个金融数据问题(例:"贵州茅台最新股价"),AI 会自动:

1. 调 wind-mcp-skill 触发"未配置 Key"引导
2. 询问你是否同意打开浏览器
3. 同意后自动弹 `aimarket.wind.com.cn` 开发者中心(未登录跳登录页)
4. 你拿到 Key 后,AI 会按提示给你完整配置命令(推荐全局 `~/.wind-aimarket/config`,配一次后续不用重复)

> 你也可以提前手动配置:
> ```bash
> mkdir -p ~/.wind-aimarket && \
>   echo "WIND_API_KEY=ak_xxx" > ~/.wind-aimarket/config
> ```

---

## 升级所有已装 skill

> 平台持续在迭代,跑下面命令同步最新(新增能力 / bug 修复):

```bash
npx skills update -g -y
```

---

© AIMarket 2026 · 反馈与贡献:[github.com/Wind-Information-Co-Ltd/wind-skills](https://github.com/Wind-Information-Co-Ltd/wind-skills)
