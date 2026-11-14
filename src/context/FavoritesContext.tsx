import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface FavoriteItem {
  id: string;       // tool path id, e.g. "merge-pdf"
  name: string;     // display name, e.g. "Merge PDF"
  addedAt: string;  // ISO date
}

interface FavoritesContextType {
  favorites: FavoriteItem[];
  isFavorite: (id: string) => boolean;
  addFavorite: (id: string, name: string) => void;
  removeFavorite: (id: string) => void;
  toggleFavorite: (id: string, name: string) => 'added' | 'removed';
}

// ─── Storage ──────────────────────────────────────────────────────────────────
const STORAGE_KEY = 'zenith_favorites';

function loadFavorites(): FavoriteItem[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
}

function saveFavorites(items: FavoriteItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

// ─── Context ──────────────────────────────────────────────────────────────────
const FavoritesContext = createContext<FavoritesContextType | null>(null);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [favorites, setFavoritesState] = useState<FavoriteItem[]>(loadFavorites);
  // Mirror of the latest list, so toggle can answer "added or removed?"
  // synchronously. (Reading it from inside a setState updater does not work:
  // React may run the updater after toggle has already returned.)
  const latest = useRef(favorites);
  const setFavorites = useCallback((next: (prev: FavoriteItem[]) => FavoriteItem[]) => {
    const updated = next(latest.current);
    if (updated === latest.current) return;
    latest.current = updated;
    saveFavorites(updated);
    setFavoritesState(updated);
  }, []);

  const isFavorite = useCallback(
    (id: string) => favorites.some(f => f.id === id),
    [favorites]
  );

  const addFavorite = useCallback((id: string, name: string) => {
    setFavorites(prev => prev.some(f => f.id === id)
      ? prev
      : [...prev, { id, name, addedAt: new Date().toISOString() }]);
  }, [setFavorites]);

  const removeFavorite = useCallback((id: string) => {
    setFavorites(prev => prev.some(f => f.id === id) ? prev.filter(f => f.id !== id) : prev);
  }, [setFavorites]);

  const toggleFavorite = useCallback(
    (id: string, name: string): 'added' | 'removed' => {
      const had = latest.current.some(f => f.id === id);
      if (had) removeFavorite(id); else addFavorite(id, name);
      return had ? 'removed' : 'added';
    },
    [addFavorite, removeFavorite]
  );

  return (
    <FavoritesContext.Provider value={{ favorites, isFavorite, addFavorite, removeFavorite, toggleFavorite }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error('useFavorites must be used inside FavoritesProvider');
  return ctx;
}
