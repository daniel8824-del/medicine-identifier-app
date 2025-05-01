// Supabase로 데이터 마이그레이션 스크립트
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// server.js에서 collectAndSaveData 함수 가져오기
const { collectAndSaveData } = require('./server');

// 데이터 마이그레이션 실행
console.log('의약품 데이터 마이그레이션을 시작합니다...');

collectAndSaveData()
  .then(() => {
    console.log('데이터 마이그레이션이 성공적으로 완료되었습니다!');
    process.exit(0);
  })
  .catch(error => {
    console.error('데이터 마이그레이션 중 오류가 발생했습니다:', error);
    process.exit(1);
  }); 