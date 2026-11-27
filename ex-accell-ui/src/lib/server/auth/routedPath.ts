/**
 * `event.url.pathname` stays percent-encoded while SvelteKit routes on the decoded path, so
 * `/%61pi/posts` reaches the posts handler and `/api/%64eploy-workflow` reaches the deploy
 * handler. Whatever decides API-ness, exemptions or access from the path must therefore look at
 * the path as the router sees it, or an encoded form slips past it.
 */

/** The path as the router sees it: percent-decoded, with doubled slashes collapsed. A path that cannot be decoded is returned as it was sent. */
export function routedPath(pathname: string): string {
  try {
    return decodeURIComponent(pathname).replace(/\/{2,}/g, '/');
  } catch {
    return pathname;
  }
}

/** The path as it was sent and as the router sees it: both forms a check may need to match. */
export function pathVariants(pathname: string): string[] {
  const routed = routedPath(pathname);
  return routed === pathname ? [pathname] : [pathname, routed];
}
