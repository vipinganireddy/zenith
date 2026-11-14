import { useSyncExternalStore } from 'react';
import { pwaStore } from '../utils/pwa';

/** Install/update state of the app (see utils/pwa.ts). */
export const usePwa = () => useSyncExternalStore(pwaStore.subscribe, pwaStore.get, pwaStore.get);
