const request = require('supertest');
const app = require('../server');

describe('의약품 검색 API 테스트', () => {
  test('제형, 모양, 색상, 분할선 검색이 작동해야 함', async () => {
    const response = await request(app)
      .get('/api/search')
      .query({
        shape: '원형',
        color: '하양',
        line: '+형',
        formCode: '정제'
      });

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    
    if (response.body.length > 0) {
      const item = response.body[0];
      expect(item).toHaveProperty('DRUG_SHAPE');
      expect(item).toHaveProperty('COLOR_CLASS1');
      expect(item).toHaveProperty('LINE_FRONT');
      expect(item).toHaveProperty('FORM_CODE_NAME');
    }
  });
}); 