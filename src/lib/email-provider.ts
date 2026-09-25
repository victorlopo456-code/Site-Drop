function senderAddress(value: string) {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] ?? value).trim();
}

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  idempotencyKey: string;
}) {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  const configuredFrom = process.env.ORDER_EMAIL_FROM?.trim();
  if (!apiKey || !configuredFrom) return { sent: false as const, reason: "not_configured" };

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: { name: "DROP Skate Shop", email: senderAddress(configuredFrom) },
      replyTo: { name: "DROP Skate Shop", email: senderAddress(configuredFrom) },
      to: [{ email: input.to, contactPixelTrackingConsent: false }],
      subject: input.subject,
      htmlContent: input.html,
      headers: { "X-Drop-Idempotency": input.idempotencyKey.slice(0, 180) },
      tags: ["drop-transactional"],
    }),
  });
  const result = (await response.json().catch(() => ({}))) as {
    messageId?: string;
    message?: string;
  };
  if (!response.ok || !result.messageId) {
    throw new Error(result.message ?? `Falha no envio (${response.status}).`);
  }
  return { sent: true as const, providerId: result.messageId };
}
