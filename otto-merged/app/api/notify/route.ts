// ─────────────────────────────────────────────────────────────────────────────
// app/api/notify/route.ts
// POST /api/notify — email the chosen recommendation to a human via Resend.
// One API call. Set RESEND_API_KEY (and optionally RESEND_FROM) in your env.
// The free onboarding@resend.dev sender works instantly, but until you verify
// a domain Resend only delivers to your own Resend account address.
// ─────────────────────────────────────────────────────────────────────────────

import { type NextRequest, NextResponse } from "next/server";

interface Pick {
  name: string;
  price?: number | null;
  why?: string;
  url?: string;
  source?: string;
  deliveryDays?: number | null;
  rating?: number | null;
}

const escapeHtml = (s: string) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

function buildRecommendationEmail(pick: Pick, goal?: string) {
  const price = typeof pick.price === "number" ? `$${pick.price.toFixed(2)}` : "price varies";
  const link = pick.url && pick.url !== "#" ? pick.url : null;
  const subject = `OTTO's pick: ${pick.name} — ${price}`;
  const meta = [
    pick.source && `Source: ${pick.source}`,
    pick.deliveryDays != null && `Delivery: ~${pick.deliveryDays} day${pick.deliveryDays === 1 ? "" : "s"}`,
    pick.rating != null && `Rating: ${pick.rating}★`,
  ]
    .filter(Boolean)
    .join(" &nbsp;·&nbsp; ");

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;background:#0f1117;color:#e6e8ee;border-radius:14px;overflow:hidden;border:1px solid #232634">
    <div style="padding:22px 26px;background:linear-gradient(135deg,#7c3aed,#38bdf8)">
      <div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;opacity:.85;color:#fff">OTTO · Autonomous Decision Engine</div>
      <div style="font-size:20px;font-weight:700;margin-top:4px;color:#fff">Here's my recommendation</div>
    </div>
    <div style="padding:24px 26px">
      ${goal ? `<div style="font-size:12px;color:#8a90a2;margin-bottom:14px"><strong style="color:#aab0c2">Mission:</strong> ${escapeHtml(goal)}</div>` : ""}
      <div style="font-size:18px;font-weight:700;color:#fff">${escapeHtml(pick.name)}</div>
      <div style="font-size:24px;font-weight:700;font-family:ui-monospace,Menlo,monospace;color:#34d399;margin:6px 0 14px">${price}</div>
      ${pick.why ? `<div style="font-size:14px;line-height:1.55;color:#c7cbd6">${escapeHtml(pick.why)}</div>` : ""}
      ${meta ? `<div style="font-size:12px;color:#8a90a2;margin-top:14px">${meta}</div>` : ""}
      ${link ? `<a href="${link}" style="display:inline-block;margin-top:20px;padding:11px 22px;background:linear-gradient(135deg,#7c3aed,#38bdf8);color:#fff;text-decoration:none;border-radius:10px;font-weight:600;font-size:14px">View the product →</a>` : ""}
    </div>
    <div style="padding:14px 26px;border-top:1px solid #232634;font-size:11px;color:#6b7180">Sent by OTTO after a multi-agent search.</div>
  </div>`;
  return { subject, html };
}

export async function POST(request: NextRequest) {
  let body: { to?: string; pick?: Pick; goal?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { to, pick, goal } = body;
  if (!pick || !pick.name) {
    return NextResponse.json({ error: "No recommendation to send." }, { status: 400 });
  }
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    return NextResponse.json({ error: "A valid recipient email is required." }, { status: 400 });
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "Missing RESEND_API_KEY — get a free key at https://resend.com/api-keys." },
      { status: 500 }
    );
  }

  const from = process.env.RESEND_FROM || "OTTO <onboarding@resend.dev>";
  const { subject, html } = buildRecommendationEmail(pick, goal);

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return NextResponse.json({ error: (data && data.message) || `Resend API ${r.status}` }, { status: 502 });
    }
    return NextResponse.json({ ok: true, id: data.id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
