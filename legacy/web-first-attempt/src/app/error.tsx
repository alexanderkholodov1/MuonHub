"use client";

/**
 * Route-level error state for the MuonHub web app.
 *
 * Uses the same Card error treatment as in-page states, with a reset action
 * supplied by the Next.js App Router.
 */
import { RefreshCw } from "lucide-react";
import { Button, Card } from "@muonhub/ui";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error, reset }: ErrorProps) {
  return (
    <div
      style={{
        maxWidth: "720px",
        margin: "0 auto",
        padding: "var(--space-16) var(--space-6)",
      }}
    >
      <Card
        title="Station view unavailable"
        error={
          error.message ||
          "The interface could not render this route. Try again to reload the station view."
        }
      />

      <div
        style={{
          display: "flex",
          justifyContent: "flex-start",
          marginTop: "var(--space-4)",
        }}
      >
        <Button
          type="button"
          variant="secondary"
          icon={<RefreshCw size={16} aria-hidden="true" />}
          onClick={reset}
        >
          Try again
        </Button>
      </div>
    </div>
  );
}
