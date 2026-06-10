// ─────────────────────────────────────────────────────────────────────────────
// app/cancel/page.tsx
// Stripe redirects here if the user cancels checkout (cancel_url).
// No charge was made.
// ─────────────────────────────────────────────────────────────────────────────

export default function CancelPage() {
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
            background: "rgba(251,113,133,0.14)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fb7185",
            fontSize: 30,
          }}
        >
          ✕
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 8px" }}>Payment cancelled</h1>
        <p style={{ color: "#8a90a2", fontSize: 14, lineHeight: 1.6, margin: "0 0 22px" }}>
          No charge was made. You can head back and approve again whenever you&apos;re ready.
        </p>
        <a
          href="/index.html"
          style={{
            display: "inline-block",
            padding: "11px 24px",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid #232634",
            color: "#e6e8ee",
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
