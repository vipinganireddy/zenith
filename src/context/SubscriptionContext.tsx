import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { isOwnerEmail } from '../config/ownerAccounts';
import { toolCountByCategory, TOTAL_TOOLS, countTools } from '../data/toolsData';

// ─── Types ────────────────────────────────────────────────────────────────────
export type PlanId = 'free' | 'pro_monthly' | 'pro_yearly' | 'max_monthly' | 'max_yearly';
export type PlanTier = 'free' | 'pro';
export type AccessResult = 'allowed' | 'free_exhausted' | 'needs_pro';

// ─── Category Access Maps ─────────────────────────────────────────────────────
// FREE tier — basic tools anyone can use
export const FREE_CATEGORIES = new Set([
  'edit', 'convert-to', 'convert-from',
]);

// PRO unlocks every tool category. 'productivity' absorbed the former
// optimize/security/esign/business categories, so it is PRO-accessible too.
export const PRO_CATEGORIES = new Set([
  'ai', 'edit', 'convert-from', 'convert-to', 'organize',
  'scan-media', 'productivity',
]);

export const FREE_USES_LIMIT = 3;

// ─── Plan Definitions ─────────────────────────────────────────────────────────
export interface SubscriptionPlan {
  id: PlanId;
  tier: PlanTier;
  name: string;
  price: number;
  period: string;
  priceDisplay: string;
  features: string[];
  badge?: string;
  color: string;
  highlight?: boolean;
}

export const PLANS: SubscriptionPlan[] = [
  {
    id: 'free',
    tier: 'free',
    name: 'Free',
    price: 0,
    period: 'forever',
    priceDisplay: '₹0',
    color: 'var(--ink-faint)',
    features: [
      '3 free uses in Edit & Convert tools',
      `${countTools(['edit','convert-to','convert-from'])} tools to choose from`,
      'Browser-based — nothing uploaded',
      'No credit card required',
    ],
  },
  {
    id: 'pro_monthly',
    tier: 'pro',
    name: 'PRO',
    price: 29,
    period: 'month',
    priceDisplay: '₹29/month',
    color: 'var(--primary)',
    badge: 'Full Access',
    highlight: true,
    features: [
      `Complete access to all ${TOTAL_TOOLS} tools`,
      `${toolCountByCategory['ai']} AI tools (bring your own key)`,
      `${toolCountByCategory['edit']} PDF editing tools`,
      `${countTools(['convert-to','convert-from'])} convert to/from PDF tools`,
      'Organize, Scan & OCR tools',
      'Productivity',
      'Save to Google Drive',
    ],
  },
  {
    id: 'pro_yearly',
    tier: 'pro',
    name: 'PRO',
    price: 339,
    period: 'year',
    priceDisplay: '₹339/year',
    color: 'var(--primary)',
    badge: 'Full Access',
    highlight: true,
    features: [
      'Everything in PRO Monthly',
      'Complete access to every tool',
      'Save vs monthly billing',
      'Priority support',
    ],
  },
];

// ─── Subscription State ───────────────────────────────────────────────────────
export interface Subscription {
  plan: PlanId;
  activatedAt: string | null;
  expiresAt: string | null;
  autoRenew: boolean;
}

const DEFAULT_SUB: Subscription = {
  plan: 'free',
  activatedAt: null,
  expiresAt: null,
  autoRenew: false,
};

// ─── Storage helpers ──────────────────────────────────────────────────────────
// Subscription + free-use tallies are scoped PER ACCOUNT so that once an account
// buys PRO it stays PRO across logout/login on this device, and never leaks to a
// different account signed in on the same browser. (There is no backend, so this
// does not sync across devices — that would require a server.)
const LEGACY_SUB_KEY = 'zenith_subscription';       // pre-account-scoping global keys,
const LEGACY_FREE_KEY = 'zenith_free_used_tools';   // migrated once into the account.

/** id of the signed-in account, or "guest" when logged out. */
function currentUid(): string {
  try {
    const s = JSON.parse(localStorage.getItem('zenith_session') || 'null');
    return (s && s.id) ? String(s.id) : 'guest';
  } catch { return 'guest'; }
}

const subKey  = (uid: string) => `zenith_subscription__${uid}`;
const freeKey = (uid: string) => `zenith_free_used_tools__${uid}`;

function loadSubscription(uid = currentUid()): Subscription {
  try {
    const scoped = localStorage.getItem(subKey(uid));
    if (scoped) return { ...DEFAULT_SUB, ...JSON.parse(scoped) };
    // One-time migration: a real account adopts any legacy global subscription,
    // then clears it so a second account can't inherit the same plan.
    if (uid !== 'guest') {
      const legacy = localStorage.getItem(LEGACY_SUB_KEY);
      if (legacy) {
        const parsed = { ...DEFAULT_SUB, ...JSON.parse(legacy) };
        localStorage.setItem(subKey(uid), JSON.stringify(parsed));
        localStorage.removeItem(LEGACY_SUB_KEY);
        return parsed;
      }
    }
    return DEFAULT_SUB;
  } catch { return DEFAULT_SUB; }
}

function saveSubscription(sub: Subscription, uid = currentUid()) {
  try { localStorage.setItem(subKey(uid), JSON.stringify(sub)); } catch { /* storage full: kept in memory */ }
}

function loadUsedToolIds(uid = currentUid()): Set<string> {
  try {
    const scopedRaw = localStorage.getItem(freeKey(uid));
    if (scopedRaw) return new Set(JSON.parse(scopedRaw));
    if (uid !== 'guest') {
      const legacy = localStorage.getItem(LEGACY_FREE_KEY);
      if (legacy) {
        const arr = JSON.parse(legacy);
        localStorage.setItem(freeKey(uid), JSON.stringify(arr));
        localStorage.removeItem(LEGACY_FREE_KEY);
        return new Set(arr);
      }
    }
    return new Set();
  } catch { return new Set(); }
}

function saveUsedToolIds(ids: Set<string>, uid = currentUid()) {
  localStorage.setItem(freeKey(uid), JSON.stringify([...ids]));
}

function getPlanTier(plan: PlanId): PlanTier {
  if (plan === 'pro_monthly' || plan === 'pro_yearly') return 'pro';
  if (plan === 'max_monthly' || plan === 'max_yearly') return 'pro'; // retired tier, treat as pro
  return 'free';
}

// ─── Context Type ─────────────────────────────────────────────────────────────
interface SubscriptionContextType {
  subscription: Subscription;
  planTier: PlanTier;
  isFree: boolean;
  isPro: boolean;
  isPaid: boolean;
  isMonthly: boolean;
  isYearly: boolean;
  daysLeft: number | null;
  freeUsesLeft: number;
  freeUsesUsed: number;
  usedToolIds: Set<string>;
  checkAccess: (category: string, toolId?: string) => AccessResult;
  consumeFreeUse: (toolId: string) => void;
  subscribe: (plan: PlanId) => void;
  cancelSubscription: () => void;
  plans: SubscriptionPlan[];
}

// ─── Context ──────────────────────────────────────────────────────────────────
const SubscriptionContext = createContext<SubscriptionContextType | null>(null);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const uid = user?.id ?? 'guest';

  // Initial state already reads the signed-in account synchronously (the session
  // is in localStorage before React mounts), so a paid plan is correct from the
  // very first render — no free flash / false "PRO required" gate on tool pages.
  const [storedSubscription, setSubscription] = useState<Subscription>(loadSubscription);
  const [usedToolIds, setUsedToolIds] = useState<Set<string>>(loadUsedToolIds);

  // Re-load the plan whenever the signed-in account actually changes (login /
  // logout / account switch). Wait until auth has finished restoring so the
  // brief "no user yet" window can't momentarily downgrade a paid account.
  const [loadedUid, setLoadedUid] = useState(uid);
  if (!isLoading && uid !== loadedUid) {
    setLoadedUid(uid);
    setSubscription(loadSubscription(uid));
    setUsedToolIds(loadUsedToolIds(uid));
  }

  useEffect(() => {
    if (isLoading) return;
    // Reconcile with the Drive mirror on every app start. This must NOT be
    // limited to paid accounts: API keys need publishing too, and a browser
    // that never *changed* a key after sync shipped would otherwise never
    // publish anything. syncAccountNow pulls then pushes, so it converges.
    if (uid !== 'guest') {
      void import('../utils/accountSync').then(async m => {
        const status = await m.syncAccountNow(uid);
        // A pull that restored something must re-render the plan immediately.
        if (status.state === 'ok' && status.restoredPlan) setSubscription(loadSubscription(uid));
      });
    }
  }, [uid, isLoading]);

  // Owner accounts (config/ownerAccounts.ts) are always PRO: no expiry, no
  // free-use limits. Derived, not stored — nothing is purchased or synced.
  const isOwner = isOwnerEmail(user?.email);
  const subscription: Subscription = isOwner
    ? { plan: 'pro_yearly', activatedAt: storedSubscription.activatedAt, expiresAt: null, autoRenew: false }
    : storedSubscription;
  const planTier = getPlanTier(subscription.plan);
  const isFree = planTier === 'free';
  const isPro = planTier === 'pro';
  const isPaid = isPro;
  const isMonthly = subscription.plan === 'pro_monthly' || subscription.plan === 'max_monthly';
  const isYearly = subscription.plan === 'pro_yearly' || subscription.plan === 'max_yearly';

  const freeUsesUsed = isFree ? usedToolIds.size : 0;
  const freeUsesLeft = isFree ? Math.max(0, FREE_USES_LIMIT - freeUsesUsed) : FREE_USES_LIMIT;

  // Snapshot of "now" for this session — a day count doesn't need to tick live.
  const [now] = useState(Date.now);
  const daysLeft: number | null = (() => {
    if (!subscription.expiresAt) return null;
    const diff = new Date(subscription.expiresAt).getTime() - now;
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  })();

  // ── Check if a category/tool is accessible ──────────────────────────────────
  const checkAccess = useCallback((category: string, _toolId?: string): AccessResult => {
    if (isPro) return 'allowed';

    // Free user — only FREE_CATEGORIES are accessible, and only
    // FREE_USES_LIMIT total tool uses; once exhausted, everything locks.
    if (!FREE_CATEGORIES.has(category)) return 'needs_pro';
    if (usedToolIds.size >= FREE_USES_LIMIT) return 'free_exhausted';
    return 'allowed';
  }, [isPro, usedToolIds]);

  // ── Consume a free use slot ──────────────────────────────────────────────────
  const consumeFreeUse = useCallback((toolId: string) => {
    if (!isFree) return;
    setUsedToolIds(prev => {
      if (prev.has(toolId)) return prev; // already counted
      const updated = new Set(prev);
      updated.add(toolId);
      saveUsedToolIds(updated);
      return updated;
    });
  }, [isFree]);

  // ── Subscribe ────────────────────────────────────────────────────────────────
  const subscribe = useCallback((plan: PlanId) => {
    const now = new Date();
    let expiresAt: string | null = null;

    if (plan === 'pro_monthly' || plan === 'max_monthly') {
      const exp = new Date(now);
      exp.setMonth(exp.getMonth() + 1);
      expiresAt = exp.toISOString();
    } else if (plan === 'pro_yearly' || plan === 'max_yearly') {
      const exp = new Date(now);
      exp.setFullYear(exp.getFullYear() + 1);
      expiresAt = exp.toISOString();
    }

    const sub: Subscription = {
      plan,
      activatedAt: plan === 'free' ? null : now.toISOString(),
      expiresAt,
      autoRenew: plan !== 'free',
    };
    saveSubscription(sub);
    setSubscription(sub);
    // Mirror the plan to the user's Drive so other browsers/devices see it.
    void import('../utils/accountSync').then(m => m.pushAccountSyncSoon());
  }, []);

  // ── Cancel ───────────────────────────────────────────────────────────────────
  const cancelSubscription = useCallback(() => {
    saveSubscription(DEFAULT_SUB);
    setSubscription(DEFAULT_SUB);
    void import('../utils/accountSync').then(m => m.pushAccountSyncSoon());
  }, []);

  return (
    <SubscriptionContext.Provider value={{
      subscription, planTier, isFree, isPro, isPaid,
      isMonthly, isYearly, daysLeft,
      freeUsesLeft, freeUsesUsed, usedToolIds,
      checkAccess, consumeFreeUse,
      subscribe, cancelSubscription,
      plans: PLANS,
    }}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error('useSubscription must be used inside SubscriptionProvider');
  return ctx;
}
