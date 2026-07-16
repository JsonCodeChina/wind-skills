## Description: <br>
Manage and monitor a personal stock watchlist with support for adding, removing, listing stocks, and summarizing recent performance using data from 10jqka.com.cn. <br>

This skill is ready for commercial/non-commercial use. <br>

## Publisher: <br>
[robin797860](https://clawhub.ai/user/robin797860) <br>

### License/Terms of Use: <br>


## Use Case: <br>
External users and agents use Stock Watcher to maintain a local Chinese A-share watchlist and retrieve concise performance summaries from 10jqka.com.cn. <br>

### Deployment Geography for Use: <br>
Global <br>

## Known Risks and Mitigations: <br>
Risk: The skill stores a local watchlist under ~/.clawdbot/stock_watcher and sends stock codes to 10jqka.com.cn during lookups. <br>
Mitigation: Use the skill only for stock codes you are comfortable querying through 10jqka.com.cn and review the local watchlist location before installation. <br>
Risk: Clear and uninstall commands can delete saved watchlist data without an undo step. <br>
Mitigation: Review the watchlist file or keep a backup before running clear_watchlist.py or uninstall.sh. <br>


## Reference(s): <br>
- [ClawHub Skill Page](https://clawhub.ai/robin797860/skills/stock-watcher) <br>
- [10jqka Stock Pages](https://stockpage.10jqka.com.cn/{stock_code}/) <br>


## Skill Output: <br>
**Output Type(s):** [Text, Shell commands, Configuration, Files] <br>
**Output Format:** [Plain text and Markdown with inline shell commands] <br>
**Output Parameters:** [1D] <br>
**Other Properties Related to Output:** [Stores a local watchlist at ~/.clawdbot/stock_watcher/watchlist.txt and fetches public stock pages from 10jqka.com.cn.] <br>

## Skill Version(s): <br>
1.0.0 (source: server release metadata) <br>

## Ethical Considerations: <br>
Users should evaluate whether this skill is appropriate for their environment, review any generated or modified files before relying on them, and apply their organization's safety, security, and compliance requirements before deployment. <br>
