import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import app from '../src/index.js';
import prisma from '../src/services/prisma.js';

describe('Authentication & Multi-Tenant User System', () => {
  const testEmail = 'auth_tester@tvtracker.app';
  const testPassword = 'SecurePassword123';
  let passwordHash = '';
  let authToken = '';

  beforeAll(async () => {
    passwordHash = await bcrypt.hash(testPassword, 10);
    authToken = jwt.sign(
      { userId: 'usr_test_123', email: testEmail },
      process.env.JWT_SECRET || 'test-jwt-secret-key-1234567890',
      { expiresIn: '30d' }
    );
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user and return a JWT token and user profile', async () => {
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce(null);
      jest.spyOn(prisma.user, 'create').mockResolvedValueOnce({
        id: 'usr_test_123',
        email: testEmail,
        passwordHash,
        name: 'Test User',
        pushToken: null,
        pushAlertsEnabled: true,
        emailAlertsEnabled: true,
        preferredRegion: 'US',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: testEmail,
          password: testPassword,
          name: 'Test User',
          preferredRegion: 'US',
        });

      expect(res.status).toBe(201);
      expect(res.body.token).toBeDefined();
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe(testEmail);
      expect(res.body.user.id).toBe('usr_test_123');
    });

    it('should reject registration if email is already taken', async () => {
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce({
        id: 'usr_existing',
        email: testEmail,
        passwordHash,
      } as any);

      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: testEmail,
          password: testPassword,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('already exists');
    });

    it('should reject registration if password is too short', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'short@tvtracker.app',
          password: '123',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('at least 6 characters');
    });
  });

  describe('POST /api/auth/login', () => {
    it('should successfully log in with valid credentials and return JWT', async () => {
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce({
        id: 'usr_test_123',
        email: testEmail,
        passwordHash,
        name: 'Test User',
        pushToken: null,
        pushAlertsEnabled: true,
        emailAlertsEnabled: true,
        preferredRegion: 'US',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: testEmail,
          password: testPassword,
        });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.email).toBe(testEmail);
    });

    it('should reject login with wrong password', async () => {
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce({
        id: 'usr_test_123',
        email: testEmail,
        passwordHash,
      } as any);

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: testEmail,
          password: 'WrongPassword!',
        });

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Invalid email or password');
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return the authenticated user profile when Bearer token is provided', async () => {
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce({
        id: 'usr_test_123',
        email: testEmail,
        name: 'Test User',
        preferredRegion: 'US',
        pushAlertsEnabled: true,
        emailAlertsEnabled: true,
        pushToken: null,
        _count: {
          watchlists: 3,
          dismissedRecs: 1,
        },
      } as any);

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.user.id).toBe('usr_test_123');
      expect(res.body.user.email).toBe(testEmail);
      expect(res.body.user.stats.watchlistCount).toBe(3);
    });

    it('should reject access when no Bearer token is provided', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
    });
  });
});
