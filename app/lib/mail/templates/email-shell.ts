/* ===============================================================
   🔥 EMAIL LAYOUT — shared HTML shell (inline-styled, client-safe)
   ===============================================================
   - Gmail / Outlook / Apple Mail uyumlu inline CSS
   - Maki Dijital branding: cyan/blue/green gradient + slate dark
   - "React Email" pattern: küçük helper fonksiyonlar component gibi
   =============================================================== */

export type LayoutProps = {
  brandName?: string;
  preheader?: string; // inbox preview text
  body: string; // ham HTML (component'lerden gelir)
};

export function escapeHtml(text: string): string {
  return (text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function emailLayout({
  brandName = "Maki Dijital",
  preheader = "",
  body,
}: LayoutProps): string {
  const safePreheader = escapeHtml(preheader);
  const safeBrand = escapeHtml(brandName);

  return `<!doctype html>
<html lang="tr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="color-scheme" content="light only" />
    <meta name="supported-color-schemes" content="light" />
    <title>${safeBrand}</title>
  </head>
  <body style="margin:0;padding:0;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;-webkit-font-smoothing:antialiased;">
    <!-- preheader (gizli) -->
    <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;color:#f6f7f9;">
      ${safePreheader}
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f7f9;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid rgba(15,23,42,0.08);border-radius:16px;overflow:hidden;box-shadow:0 1px 2px rgba(15,23,42,0.04);">
            <!-- HEADER -->
            <tr>
              <td style="padding:24px 28px 20px;border-bottom:1px solid rgba(15,23,42,0.06);">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td valign="middle">
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          <td valign="middle" style="vertical-align:middle;">
                            <div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#1d4ed8 0%,#06b6d4 55%,#84cc16 100%);color:#ffffff;font-weight:700;font-size:16px;line-height:36px;text-align:center;">
                              M
                            </div>
                          </td>
                          <td valign="middle" style="padding-left:12px;vertical-align:middle;">
                            <div style="font-size:15px;font-weight:700;color:#0f172a;letter-spacing:-0.01em;">${safeBrand}</div>
                            <div style="font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:#94a3b8;margin-top:2px;">Admin · CRM</div>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- BODY -->
            <tr>
              <td style="padding:28px;">
                ${body}
              </td>
            </tr>

            <!-- FOOTER -->
            <tr>
              <td style="padding:18px 28px;background:#fafafa;border-top:1px solid rgba(15,23,42,0.06);">
                <p style="margin:0;font-size:11.5px;color:#94a3b8;line-height:1.5;">
                  Bu e-posta ${safeBrand} sistemi tarafından otomatik gönderildi.
                </p>
              </td>
            </tr>
          </table>

          <p style="margin:16px 0 0;font-size:11px;color:#94a3b8;">
            © ${new Date().getFullYear()} ${safeBrand}
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/* ---------------------------------------------
   Reusable inline components (helper fonksiyonlar)
---------------------------------------------- */
export function emailHeading(text: string): string {
  return `<h1 style="margin:0 0 12px;font-size:22px;line-height:1.25;letter-spacing:-0.02em;font-weight:700;color:#0f172a;">${escapeHtml(
    text
  )}</h1>`;
}

export function emailParagraph(text: string): string {
  return `<p style="margin:0 0 14px;font-size:14px;line-height:1.65;color:#334155;">${text}</p>`;
}

export function emailDivider(): string {
  return `<div style="height:1px;background:rgba(15,23,42,0.08);margin:20px 0;"></div>`;
}

export function emailKeyValueRow(label: string, value: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0;">
    <tr>
      <td style="font-size:12px;color:#64748b;letter-spacing:0.04em;text-transform:uppercase;font-weight:600;padding-right:12px;width:38%;">${escapeHtml(
        label
      )}</td>
      <td style="font-size:14px;color:#0f172a;font-weight:500;">${escapeHtml(
        value
      )}</td>
    </tr>
  </table>`;
}

export function emailButton(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0 4px;">
    <tr>
      <td style="border-radius:10px;background:#0f172a;">
        <a href="${href}" style="display:inline-block;padding:11px 22px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;letter-spacing:-0.01em;">${escapeHtml(
          label
        )}</a>
      </td>
    </tr>
  </table>`;
}

export function emailBadge(
  text: string,
  variant: "neutral" | "success" | "warning" | "danger" | "info" = "info"
): string {
  const styles: Record<string, string> = {
    neutral: "background:#f6f7f9;color:#475569;border:1px solid rgba(15,23,42,0.08);",
    success: "background:#ecfaf2;color:#176b46;border:1px solid #c8eed7;",
    warning: "background:#fff8eb;color:#92560a;border:1px solid #fde7bf;",
    danger: "background:#fdeef0;color:#9a2a36;border:1px solid #f4cfd5;",
    info: "background:#ecfeff;color:#0e7490;border:1px solid #a5f3fc;",
  };
  return `<span style="display:inline-block;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:600;letter-spacing:0;${styles[variant]}">${escapeHtml(
    text
  )}</span>`;
}
