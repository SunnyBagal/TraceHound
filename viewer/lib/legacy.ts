const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/**
 * The viewer lived at "/" until the landing page took it; its links carry ?repo=, ?changes= or
 * ?impact=. The landing page runs this inline, before anything below it is parsed or painted:
 * such a link goes on to /graph with the same query and hash, and the page stays hidden meanwhile.
 * A static export has no server redirects, and location.replace keeps "/" out of the history.
 */
export const LEGACY_QUERY = /[?&](?:repo|changes|impact)=/;

export const LEGACY_REDIRECT_SCRIPT = `(function(){var s=location.search;if(${LEGACY_QUERY}.test(s)){document.documentElement.style.visibility="hidden";location.replace(${JSON.stringify(`${base}/graph`)}+s+location.hash)}})()`;
