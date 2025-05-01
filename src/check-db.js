 const sqlite3 = require('sqlite3').verbose();
   const db = new sqlite3.Database('./medicines.db');

   // 테이블 목록 확인
   db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, tables) => {
     if (err) {
       console.error('테이블 목록 조회 오류:', err);
       return;
     }
     console.log('테이블 목록:', tables);
     
     // 첫 번째 테이블의 구조 확인
     if (tables.length > 0) {
       const tableName = tables[0].name;
       db.all(`PRAGMA table_info(${tableName})`, [], (err, columns) => {
         if (err) {
           console.error('테이블 구조 조회 오류:', err);
           return;
         }
         console.log(`${tableName} 테이블 구조:`, columns);
         
         // 샘플 데이터 확인
         db.all(`SELECT * FROM ${tableName} LIMIT 3`, [], (err, rows) => {
           if (err) {
             console.error('데이터 조회 오류:', err);
             return;
           }
           console.log(`${tableName} 샘플 데이터:`, rows);
           db.close();
         });
       });
     } else {
       console.log('테이블이 없습니다');
       db.close();
     }
   });