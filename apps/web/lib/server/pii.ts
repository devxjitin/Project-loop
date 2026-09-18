const contextualLabels = ['full name:', 'customer name:', 'name:', 'contact:', 'address:', 'account number:', 'account #:', 'case number:', 'ticket number:'];

/** Redacts labeled values without depending on a value-shaped regular expression. */
function redactContextualFields(value: string) {
  let output = value;
  for (const label of contextualLabels) {
    let from = 0;
    while (true) {
      const index = output.toLowerCase().indexOf(label, from);
      if (index < 0) break;
      const valueStart = index + label.length;
      const lineEnd = output.indexOf('\n', valueStart);
      const valueEnd = lineEnd < 0 ? Math.min(output.length, valueStart + 160) : Math.min(lineEnd, valueStart + 160);
      if (output.slice(valueStart, valueEnd).trim()) output = `${output.slice(0, valueStart)} [CONTEXTUAL_PII_REDACTED]${output.slice(valueEnd)}`;
      from = valueStart + 27;
    }
  }
  return output;
}

/** Defense-in-depth pre-LLM redaction. Raw feedback remains in Postgres for authorized users only. */
export function redactForModel(value: string) {
  return redactContextualFields(value)
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[EMAIL_REDACTED]')
    .replace(/\b(?:\+?\d[\d .()/-]{7,}\d)\b/g, '[PHONE_REDACTED]')
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, '[CARD_REDACTED]')
    .replace(/\b(?:sk|pk|api)[_-][A-Za-z0-9_-]{16,}\b/gi, '[SECRET_REDACTED]');
}
