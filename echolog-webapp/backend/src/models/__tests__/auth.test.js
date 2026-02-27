// backend/src/routes/__tests__/auth.test.js
const request = require('supertest');
const app = require('../../server');
const { db } = require('../../database/db');

afterAll(async () => {
  await new Promise((resolve, reject) => {
    db.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
});

describe('Auth Routes', () => {
  const testUser = { username: 'apitest', email: 'api@test.com', password: 'secret' };

  test('POST /api/auth/register – success', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send(testUser);
    expect(res.statusCode).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.username).toBe(testUser.username);
  });

  test('POST /api/auth/login – success', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: testUser.username, password: testUser.password });
    expect(res.statusCode).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  test('POST /api/auth/login – wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: testUser.username, password: 'wrong' });
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });
});