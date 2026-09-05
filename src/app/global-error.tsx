"use client";

/**
 * Last-resort error boundary. Only renders when the root layout itself throws,
 * so it must supply its own <html>/<body>. Keep it dependency-free and inline-
 * styled — the app shell and theme may be unavailable here.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" dir="ltr">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "1.5rem",
          textAlign: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#ffffff",
          color: "#171717",
        }}
      >
        <h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>
          Something went wrong
        </h1>
        <p style={{ maxWidth: "24rem", fontSize: "0.875rem", color: "#666" }}>
          The application failed to load. Please try again.
        </p>
        {error.digest ? (
          <p
            style={{
              fontSize: "0.75rem",
              color: "#999",
              fontFamily: "monospace",
            }}
          >
            Reference: {error.digest}
          </p>
        ) : null}
        <button
          onClick={reset}
          style={{
            padding: "0.5rem 1rem",
            fontSize: "0.875rem",
            borderRadius: "0.5rem",
            border: "1px solid #e5e5e5",
            background: "transparent",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
