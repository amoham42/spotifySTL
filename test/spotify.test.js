import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toSpotifyUri } from '../spotify.js';

const ID = '3ylrCkU7BD4N7SNegCRRXY';

test('plain share links', () => {
  assert.equal(toSpotifyUri(`https://open.spotify.com/track/${ID}`), `spotify:track:${ID}`);
  assert.equal(toSpotifyUri(`https://open.spotify.com/album/${ID}`), `spotify:album:${ID}`);
  assert.equal(toSpotifyUri(`https://open.spotify.com/playlist/${ID}`), `spotify:playlist:${ID}`);
});

test('share links with tracking, locale and embed paths', () => {
  assert.equal(toSpotifyUri(`https://open.spotify.com/track/${ID}?si=abc123&context=x`), `spotify:track:${ID}`);
  assert.equal(toSpotifyUri(`https://open.spotify.com/intl-de/track/${ID}`), `spotify:track:${ID}`);
  assert.equal(toSpotifyUri(`https://open.spotify.com/embed/episode/${ID}`), `spotify:episode:${ID}`);
  assert.equal(toSpotifyUri(`  open.spotify.com/show/${ID}  `), `spotify:show:${ID}`);
});

test('spotify: URIs', () => {
  assert.equal(toSpotifyUri(`spotify:artist:${ID}`), `spotify:artist:${ID}`);
});

test('rejects anything else', () => {
  for (const bad of ['', 'hello', `https://example.com/track/${ID}`, `https://open.spotify.com/track/short`,
    `https://open.spotify.com/user/${ID}`, `spotify:track:${ID}x`, 'https://spotify.link/abc', `https://evilspotify.com/track/${ID}`]) {
    assert.equal(toSpotifyUri(bad), null, bad);
  }
});
