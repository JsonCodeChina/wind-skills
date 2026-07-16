## Description: <br>
Tushare Finance helps agents retrieve Chinese financial market data for A-shares, Hong Kong stocks, U.S. stocks, funds, futures, bonds, market prices, financial statements, and macroeconomic indicators through Tushare Pro interfaces. <br>

This skill is ready for commercial/non-commercial use. <br>

## Publisher: <br>
[stanleychanh](https://clawhub.ai/user/stanleychanh) <br>

### License/Terms of Use: <br>
MIT <br>


## Use Case: <br>
Developers, analysts, and agent builders use this skill to look up Tushare Pro API methods and generate Python or shell-based workflows for market data, financial statements, macroeconomic indicators, and batch exports. <br>

### Deployment Geography for Use: <br>
Global <br>

## Known Risks and Mitigations: <br>
Risk: The bundled documentation crawler can use account credentials and CAPTCHA-solving automation. <br>
Mitigation: Use the normal Tushare token-based workflow for market-data queries, and run scripts/crawl_docs.py only after reviewing the script, required credentials, and Tushare terms. <br>
Risk: Exported market, company, or financial datasets may be sensitive or regulated in some workflows. <br>
Mitigation: Handle downloaded and exported datasets according to the user's data handling, retention, and sharing requirements. <br>
Risk: The release has conflicting license signals across evidence and artifact files. <br>
Mitigation: Confirm the authoritative license before public release or redistribution. <br>


## Reference(s): <br>
- [ClawHub skill page](https://clawhub.ai/stanleychanh/tushare-finance) <br>
- [Tushare official documentation](https://tushare.pro/document/2) <br>
- [Tushare API test tool](https://tushare.pro/document/1) <br>
- [Local API reference index](reference/README.md) <br>
- [Quick reference](QUICK_REFERENCE.md) <br>


## Skill Output: <br>
**Output Type(s):** [text, markdown, code, shell commands, configuration, guidance] <br>
**Output Format:** [Markdown guidance with Python snippets, shell commands, configuration steps, and pandas DataFrame-oriented examples.] <br>
**Output Parameters:** [1D] <br>
**Other Properties Related to Output:** [May point to local reference files and may generate export workflows for financial datasets when requested.] <br>

## Skill Version(s): <br>
2.1.0 (source: release metadata and README changelog, released 2026-06-09) <br>

## Ethical Considerations: <br>
Users should evaluate whether this skill is appropriate for their environment, review any generated or modified files before relying on them, and apply their organization's safety, security, and compliance requirements before deployment. <br>
