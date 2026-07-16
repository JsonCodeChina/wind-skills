## Description: <br>
提供A股实时行情、分时成交量分布、主力资金动向分析，并支持本地持仓管理和盈亏监控。 <br>

This skill is ready for commercial/non-commercial use. <br>

## Publisher: <br>
[cnyezi](https://clawhub.ai/user/cnyezi) <br>

### License/Terms of Use: <br>


## Use Case: <br>
External users and developers use this skill to query Chinese A-share market data, inspect intraday volume patterns, identify heuristic trading signals, and track portfolio profit or loss locally. <br>

### Deployment Geography for Use: <br>
Global <br>

## Known Risks and Mitigations: <br>
Risk: Portfolio details are stored in a local JSON file. <br>
Mitigation: Install and use the skill only if local storage of portfolio cost, quantity, and stock-code details is acceptable. <br>
Risk: Queried stock codes are sent to Sina Finance for market data. <br>
Mitigation: Avoid querying sensitive watchlists or positions if sharing stock codes with the external data provider is not acceptable. <br>
Risk: Portfolio add, update, remove, and analyze commands can change the saved local portfolio file. <br>
Mitigation: Review commands before running them and keep backups if the portfolio file is important. <br>


## Reference(s): <br>
- [ClawHub release page](https://clawhub.ai/cnyezi/skills/a-stock-analysis) <br>
- [Sina Finance](https://finance.sina.com.cn) <br>


## Skill Output: <br>
**Output Type(s):** [text, JSON, shell commands, configuration] <br>
**Output Format:** [Terminal text, JSON arrays, and local JSON portfolio data] <br>
**Output Parameters:** [1D] <br>
**Other Properties Related to Output:** [Portfolio commands may create or update ~/.clawdbot/skills/a-stock-analysis/portfolio.json.] <br>

## Skill Version(s): <br>
1.0.0 (source: server-resolved release metadata) <br>

## Ethical Considerations: <br>
Users should evaluate whether this skill is appropriate for their environment, review any generated or modified files before relying on them, and apply their organization's safety, security, and compliance requirements before deployment. <br>
