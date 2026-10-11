import { NextResponse, type NextRequest } from "next/server";
import { defaultLocale, localeFromAcceptLanguage, splitLocale } from "@/lib/i18n";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (splitLocale(pathname).locale) return NextResponse.next();

  const url = request.nextUrl.clone();

  // The front door greets visitors in their own language.
  if (pathname === "/") {
    url.pathname = `/${localeFromAcceptLanguage(request.headers.get("accept-language"))}`;
    const response = NextResponse.redirect(url, 307);
    response.headers.set("Vary", "Accept-Language");
    return response;
  }

  // Any other unprefixed path belongs to the English site.
  url.pathname = `/${defaultLocale}${pathname}`;
  return NextResponse.redirect(url, 308);
}

export const config = {
  // Skip Next internals and anything that looks like a file.
  matcher: ["/((?!_next/|.*\\.[^/]+$).*)"],
};
