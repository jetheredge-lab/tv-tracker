import axios from 'axios';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
export const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

export const POSTER_SIZE = 'w500';
export const BACKDROP_SIZE = 'w1280';

const client = axios.create({ baseURL: TMDB_BASE_URL, timeout: 15000 });

// Read at call time, never at construction. Every module here is imported
// before index.ts runs dotenv.config(), so a field initializer captures an
// empty env and silently disables TMDB forever - which is exactly how the
// original "everything recommends the same five shows" bug happened.
const apiKey = (): string | null => process.env.TMDB_API_KEY?.trim() || null;
const accessToken = (): string | null => process.env.TMDB_ACCESS_TOKEN?.trim() || null;

/** v3 query-param key and v4 bearer token are both accepted; either works. */
export const tmdbIsConfigured = (): boolean => Boolean(apiKey() || accessToken());

export const tmdbGet = async <T>(
  path: string,
  params: Record<string, unknown> = {},
  opts: { timeout?: number } = {}
): Promise<T> => {
  const token = accessToken();
  const res = await client.get<T>(path, {
    // The bearer token authenticates via header; the v3 key rides on the query.
    params: token ? params : { api_key: apiKey(), ...params },
    headers: token
      ? { Authorization: `Bearer ${token}`, Accept: 'application/json' }
      : { Accept: 'application/json' },
    ...(opts.timeout ? { timeout: opts.timeout } : {}),
  });
  return res.data;
};

/** TMDB returns bare paths; the client has to compose the CDN URL itself. */
export const tmdbImage = (path: string | null | undefined, size: string): string | null =>
  path ? `${TMDB_IMAGE_BASE}/${size}${path}` : null;
