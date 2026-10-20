import { NextResponse } from "next/server"

/**
 * A same-origin redirect with a relative Location. Route handlers see the
 * server's own host in request.url and nextUrl (localhost behind 127.0.0.1),
 * and a redirect there loses the session cookie and fails the router's RSC
 * fetch; a relative Location always stays on the origin the browser used.
 */
export function redirectTo(pathWithQuery: string): NextResponse {
  return new NextResponse(null, { status: 307, headers: { Location: pathWithQuery } })
}
