export default function HomePage() {
  return (
    <main>
      <h1>OTTO 2.0 — API Server</h1>
      <p>Backend is running. Use the API routes below:</p>
      <ul>
        <li>POST /api/run-task</li>
        <li>POST /api/agents/execute</li>
        <li>POST /api/recommendation</li>
        <li>GET  /api/recommendation?taskId=&lt;id&gt;</li>
        <li>POST /api/payments/create-checkout</li>
        <li>POST /api/stripe/webhook</li>
      </ul>
    </main>
  );
}
