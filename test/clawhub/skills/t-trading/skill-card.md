## Description: <br>
Provides Chinese-language structured technical analysis for A-share and cryptocurrency short-term trading using Vegas Tunnel EMA channels, Fibonacci retracements, multi-timeframe resonance scoring, and signal synthesis. <br>

This skill is ready for commercial/non-commercial use. <br>

## Publisher: <br>
[Wscats](https://clawhub.ai/user/Wscats) <br>

### License/Terms of Use: <br>
MIT-0 <br>


## Use Case: <br>
External traders and market-analysis users can ask an agent for structured A-share or cryptocurrency technical-analysis reports, including trend direction, resonance scores, entry levels, stop-loss levels, take-profit levels, position guidance, and a risk disclaimer. The skill is intended as technical reference material, not personalized financial advice or automated trading execution. <br>

### Deployment Geography for Use: <br>
Global <br>

## Known Risks and Mitigations: <br>
Risk: Outputs may be mistaken for personalized financial advice or automatic trade instructions. <br>
Mitigation: Treat outputs as technical-analysis reference only; require the user to make independent decisions and keep the disclaimer visible in reports. <br>
Risk: The skill may activate on broad market-analysis phrasing. <br>
Mitigation: Confirm the requested symbol, market, timeframe, and analysis purpose before producing trade-oriented guidance. <br>
Risk: Analysis quality depends on current and complete market data supplied in the conversation. <br>
Mitigation: Ask for missing price, timeframe, volume, or trend data before calculating levels, and clearly state when analysis is based on incomplete context. <br>


## Reference(s): <br>
- [ClawHub skill page](https://clawhub.ai/Wscats/t-trading) <br>
- [Publisher profile](https://clawhub.ai/user/Wscats) <br>
- [README.md](artifact/README.md) <br>
- [SKILL.md](artifact/SKILL.md) <br>
- [Vegas Tunnel resonance rules](artifact/vegas-tunnel-resonance-skill.md) <br>


## Skill Output: <br>
**Output Type(s):** [Text, Markdown, Guidance] <br>
**Output Format:** [Chinese-language Markdown technical-analysis report with scoring tables, price levels, action guidance, and risk disclaimer] <br>
**Output Parameters:** [1D] <br>
**Other Properties Related to Output:** [May include entry, stop-loss, take-profit, position-sizing, and observe-only recommendations based on the provided market context.] <br>

## Skill Version(s): <br>
1.0.0 (source: server release metadata and artifact documentation) <br>

## Ethical Considerations: <br>
Users should evaluate whether this skill is appropriate for their environment, review any generated or modified files before relying on them, and apply their organization's safety, security, and compliance requirements before deployment. <br>
