#!/usr/bin/env node
/**
 * Inject the home-screen tags Expo's web export leaves out.
 *
 * Expo builds index.html from its own template plus the `web` block in
 * app.json, which covers the title, description, theme colour and favicon but
 * nothing else. `app/+html.tsx` would be the idiomatic place for the rest, but
 * it only applies to STATIC rendering - this app exports as an SPA, where the
 * file is silently ignored.
 *
 * Without these tags "Add to Home Screen" saves a screenshot of the page
 * instead of the icon: iOS needs apple-touch-icon, Android needs the manifest.
 *
 * Run as part of `npm run web:build` so it cannot be forgotten.
 */
import { readFileSync, writeFileSync } from 'fs';

const file = process.argv[2];
if (!file) {
  console.error('usage: inject-web-head.mjs <path/to/index.html>');
  process.exit(1);
}

const TAGS = `
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
    <link rel="manifest" href="/manifest.json" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="CueList" />
`;

let html = readFileSync(file, 'utf8');

if (html.includes('apple-touch-icon')) {
  console.log('[inject-web-head] already present, nothing to do');
  process.exit(0);
}
if (!html.includes('</head>')) {
  console.error('[inject-web-head] no </head> found - export format changed, refusing to guess');
  process.exit(1);
}

html = html.replace('</head>', `${TAGS}  </head>`);
writeFileSync(file, html);
console.log('[inject-web-head] apple-touch-icon, manifest and web-app meta injected');
