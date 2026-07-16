## Description: <br>
Xero API integration with managed OAuth for managing contacts, invoices, payments, accounts, bank transactions, and financial reports. <br>

This skill is ready for commercial/non-commercial use. <br>

## Publisher: <br>
[byungkyu](https://clawhub.ai/user/byungkyu) <br>

### License/Terms of Use: <br>
MIT-0 <br>


## Use Case: <br>
External users and developers use this skill to connect an agent to Xero accounting data through Maton-managed OAuth. It supports operational accounting tasks such as reviewing contacts, invoices, payments, accounts, bank transactions, and financial reports. <br>

### Deployment Geography for Use: <br>
Global <br>

## Known Risks and Mitigations: <br>
Risk: The Maton API key and connected OAuth account can expose Xero accounting data. <br>
Mitigation: Install only when Maton is trusted, keep MATON_API_KEY private, and revoke unused Maton or Xero connections. <br>
Risk: Requests may target the wrong Xero account when multiple connections exist. <br>
Mitigation: Verify the selected connection and include the Maton-Connection header for multi-connection accounts. <br>
Risk: Create, update, and delete operations can alter contacts, invoices, payments, accounts, or related financial records. <br>
Mitigation: Carefully review invoices, amounts, contacts, deletions, target resources, and intended effects before approving write operations. <br>


## Reference(s): <br>
- [ClawHub Xero Skill Page](https://clawhub.ai/byungkyu/skills/xero) <br>
- [Publisher Profile](https://clawhub.ai/user/byungkyu) <br>
- [Xero Accounting API Overview](https://developer.xero.com/documentation/api/accounting/overview) <br>
- [Xero Contacts API](https://developer.xero.com/documentation/api/accounting/contacts) <br>
- [Xero Invoices API](https://developer.xero.com/documentation/api/accounting/invoices) <br>
- [Xero Accounts API](https://developer.xero.com/documentation/api/accounting/accounts) <br>
- [Xero Payments API](https://developer.xero.com/documentation/api/accounting/payments) <br>
- [Xero Reports API](https://developer.xero.com/documentation/api/accounting/reports) <br>
- [Maton](https://maton.ai) <br>


## Skill Output: <br>
**Output Type(s):** [Guidance, Code, Shell commands, API Calls, Configuration instructions] <br>
**Output Format:** [Markdown with inline bash, Python, JavaScript, HTTP, and JSON examples] <br>
**Output Parameters:** [1D] <br>
**Other Properties Related to Output:** [Requires network access, MATON_API_KEY, and user approval before write operations.] <br>

## Skill Version(s): <br>
1.0.5 (source: release evidence) <br>

## Ethical Considerations: <br>
Users should evaluate whether this skill is appropriate for their environment, review any generated or modified files before relying on them, and apply their organization's safety, security, and compliance requirements before deployment. <br>
