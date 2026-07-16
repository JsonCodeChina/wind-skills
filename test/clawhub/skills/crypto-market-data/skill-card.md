## Description: <br>
No API KEY needed for free tier. Professional-grade cryptocurrency and stock market data integration for real-time prices, company profiles, and global analytics. Powered by Node.js with zero external dependencies. <br>

This skill is ready for commercial/non-commercial use. <br>

## Publisher: <br>
[liam8](https://clawhub.ai/user/liam8) <br>

### License/Terms of Use: <br>


## Use Case: <br>
Developers and agents use this skill to retrieve cryptocurrency and stock market prices, asset discovery data, company profiles, historical charts, and global market metrics without configuring an API key. <br>

### Deployment Geography for Use: <br>
Global <br>

## Known Risks and Mitigations: <br>
Risk: Market queries are sent to api.igent.net. <br>
Mitigation: Install only if sending cryptocurrency or stock lookup queries to that service is acceptable for the intended use. <br>
Risk: The skill caches a temporary provider token in the scripts directory. <br>
Mitigation: Keep the skill directory private and delete scripts/.token when clearing the cached session is required. <br>
Risk: API_BASE_URL can redirect requests to a replacement endpoint. <br>
Mitigation: Set API_BASE_URL only when the replacement endpoint is trusted. <br>


## Reference(s): <br>
- [ClawHub skill page](https://clawhub.ai/liam8/skills/crypto-market-data) <br>


## Skill Output: <br>
**Output Type(s):** [text, markdown, code, shell commands, configuration, guidance] <br>
**Output Format:** [Markdown guidance with shell commands and JSON API responses from the skill scripts] <br>
**Output Parameters:** [1D] <br>
**Other Properties Related to Output:** [Scripts query api.igent.net and may cache a temporary provider token in scripts/.token.] <br>

## Skill Version(s): <br>
1.0.2 (source: server release evidence) <br>

## Ethical Considerations: <br>
Users should evaluate whether this skill is appropriate for their environment, review any generated or modified files before relying on them, and apply their organization's safety, security, and compliance requirements before deployment. <br>
