## Description: <br>
Analyze stocks and cryptocurrencies using Yahoo Finance data. Supports portfolio management, watchlists with alerts, dividend analysis, 8-dimension stock scoring, viral trend detection (Hot Scanner), and rumor/early signal detection. Use for stock analysis, portfolio tracking, earnings reactions, crypto monitoring, trending stocks, or finding rumors before they hit mainstream. <br>

This skill is ready for commercial/non-commercial use. <br>

## Publisher: <br>
[udiedrichsen](https://clawhub.ai/user/udiedrichsen) <br>

### License/Terms of Use: <br>


## Use Case: <br>
External users and developers use this skill to analyze equities and cryptocurrencies, compare tickers, manage portfolios and watchlists, inspect dividend metrics, and surface trending or rumor-driven market signals. Outputs are informational and are not financial advice. <br>

### Deployment Geography for Use: <br>
Global <br>

## Known Risks and Mitigations: <br>
Risk: Optional Twitter/X scanners can require live X session cookies and expose AUTH_TOKEN or CT0 values to an external CLI. <br>
Mitigation: Use finance-only commands or run hot_scanner.py --no-social unless social data is needed; do not provide AUTH_TOKEN or CT0 unless you understand the access they grant, keep .env out of shared folders and repositories, and consider a separate low-risk X account for testing. <br>
Risk: Market, news, and social signals can be delayed, rate-limited, noisy, or misleading. <br>
Mitigation: Treat outputs as informational, verify important signals against source data, and consult a licensed financial advisor before making investment decisions. <br>


## Reference(s): <br>
- [Stock Analysis ClawHub Listing](https://clawhub.ai/udiedrichsen/skills/stock-analysis) <br>
- [Yahoo Finance](https://finance.yahoo.com) <br>
- [CoinGecko](https://coingecko.com) <br>
- [SEC EDGAR](https://www.sec.gov/edgar) <br>
- [Google News](https://news.google.com) <br>
- [Twitter/X](https://x.com) <br>
- [bird CLI](https://github.com/steipete/bird) <br>


## Skill Output: <br>
**Output Type(s):** [text, markdown, json, shell commands, configuration] <br>
**Output Format:** [Console text and optional JSON, with Markdown guidance and shell command examples] <br>
**Output Parameters:** [1D] <br>
**Other Properties Related to Output:** [Portfolio and watchlist commands can write local JSON state under the user's ClawHub skill state directory.] <br>

## Skill Version(s): <br>
6.2.0 (source: frontmatter and server release metadata) <br>

## Ethical Considerations: <br>
Users should evaluate whether this skill is appropriate for their environment, review any generated or modified files before relying on them, and apply their organization's safety, security, and compliance requirements before deployment. <br>
