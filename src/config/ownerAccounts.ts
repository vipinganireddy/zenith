/* Built-in owner account(s): always PRO, no expiry, no free-use limits.

   There is no backend, so the account is defined here and created on this
   device the first time it signs in. Only the SHA-256 hash of the password is
   stored — but this file ships to every browser, so treat these credentials as
   public: anyone who reads the bundle can find the email, and a short password
   is trivially recovered from its hash. Plan checks run in the browser anyway
   (see docs/DECISIONS.md), so this grants nothing a determined user couldn't
   already do — but use a long, unique password here. */

export interface OwnerAccount {
  id: string;            // stable uid, so the account's data (plan, keys, files) is keyed the same everywhere
  email: string;
  name: string;
  passwordHash: string;  // SHA-256 hex of the password
}

export const OWNER_ACCOUNTS: OwnerAccount[] = [
  {
    id: 'owner-shadowxbooster',
    email: 'shadowxbooster@gmail.com',
    name: 'ShadowXBooster',
    passwordHash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',
  },
];

export const findOwner = (email?: string | null): OwnerAccount | undefined =>
  email ? OWNER_ACCOUNTS.find(o => o.email.toLowerCase() === email.trim().toLowerCase()) : undefined;

export const isOwnerEmail = (email?: string | null): boolean => !!findOwner(email);
