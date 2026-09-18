type Email = { to: string; subject: string; html: string };

/** Sends transactional email through Resend without retaining message bodies. */
export async function sendTransactionalEmail({ to, subject, html }: Email) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) throw new Error('Transactional email is not configured. Set RESEND_API_KEY and EMAIL_FROM.');
  const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' }, body: JSON.stringify({ from, to, subject, html }) });
  if (!response.ok) throw new Error('Transactional email provider rejected the message.');
}
