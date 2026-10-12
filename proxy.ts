import { NextResponse, type NextRequest } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { publicEnv } from "@/lib/env"

// Routes anyone can open without a session.
const PUBLIC_PATHS = ["/sign-in", "/auth/confirm", "/api/events", "/offline"]

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/** Refreshes the Supabase session cookie and gates app routes behind sign in. */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value)
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options)
      },
    },
  })

  // Do not run code between createServerClient and getClaims: it can make
  // users randomly signed out when the session refresh races.
  const { data } = await supabase.auth.getClaims()
  const signedIn = Boolean(data?.claims)
  const { pathname } = request.nextUrl

  if (!signedIn && !isPublic(pathname)) {
    return redirectKeepingCookies(request, response, "/sign-in")
  }
  if (signedIn && pathname === "/sign-in") {
    return redirectKeepingCookies(request, response, "/today")
  }

  return response
}

function redirectKeepingCookies(request: NextRequest, from: NextResponse, path: string) {
  const url = request.nextUrl.clone()
  url.pathname = path
  url.search = ""
  const redirect = NextResponse.redirect(url)
  for (const cookie of from.cookies.getAll()) redirect.cookies.set(cookie)
  return redirect
}

export const config = {
  matcher: [
    // Everything except static assets, the service worker, manifest and icons.
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|pwa-icon|.*\\.(?:png|svg|ico|webp)$).*)",
  ],
}
