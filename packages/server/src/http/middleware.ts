import { getSession } from "../auth/service.js";

export type HttpRequest = {
  headers: Record<string, string | string[] | undefined>;
  method: string;
  path: string;
  body?: Record<string, unknown>;
  params: Record<string, string>;
  header(name: string): string | undefined;
  on(event: string, listener: (...args: any[]) => void): void;
  destroy(): void;
};

export type HttpResponse = {
  clearCookie(name: string, options?: Record<string, unknown>): HttpResponse;
  cookie(name: string, value: string, options?: Record<string, unknown>): HttpResponse;
  setHeader(name: string, value: string): void;
  status(code: number): HttpResponse;
  json(body: unknown): void;
  send(body: Buffer): void;
  sendStatus(code: number): void;
};

export type Next = () => void;

export function sessionFromCookie(header: string | undefined) {
  return header?.split(";").map((part) => part.trim()).find((part) => part.startsWith("gv_session="))?.slice("gv_session=".length);
}

export async function requestSession(request: HttpRequest) {
  return getSession(sessionFromCookie(request.header("cookie")));
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Request could not be completed.";
}

export function originGuard(clientOrigins: ReadonlySet<string>, protectedPaths: readonly string[], allowedMethods: readonly string[]) {
  const methods = allowedMethods.join(", ");
  return (request: HttpRequest, response: HttpResponse, next: Next) => {
    const rawOrigin = request.headers.origin;
    const origin = Array.isArray(rawOrigin) ? rawOrigin[0] : rawOrigin;
    const protectedPath = protectedPaths.some((path) => request.path.startsWith(path));
    if (protectedPath && request.method !== "GET" && origin && !clientOrigins.has(origin)) {
      response.status(403).json({ error: "Origin is not allowed." });
      return;
    }
    if (origin && clientOrigins.has(origin) && protectedPath) {
      response.setHeader("Access-Control-Allow-Origin", origin);
      response.setHeader("Vary", "Origin");
      response.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Model-Name");
      response.setHeader("Access-Control-Allow-Methods", methods);
      response.setHeader("Access-Control-Allow-Credentials", "true");
    }
    if (request.method === "OPTIONS") {
      response.sendStatus(origin && clientOrigins.has(origin) ? 204 : 403);
      return;
    }
    next();
  };
}

export function jsonBodyParser(options: {
  methods?: readonly string[];
  maxBytes?: number | ((request: HttpRequest) => number);
  skip?: (request: HttpRequest) => boolean;
} = {}) {
  const methods = new Set(options.methods ?? ["POST"]);
  return (request: HttpRequest, response: HttpResponse, next: Next) => {
    if (!methods.has(request.method) || options.skip?.(request)) { next(); return; }
    const maxBytes = typeof options.maxBytes === "function" ? options.maxBytes(request) : options.maxBytes ?? 8_192;
    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size <= maxBytes) chunks.push(chunk);
      else tooLarge = true;
    });
    request.on("end", () => {
      if (tooLarge) { response.status(413).json({ error: "Request is too large." }); return; }
      try {
        request.body = size === 0 ? {} : JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
        next();
      } catch { response.status(400).json({ error: "Request body must be valid JSON." }); }
    });
    request.on("error", () => response.status(400).json({ error: "Could not read request body." }));
  };
}
