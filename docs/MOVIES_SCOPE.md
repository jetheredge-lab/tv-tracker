# Movies in TV Tracker — scope

**Status:** approved, phase 1 in progress. Written 2026-08-19.
**Goal:** movies as first-class citizens beside shows in a single unified watchlist, with
streaming availability that *informs* recommendations without ever gating them.

---

## Verified before writing this (2026-08-19)

Everything below rests on TMDB, so it was checked against the live API with the key already in
`backend/.env` (v3, 32 chars, returns 200) rather than assumed:

| What | Result |
|---|---|
| `/watch/providers/movie?watch_region=US` | 292 providers — enough to build a real subscriptions picker |
| `/movie/550/watch/providers` | Fight Club: `buy` + `rent` only, **no** flatrate |
| `/discover/movie?with_watch_providers=8&watch_region=US` | 4,675 Netflix US titles — platform filtering works server-side |
| `files.tmdb.org/p/exports/movie_ids_08_18_2026.json.gz` | HTTP 200, 27.5 MB gzipped |

Fight Club is the useful case: a well-known film on **no** subscription service anywhere. Any
design that hides what you cannot stream would simply lose it.

**TVmaze is television-only.** There is no movie index, so the free `weight` popularity signal
that makes the current recommender work without an API key has no movie equivalent. TMDB
therefore changes from optional enrichment into a hard dependency: no key, no movies. That is a
real shift from today's behaviour, where an absent key degrades quietly.

---

## Principle: subscriptions are a lens, never a gate

A recommendation is never hidden, reordered out of view, or filtered away because of where it
streams. Availability is *presentation plus a nudge*.

**Badge states**

| Situation | Rendering |
|---|---|
| Subscriptions **not set** | Every badge full colour, exactly as today. An unset preference must never make the app look broken or half-disabled |
| Set, and you have the service | Full colour — "Included with Netflix" |
| Set, and you do not | Greyed / outline treatment, still visible and still tappable — "Not in your plans" |
| Rent or buy only (Fight Club) | Neutral treatment with the price context — never greyed, because no subscription would ever light it up |

**Ranking:** services you own contribute a scoring *boost*, never a filter. This reuses the
existing soft-preference mechanism — `providerWeights` in `taste.ts` already nudges by provider
affinity inferred from your watchlist, and a declared subscription is simply a stronger, more
honest version of the same signal. A great film you cannot stream still outranks a mediocre one
you can.

The one place filtering is legitimate is an explicit, user-driven row — "Included with your
subscriptions" — where restriction is the stated purpose and the user chose it.

---

## Schema

**Decision: keep the model named `Show` and add a discriminator.** Renaming to `Title` would
touch 85 backend and 36 mobile references for no functional gain. The name becomes slightly
inaccurate; that is cheaper than the churn, and reversible later.

```
Show
  + mediaType   MediaType @default(TV)     // TV | MOVIE
  ~ tvmazeId    Int?  @unique              // now nullable — movies have none
    tmdbId      Int?  @unique              // already present; becomes the movie key
    status      String                     // TV: Running/Ended. Movies: Released/Post Production
    network     String?                    // TV only; null for movies
  + runtime     Int?                       // movies need it; TV has it per-episode
  + releaseDate DateTime?                  // theatrical; `premiered` stays the TV field
```

Postgres permits many NULLs in a `@unique` column, so nullable `tvmazeId` is safe.

`Watchlist`, `DismissedRecommendation` and `StreamingProvider` all key off `Show.id` and need
**no changes** — that is what makes the unified watchlist cheap.

**New tables**

```
CatalogMovie      // mirrors catalog_shows: the scoring pool, tmdbId PK,
                  // popularity + vote_average + genres + releaseDate + posterUrl

UserSubscription  // userId, providerId, providerName, region
                  // absent rows == "not told us", which is NOT the same as "owns nothing"

TitleAvailability // showId, region, providerId, providerName, offerType (flatrate|rent|buy),
                  // deepLink, refreshedAt  — replaces the network→provider heuristic for
                  // movies, and is a genuine upgrade for TV later
```

The distinction between "no subscriptions recorded" and "subscribes to nothing" has to be
explicit in code, not inferred from an empty list, or the unset case silently becomes the
greyed-out case.

---

## Data pipeline

The TV catalog syncs by walking TVmaze's paginated index. Movies work differently:

1. **Weekly sweep.** The daily export dump gives every movie id plus popularity for 27.5 MB —
   ideal for knowing *what exists*, but it carries no genres, poster or rating.
2. **Hydration via `/discover/movie`, not per-id lookups.** Discover returns full details
   inline, 20 per page, so a paginated sweep builds the pool in a fraction of the calls that
   hydrating ~40k ids individually would take. TMDB caps any single discover query at **500
   pages (10,000 results)**, so the sweep has to be banded — by release year, or by popularity
   range — and the bands unioned.
3. **Pool filter** mirroring the TV side's `POOL_MIN_WEIGHT` / `POOL_MIN_RATING`: enough to keep
   the long tail of untranslated regional releases out of a genre row.
4. **Availability refresh** on its own, faster cadence. Films move between services constantly,
   which TV barely does — and that windowing is what makes "leaving Netflix soon" possible
   later.

---

## Recommender

The scoring core survives. `baseScore` runs on genres, provider affinity, rating, popularity,
recency and language — every one has a movie equivalent. What needs work:

- **Genre vocabulary does not match.** TVmaze says `Science-Fiction`; TMDB says
  `Science Fiction` (id 878). Without a normalisation map, a user who loves sci-fi television
  gets no sci-fi films, and the unified watchlist quietly fails at the one thing it exists for.
  Small map, high consequence.
- **TV-only gates come out:** `status !== 'Ended'` and the `allowedTypes` check are meaningless
  for movies.
- **Sections need movie shapes.** "New this season / still running" has no analogue. Movie rows:
  *In theatres now*, *New on streaming*, *Because you watched …*, *Included with your
  subscriptions*, *Leaving soon* (once availability history exists).
- **Cross-media seeding is the payoff.** `taste.ts` builds seeds from the watchlist; once both
  media share a table, a film can seed a series recommendation and vice versa. This is the
  argument for unified over separate, and it comes almost free.

---

## Mobile

- `StreamingBadge` grows the four states above. It already renders brand-coloured text pills
  with no logo (the watchmode image host is dead), so greying is a colour-token change.
- Subscriptions picker in Settings, seeded from the 292-provider list, region-aware.
- Movie detail route: no seasons, no episode list; runtime, release date, cast.
- Watchlist status semantics: `WATCHING`/`COMPLETED`/`PLAN_TO_WATCH` fit a series. A film is
  watched or it is not — see open decisions.
- Search and Explore gain a media-type filter, defaulting to both.

---

## Calendar and notifications

`ics.ts`, `scheduler.ts` and `notification.ts` (~400 lines) are entirely episode-driven; the
nightly job walks `episodes` looking for today's airdates. Movies have a release date instead —
and two of them (theatrical, then streaming), which TMDB exposes via
`/movie/{id}/release_dates` per region and type. This is a parallel path, not a tweak, and it is
the least valuable part of the work. Deferred to last.

---

## Phasing

| Phase | Deliverable | Rough size |
|---|---|---|
| **1** | Movies exist: `mediaType` migration, `CatalogMovie` sync, movie search + detail, unified watchlist add/remove | Largest. The migration touches many call sites but almost none of them think hard |
| **2** | Subscriptions: picker, `UserSubscription`, badge states, availability for movies. Retrofit TV badges to real data | Small, and it improves what already ships |
| **3** | Movie recommendations: genre normalisation, movie sections, subscription boost, cross-media seeding | Medium |
| **4** | Release calendar + ICS + notifications for movies | Optional polish |

Phases 1–3 carry the value. Each ends somewhere demonstrable: after 1 you can add a film to your
watchlist; after 2 the badges tell you where to watch it; after 3 the app recommends films.

---

## Settled decisions

1. **Films get their own `WATCHED` status** (operator call). `COMPLETED` describes finishing a
   run of episodes and reads wrong for a single sitting. Added to `WatchlistStatus`; the filter
   UI has to grow it.
2. **`Show` keeps its name.** Confirmed — renaming to `Title` would touch ~120 references for no
   functional gain.
3. **The genre vocabularies must match** (operator call — not optional). Implemented in
   `services/genres.ts`: TVmaze's vocabulary is canonical because ~89k `catalog_shows` rows
   already carry it, so mapping TMDB onto it rewrites nothing. Verified against the live TMDB
   genre list — all 19 movie genres accounted for, `Science Fiction` → `Science-Fiction`,
   `TV Movie` dropped as a distribution channel rather than a taste. `Animation` is deliberately
   NOT folded into `Anime`.
4. **Pool depth** (default taken): mirror the TV thresholds in spirit — a popularity/vote floor
   rather than a fixed count, tuned once the first sweep shows the distribution.
5. **Subscriptions are region-scoped** (default taken): `UserSubscription` carries `region`,
   because the same service ships different catalogues per country and `preferredRegion` already
   exists. Cheap now, expensive to retrofit.
6. **JustWatch attribution** (default taken): required wherever provider data renders. Not
   optional under TMDB's terms.

## Still open

1. **Exact pool thresholds**, once the first catalog sweep reveals the popularity distribution.
2. **Whether `WATCHED` should also apply to TV** (a limited series is arguably watched, not
   completed). Left alone for now — no migration of existing rows.
