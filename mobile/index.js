// Local entry point. Without this, "main": "expo-router/entry" resolves to the
// hoisted ../node_modules/expo-router/entry.js, so Metro advertises a bundle
// URL containing "..". HTTP clients (Android/OkHttp, curl) normalize that away
// per RFC 3986, and the request 404s. Keeping the entry inside the project root
// keeps the URL clean.
import "expo-router/entry";
