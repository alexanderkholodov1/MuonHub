/**
 * Route-level loading state for the MuonHub web app.
 *
 * Mirrors the Card loading state so App Router transitions stay aligned with
 * the Observatory Dark design system.
 */
import { Card } from "@muonhub/ui";

export default function Loading() {
  return (
    <div
      style={{
        maxWidth: "720px",
        margin: "0 auto",
        padding: "var(--space-16) var(--space-6)",
      }}
    >
      <Card title="Preparing station view" loading />
    </div>
  );
}
