# PII and LLM handling policy

Project LOOP stores customer feedback only within the tenant-scoped Postgres database. Before any feedback text, question, quote, or theme label leaves the application for the private AI service, the application applies `redactForModel`.

The current redactor combines contextual scanning with pattern redaction. It removes labeled name, contact, address, account, case, and ticket fields; email addresses; phone-like numbers; payment-card-like numbers; and common API-key patterns. It is a defense-in-depth control, not a guarantee of anonymization: unlabeled names, company names, free-form addresses, support case details, and novel identifier formats can still be personal data.

Operational requirements:

- Use only the configured private AI service and server-side `AI_SERVICE_TOKEN`; browser clients must never call Gemini directly.
- Do not log raw request bodies, model prompts, or access tokens.
- Keep model-provider retention and data-processing terms approved by Legal before production data is enabled.
- Honor a verified deletion request by deleting the feedback item; dependent embeddings, theme links, and report snapshots must be reviewed as part of that deletion workflow.
- Review the redaction rules quarterly and after every PII incident or new data source.

This policy is the MVP documented acceptance of residual PII risk. Production launch requires Legal approval of the provider DPA and retention configuration.
