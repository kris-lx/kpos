// Test environment setup — provides required env vars so app.config.ts
// doesn't call process.exit(1) during test module loading.
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
process.env.JWT_SECRET   = 'test-secret-key-minimum-32-characters-long-xx';
process.env.NODE_ENV     = 'test';
