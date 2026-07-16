## Description: <br>
Queries Eastmoney macroeconomic data from natural-language requests and returns data descriptions with CSV outputs for macroeconomic research, market analysis, and policy interpretation. <br>

This skill is ready for commercial/non-commercial use. <br>

## Publisher: <br>
[financial-ai-analyst](https://clawhub.ai/user/financial-ai-analyst) <br>

### License/Terms of Use: <br>
MIT-0 <br>


## Use Case: <br>
Analysts, researchers, and agent developers use this skill to request specific macroeconomic indicators, commodity prices, monetary data, and fiscal or trade metrics and receive structured files for downstream analysis. <br>

### Deployment Geography for Use: <br>
Global <br>

## Known Risks and Mitigations: <br>
Risk: The skill requires a sensitive Eastmoney API key. <br>
Mitigation: Use a revocable EM_API_KEY, keep it in the environment, and avoid logging or embedding the key in prompts, code, or output files. <br>
Risk: Macro-data queries and related request metadata are sent to Eastmoney. <br>
Mitigation: Install and run the skill only when the Eastmoney service and publisher are trusted for the intended data workflow. <br>
Risk: Completeness checks for broad or multi-metric requests may require follow-up calls. <br>
Mitigation: Monitor API usage and cap retries according to the documented workflow. <br>


## Reference(s): <br>
- [ClawHub skill page](https://clawhub.ai/financial-ai-analyst/mx-macro-data) <br>
- [Publisher profile](https://clawhub.ai/user/financial-ai-analyst) <br>
- [Eastmoney Miaoxiang service](https://ai.eastmoney.com/mxClaw) <br>
- [Eastmoney API host](https://ai-saas.eastmoney.com) <br>


## Skill Output: <br>
**Output Type(s):** [text, markdown, code, shell commands, configuration, guidance, files] <br>
**Output Format:** [CSV files, TXT descriptions, JSON-like result dictionaries, and Markdown guidance with shell commands] <br>
**Output Parameters:** [1D] <br>
**Other Properties Related to Output:** [Requires EM_API_KEY; may generate separate CSV files by data frequency and a description file for each query.] <br>

## Skill Version(s): <br>
1.0.12 (source: server release evidence) <br>

## Ethical Considerations: <br>
Users should evaluate whether this skill is appropriate for their environment, review any generated or modified files before relying on them, and apply their organization's safety, security, and compliance requirements before deployment. <br>
