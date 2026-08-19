import { create } from 'zustand';
import { MediaType, WatchlistItem, WatchlistStatus } from '../types';

/**
 * Identity for a title across both media.
 *
 * TVmaze and TMDB number their catalogues independently, so a bare id is
 * ambiguous - tvmaze 550 and tmdb 550 are different titles entirely. Every
 * membership check goes through this so a film can never shadow a series.
 */
export const titleKey = (
  title: { mediaType?: MediaType | null; tvmazeId?: number | null; tmdbId?: number | null } | null | undefined
): string => {
  if (!title) return '';
  const isMovie = title.mediaType === 'MOVIE' || (!title.tvmazeId && Boolean(title.tmdbId));
  return isMovie ? `movie:${title.tmdbId}` : `tv:${title.tvmazeId}`;
};

export type FilterCategory = 'ALL' | 'WATCHING' | 'FINISHED' | 'PLAN_TO_WATCH' | 'FAVORITES';

/** COMPLETED (series) and WATCHED (films) both mean "done", so one tab covers both. */
export const FINISHED_STATUSES: WatchlistStatus[] = ['COMPLETED', 'WATCHED'];

interface WatchlistState {
  items: WatchlistItem[];
  activeFilter: FilterCategory;
  searchQuery: string;
  setFilter: (filter: FilterCategory) => void;
  setSearchQuery: (query: string) => void;
  setWatchlist: (items: WatchlistItem[]) => void;
  addOrUpdateItem: (item: WatchlistItem) => void;
  removeItem: (id: string) => void;
  isInWatchlist: (key: string) => boolean;
  getWatchlistItemByKey: (key: string) => WatchlistItem | undefined;
}

export const useWatchlistStore = create<WatchlistState>((set, get) => ({
  items: [],
  activeFilter: 'ALL',
  searchQuery: '',

  setFilter: (filter) => set({ activeFilter: filter }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setWatchlist: (items) => set({ items }),

  addOrUpdateItem: (item) => {
    set((state) => {
      const existingIndex = state.items.findIndex(
        (i) => i.id === item.id || (titleKey(i.show) !== '' && titleKey(i.show) === titleKey(item.show))
      );
      if (existingIndex >= 0) {
        const updated = [...state.items];
        updated[existingIndex] = item;
        return { items: updated };
      }
      return { items: [item, ...state.items] };
    });
  },

  removeItem: (id) => {
    set((state) => ({
      items: state.items.filter((i) => i.id !== id && i.showId !== id),
    }));
  },

  isInWatchlist: (key: string) => {
    if (!key) return false;
    return get().items.some((i) => titleKey(i.show) === key);
  },

  getWatchlistItemByKey: (key: string) => {
    if (!key) return undefined;
    return get().items.find((i) => titleKey(i.show) === key);
  },
}));
