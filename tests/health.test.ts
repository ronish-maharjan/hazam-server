import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../src/app';

describe('Health & Foundation', () => {
  // ─── Health Check ─────────────────────────────────────
  describe('GET /api/health', () => {
    it('should return 200 with healthy status', async () => {
      const res = await request(app).get('/api/health');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        success: true,
        message: 'Hazam API is running',
        data: {
          status: 'healthy',
        },
      });
      expect(res.body.data.timestamp).toBeDefined();
    });
  });

  // ─── 404 Catch-All ────────────────────────────────────
  describe('Unknown routes', () => {
    it('should return 404 for GET unknown path', async () => {
      const res = await request(app).get('/api/does-not-exist');

      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({
        success: false,
        message: 'Route not found',
      });
    });

    it('should return 404 for POST unknown path', async () => {
      const res = await request(app)
        .post('/api/nonexistent')
        .send({ foo: 'bar' });

      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({
        success: false,
        message: 'Route not found',
      });
    });
  });

  // ─── Malformed JSON ───────────────────────────────────
  describe('Malformed request body', () => {
    it('should return 400 for invalid JSON', async () => {
      const res = await request(app)
        .post('/api/health')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }');

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({
        success: false,
        message: 'Invalid JSON in request body',
      });
    });
  });

  // ─── Response format consistency ──────────────────────
  describe('Response format', () => {
    it('success responses have success, message, and data keys', async () => {
      const res = await request(app).get('/api/health');

      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('message');
      expect(res.body).toHaveProperty('data');
      expect(typeof res.body.message).toBe('string');
    });

    it('error responses have success and message keys', async () => {
      const res = await request(app).get('/api/nope');

      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('message');
      expect(typeof res.body.message).toBe('string');
    });
  });
});
