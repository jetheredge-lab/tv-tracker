import jwt from 'jsonwebtoken';
import { timingSafeEqual } from 'crypto';

/**
 * Fail fast instead of falling back to a hardcoded default.
 *
 * Both authController and the auth middleware previously defaulted to
 * 'tvtracker-jwt-secret-key-default' when JWT_SECRET was unset. That value is
 * public in the source, so a misconfigured deploy would keep serving happily
 * while signing tokens anyone could forge. Refusing to boot is the safer
 * failure: it is loud, immediate, and impossible to miss.
 */
const secret = process.env.JWT_SECRET;

if (!secret || secret.trim().length < 16) {
  throw new Error(
    'JWT_SECRET is missing or shorter than 16 characters. Refusing to start - ' +
      'without a strong secret the server would issue forgeable auth tokens.'
  );
}

export const JWT_SECRET: string = secret;
export const JWT_EXPIRES_IN: string = process.env.JWT_EXPIRES_IN || '30d';

export interface TokenPayload {
  userId: string;
  email?: string | null;
}

export const signUserToken = (userId: string, email?: string | null): string =>
  jwt.sign(
    { userId, ...(email ? { email } : {}) },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions
  );

/**
 * Gate on ACCOUNT CREATION, not on sign-in.
 *
 * Anyone who finds the hostname could previously provision themselves an
 * account just by loading the page - /api/users/sync creates the row, and it
 * has to be unauthenticated because that is how a device bootstraps. Requiring
 * a signup form would not have changed that: registration is open, so a form
 * is a speed bump, not a gate. A shared invite code is the actual gate.
 *
 * Unset means the instance is open, which is right for a local dev database
 * and wrong for a public hostname.
 */
export const INVITE_CODE: string | null = process.env.SIGNUP_INVITE_CODE?.trim() || null;

export const inviteRequired = (): boolean => INVITE_CODE !== null;

/**
 * Constant-time compare so the code cannot be recovered a character at a time.
 * timingSafeEqual throws on a length mismatch, hence the explicit length check
 * (which leaks only the length, not the content).
 */
export const inviteCodeAccepted = (supplied: unknown): boolean => {
  if (!INVITE_CODE) return true;
  if (typeof supplied !== 'string') return false;
  const a = Buffer.from(supplied.trim(), 'utf8');
  const b = Buffer.from(INVITE_CODE, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
};

/** The one shape every invite rejection uses, so clients can branch on `code`. */
export const INVITE_REJECTION = {
  error: 'Invite required',
  code: 'invite_required',
  message: 'This CueList instance is invite-only. Enter your access code to continue.',
} as const;
