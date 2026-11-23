// Spotify link parsing, kept free of browser APIs so it can be unit-tested in Node.

const KINDS = 'track|album|playlist|artist|episode|show';

/** Accepts open.spotify.com links (with ?si=…, /intl-xx/, /embed/) and spotify: URIs. */
export function toSpotifyUri(input) {
  const text = input.trim();
  let m = text.match(new RegExp(`^spotify:(${KINDS}):([A-Za-z0-9]{22})$`));
  if (m) return `spotify:${m[1]}:${m[2]}`;
  try {
    const url = new URL(text.startsWith('http') ? text : `https://${text}`);
    if (!/(^|\.)spotify\.com$/.test(url.hostname)) return null;
    m = url.pathname.match(new RegExp(`/(${KINDS})/([A-Za-z0-9]{22})(?:/|$)`));
    return m ? `spotify:${m[1]}:${m[2]}` : null;
  } catch {
    return null;
  }
}
