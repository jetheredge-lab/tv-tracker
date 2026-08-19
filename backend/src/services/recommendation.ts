import prisma from './prisma.js';
import tmdbService from './tmdb.js';
import tvmazeService from './tvmaze.js';
import watchmodeService from './watchmode.js';
import catalogService, { CandidateShow } from './catalog.js';
import { buildTasteProfile, clamp, jaccard, seededUnit, SeedShow, TasteProfile } from './taste.js';
import { RecommendationSection } from '../types/index.js';

type RecShow = RecommendationSection['shows'][number];

interface ScoredCandidate {
  show: CandidateShow;
  score: number;
  reason?: string;
}

interface SectionSpec {
  id: string;
  title: string;
  subtitle?: string;
  kind: string;
  sourceShow?: RecommendationSection['sourceShow'];
  picks: ScoredCandidate[];
}

const SECTION_SIZE = 12;
const SECTION_MIN = 4;
const MAX_SECTIONS = 9;
const CACHE_TTL_MS = 3 * 60 * 60 * 1000;

const cache = new Map<string, { expires: number; sections: RecommendationSection[] }>();

/**
 * Drop a user's cached rows. Called whenever their watchlist changes, so a new
 * add or a dismiss is reflected on the next pull instead of hours later.
 */
export function invalidateUserRecommendations(userId: string) {
  cache.delete(userId);
}

export class RecommendationEngineService {
  async getPersonalizedRecommendations(
    userId: string,
    opts: { refresh?: boolean } = {}
  ): Promise<RecommendationSection[]> {
    const cached = cache.get(userId);
    if (!opts.refresh && cached && cached.expires > Date.now()) {
      return cached.sections;
    }

    await catalogService.ensureLoaded();
    const pool = catalogService.getPool();
    if (pool.length === 0) {
      console.warn('[RecommendationEngine] catalog is empty - run `npm run catalog:sync`');
      return [];
    }

    const [watchlists, dismissed] = await Promise.all([
      prisma.watchlist.findMany({
        where: { userId },
        include: { show: { include: { streamingProviders: true } } },
        orderBy: [{ isFavorite: 'desc' }, { rating: 'desc' }, { updatedAt: 'desc' }],
      }),
      prisma.dismissedRecommendation.findMany({ where: { userId }, include: { show: true } }),
    ]);

    const excludedIds = new Set<number>();
    for (const w of watchlists) excludedIds.add(w.show.tvmazeId);
    for (const d of dismissed) excludedIds.add(d.show.tvmazeId);

    const taste = buildTasteProfile(
      watchlists.map(w => ({
        status: w.status,
        rating: w.rating,
        isFavorite: w.isFavorite,
        show: {
          id: w.show.id,
          tvmazeId: w.show.tvmazeId,
          title: w.show.title,
          genres: w.show.genres || [],
          network: w.show.network,
          premiered: w.show.premiered,
          rating: w.show.rating,
        },
      })),
      id => catalogService.findById(id)
    );

    // Title-level exclusion catches the same show listed under a different
    // TVmaze id (reboots, regional cuts).
    const excludedTitles = new Set(taste.watchedTitles);
    for (const d of dismissed) excludedTitles.add(d.show.title.toLowerCase().trim());

    const dayKey = new Date().toISOString().slice(0, 10);
    const eligible = pool.filter(
      c => !excludedIds.has(c.tvmazeId) && !excludedTitles.has(c.title.toLowerCase().trim())
    );

    // One base score per candidate, reused by every section.
    const baseScores = new Map<number, number>();
    for (const c of eligible) {
      baseScores.set(c.tvmazeId, this.baseScore(c, taste, userId, dayKey));
    }

    const used = new Set<number>();
    const specs: SectionSpec[] = [];

    if (taste.seeds.length > 0) {
      const seeds = this.rotateSeeds(taste.seeds, userId, dayKey);
      for (const seed of seeds) {
        const spec = await this.buildSeedSection(seed, eligible, baseScores, used, watchlists);
        if (spec) specs.push(spec);
      }
    }

    specs.push(...this.buildGenreSections(taste, eligible, baseScores, used));

    const providerSpec = this.buildProviderSection(taste, eligible, baseScores, used);
    if (providerSpec) specs.push(providerSpec);

    specs.push(this.buildNewThisSeasonSection(eligible, baseScores, used));
    specs.push(await this.buildTrendingSection(eligible, baseScores, used, taste));
    specs.push(this.buildHiddenGemsSection(eligible, baseScores, used, taste));
    specs.push(this.buildAcclaimedSection(eligible, baseScores, used, taste));

    const eraSpec = this.buildEraSection(taste, eligible, baseScores, used);
    if (eraSpec) specs.push(eraSpec);

    const kept = specs.filter(s => s && s.picks.length >= SECTION_MIN).slice(0, MAX_SECTIONS);
    const sections = await this.materialize(kept);

    cache.set(userId, { expires: Date.now() + CACHE_TTL_MS, sections });
    return sections;
  }

  /* ---------------------------------------------------------------- scoring */

  /**
   * How well a catalog show fits this user, independent of which row it lands in.
   */
  private baseScore(c: CandidateShow, taste: TasteProfile, userId: string, dayKey: string): number {
    const currentYear = new Date().getUTCFullYear();

    let genreScore = 0;
    for (const g of c.genres) genreScore += taste.genreWeights.get(g) || 0;
    genreScore = genreScore / Math.sqrt(Math.max(c.genres.length, 1));

    const providerScore = c.provider ? taste.providerWeights.get(c.provider) || 0 : 0;

    const quality =
      c.rating !== null ? clamp((c.rating - 6.5) / 2, -0.5, 1) : c.weight >= 85 ? 0.3 : -0.1;

    const popularity = c.weight / 100;

    const recency = c.premieredYear
      ? clamp(1 - (currentYear - c.premieredYear) / 25, 0, 1)
      : 0.3;

    const languageScore = c.language === taste.dominantLanguage ? 0.3 : -0.9;
    const typeScore = c.type && taste.allowedTypes.has(c.type) ? 0.2 : -1.0;

    // Deterministic per-user, per-day nudge: enough to reshuffle the tail of
    // near-ties day to day, not enough to promote a bad match.
    const jitter = seededUnit(userId, dayKey, c.tvmazeId) * 0.5;

    // With no watchlist yet, taste weights are all zero - lean on popularity
    // and quality instead of returning noise.
    const genreLift = taste.positiveCount > 0 ? 3.0 : 0;

    return (
      genreLift * genreScore +
      1.0 * providerScore +
      1.6 * quality +
      1.0 * popularity +
      0.7 * recency +
      languageScore +
      typeScore +
      jitter
    );
  }

  private take(
    candidates: CandidateShow[],
    baseScores: Map<number, number>,
    used: Set<number>,
    opts: {
      filter?: (c: CandidateShow) => boolean;
      boost?: (c: CandidateShow) => number;
      reason?: (c: CandidateShow) => string;
      limit?: number;
    }
  ): ScoredCandidate[] {
    const limit = opts.limit ?? SECTION_SIZE;
    const scored: ScoredCandidate[] = [];

    for (const c of candidates) {
      if (used.has(c.tvmazeId)) continue;
      if (opts.filter && !opts.filter(c)) continue;
      const boost = opts.boost ? opts.boost(c) : 0;
      if (boost === Number.NEGATIVE_INFINITY) continue;
      scored.push({
        show: c,
        score: (baseScores.get(c.tvmazeId) ?? 0) + boost,
        reason: opts.reason?.(c),
      });
    }

    scored.sort((a, b) => b.score - a.score);
    const picks = scored.slice(0, limit);
    for (const p of picks) used.add(p.show.tvmazeId);
    return picks;
  }

  /* --------------------------------------------------------------- sections */

  /**
   * Rotate which liked shows anchor today's rows so the same three seeds do not
   * drive every visit forever.
   */
  private rotateSeeds(seeds: SeedShow[], userId: string, dayKey: string): SeedShow[] {
    const strong = seeds.filter(s => s.weight >= 2.5);
    const eligible = strong.length >= 3 ? strong : seeds;
    return [...eligible]
      .map(s => ({ s, k: seededUnit(userId, dayKey, s.tvmazeId) + Math.min(s.weight, 4) / 8 }))
      .sort((a, b) => b.k - a.k)
      .slice(0, 3)
      .map(x => x.s);
  }

  private async buildSeedSection(
    seed: SeedShow,
    eligible: CandidateShow[],
    baseScores: Map<number, number>,
    used: Set<number>,
    watchlists: Array<{ show: { id: string; tvmazeId: number; title: string } }>
  ): Promise<SectionSpec | null> {
    // TMDB, when a key is configured, contributes an editorial "people who
    // watched this also watched" signal that pure genre overlap cannot.
    const tmdbTitles = await tmdbService.getSimilarTitlesForShow(seed.title, seed.genres);
    const tmdbBoosted = new Map<number, number>();
    tmdbTitles.forEach((title, idx) => {
      const match = catalogService.findByTitle(title);
      if (match) tmdbBoosted.set(match.tvmazeId, 3.5 - Math.min(idx, 15) * 0.1);
    });

    const picks = this.take(eligible, baseScores, used, {
      boost: c => {
        const overlap = jaccard(seed.genres, c.genres);
        const tmdbBoost = tmdbBoosted.get(c.tvmazeId) ?? 0;
        // Require *some* connection: shared genre or an explicit TMDB link.
        if (overlap === 0 && tmdbBoost === 0) return Number.NEGATIVE_INFINITY;
        const sameProvider = seed.provider && c.provider === seed.provider ? 0.5 : 0;
        const eraGap =
          seed.premieredYear && c.premieredYear
            ? clamp(1 - Math.abs(seed.premieredYear - c.premieredYear) / 20, 0, 1) * 0.4
            : 0;
        return 4.0 * overlap + tmdbBoost + sameProvider + eraGap;
      },
      reason: c => {
        if (tmdbBoosted.has(c.tvmazeId)) return `Viewers of ${seed.title} also watch this`;
        const shared = c.genres.filter(g => seed.genres.includes(g));
        return shared.length > 0 ? `Shares ${shared.slice(0, 2).join(' + ')}` : 'Similar tone';
      },
    });

    if (picks.length < SECTION_MIN) return null;

    const source = watchlists.find(w => w.show.tvmazeId === seed.tvmazeId)?.show;

    return {
      id: `rec_because_${seed.tvmazeId}`,
      kind: 'because_you_watched',
      title: `Because you watched ${seed.title}`,
      subtitle: seed.reasonLabel,
      sourceShow: source
        ? { id: source.id, tvmazeId: source.tvmazeId, title: source.title }
        : undefined,
      picks,
    };
  }

  private buildGenreSections(
    taste: TasteProfile,
    eligible: CandidateShow[],
    baseScores: Map<number, number>,
    used: Set<number>
  ): SectionSpec[] {
    const genres = taste.topGenres.slice(0, 3);
    const specs: SectionSpec[] = [];

    for (const genre of genres) {
      const picks = this.take(eligible, baseScores, used, {
        filter: c => c.genres.includes(genre),
        boost: c => (c.rating !== null ? 0.4 : 0),
        reason: () => `More ${genre.toLowerCase()}`,
      });
      if (picks.length >= SECTION_MIN) {
        specs.push({
          id: `rec_genre_${genre.toLowerCase().replace(/\W+/g, '_')}`,
          kind: 'genre',
          title: `More ${genre}`,
          subtitle: `${genre} is one of your most-watched genres`,
          picks,
        });
      }
      if (specs.length >= 2) break;
    }

    return specs;
  }

  private buildProviderSection(
    taste: TasteProfile,
    eligible: CandidateShow[],
    baseScores: Map<number, number>,
    used: Set<number>
  ): SectionSpec | null {
    const provider = taste.topProviders[0];
    if (!provider) return null;

    const picks = this.take(eligible, baseScores, used, {
      filter: c => c.provider === provider,
      reason: () => `On ${provider}`,
    });
    if (picks.length < SECTION_MIN) return null;

    return {
      id: `rec_provider_${provider.toLowerCase().replace(/\W+/g, '_')}`,
      kind: 'provider',
      title: `More from ${provider}`,
      subtitle: 'You already watch several shows here',
      picks,
    };
  }

  private buildNewThisSeasonSection(
    eligible: CandidateShow[],
    baseScores: Map<number, number>,
    used: Set<number>
  ): SectionSpec {
    const cutoff = new Date();
    cutoff.setUTCMonth(cutoff.getUTCMonth() - 9);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    // TVmaze lists announced shows with a future premiere date - they are not
    // recommendations, they are anticipation.
    const todayStr = new Date().toISOString().slice(0, 10);

    const picks = this.take(eligible, baseScores, used, {
      filter: c =>
        !!c.premiered && c.premiered >= cutoffStr && c.premiered <= todayStr && c.status !== 'Ended',
      boost: c => 1.2 + (c.weight >= 80 ? 0.6 : 0),
      reason: c => (c.premieredYear ? `New in ${c.premieredYear}` : 'Newly premiered'),
    });

    return {
      id: 'rec_new_this_season',
      kind: 'new',
      title: 'New this season',
      subtitle: 'Recently premiered and still running',
      picks,
    };
  }

  private async buildTrendingSection(
    eligible: CandidateShow[],
    baseScores: Map<number, number>,
    used: Set<number>,
    taste: TasteProfile
  ): Promise<SectionSpec> {
    const trendingTitles = await tmdbService.getTrendingTitles();
    const trendingRank = new Map<number, number>();
    trendingTitles.forEach((title, idx) => {
      const match = catalogService.findByTitle(title);
      if (match) trendingRank.set(match.tvmazeId, trendingTitles.length - idx);
    });

    const picks = this.take(eligible, baseScores, used, {
      // Without a TMDB key, TVmaze's own popularity weight is the trending signal.
      filter: c => trendingRank.has(c.tvmazeId) || (c.weight >= 90 && c.status !== 'Ended'),
      boost: c => (trendingRank.has(c.tvmazeId) ? 2.5 + trendingRank.get(c.tvmazeId)! / 40 : 0.8),
      reason: () => 'Popular right now',
    });

    const subtitle = taste.topProviders[0]
      ? `What everyone is watching — including on ${taste.topProviders[0]}`
      : 'What everyone is watching';

    return { id: 'rec_trending_week', kind: 'trending', title: 'Trending this week', subtitle, picks };
  }

  private buildHiddenGemsSection(
    eligible: CandidateShow[],
    baseScores: Map<number, number>,
    used: Set<number>,
    taste: TasteProfile
  ): SectionSpec {
    const picks = this.take(eligible, baseScores, used, {
      // Well reviewed but not widely watched - the row a popularity-only
      // recommender can never produce.
      filter: c => c.rating !== null && c.rating >= 7.8 && c.weight <= 80,
      boost: c => 1.0 + (c.rating! - 7.8) * 0.8,
      reason: c => `Rated ${c.rating!.toFixed(1)} but under the radar`,
    });

    return {
      id: 'rec_hidden_gems',
      kind: 'hidden_gems',
      title: 'Hidden gems',
      subtitle:
        taste.topGenres.length > 0
          ? `Highly rated, lightly watched — tuned to your ${taste.topGenres[0].toLowerCase()} taste`
          : 'Highly rated, lightly watched',
      picks,
    };
  }

  private buildAcclaimedSection(
    eligible: CandidateShow[],
    baseScores: Map<number, number>,
    used: Set<number>,
    taste: TasteProfile
  ): SectionSpec {
    const picks = this.take(eligible, baseScores, used, {
      filter: c => c.rating !== null && c.rating >= 8.4,
      boost: c => (c.rating! - 8.4) * 1.5 + 0.5,
      reason: c => `${c.rating!.toFixed(1)} average rating`,
    });

    return {
      id: 'rec_acclaimed',
      kind: 'acclaimed',
      title: 'Critically acclaimed',
      subtitle: taste.positiveCount > 0 ? "The best-rated shows you haven't added" : 'The best-rated shows on TV',
      picks,
    };
  }

  private buildEraSection(
    taste: TasteProfile,
    eligible: CandidateShow[],
    baseScores: Map<number, number>,
    used: Set<number>
  ): SectionSpec | null {
    if (!taste.meanYear) return null;
    const decade = Math.floor(taste.meanYear / 10) * 10;
    // Only worth a row when the user's taste actually skews to an older era.
    if (decade >= new Date().getUTCFullYear() - 9) return null;

    const picks = this.take(eligible, baseScores, used, {
      filter: c => !!c.premieredYear && c.premieredYear >= decade && c.premieredYear < decade + 10,
      boost: () => 0.8,
      reason: c => `From ${c.premieredYear}`,
    });

    if (picks.length < SECTION_MIN) return null;

    return {
      id: `rec_era_${decade}`,
      kind: 'era',
      title: `More from the ${decade}s`,
      subtitle: 'Matches the era you watch most',
      picks,
    };
  }

  /* ----------------------------------------------------------- materialize */

  /**
   * Turn scored catalog rows into API payload: summaries from the catalog,
   * streaming badges from the network heuristics (no per-card API spend).
   */
  private async materialize(specs: SectionSpec[]): Promise<RecommendationSection[]> {
    const ids = [...new Set(specs.flatMap(s => s.picks.map(p => p.show.tvmazeId)))];
    const summaries = await catalogService.getSummaries(ids);

    return specs.map(spec => ({
      id: spec.id,
      title: spec.title,
      subtitle: spec.subtitle,
      kind: spec.kind,
      sourceShow: spec.sourceShow,
      shows: spec.picks.map(pick => this.toRecShow(pick, summaries)),
    }));
  }

  private toRecShow(pick: ScoredCandidate, summaries: Map<number, string>): RecShow {
    const c = pick.show;
    return {
      tvmazeId: c.tvmazeId,
      title: c.title,
      summary: summaries.get(c.tvmazeId) || null,
      posterUrl: c.posterUrl,
      backdropUrl: c.backdropUrl,
      status: c.status || 'Unknown',
      genres: c.genres,
      network: c.provider,
      premiered: c.premiered,
      rating: c.rating,
      reason: pick.reason,
      streamingProviders: watchmodeService.getProvidersFromHeuristics(c.title, c.provider, 'US'),
    };
  }

  /* -------------------------------------------------------------- dismissal */

  async dismissRecommendation(userId: string, tvmazeId?: number, showId?: string) {
    let targetShowId = showId;

    if (!targetShowId && tvmazeId) {
      const show = await tvmazeService.syncShowWithDb(tvmazeId);
      if (show) targetShowId = show.id;
    }

    if (!targetShowId) {
      throw new Error('Either showId or tvmazeId must be provided');
    }

    await prisma.user.upsert({ where: { id: userId }, update: {}, create: { id: userId } });

    const result = await prisma.dismissedRecommendation.upsert({
      where: { userId_showId: { userId, showId: targetShowId } },
      update: {},
      create: { userId, showId: targetShowId },
    });

    invalidateUserRecommendations(userId);
    return result;
  }
}

export const recommendationEngine = new RecommendationEngineService();
export default recommendationEngine;
