# ADR-0007: Server-Sent Events for Streaming

## Status

Accepted

> **Current operational note (2026):** SSE remains the API streaming protocol, but the first production profile does not support Vercel/serverless deployment. It runs as one long-lived process and one replica. The original option analysis below is retained for history.

## Context

The auto pipeline (ADR-0005) makes 10+ sequential LLM calls and can take 30–90 seconds to complete. Without streaming, the user sees nothing until the entire pipeline finishes — an unacceptable UX. The team needed a mechanism to push real-time progress updates from server to client.

Options considered:

1. **Polling** — Client repeatedly hits a status endpoint. Simple but wasteful and introduces latency.
2. **WebSockets** — Full-duplex, real-time. Powerful but complex (connection management, reconnection, stateful servers) and doesn't align with Next.js's serverless-friendly model.
3. **Server-Sent Events (SSE)** — Unidirectional server-to-client streaming over a standard HTTP connection. Simple, natively supported by browsers via `EventSource`, and compatible with serverless/edge runtimes.

The data flow is inherently unidirectional: the client sends a request, then the server streams progress updates. There is no need for the client to send messages mid-stream, ruling out WebSocket's complexity.

## Decision

We use **Server-Sent Events (SSE)** for all long-running API endpoints. The implementation uses Next.js `ReadableStream` responses with the `text/event-stream` content type.

### Server-Side Pattern

```typescript
// API route returns a ReadableStream
return new Response(
  new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      // Heartbeat keepalive prevents proxy/CDN timeouts
      const heartbeat = setInterval(() => send({ type: "heartbeat" }), 15000);

      // Pipeline emits progress events
      await runAutoPipeline(subject, { onProgress: send });

      clearInterval(heartbeat);
      controller.close();
    },
  }),
  { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } }
);
```

### Event Protocol

Events follow a structured JSON format:

```
data: {"stage": "investigating", "message": "Analyzing subject..."}
data: {"stage": "generating", "angle": "scamper", "progress": 0.25}
data: {"stage": "generating", "angle": "scamper", "result": {...}}
data: {"stage": "synthesizing", "message": "Building recommendations..."}
data: {"stage": "complete", "synthesis": {...}}
```

### SSE Endpoints

- `/api/auto` — Full auto pipeline streaming
- `/api/pipeline` — Natural language pipeline streaming

### Heartbeat

A keepalive event is sent every 15 seconds to prevent intermediate proxies, load balancers, and CDNs from closing idle connections.

## Consequences

**Positive:**

- **Progressive UX** — The web app renders each pipeline stage as it completes: investigation results appear immediately, then each angle's ideas stream in, followed by synthesis.
- **Browser-native** — `EventSource` API is supported in all modern browsers with automatic reconnection built in. No client library needed.
- **Serverless-compatible** — SSE works with Vercel's serverless functions and edge runtime. No persistent connections or WebSocket upgrade handshakes required.
- **Simple error handling** — Errors are sent as structured events. The client parses them like any other event.
- **Composable with `ReadableStream`** — The same streaming primitive used by the LLM providers' `generateStream()` methods can pipe directly into SSE output.

**Negative:**

- **Unidirectional only** — The client cannot send additional input after the stream starts (e.g., to cancel a specific angle mid-pipeline). Cancellation is handled via `AbortController` on the HTTP connection.
- **Connection limits** — Browsers enforce a maximum of ~6 concurrent SSE connections per domain. This is acceptable for Innovator's use case (typically 1 stream at a time).
- **No built-in message acknowledgment** — Unlike WebSockets, SSE has no delivery confirmation. If the client disconnects and reconnects, missed events are lost (acceptable for progress updates, which are transient).
- **Proxy compatibility** — Some enterprise proxies buffer SSE responses. The heartbeat mitigates most timeout issues, but buffering proxies may delay event delivery.
