import { NextResponse, type NextRequest } from "next/server"
import { evaluateWebProxyAuth } from "./lib/proxy-auth"

/**
 * Next.js proxy - validates bearer token and origin on all non-public routes.
 *
 * When the GSD_WEB_AUTH_TOKEN env var is set at server launch, every request
 * except the minimal public allowlist (`/`, `/_next/*`) must carry a matching
 * `Authorization: Bearer <token>` header or `?_token=` query parameter.
 *
 * If an `Origin` header is present, it must match the configured host origin
 * or an explicit `GSD_WEB_ALLOWED_ORIGINS` entry.
 */
export function proxy(request: NextRequest): NextResponse | undefined {
  const decision = evaluateWebProxyAuth({
    pathname: request.nextUrl.pathname,
    searchParams: request.nextUrl.searchParams,
    headers: request.headers,
  })

  if (decision.kind === "json") {
    return NextResponse.json(decision.body, { status: decision.status })
  }

  return NextResponse.next()
}

export const config = {
  matcher: "/:path*",
}
