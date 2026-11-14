// Strip characters that could be used for XSS or injection attacks
export function sanitizeInput(value: string): string {
  return value
    .replace(/[<>]/g, '')           // no HTML tags
    .replace(/javascript:/gi, '')   // no JS protocol
    .replace(/on\w+=/gi, '')        // no event handlers
    .replace(/['"`;]/g, '')         // no quote injection
    .trim();
}

export function sanitizeEmail(email: string): string {
  return email.toLowerCase().trim().replace(/[^a-z0-9.@_+-]/g, '');
}

export function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z\s\-'.]/g, '').trim().slice(0, 100);
}

// Validate email format
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Validate password strength
export function isStrongPassword(password: string): boolean {
  return password.length >= 8;
}

// Rate limiter: track attempts per key in localStorage
const RATE_KEY = 'zenith_rate_limits';

interface RateEntry {
  count: number;
  firstAt: number;
  lockedUntil?: number;
}

function loadRates(): Record<string, RateEntry> {
  try { return JSON.parse(localStorage.getItem(RATE_KEY) || '{}'); } catch { return {}; }
}

function saveRates(r: Record<string, RateEntry>) {
  localStorage.setItem(RATE_KEY, JSON.stringify(r));
}

export function checkRateLimit(key: string, maxAttempts = 5, windowMs = 15 * 60 * 1000, lockMs = 15 * 60 * 1000): { allowed: boolean; lockedUntil?: number } {
  const rates = loadRates();
  const now = Date.now();
  const entry = rates[key];

  if (entry?.lockedUntil && now < entry.lockedUntil) {
    return { allowed: false, lockedUntil: entry.lockedUntil };
  }

  if (!entry || now - entry.firstAt > windowMs) {
    rates[key] = { count: 1, firstAt: now };
    saveRates(rates);
    return { allowed: true };
  }

  if (entry.count >= maxAttempts) {
    const lockedUntil = now + lockMs;
    rates[key] = { ...entry, lockedUntil };
    saveRates(rates);
    return { allowed: false, lockedUntil };
  }

  rates[key] = { ...entry, count: entry.count + 1 };
  saveRates(rates);
  return { allowed: true };
}

export function clearRateLimit(key: string) {
  const rates = loadRates();
  delete rates[key];
  saveRates(rates);
}
