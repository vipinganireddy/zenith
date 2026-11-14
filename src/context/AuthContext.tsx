import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { checkRateLimit, clearRateLimit } from '../utils/sanitize';
import { findOwner } from '../config/ownerAccounts';
import { clearGDState } from '../utils/googleDrive';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  initials: string;
  createdAt: string;
}

interface StoredUser extends User {
  passwordHash: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string, remember: boolean) => Promise<void>;
  sendOTP: (phone: string) => Promise<string>; // returns OTP for demo display
  verifyOTP: (phone: string, otp: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<string>;
  sendEmailOTP: (email: string) => Promise<string>;
  verifyEmailOTP: (email: string, otp: string) => Promise<void>;
  forgotPassword: (email: string) => Promise<string>;
  resetPassword: (email: string, otp: string, newPassword: string) => Promise<void>;
  loginWithGoogle: (googleUser: { id: string; email: string; name: string; picture?: string }) => Promise<void>;
  logout: () => void;
  updateProfile: (data: Partial<Pick<User, 'name' | 'phone'>>) => void;
}

// ─── Storage helpers ──────────────────────────────────────────────────────────
const USERS_KEY = 'zenith_users';
const SESSION_KEY = 'zenith_session';

const getUsers = (): StoredUser[] => {
  try { return JSON.parse(localStorage.getItem(USERS_KEY) || '[]'); } catch { return []; }
};
const saveUsers = (users: StoredUser[]) => {
  try { localStorage.setItem(USERS_KEY, JSON.stringify(users)); }
  catch { throw new Error('This device is out of storage. Delete some files or chats, then try again.'); }
};

const getSession = (): User | null => {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
};
const saveSession = (user: User | null) => {
  try {
    if (user) localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    else localStorage.removeItem(SESSION_KEY);
  } catch { /* storage full: the session still lives in memory until the app closes */ }
};
/** crypto.randomUUID exists only on secure origins (https, localhost). */
const newId = () => crypto.randomUUID?.() ?? `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

// ─── Password hashing (SHA-256 via Web Crypto) ────────────────────────────────
async function hashPassword(password: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── OTP storage (in-memory, with expiry) ────────────────────────────────────
const otpStore = new Map<string, { code: string; expires: number }>();

function generateOTP(): string {
  const n = new Uint32Array(1);
  crypto.getRandomValues(n);
  return String(100000 + (n[0] % 900000));
}

function storeOTP(key: string): string {
  const code = generateOTP();
  otpStore.set(key, { code, expires: Date.now() + 5 * 60 * 1000 }); // 5 min expiry
  return code;
}

function verifyOTPCode(key: string, code: string): boolean {
  const entry = otpStore.get(key);
  if (!entry) return false;
  if (Date.now() > entry.expires) { otpStore.delete(key); return false; }
  if (entry.code !== code) return false;
  otpStore.delete(key);
  return true;
}

// ─── Pending registrations ────────────────────────────────────────────────────
const pendingRegistrations = new Map<string, { name: string; email: string; passwordHash: string }>();

// ─── Context ──────────────────────────────────────────────────────────────────
const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // The session lives in localStorage, so it can be restored synchronously on
  // the first render — no loading pass, no flash of the signed-out UI.
  const [state, setState] = useState<AuthState>(() => {
    const session = getSession();
    return { user: session, isAuthenticated: !!session, isLoading: false };
  });

  const setUser = (user: User | null) => {
    saveSession(user);
    setState({ user, isAuthenticated: !!user, isLoading: false });
  };

  // ── Email + Password Login ──
  const login = useCallback(async (email: string, password: string, remember: boolean) => {
    const key = `login:${email.toLowerCase()}`;
    const rl = checkRateLimit(key, 5, 15 * 60 * 1000, 15 * 60 * 1000);
    if (!rl.allowed) {
      const mins = Math.ceil(((rl.lockedUntil ?? Date.now()) - Date.now()) / 60000);
      throw new Error(`Too many failed attempts. Try again in ${mins} minute${mins !== 1 ? 's' : ''}.`);
    }
    const users = getUsers();
    let user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    const owner = findOwner(email);
    // Built-in owner account (config/ownerAccounts.ts): created on this device on first sign-in
    if (!user && owner) {
      user = {
        id: owner.id, name: owner.name, email: owner.email,
        initials: owner.name.slice(0, 2).toUpperCase(),
        createdAt: new Date().toISOString(), passwordHash: owner.passwordHash,
      };
      saveUsers([...users, user]);
    }
    if (!user) throw new Error('No account found with this email.');
    const hash = await hashPassword(password);
    // The owner's built-in password always works, even after a local password change
    if (hash !== user.passwordHash && hash !== owner?.passwordHash) throw new Error('Incorrect password.');
    clearRateLimit(key);
    const { passwordHash: _, ...publicUser } = user;
    if (!remember) {
      sessionStorage.setItem('zenith_session_only', '1');
    }
    setUser(publicUser);
  }, []);

  // ── Send OTP to phone ──
  const sendOTP = useCallback(async (phone: string): Promise<string> => {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length < 7) throw new Error('Enter a valid phone number.');
    const code = storeOTP(`phone:${cleaned}`);
    // In a real app this would call a backend to send SMS
    // For demo, we return the code so it can be shown to the user
    return code;
  }, []);

  // ── Verify phone OTP and login ──
  const verifyOTP = useCallback(async (phone: string, otp: string) => {
    const cleaned = phone.replace(/\D/g, '');
    const rl = checkRateLimit(`otp:phone:${cleaned}`, 5, 15 * 60 * 1000, 15 * 60 * 1000);
    if (!rl.allowed) {
      const mins = Math.ceil(((rl.lockedUntil ?? Date.now()) - Date.now()) / 60000);
      throw new Error(`Too many attempts. Try again in ${mins} minute${mins !== 1 ? 's' : ''}.`);
    }
    if (!verifyOTPCode(`phone:${cleaned}`, otp)) throw new Error('Invalid or expired OTP. Try again.');
    clearRateLimit(`otp:phone:${cleaned}`);
    // Find or create a phone-based user
    const users = getUsers();
    let stored = users.find(u => u.phone === cleaned);
    if (!stored) {
      // Auto-create account for phone-only users
      const newUser: StoredUser = {
        id: newId(),
        name: `User ${cleaned.slice(-4)}`,
        email: `${cleaned}@phone.zenith`,
        phone: cleaned,
        initials: 'Z',
        createdAt: new Date().toISOString(),
        passwordHash: '',
      };
      saveUsers([...users, newUser]);
      stored = newUser;
    }
    const { passwordHash: _, ...publicUser } = stored;
    setUser(publicUser);
  }, []);

  // ── Register: step 1 — create pending record + send email OTP ──
  const register = useCallback(async (name: string, email: string, password: string) => {
    const users = getUsers();
    if (findOwner(email) || users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
      throw new Error('An account with this email already exists.');
    }
    const passwordHash = await hashPassword(password);
    pendingRegistrations.set(email.toLowerCase(), { name, email, passwordHash });
    const code = storeOTP(`email_verify:${email.toLowerCase()}`);
    return code; // returned so UI can show it
  }, []);

  // ── Send email OTP (for registration or reset) ──
  const sendEmailOTP = useCallback(async (email: string): Promise<string> => {
    const code = storeOTP(`email_verify:${email.toLowerCase()}`);
    return code;
  }, []);

  // ── Verify email OTP and complete registration ──
  const verifyEmailOTP = useCallback(async (email: string, otp: string) => {
    const key = `otp:email:${email.toLowerCase()}`;
    const rl = checkRateLimit(key, 5, 15 * 60 * 1000, 15 * 60 * 1000);
    if (!rl.allowed) {
      const mins = Math.ceil(((rl.lockedUntil ?? Date.now()) - Date.now()) / 60000);
      throw new Error(`Too many attempts. Try again in ${mins} minute${mins !== 1 ? 's' : ''}.`);
    }
    if (!verifyOTPCode(`email_verify:${email.toLowerCase()}`, otp)) {
      throw new Error('Invalid or expired code. Try again.');
    }
    clearRateLimit(key);
    const pending = pendingRegistrations.get(email.toLowerCase());
    if (!pending) throw new Error('Registration session expired. Please start over.');
    const users = getUsers();
    const initials = pending.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    const newUser: StoredUser = {
      id: newId(),
      name: pending.name,
      email: pending.email,
      initials,
      createdAt: new Date().toISOString(),
      passwordHash: pending.passwordHash,
    };
    saveUsers([...users, newUser]);
    pendingRegistrations.delete(email.toLowerCase());
    const { passwordHash: _, ...publicUser } = newUser;
    setUser(publicUser);
  }, []);

  // ── Forgot password: send OTP ──
  const forgotPassword = useCallback(async (email: string): Promise<string> => {
    const users = getUsers();
    if (!users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
      throw new Error('No account found with this email.');
    }
    return storeOTP(`reset:${email.toLowerCase()}`);
  }, []);

  // ── Reset password ──
  const resetPassword = useCallback(async (email: string, otp: string, newPassword: string) => {
    const key = `otp:reset:${email.toLowerCase()}`;
    const rl = checkRateLimit(key, 5, 15 * 60 * 1000, 15 * 60 * 1000);
    if (!rl.allowed) {
      const mins = Math.ceil(((rl.lockedUntil ?? Date.now()) - Date.now()) / 60000);
      throw new Error(`Too many attempts. Try again in ${mins} minute${mins !== 1 ? 's' : ''}.`);
    }
    if (!verifyOTPCode(`reset:${email.toLowerCase()}`, otp)) {
      throw new Error('Invalid or expired code. Try again.');
    }
    clearRateLimit(key);
    const users = getUsers();
    const idx = users.findIndex(u => u.email.toLowerCase() === email.toLowerCase());
    if (idx < 0) throw new Error('Account not found.');
    users[idx].passwordHash = await hashPassword(newPassword);
    saveUsers(users);
  }, []);

  // ── Google OAuth login / register ──
  const loginWithGoogle = useCallback(async (googleUser: { id: string; email: string; name: string; picture?: string }) => {
    const users = getUsers();
    let stored = users.find(u => u.email.toLowerCase() === googleUser.email.toLowerCase());
    if (!stored) {
      // Auto-create account for new Google users
      const newUser: StoredUser = {
        id: googleUser.id,
        name: googleUser.name,
        email: googleUser.email,
        initials: (googleUser.name || googleUser.email || '?').split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2),
        createdAt: new Date().toISOString(),
        passwordHash: '', // Google users have no password
      };
      saveUsers([...users, newUser]);
      stored = newUser;
    }
    // Restore this account's cloud state (PRO plan, API keys) from the user's
    // Drive BEFORE committing the session, so a second browser wakes up already
    // knowing the plan instead of flashing "free". Bounded — never hangs login.
    const { pullAccountSyncSafe } = await import('../utils/accountSync');
    await pullAccountSyncSafe(stored.id);
    // Update name/initials from Google in case they changed
    const { passwordHash: _, ...publicUser } = stored;
    setUser(publicUser);
  }, []);

  // ── Logout ──
  const logout = useCallback(() => {
    // Drive link and sync-file id aren't per account: drop them so the next
    // person to sign in here can't pull this account's keys or push theirs to its Drive
    clearGDState();
    localStorage.removeItem('zenith_gd_syncfile');
    setUser(null);
    sessionStorage.removeItem('zenith_session_only');
  }, []);

  // ── Update profile ──
  const updateProfile = useCallback((data: Partial<Pick<User, 'name' | 'phone'>>) => {
    setState(prev => {
      if (!prev.user) return prev;
      const updated = { ...prev.user, ...data };
      if (data.name) updated.initials = data.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
      saveSession(updated);
      // Also update in users store
      const users = getUsers();
      const idx = users.findIndex(u => u.id === updated.id);
      if (idx >= 0) { users[idx] = { ...users[idx], ...data }; saveUsers(users); }
      return { ...prev, user: updated };
    });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, sendOTP, verifyOTP, register, sendEmailOTP, verifyEmailOTP, forgotPassword, resetPassword, loginWithGoogle, logout, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
