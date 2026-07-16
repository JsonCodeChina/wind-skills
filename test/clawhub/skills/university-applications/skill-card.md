## Description: <br>
命理大师 provides cultural fortune-telling and symbolic interpretation workflows across BaZi, Zi Wei Dou Shu, Qi Men Dun Jia, Liu Yao, Mei Hua Yi Shu, tarot, astrology, numerology, feng shui, naming, dressing, compatibility, timing, local profile management, optional daily push, a browser Liu Yao interface, and HTML-style reporting. <br>

This skill is ready for commercial/non-commercial use. <br>

## Publisher: <br>
[wscats](https://clawhub.ai/user/wscats) <br>

### License/Terms of Use: <br>
MIT-0 <br>


## Use Case: <br>
External users and agent operators use this skill for cultural astrology, divination, feng shui, naming, compatibility, timing, and daily-fortune style guidance. It is intended as reflective cultural reference and not as a substitute for medical, legal, financial, psychological, emergency, or other professional advice. <br>

### Deployment Geography for Use: <br>
Global <br>

## Known Risks and Mitigations: <br>
Risk: The skill can store sensitive birth details, locations, optional family information, interaction topics, and push logs on the local machine. <br>
Mitigation: Install only if local storage of this information is acceptable; review stored profile data regularly and use profile deletion, including purge deletion when physical removal is needed. <br>
Risk: The optional Liu Yao browser LLM feature can use a user-provided API key and send the hexagram and typed question to the configured endpoint. <br>
Mitigation: Use a limited key dedicated to this feature, avoid entering sensitive questions, and enable the feature only after confirming the endpoint and consent prompt. <br>
Risk: Profile commands with full output or sensitive save values can expose personal data in shared terminals, shell history, or CI logs. <br>
Mitigation: Avoid running full profile views or sensitive save commands in shared environments, and prefer private local terminals for profile management. <br>
Risk: Photo-based palmistry or physiognomy requests can involve images of a person who has not consented. <br>
Mitigation: Prefer text descriptions and assess other people only when they have clearly consented. <br>
Risk: Fortune-telling output may be over-relied on for high-stakes decisions. <br>
Mitigation: Treat outputs as cultural and reflective guidance, and consult qualified professionals for medical, legal, financial, psychological, emergency, relationship, and other high-stakes decisions. <br>


## Reference(s): <br>
- [ClawHub skill page](https://clawhub.ai/wscats/university-applications) <br>
- [README](README.md) <br>
- [Intake and routing](references/intake-and-routing.md) <br>
- [Safety and ethics](references/safety-and-ethics.md) <br>
- [Output templates](references/output-templates.md) <br>
- [BaZi framework](references/bazi-framework.md) <br>
- [Zi Wei framework](references/ziwei-framework.md) <br>
- [Qi Men framework](references/qimen-framework.md) <br>
- [Yi Jing divination framework](references/yijing-divination-framework.md) <br>
- [Feng shui and timing framework](references/fengshui-and-timing-framework.md) <br>


## Skill Output: <br>
**Output Type(s):** [text, markdown, shell commands, configuration, guidance] <br>
**Output Format:** [Markdown with inline command examples and structured interpretive guidance] <br>
**Output Parameters:** [1D] <br>
**Other Properties Related to Output:** [May reference local scripts for charting, divination, profile operations, push toggles, and optional browser-based LLM interpretation.] <br>

## Skill Version(s): <br>
1.2.10 (source: server release evidence) <br>

## Ethical Considerations: <br>
Users should evaluate whether this skill is appropriate for their environment, review any generated or modified files before relying on them, and apply their organization's safety, security, and compliance requirements before deployment. <br>
