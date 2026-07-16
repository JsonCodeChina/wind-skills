## Description: <br>
Yahoo Finance (yfinance) powered stock analysis skill: quotes, fundamentals, ASCII trends, high-resolution charts (RSI/MACD/BB/VWAP/ATR), plus optional web add-ons (news + browser-first options/flow). <br>

This skill is ready for commercial/non-commercial use. <br>

## Publisher: <br>
[kys42](https://clawhub.ai/user/kys42) <br>

### License/Terms of Use: <br>


## Use Case: <br>
Developers, analysts, and agent users use this skill to gather ticker quotes, fundamentals, technical charts, compact reports, news links, and optional options-flow links for market research workflows. <br>

### Deployment Geography for Use: <br>
Global <br>

## Known Risks and Mitigations: <br>
Risk: Ticker, news, and options-flow requests may be sent to third-party market, search, and options services. <br>
Mitigation: Avoid including sensitive or nonpublic information in queries and review outputs against authoritative sources before acting on them. <br>
Risk: The skill runs local Python commands with third-party dependencies and includes optional browser-based options-flow tooling. <br>
Mitigation: Use a virtual environment, review dependencies and scripts before installation, and skip the optional browser helper when browser automation or Unusual Whales access is not desired. <br>


## Reference(s): <br>
- [Stock Market Pro on ClawHub](https://clawhub.ai/kys42/skills/stock-market-pro) <br>
- [uv](https://github.com/astral-sh/uv) <br>
- [Unusual Whales stock overview](https://unusualwhales.com/stock/{TICKER}/overview) <br>
- [Unusual Whales live options flow](https://unusualwhales.com/live-options-flow?ticker_symbol={TICKER}) <br>
- [Unusual Whales options flow history](https://unusualwhales.com/stock/{TICKER}/options-flow-history) <br>


## Skill Output: <br>
**Output Type(s):** [text, markdown, code, shell commands, configuration, files, guidance] <br>
**Output Format:** [Markdown and terminal text with inline shell commands, plus optional PNG chart files and JSON/JSONL search output.] <br>
**Output Parameters:** [1D] <br>
**Other Properties Related to Output:** [Outputs depend on live third-party market, search, and options-flow services; chart commands may write PNG files under /tmp.] <br>

## Skill Version(s): <br>
1.2.12 (source: server release metadata) <br>

## Ethical Considerations: <br>
Users should evaluate whether this skill is appropriate for their environment, review any generated or modified files before relying on them, and apply their organization's safety, security, and compliance requirements before deployment. <br>
