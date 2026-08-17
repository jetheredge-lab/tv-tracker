import jwt from 'jsonwebtoken';

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
