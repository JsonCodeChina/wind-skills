## Description: <br>
WooCommerce REST API integration with managed OAuth for accessing products, orders, customers, coupons, shipping, taxes, reports, webhooks, payment gateways, store settings, and system status tools. <br>

This skill is ready for commercial/non-commercial use. <br>

## Publisher: <br>
[byungkyu](https://clawhub.ai/user/byungkyu) <br>

### License/Terms of Use: <br>
MIT-0 <br>


## Use Case: <br>
Store operators and developers use this skill to manage WooCommerce e-commerce operations through Maton-mediated REST API calls. It supports catalog, order, customer, coupon, shipping, tax, reporting, webhook, payment, settings, and system-status workflows. <br>

### Deployment Geography for Use: <br>
Global <br>

## Known Risks and Mitigations: <br>
Risk: The skill can make changes to a real WooCommerce store through Maton-mediated access. <br>
Mitigation: Install only when store-management access is intended, use the least-privileged practical store account, and confirm write operations before execution. <br>
Risk: Customer and order workflows may expose personal information. <br>
Mitigation: Avoid retrieving or displaying customer or order PII unless it is needed for the specific task. <br>
Risk: Refunds, deletes, payment gateway changes, store settings changes, webhook creation, and system maintenance actions can affect customers or store operations. <br>
Mitigation: Carefully confirm the target resource, requested action, and expected store-wide impact before performing these operations. <br>


## Reference(s): <br>
- [ClawHub Skill Page](https://clawhub.ai/byungkyu/skills/woocommerce) <br>
- [Publisher Profile](https://clawhub.ai/user/byungkyu) <br>
- [WooCommerce REST API Documentation](https://woocommerce.github.io/woocommerce-rest-api-docs/) <br>
- [WooCommerce API Authentication Guide](https://woocommerce.github.io/woocommerce-rest-api-docs/#authentication) <br>
- [WooCommerce Developer Resources](https://developer.woocommerce.com/) <br>
- [Maton API](https://api.maton.ai) <br>
- [Maton Settings](https://maton.ai/settings) <br>


## Skill Output: <br>
**Output Type(s):** [guidance, shell commands, code, configuration] <br>
**Output Format:** [Markdown with inline bash, Python, JavaScript, curl, HTTP, and JSON examples] <br>
**Output Parameters:** [1D] <br>
**Other Properties Related to Output:** [Requires network access and the MATON_API_KEY environment variable.] <br>

## Skill Version(s): <br>
1.0.5 (source: server release evidence) <br>

## Ethical Considerations: <br>
Users should evaluate whether this skill is appropriate for their environment, review any generated or modified files before relying on them, and apply their organization's safety, security, and compliance requirements before deployment. <br>
