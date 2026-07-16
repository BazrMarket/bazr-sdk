/**
 * A real HTTP server for the tests.
 *
 * The client is exercised over an actual socket, not by calling its internals.
 * Serialisation bugs (a query string that never gets appended, a POST body that
 * never gets encoded) only show up on the wire.
 */

import http from "node:http";
import type { AddressInfo } from "node:net";

export interface RecordedRequest {
  method: string;
  url: string;
  path: string;
  query: URLSearchParams;
  headers: http.IncomingHttpHeaders;
  body: string;
}

export interface MockReply {
  status?: number;
  headers?: Record<string, string>;
  /** Objects are JSON-encoded; strings are sent verbatim (for malformed-body tests). */
  body?: unknown;
  delayMs?: number;
}

export type MockHandler = (req: RecordedRequest, callIndex: number) => MockReply;

export interface MockServer {
  baseUrl: string;
  port: number;
  requests: RecordedRequest[];
  close(): Promise<void>;
}

export async function startMockServer(handler: MockHandler): Promise<MockServer> {
  const requests: RecordedRequest[] = [];

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const rawUrl = req.url ?? "/";
      const parsed = new URL(rawUrl, "http://localhost");
      const recorded: RecordedRequest = {
        method: req.method ?? "GET",
        url: rawUrl,
        path: parsed.pathname,
        query: parsed.searchParams,
        headers: req.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      };
      const callIndex = requests.length;
      requests.push(recorded);

      let reply: MockReply;
      try {
        reply = handler(recorded, callIndex);
      } catch (err) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { code: "handler_threw", message: String(err) } }));
        return;
      }

      const send = (): void => {
        const status = reply.status ?? 200;
        const headers: Record<string, string> = {
          "content-type": "application/json",
          ...reply.headers,
        };
        const body =
          reply.body === undefined
            ? ""
            : typeof reply.body === "string"
              ? reply.body
              : JSON.stringify(reply.body);
        res.writeHead(status, headers);
        res.end(body);
      };

      if (reply.delayMs && reply.delayMs > 0) setTimeout(send, reply.delayMs);
      else send();
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    port,
    requests,
    async close() {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

/** A port nothing is listening on, for connection-refused tests. */
export async function findClosedPort(): Promise<number> {
  const server = await startMockServer(() => ({ body: {} }));
  const { port } = server;
  await server.close();
  return port;
}

/** Records every backoff the client asks for, without actually waiting. */
export function recordingSleep(): { delays: number[]; sleep: (ms: number) => Promise<void> } {
  const delays: number[] = [];
  return {
    delays,
    sleep: (ms: number) => {
      delays.push(ms);
      return Promise.resolve();
    },
  };
}
