import { create } from 'zustand';
import { WatchlistItem, WatchlistStatus } from '../types';

export type FilterCategory = 'ALL' | 'WATCHING' | 'COMPLETED' | 'PLAN_TO_WATCH' | 'FAVORITES';

interface WatchlistState {
  items: WatchlistItem[];
  activeFilter: FilterCategory;
  searchQuery: string;
  setFilter: (filter: FilterCategory) => void;
  setSearchQuery: (query: string) => void;
  setWatchlist: (items: WatchlistItem[]) => void;
  addOrUpdateItem: (item: WatchlistItem) => void;
  removeItem: (id: string) => void;
  isInWatchlist: (tvmazeId: number) => boolean;
  getWatchlistItemByTvmazeId: (tvmazeId: number) => WatchlistItem | undefined;
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
        (i) => i.id === item.id || i.show?.tvmazeId === item.show?.tvmazeId
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

  isInWatchlist: (tvmazeId: number) => {
    return get().items.some((i) => i.show?.tvmazeId === tvmazeId);
  },

  getWatchlistItemByTvmazeId: (tvmazeId: number) => {
    return get().items.find((i) => i.show?.tvmazeId === tvmazeId);
  },
}));
