import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/config/db.js';

describe('End-to-End Auth & Habit CRUD Integration', () => {
  const testEmail = `test-integration-${Date.now()}@example.com`;
  const testPassword = 'password123';
  let accessToken = '';
  let habitId = '';

  afterAll(async () => {
    // Clean up our integration test user and all cascade relations (habits, logs, settings, tokens)
    try {
      await prisma.user.deleteMany({
        where: {
          email: testEmail,
        },
      });
    } catch (error) {
      console.error('Clean up failed:', error);
    }
  });

  describe('Authentication Endpoints', () => {
    it('should successfully register a new user', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: testEmail,
          password: testPassword,
          timezone: 'America/New_York',
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.user.email).toBe(testEmail);
      expect(res.body.data.user.timezone).toBe('America/New_York');

      accessToken = res.body.data.accessToken;
    });

    it('should reject registration of duplicate emails', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: testEmail,
          password: testPassword,
          timezone: 'America/New_York',
        });

      expect(res.status).toBe(409);
      expect(res.body.status).toBe('error');
      expect(res.body.message).toContain('already in use');
    });

    it('should successfully log in and return a new access token', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: testEmail,
          password: testPassword,
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.user.email).toBe(testEmail);
    });

    it('should reject login with wrong credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: testEmail,
          password: 'wrongpassword',
        });

      expect(res.status).toBe(401);
      expect(res.body.status).toBe('error');
    });
  });

  describe('Habits CRUD Endpoints', () => {
    it('should reject habit listing without authentication', async () => {
      const res = await request(app).get('/api/habits');
      expect(res.status).toBe(401);
    });

    it('should create a new habit for authenticated user', async () => {
      const res = await request(app)
        .post('/api/habits')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Exercise Daily',
          description: '30 mins of gym cardio',
          frequency: 'DAILY',
          specificDays: [],
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data.habit.name).toBe('Exercise Daily');
      expect(res.body.data.habit.currentStreak).toBe(0);

      habitId = res.body.data.habit.id;
    });

    it('should return the habit list containing the created habit', async () => {
      const res = await request(app)
        .get('/api/habits')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.habits).toBeInstanceOf(Array);
      expect(res.body.data.habits.length).toBeGreaterThanOrEqual(1);

      const found = res.body.data.habits.find((h: any) => h.id === habitId);
      expect(found).toBeDefined();
      expect(found.name).toBe('Exercise Daily');
    });

    it('should update habit details', async () => {
      const res = await request(app)
        .put(`/api/habits/${habitId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Exercise Harder',
          description: '45 mins of gym cardio',
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.habit.name).toBe('Exercise Harder');
      expect(res.body.data.habit.description).toBe('45 mins of gym cardio');
    });

    it('should delete the habit', async () => {
      const res = await request(app)
        .delete(`/api/habits/${habitId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');

      // Verify it is gone
      const checkRes = await request(app)
        .get(`/api/habits/${habitId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(checkRes.status).toBe(404);
    });
  });
});
