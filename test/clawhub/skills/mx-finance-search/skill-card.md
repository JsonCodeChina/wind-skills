## Description: <br>
Financial Search Engine lets an agent use natural-language queries to retrieve financial news, announcements, research reports, exchange updates, and policy information from Eastmoney services. <br>

This skill is ready for commercial/non-commercial use. <br>

## Publisher: <br>
[financial-ai-analyst](https://clawhub.ai/user/financial-ai-analyst) <br>

### License/Terms of Use: <br>
MIT-0 <br>


## Use Case: <br>
Developers and analysts use this skill to query timely financial information about companies, sectors, themes, policies, and market events. It supports event tracking, sentiment monitoring, report review, announcement analysis, and market-signal gathering. <br>

### Deployment Geography for Use: <br>
Global <br>

## Known Risks and Mitigations: <br>
Risk: Queries and the EM_API_KEY are sent to Eastmoney services. <br>
Mitigation: Use a revocable API key, avoid confidential portfolio or business-sensitive query details, and confirm the key scope, expiration, and revocation path before use. <br>
Risk: Retrieved financial content can be written to local .txt files by default. <br>
Mitigation: Use --no-save when local persistence is not needed, and store any saved outputs in an access-controlled workspace. <br>
Risk: Retrieved financial information may be incomplete, stale, or unsuitable as sole support for investment decisions. <br>
Mitigation: Validate important findings against primary sources and keep key numbers, named entities, and source meaning intact when summarizing. <br>


## Reference(s): <br>
- [ClawHub Skill Page](https://clawhub.ai/financial-ai-analyst/mx-finance-search) <br>
- [Eastmoney Miaoxiang API Key Portal](https://ai.eastmoney.com/mxClaw) <br>
- [Eastmoney Search News Endpoint](https://ai-saas.eastmoney.com/proxy/b/mcp/tool/searchNews) <br>


## Skill Output: <br>
**Output Type(s):** [Text, Files, JSON] <br>
**Output Format:** [Plain text response, optional local .txt file, and structured Python dictionary for code use] <br>
**Output Parameters:** [1D] <br>
**Other Properties Related to Output:** [Requires EM_API_KEY. Command-line use saves retrieved content locally by default unless --no-save is used.] <br>

## Skill Version(s): <br>
1.0.9 (source: server release metadata) <br>

## Ethical Considerations: <br>
Users should evaluate whether this skill is appropriate for their environment, review any generated or modified files before relying on them, and apply their organization's safety, security, and compliance requirements before deployment. <br>
