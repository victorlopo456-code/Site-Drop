function escapeHtml(value: string) {
  return value.replace(
    /[&<>"]/g,
    (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]!,
  );
}

export { escapeHtml };

export async function sendMarketingEmail(input: {
  to: string;
  subject: string;
  title: string;
  message: string;
  buttonLabel: string;
  buttonUrl: string;
  detail?: string;
  idempotencyKey: string;
}) {
  const html = `<!doctype html><html><body style="margin:0;background:#111;color:#f5f5f5;font-family:Arial,sans-serif"><div style="max-width:600px;margin:auto;padding:32px 20px"><p style="color:#f57c00;font-weight:bold;letter-spacing:2px">DROP SKATE SHOP</p><h1>${escapeHtml(input.title)}</h1><p>${escapeHtml(input.message)}</p>${input.detail ? `<div style="margin:20px 0;padding:16px;background:#191919;border:1px solid #333;border-radius:8px">${escapeHtml(input.detail)}</div>` : ""}<a href="${escapeHtml(input.buttonUrl)}" style="display:inline-block;margin-top:18px;padding:13px 20px;background:#f57c00;color:#111;text-decoration:none;font-weight:bold;border-radius:6px">${escapeHtml(input.buttonLabel)}</a><p style="margin-top:32px;color:#999;font-size:12px">Mensagem automática da DROP Skate Shop.</p></div></body></html>`;
  const result = await sendEmail({
    to: input.to,
    subject: input.subject,
    html,
    idempotencyKey: input.idempotencyKey,
  });
  return result.sent;
}
import { sendEmail } from "@/lib/email-provider";
