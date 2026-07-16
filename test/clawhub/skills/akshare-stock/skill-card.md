## Description: <br>
A股量化 AkShare helps agents query Chinese A-share quotes, historical prices, financial data, sector data, fund flows, IPO information, and screening inputs through AkShare. <br>

This skill is for research and development only. <br>

## Publisher: <br>
[mbpz](https://clawhub.ai/user/mbpz) <br>

### License/Terms of Use: <br>


## Use Case: <br>
Developers and analysts use this skill to guide A-share market data lookups, financial analysis, sector review, stock search, and local AkShare CLI usage. Its outputs should be treated as research information rather than investment advice. <br>

### Deployment Geography for Use: <br>
Global <br>

## Known Risks and Mitigations: <br>
Risk: Market data can be unavailable, stale, or affected by upstream website and network changes. <br>
Mitigation: Validate important results against authoritative data sources and add exception handling, retries, and local testing before relying on outputs. <br>
Risk: Installing AkShare and related packages changes the user's Python environment. <br>
Mitigation: Install dependencies in a controlled virtual environment and pin versions for repeatable workflows. <br>
Risk: Financial analysis output could be mistaken for investment advice. <br>
Mitigation: Use the output for research only and require qualified human review before making trading or investment decisions. <br>


## Reference(s): <br>
- [ClawHub skill page](https://clawhub.ai/mbpz/akshare-stock) <br>


## Skill Output: <br>
**Output Type(s):** [text, markdown, code, shell commands, configuration, guidance] <br>
**Output Format:** [Markdown guidance with Python and shell code blocks; CLI commands can emit JSON market data.] <br>
**Output Parameters:** [1D] <br>
**Other Properties Related to Output:** [Requires a Python environment with AkShare installed and network access to upstream market data sources.] <br>

## Skill Version(s): <br>
1.0.1 (source: server release evidence) <br>

## Ethical Considerations: <br>
Users should evaluate whether this skill is appropriate for their environment, review any generated or modified files before relying on them, and apply their organization's safety, security, and compliance requirements before deployment. <br>
