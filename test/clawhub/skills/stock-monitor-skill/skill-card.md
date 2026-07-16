## Description: <br>
Stock Monitor provides configurable alerts for watched stocks, ETFs, and gold using cost thresholds, daily price movement, volume changes, moving-average crosses, RSI, price gaps, and trailing-profit checks. <br>

This skill is ready for commercial/non-commercial use. <br>

## Publisher: <br>
[THIRTYFANG](https://clawhub.ai/user/THIRTYFANG) <br>

### License/Terms of Use: <br>
MIT <br>


## Use Case: <br>
External users and developers use this skill to monitor configured market instruments and receive structured alert messages based on price, volume, and technical-indicator conditions. The generated suggestions are informational and should not be treated as professional financial advice. <br>

### Deployment Geography for Use: <br>
Global <br>

## Known Risks and Mitigations: <br>
Risk: The skill can run as a background process that repeatedly polls third-party financial data sources for configured watchlist symbols. <br>
Mitigation: Install only if continuous market-data polling is acceptable, review the watchlist before starting, and use the provided stop command when monitoring is no longer needed. <br>
Risk: Alert messages may include buy, sell, hold, or wait-style suggestions derived from market signals and simple sentiment checks. <br>
Mitigation: Treat suggestions as informational alerts only and make financial decisions using independent review or qualified professional advice. <br>


## Reference(s): <br>
- [ClawHub skill page](https://clawhub.ai/THIRTYFANG/stock-monitor-skill) <br>
- [ClawHub publisher profile](https://clawhub.ai/user/THIRTYFANG) <br>
- [Eastmoney suggestion API](https://searchapi.eastmoney.com/api/suggest/get) <br>
- [Sina Finance search](https://search.sina.com.cn/?q={name}&c=news&sort=time) <br>
- [Sina quote API](https://quotes.sina.cn/cn/api/quotes.php?symbol={code}&source=sina) <br>
- [Eastmoney quote API](https://push2.eastmoney.com/api/qt/stock/get) <br>


## Skill Output: <br>
**Output Type(s):** [text, markdown, shell commands, configuration, guidance] <br>
**Output Format:** [Markdown-style alert text with shell commands and Python configuration examples] <br>
**Output Parameters:** [1D] <br>
**Other Properties Related to Output:** [Can run as a user-started background monitor and write runtime logs under the user's home directory.] <br>

## Skill Version(s): <br>
0.1.0 (source: ClawHub release evidence) <br>

## Ethical Considerations: <br>
Users should evaluate whether this skill is appropriate for their environment, review any generated or modified files before relying on them, and apply their organization's safety, security, and compliance requirements before deployment. <br>
