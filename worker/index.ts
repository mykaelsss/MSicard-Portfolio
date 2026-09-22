/// <reference types="@cloudflare/workers-types" />
import seed from "../content/content.json";
import { handleContact, type ContactEnv } from "./contact";

export interface Env extends ContactEnv {
  /** R2 bucket holding the live `content.json` and `resume.pdf`. */
  CONTENT: R2Bucket;
  /** Static assets produced by `vite build`. */
  ASSETS: Fetcher;
}

const CONTENT_KEY = "content.json";
const RESUME_KEY = "resume.pdf";

/**
 * Short TTL with a long stale window: an upload goes live within a minute,
 * and a browser that already holds a copy paints it immediately and
 * revalidates behind the paint. This is a client-side policy only. Responses
 * a Worker generates are not stored in Cloudflare's cache, so every cold
 * request still reaches R2.
 */
const CACHE_CONTROL = "public, max-age=60, stale-while-revalidate=600";

function notModified(request: Request, etag: string | undefined): boolean {
  if (!etag) return false;
  const ifNoneMatch = request.headers.get("If-None-Match");
  if (!ifNoneMatch) return false;
  return ifNoneMatch
    .split(",")
    .some((candidate) => candidate.trim().replace(/^W\//, "") === etag);
}

async function serveContent(request: Request, env: Env): Promise<Response> {
  let object: R2ObjectBody | null = null;
  try {
    object = await env.CONTENT?.get(CONTENT_KEY);
  } catch {
    object = null;
  }

  // No bucket, no object, or a transient R2 failure: fall back to the copy
  // bundled at build time so the site always renders something correct.
  if (!object) {
    return Response.json(seed, {
      headers: {
        "Cache-Control": CACHE_CONTROL,
        "X-Content-Source": "bundled",
      },
    });
  }

  const etag = object.httpEtag;
  if (notModified(request, etag)) {
    return new Response(null, {
      status: 304,
      headers: { ETag: etag, "Cache-Control": CACHE_CONTROL },
    });
  }

  const body = await object.text();

  // A malformed upload must not take the site down.
  try {
    JSON.parse(body);
  } catch {
    return Response.json(seed, {
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Source": "bundled-invalid-r2-json",
      },
    });
  }

  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": CACHE_CONTROL,
      ETag: etag,
      "X-Content-Source": "r2",
    },
  });
}

const RESUME_FILENAME = "Mykael-Sicard-Resume.pdf";

function dispositionFor(url: URL): string {
  return url.searchParams.has("download")
    ? `attachment; filename="${RESUME_FILENAME}"`
    : `inline; filename="${RESUME_FILENAME}"`;
}

async function serveResume(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  let object: R2ObjectBody | null = null;
  try {
    object = await env.CONTENT?.get(RESUME_KEY);
  } catch {
    object = null;
  }

  // Fall through to the PDF shipped in `public/` when R2 has nothing. The
  // response is rewrapped rather than returned as-is, so `?download=1` still
  // forces a save on the fallback path.
  if (!object) {
    const asset = await env.ASSETS.fetch(
      new Request(new URL("/resume.pdf", url).toString(), request),
    );
    if (!asset.ok) return asset;

    const headers = new Headers(asset.headers);
    headers.set("Content-Type", "application/pdf");
    headers.set("Content-Disposition", dispositionFor(url));
    headers.set("X-Content-Source", "bundled");
    return new Response(asset.body, {
      status: asset.status,
      statusText: asset.statusText,
      headers,
    });
  }

  const etag = object.httpEtag;
  if (notModified(request, etag)) {
    return new Response(null, {
      status: 304,
      headers: { ETag: etag, "Cache-Control": CACHE_CONTROL },
    });
  }

  return new Response(object.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": dispositionFor(url),
      "Cache-Control": CACHE_CONTROL,
      ETag: etag,
      "X-Content-Source": "r2",
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/content") {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return new Response("Method Not Allowed", { status: 405 });
      }
      return serveContent(request, env);
    }

    if (url.pathname === "/api/contact") {
      return handleContact(request, env, url);
    }

    if (url.pathname === "/resume.pdf") {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return new Response("Method Not Allowed", { status: 405 });
      }
      return serveResume(request, env, url);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
