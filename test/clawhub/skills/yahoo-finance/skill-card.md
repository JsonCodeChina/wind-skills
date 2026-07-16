## Description: <br>
Get stock prices, quotes, fundamentals, earnings, options, dividends, and analyst ratings using Yahoo Finance. <br>

This skill is ready for commercial/non-commercial use. <br>

## Publisher: <br>
[ajanraj](https://clawhub.ai/user/ajanraj) <br>

### License/Terms of Use: <br>


## Use Case: <br>
External users and developers use this skill to retrieve Yahoo Finance market data from a command-line workflow, including prices, quotes, fundamentals, earnings, options, dividends, analyst ratings, history, comparisons, and symbol search. <br>

### Deployment Geography for Use: <br>
Global <br>

## Known Risks and Mitigations: <br>
Risk: Optional uv installation commands may run remote installer scripts. <br>
Mitigation: Prefer installing uv through Homebrew or pip before using the skill. <br>
Risk: The reviewed bundle does not include the referenced yf script, so the CLI may require an additional file not present in this release artifact. <br>
Mitigation: Confirm the executable is present and review it before installing or linking it into PATH. <br>


## Reference(s): <br>
- [ClawHub skill page](https://clawhub.ai/ajanraj/skills/yahoo-finance) <br>


## Skill Output: <br>
**Output Type(s):** [text, shell commands, guidance] <br>
**Output Format:** [Markdown with inline shell commands] <br>
**Output Parameters:** [1D] <br>
**Other Properties Related to Output:** [May guide users through installing uv and running the yf command-line helper.] <br>

## Skill Version(s): <br>
1.0.0 (source: server release evidence) <br>

## Ethical Considerations: <br>
Users should evaluate whether this skill is appropriate for their environment, review any generated or modified files before relying on them, and apply their organization's safety, security, and compliance requirements before deployment. <br>
