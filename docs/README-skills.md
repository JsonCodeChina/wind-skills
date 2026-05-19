---
name: aifinmarket
description: AIFinMarket 金融能力安装和配置入口。当用户需要安装或配置 Wind金融能力、配置 WIND_API_KEY时使用。
---

## 安装流程

1. 检查必需 skill 是否已安装，并区分安装范围：当前 agent 对应 `.agents/skills/<skill-name>/SKILL.md`，全部 agent 对应 `%USERPROFILE%\.agents\skills\<skill-name>\SKILL.md`；必需 skill 为 `wind-find-finance-skill`、`wind-mcp-skill`。

2. 如果必需 skill 缺失，安装前先征求用户确认，并明确询问安装范围：安装到当前项目目录，还是安装到全局供所有Agent使用 。当前项目使用不带 `-g` 的命令，全部 agent 使用带 `-g` 的命令。

   安装前先判断 GitHub 和 Gitee 的连通性，选择当前可用且更稳定/更快的源执行安装。安装完成后，确认对应 `SKILL.md` 文件已存在。

   安装成功后不要默认提示用户重启 Codex 或刷新会话；只要 `SKILL.md` 已落盘，即可直接通过对应 skill 目录下的脚本或当前会话可用能力继续配置、验证和调用。只有实际调用失败且明确是当前客户端未加载新 skill 导致时，才提示用户刷新或重启。

   如果安装失败，切换到另一个已检测可用的源重试；若 GitHub 和 Gitee 都不可用，说明阻断原因并给出失败命令。未经用户确认，不要手动复制、覆盖、删除或替换已有 skill 文件夹。

   GitHub 源命令：

   ```bash
   npx skills add Wind-Information-Co-Ltd/wind-skills --skill wind-find-finance-skill -y
   npx skills add Wind-Information-Co-Ltd/wind-skills --skill wind-mcp-skill -y
   ```

   Gitee 源命令：

   ```bash
   npx skills add https://gitee.com/wind_info/wind-skills.git --skill wind-find-finance-skill -y
   npx skills add https://gitee.com/wind_info/wind-skills.git --skill wind-mcp-skill -y
   ```

3. 安装完成后检查 `WIND_API_KEY`，检查位置包括环境变量 `WIND_API_KEY`、全局配置 `%USERPROFILE%\.wind-aifinmarket\config` 或 `$HOME/.wind-aifinmarket/config`、项目配置 `.agents\skills\wind-mcp-skill\config`。

如果没有 Key 或验证失败，说明暂时不能调用 Wind 数据，并优先协助用户直接用浏览器能力打开 Wind AIFinMarket 官网开发者中心获取 `WIND_API_KEY`：`https://aifinmarket.wind.com.cn/#/user/overview`。如果当前环境不能直接打开浏览器，再给出链接让用户手动访问。拿到 Key 后，按用户当前系统和终端环境，帮用户在本机配置文件中写入 `WIND_API_KEY=<真实 Key>`。

Key 已存在或配置完成后，通过 `wind-mcp-skill` 执行一次轻量 Wind 取数验证；若验证成功，告知用户金融能力已可用。
