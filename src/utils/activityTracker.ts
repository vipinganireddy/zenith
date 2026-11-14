// ─── Tool usage activity tracker ───────────────────────────────────────────────
// Stores recent tool usage in localStorage so DashboardHome can display it.

const RECENT_TOOLS_KEY = 'zenith_recent_tools';
const TOOL_STATS_KEY = 'zenith_tool_stats';
const TIME_SPENT_KEY = 'zenith_time_spent'; // total active seconds spent in the app

export interface RecentTool {
  id: string;
  name: string;
  path: string;
  usedAt: string; // ISO date string
}

export function trackToolUsage(id: string, name: string) {
  try {
    const existing: RecentTool[] = JSON.parse(localStorage.getItem(RECENT_TOOLS_KEY) || '[]');
    const filtered = existing.filter(t => t.id !== id);
    const updated: RecentTool[] = [
      { id, name, path: `/dashboard/tools/${id}`, usedAt: new Date().toISOString() },
      ...filtered,
    ].slice(0, 10);
    localStorage.setItem(RECENT_TOOLS_KEY, JSON.stringify(updated));

    const stats = JSON.parse(localStorage.getItem(TOOL_STATS_KEY) || '{"total":0}');
    stats.total = (stats.total || 0) + 1;
    localStorage.setItem(TOOL_STATS_KEY, JSON.stringify(stats));
  } catch { /* ignore storage errors */ }
}

export function getRecentTools(): RecentTool[] {
  try { return JSON.parse(localStorage.getItem(RECENT_TOOLS_KEY) || '[]'); }
  catch { return []; }
}

export function getTotalUsage(): number {
  try {
    return JSON.parse(localStorage.getItem(TOOL_STATS_KEY) || '{"total":0}').total || 0;
  }
  catch { return 0; }
}

// ─── Active-time tracking ───────────────────────────────────────────────────────
// Real time the user spends in the app (foreground, per browser/account).

export function addActiveSeconds(sec: number) {
  try {
    const cur = parseInt(localStorage.getItem(TIME_SPENT_KEY) || '0', 10) || 0;
    localStorage.setItem(TIME_SPENT_KEY, String(cur + sec));
  } catch { /* ignore */ }
}

export function getTimeSpent(): number {
  try { return parseInt(localStorage.getItem(TIME_SPENT_KEY) || '0', 10) || 0; }
  catch { return 0; }
}

/** Human-readable duration: 45s · 12m · 1.3h */
export function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const mins = Math.floor(totalSeconds / 60);
  if (mins < 60) return `${mins}m`;
  return `${(mins / 60).toFixed(1)}h`;
}
