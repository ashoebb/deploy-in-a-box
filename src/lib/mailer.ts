/**
 * Mail abstraction. Two transports:
 *  - "console" (default): prints the email to stdout, fine for local dev.
 *  - "resend": sends through the Resend HTTP API (set RESEND_API_KEY).
 * Swap in SES here later if you prefer; every send goes through sendMail().
 */

interface Mail {
  to: string;
  subject: string;
  text: string;
}

export async function sendMail(mail: Mail): Promise<void> {
  const transport = process.env.MAIL_TRANSPORT ?? "console";

  if (transport === "resend") {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("MAIL_TRANSPORT=resend but RESEND_API_KEY is not set");
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.MAIL_FROM ?? "Deploy-in-a-Box <no-reply@example.com>",
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Resend API error ${res.status}: ${body}`);
    }
    return;
  }

  // console transport
  console.log("── mail (console transport) ──────────────────────────");
  console.log(`to:      ${mail.to}`);
  console.log(`subject: ${mail.subject}`);
  console.log(mail.text);
  console.log("──────────────────────────────────────────────────────");
}
