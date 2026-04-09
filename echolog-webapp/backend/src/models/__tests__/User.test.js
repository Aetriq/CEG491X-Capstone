// backend/src/models/__tests__/User.test.js
const { db } = require('../../database/db');
const User = require('../User');

// Close database connection after all tests
afterAll(async () => {
  await new Promise((resolve, reject) => {
    db.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
});

describe('User Model', () => {
  test('should create a new user', async () => {
    const user = await User.create('testuser', 'test@example.com', 'password123');
    expect(user.id).toBeDefined();
    expect(user.username).toBe('testuser');
    expect(user.email).toBe('test@example.com');
  });

  test('should find user by username', async () => {
    const user = await User.findByUsername('testuser');
    expect(user).toBeDefined();
    expect(user.username).toBe('testuser');
  });

  test('should verify password correctly', async () => {
    const user = await User.findByUsername('testuser');
    const valid = await User.verifyPassword(user, 'password123');
    expect(valid).toBe(true);
    const invalid = await User.verifyPassword(user, 'wrong');
    expect(invalid).toBe(false);
  });

  test('should not create duplicate username', async () => {
    await expect(User.create('testuser', 'another@example.com', 'pass'))
      .rejects.toThrow('Username or email already exists');
  });
});