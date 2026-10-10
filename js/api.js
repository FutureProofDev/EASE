/* =====================================================================
   api.js: the ONLY file that calls fetch().
   If the backend moves or its response shape changes, this is the one
   file you edit. Everything else just calls these named functions.
   ===================================================================== */

// RELATIVE path on purpose. fetch() resolves it against the PAGE's URL
// (index.html), not against this file, so the project works under any
// folder name (/ease/, /senior-guide/) and on any host.
const API_BASE = 'api/';

/**
 * One wrapper for every request. It turns all the ways a request can fail
 * (no network, server crash, bad JSON, {ok:false}) into ONE thing: an Error
 * with a plain-English message that the UI can show directly to the user.
 */
async function request(path, options) {
  let response;
  try {
    response = await fetch(API_BASE + path, options);
  } catch {
    // fetch() only rejects on network failure, not on HTTP errors.
    throw new Error('Cannot reach the server. Please check your connection and try again.');
  }

  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error('The server sent a reply we could not read.');
  }

  // Matches the PHP contract: { ok: true, data } or { ok: false, error }.
  if (!response.ok || !body.ok) {
    throw new Error(body.error || 'Something went wrong. Please try again.');
  }
  return body.data;
}

export const getServices = ()     => request('services.php');
export const getGuide    = (slug) => request(`steps.php?service=${encodeURIComponent(slug)}`);
export const getTariffs  = (slug) => request(`tariffs.php?service=${encodeURIComponent(slug)}`);