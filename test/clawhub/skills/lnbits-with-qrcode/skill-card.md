## Description: <br>
Manage LNbits Lightning Wallet (Balance, Pay, Invoice) <br>

This skill is ready for commercial/non-commercial use. <br>

## Publisher: <br>
[jamestsetsekas](https://clawhub.ai/user/jamestsetsekas) <br>

### License/Terms of Use: <br>


## Use Case: <br>
External users and developers use this skill to let an assistant manage an LNbits Lightning wallet: check balances, create invoices with QR codes, decode invoices, and pay invoices after explicit confirmation. <br>

### Deployment Geography for Use: <br>
Global <br>

## Known Risks and Mitigations: <br>
Risk: The skill can operate with an LNbits admin key and therefore has real financial authority over the configured wallet. <br>
Mitigation: Use a dedicated low-balance wallet and install only when assistant access to that wallet is acceptable. <br>
Risk: A payment request could be paid incorrectly if invoice details are not checked before execution. <br>
Mitigation: Decode invoices, verify the amount and memo, check balance first, and require explicit yes/no confirmation before payment. <br>
Risk: Wallet secrets could be exposed through chat, shared logs, or an unintended LNbits server configuration. <br>
Mitigation: Keep the adminkey out of chat and shared logs, store credentials in environment variables, and set LNBITS_BASE_URL to the intended LNbits server. <br>


## Reference(s): <br>
- [LNbits Website](https://lnbits.com) <br>
- [LNbits Demo Server](https://legend.lnbits.com) <br>


## Skill Output: <br>
**Output Type(s):** [Text, Shell commands, JSON, Files, Guidance] <br>
**Output Format:** [Markdown responses with shell commands, JSON command results, Bolt11 invoice text, and MEDIA file paths for QR PNGs] <br>
**Output Parameters:** [1D] <br>
**Other Properties Related to Output:** [Requires python3, qrcode[pil], LNBITS_API_KEY, and LNBITS_BASE_URL; QR PNG files are written under ./.lnbits_qr and cleaned after about five minutes.] <br>

## Skill Version(s): <br>
1.0.2 (source: server release metadata) <br>

## Ethical Considerations: <br>
Users should evaluate whether this skill is appropriate for their environment, review any generated or modified files before relying on them, and apply their organization's safety, security, and compliance requirements before deployment. <br>
