jest.mock('../src/prismaClient'); // adjust the path if needed

const request = require('supertest');
const app = require('../src/app'); // your Express app

describe('GET /api/articles/:id', () => {
  it('should return 400 for invalid ID', async () => {
    const res = await request(app).get('/api/articles/abc');
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('message', 'Invalid article ID');
  });

  it('should return 404 if article not found', async () => {
    const res = await request(app).get('/api/articles/999999');
    expect(res.statusCode).toBe(404);
    expect(res.body).toHaveProperty('message', 'Article not found');
  });

  it('should return 200 for valid article ID', async () => {
    const res = await request(app).get('/api/articles/1');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('nomArticle', 'Mock Article');
  });
});
