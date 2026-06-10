// ─────────────────────────────────────────────────────────────────────────────
// app/success/page.tsx
// Stripe redirects here after a completed payment (success_url).
// The actual order fulfilment happens server-side in the webhook handler;
// this page is just the user-facing confirmation.
// ─────────────────────────────────────────────────────────────────────────────

export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0f1117",
        color: "#e6e8ee",
        fontFamily: "-apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
        padding: 24,
      }}
    >
      <div
        style={{
          maxWidth: 460,
          width: "100%",
          background: "#12141d",
          border: "1px solid #232634",
          borderRadius: 16,
          padding: "36px 32px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            margin: "0 auto 18px",
            borderRadius: "50%",
            background: "rgba(52,211,153,0.14)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#34d399",
            fontSize: 32,
          }}
        >
          ✓
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 8px" }}>Payment successful</h1>
        <p style={{ color: "#8a90a2", fontSize: 14, lineHeight: 1.6, margin: "0 0 22px" }}>
          OTTO has completed the purchase on your behalf. A confirmation has been recorded.
        </p>
        {session_id && (
          <div
            style={{
              fontFamily: "ui-monospace, Menlo, monospace",
              fontSize: 11,
              color: "#6b7180",
              background: "#0c0c1c",
              border: "1px solid #232634",
              borderRadius: 8,
              padding: "8px 10px",
              marginBottom: 22,
              wordBreak: "break-all",
            }}
          >
            Session: {session_id}
          </div>
        )}
        <a
          href="/index.html"
          style={{
            display: "inline-block",
            padding: "11px 24px",
            background: "linear-gradient(135deg,#7c3aed,#38bdf8)",
            color: "#fff",
            textDecoration: "none",
            borderRadius: 10,
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          ← Back to OTTO
        </a>
      </div>
    </main>
  );
}
