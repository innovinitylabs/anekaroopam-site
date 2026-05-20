import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const { pathname } = request.nextUrl;

  if (host.startsWith("perceive.")) {
    if (pathname.startsWith("/perceive")) {
      return NextResponse.next();
    }
    const url = request.nextUrl.clone();
    url.pathname = `/perceive${pathname === "/" ? "" : pathname}`;
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|valipokkann|artworks).*)",
  ],
};
