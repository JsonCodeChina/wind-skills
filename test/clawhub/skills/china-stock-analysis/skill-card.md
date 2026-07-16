## Description: <br>
Analyze Chinese stock prices (A-shares, HK stocks) and provide investment recommendations. <br>

This skill is ready for commercial/non-commercial use. <br>

## Publisher: <br>
[paulshe](https://clawhub.ai/user/paulshe) <br>

### License/Terms of Use: <br>
MIT-0 <br>


## Use Case: <br>
External users use this skill to ask an agent for structured analysis of A-share, Hong Kong, and related US-listed stocks using public web data. The skill helps summarize current price data, market context, technical signals, and informational buy, hold, or sell recommendations. <br>

### Deployment Geography for Use: <br>
Global <br>

## Known Risks and Mitigations: <br>
Risk: Stock recommendations may be inaccurate, incomplete, or mistaken for personalized financial advice. <br>
Mitigation: Treat buy, hold, and sell outputs as informational only and include the skill's investment-risk disclaimer in user-facing analysis. <br>
Risk: Public market data gathered through web search may be stale, inconsistent, or unavailable. <br>
Mitigation: Check the source, timestamp, and quoted ticker before relying on current price or trend analysis. <br>
Risk: The skill is branded for Chinese stocks but may also handle US tickers. <br>
Mitigation: Confirm the requested market and ticker format before presenting conclusions. <br>


## Reference(s): <br>
- [Popular Chinese Stocks Reference](references/china-stocks.md) <br>
- [Eastmoney](https://www.eastmoney.com) <br>
- [Xueqiu](https://xueqiu.com) <br>
- [Yahoo Finance](https://finance.yahoo.com) <br>
- [Google Finance](https://www.google.com/finance) <br>


## Skill Output: <br>
**Output Type(s):** [text, markdown, guidance] <br>
**Output Format:** [Markdown with tables and bullet lists] <br>
**Output Parameters:** [1D] <br>
**Other Properties Related to Output:** [Includes price summaries, technical analysis, recommendation rationale, operating strategy, and risk disclaimer.] <br>

## Skill Version(s): <br>
1.0.0 (source: server release evidence) <br>

## Ethical Considerations: <br>
Users should evaluate whether this skill is appropriate for their environment, review any generated or modified files before relying on them, and apply their organization's safety, security, and compliance requirements before deployment. <br>
