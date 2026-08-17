// Local entry point. With "main": "expo-router/entry", the entry resolves to
// the hoisted ../node_modules/expo-router/entry.js, so Metro advertises a
// bundle URL containing "..". HTTP clients (Android/OkHttp, curl) normalize
// that away per RFC 3986 and the request 404s. Keeping the entry inside the
// project root keeps the URL clean.

// NativeWind v4: the compiled stylesheet must load before any screen renders.
import './global.css';

// Restore className on third-party components (see the file for why).
import './nativewind-interop';

import 'expo-router/entry';
