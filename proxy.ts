import { NextResponse, type NextRequest } from "next/server";
import { LANG_HEADER, defaultLocale, localeFromAcceptLanguage, splitLocale } from "@/lib/i18n";
import { routeFor } from "@/lib/routes";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const url = request.nextUrl.clone();

  const { locale } = splitLocale(pathname);
  if (locale) {
    // The language travels with the request, so a wrong turn is answered in it.
    const headers = new Headers(request.headers);
    headers.set(LANG_HEADER, locale);
    // Polish addresses are Polish words; the pages behind them keep one name.
    const route = routeFor(pathname);
    if (!route) return NextResponse.next({ request: { headers } });
    if ("rewrite" in route) {
      url.pathname = route.rewrite;
      return NextResponse.rewrite(url, { request: { headers } });
    }
    url.pathname = route.redirect;
    return NextResponse.redirect(url, 308);
  }

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
