const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const { createObjectCsvWriter } = require('csv-writer');

const db = new sqlite3.Database('./medicines.db');

// 데이터를 CSV로 내보내기
db.all("SELECT * FROM medicines", [], (err, rows) => {
  if (err) {
    console.error('데이터 조회 오류:', err);
    return;
  }
  
  console.log(`총 ${rows.length}개의 약품 데이터를 내보냅니다...`);
  
  // 컬럼 헤더 생성
  const headers = Object.keys(rows[0]).map(key => {
    return { id: key, title: key };
  });
  
  const csvWriter = createObjectCsvWriter({
    path: 'medicines.csv',
    header: headers,
    encoding: 'utf8',
    // BOM 추가로 Excel에서도 UTF-8로 인식
    append: false,
    bom: true
  });
  
  csvWriter.writeRecords(rows)
    .then(() => {
      console.log('CSV 파일 생성 완료: medicines.csv');
      console.log('이 파일을 Supabase에 가져오세요.');
      db.close();
    });
});