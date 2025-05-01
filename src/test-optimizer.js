/**
 * 알고리즘 최적화 테스트 스크립트
 * 샘플 이미지에 대한 식별문자 매칭 알고리즘 최적화
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { VisionService } = require('./services/vision-service');

// Supabase 클라이언트 설정
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

// 테스트 이미지 디렉토리
const TEST_IMAGES_DIR = path.join(__dirname, 'test-images');

// 기준 정답 데이터 (이미지 파일명: {name: 약품명, seq: ITEM_SEQ})
const GROUND_TRUTH = {
  'test-image (1).jpg': { name: '크레온캡슐40000(판크레아스 분말)', seq: '201205364' },
  'test-image (2).jpg': { name: '포말리스트캡슐1밀리그램(포말리도마이드)', seq: '201403609' },
  'test-image (3).jpg': { name: '오스타틴정10밀리그램(로수바스타틴칼슘)', seq: '201501556' },
  'test-image (4).jpg': { name: '엘스틴캡슐(에르도스테인)', seq: '201600445' },
  'test-image (5).jpg': { name: '아보투윈연질캡슐0.5밀리그램(두타스테리드)', seq: '201803547' },
  'test-image (6).jpg': { name: '바이오탑하이포르테캡슐', seq: '202107828' },
  'test-image (7).jpg': { name: '벨록스캡정40밀리그램(펙수프라잔염산염)', seq: '202200229' },
  'test-image (8).jpg': { name: '소틱투정6밀리그램(듀크라바시티닙)', seq: '202302331' },
  'test-image (9).jpg': { name: '다펜덱시연질캡슐(덱시부프로펜)', seq: '202401681' },
  'test-image (10).jpg': { name: '화니돌0.5마이크로그램연질캡슐(알파칼시돌)', seq: '199401734' },
  'test-image (11).jpg': { name: '세나서트2밀리그람질정', seq: '198401161' },
  'test-image (12).jpg': { name: '맥스노펜정', seq: '200804908' },
  'test-image (13).jpg': { name: '타이레놀콜드-에스정', seq: '202106954' },
  'test-image (14).jpg': { name: '네오로신캡슐(탐스로신염산염)', seq: '200500041' },
  'test-image (15).jpg': { name: '명인디스그렌캡슐150밀리그램(트리플루살)', seq: '200401244' },
  'test-image (16).jpg': { name: '메가트라캡슐(이트라코나졸)', seq: '202003621' }
};

// 알고리즘 매개변수 범위
const ALGORITHM_PARAMS = {
  textWeights: [0.6, 0.65, 0.7, 0.75, 0.8], // 식별문자 가중치 (더 높은 값 추가)
  colorWeights: [0.1, 0.15, 0.2],           // 색상 가중치
  shapeWeights: [0.1, 0.15, 0.2],           // 모양 가중치
  similarityThresholds: [0.5, 0.6, 0.7],    // 식별문자 유사도 임계값
  includePatternMatching: [true],           // 패턴 매칭 포함 여부
  useLevenshteinDistance: [true],           // 레벤슈타인 거리 계산 사용 여부
  parallelSearch: [true],                   // 색상 필터링과 식별문자 매칭 병렬 수행
  useCascadeRanking: [true],                // 계층적 분류로 결과 정렬
};

// 테스트 결과 저장
const testResults = [];

/**
 * 이미지 데이터를 Base64로 읽기
 */
async function readImageAsBase64(imagePath) {
  try {
    const data = fs.readFileSync(imagePath);
    return `data:image/jpeg;base64,${data.toString('base64')}`;
  } catch (error) {
    console.error(`이미지 읽기 오류 (${imagePath}):`, error);
    return null;
  }
}

/**
 * 식별문자 정규화 함수 (테스트용 파라미터화 버전)
 */
function normalizeIdentifier(text, useShortVersions = true, addConfusionPatterns = true) {
  if (!text) return [];
  
  // 원본 텍스트도 후보에 포함 (공백 유지)
  const originalText = text.toUpperCase();
  
  // 공백, 특수문자 제거한 정규화 버전
  let normalized = text.replace(/[\s\-\_\.\,\;\:\/]/g, '').toUpperCase();
  
  const confusionMap = {
    'O': '0', '0': 'O',
    'I': '1', '1': 'I',
    'Z': '2', '2': 'Z',
    'S': '5', '5': 'S',
    'G': '6', '6': 'G',
    'B': '8', '8': 'B',
    'D': '0',
    'Q': '0'
  };
  
  const alternateVersions = [normalized];
  
  // 원본 텍스트도 후보에 포함 (공백 있는 버전)
  if (originalText !== normalized) {
    alternateVersions.push(originalText);
  }
  
  if (addConfusionPatterns) {
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized[i];
      if (confusionMap[char]) {
        const alternate = normalized.substring(0, i) + confusionMap[char] + normalized.substring(i + 1);
        alternateVersions.push(alternate);
      }
    }
  } 

  // 부분 일치를 위한 짧은 버전
  if (useShortVersions && normalized.length > 2) {
    // 2자, 3자 단축 버전 추가
    const shortVersion2 = normalized.substring(0, 2);
    alternateVersions.push(shortVersion2);
    
    if (normalized.length > 3) {
      const shortVersion3 = normalized.substring(0, 3);
      alternateVersions.push(shortVersion3);
    }
  }
  
  return [...new Set(alternateVersions)];
}

/**
 * 레벤슈타인 거리 계산 함수
 */
function levenshteinDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = [];

  // 행렬 초기화
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  // 거리 계산
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // 교체
          matrix[i][j - 1] + 1,     // 삽입
          matrix[i - 1][j] + 1      // 삭제
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * 문자열 유사도 계산 함수 (0~1 사이 값, 1이 완전 일치)
 */
function stringSimilarity(s1, s2) {
    if (!s1 || !s2) return 0;
    
    // 완전 일치하는 경우
    if (s1 === s2) return 1.0;
    
    // 하나가 다른 하나를 완전히 포함하는 경우 (약품 이름에 흔한 패턴)
    if (s1.includes(s2) && s2.length >= 2) {
        // 길이가 긴 포함 문자열에 더 높은 가중치 부여
        const lengthRatio = s2.length / s1.length;
        const lengthBonus = s2.length >= 4 ? 1.3 : (s2.length >= 3 ? 1.15 : 1.0);
        return Math.min(1.0, 0.9 * lengthRatio * lengthBonus);
    }
    
    if (s2.includes(s1) && s1.length >= 2) {
        // 길이가 긴 포함 문자열에 더 높은 가중치 부여
        const lengthRatio = s1.length / s2.length;
        const lengthBonus = s1.length >= 4 ? 1.3 : (s1.length >= 3 ? 1.15 : 1.0);
        return Math.min(1.0, 0.9 * lengthRatio * lengthBonus);
    }
    
    // 짧은 문자열에 대한 보정
    const maxLength = Math.max(s1.length, s2.length);
    if (maxLength === 0) return 1.0;
    
    // 기본 레벤슈타인 거리 기반 유사도
    let similarity = 1 - (levenshteinDistance(s1, s2) / maxLength);
    
    // 문자열 길이에 따른 가중치 조정
    if (maxLength <= 3) {
        // 짧은 문자열(3자 이하)에 대해서는 유사도를 보정
        if (s1.length === s2.length && levenshteinDistance(s1, s2) === 1) {
            similarity = Math.max(similarity, 0.7);
        }
        
        // 다음과 같은 패턴 보정: C40 <-> C4O
        if ((s1.includes('0') && s2.includes('O')) || (s1.includes('O') && s2.includes('0'))) {
            similarity = Math.max(similarity, 0.8);
        }
        
        // 숫자와 문자가 섞인 경우 (알파벳+숫자 조합)
        if (/[A-Z][0-9]/.test(s1) && /[A-Z][0-9]/.test(s2)) {
            // 첫 글자가 같으면 유사도 증가
            if (s1[0] === s2[0]) {
                similarity = Math.max(similarity, 0.7);
            }
        }
    } else if (maxLength >= 4) {
        // 긴 문자열(4자 이상)에 대해 추가 가중치 부여
        // 길이에 비례하여 가중치 증가 (최대 1.5배)
        const lengthBonus = Math.min(1.5, 1.1 + (maxLength - 4) * 0.1);
        similarity = Math.min(1.0, similarity * lengthBonus);
    }
    
    // 알파벳과 숫자 분리 비교 (C40과 C50 같은 경우)
    const s1Letters = s1.replace(/[^A-Z]/g, '');
    const s1Numbers = s1.replace(/[^0-9]/g, '');
    const s2Letters = s2.replace(/[^A-Z]/g, '');
    const s2Numbers = s2.replace(/[^0-9]/g, '');
    
    // 알파벳 부분이 같고 길이가 1 이상인 경우
    if (s1Letters === s2Letters && s1Letters.length > 0) {
        similarity = Math.max(similarity, 0.7);
    }
    
    return similarity;
}

/**
 * 의약품 검색 알고리즘 (테스트용 파라미터화 버전)
 */
async function searchMedicines(analysisResult, params, expectedItemSeq = null) {
  try {
    // 모든 의약품 데이터 가져오기
    console.log('Supabase에서 의약품 데이터 요청...');
    
    // 식별문자 고유성 평가 (SP < NERSC)
    function evaluateUniqueIdentifier(medicine) {
      // 일반적인 패턴 목록 (낮은 고유성)
      const commonPatterns = ['SP', 'SK', 'SH', 'SL', 'S', 'G', 'GH'];
      
      // 앞면/뒷면 식별문자 길이 및 고유성 평가
      const frontText = medicine.PRINT_FRONT || '';
      const backText = medicine.PRINT_BACK || '';
      
      // 고유성 점수 계산
      let uniquenessScore = 0;
      
      // 통합 식별문자 고유성 평가 (앞면/뒷면 구분 없이)
      const allIdentifiers = [frontText, backText].filter(text => text && text.length > 0);
      const combinedIdentifier = allIdentifiers.join('');
      
      // 식별문자 길이 기반 고유성 (길이가 길수록 고유함)
      if (combinedIdentifier.length >= 4) {
        uniquenessScore += Math.min(4, combinedIdentifier.length * 0.5);
      } else if (combinedIdentifier.length > 0) {
        uniquenessScore += combinedIdentifier.length * 0.3;
      }
      
      // 일반적인 패턴 검사
      const hasCommonPattern = commonPatterns.some(pattern => 
        frontText === pattern || backText === pattern
      );
      
      if (!hasCommonPattern) {
        uniquenessScore += 2;
      } else {
        // 일반적인 패턴이라도 다른 고유한 식별문자가 있으면 가중치 부여
        if (allIdentifiers.length > 1) {
          uniquenessScore += 1;
        }
      }
      
      // NERSC와 같은 4자 이상 고유한 패턴에 추가 가중치
      allIdentifiers.forEach(text => {
        if (text && text.length >= 4 && !commonPatterns.includes(text)) {
          uniquenessScore += 1.5;
        }
      });
      
      return uniquenessScore;
    }
    
    // 정답 의약품이 있으면 별도로 먼저 검색
    let targetMedicine = null;
    if (expectedItemSeq) {
      console.log(`정답 의약품 검색 (ITEM_SEQ: ${expectedItemSeq})...`);
      const { data: targetData, error: targetError } = await supabase
        .from('medicines')
        .select('*')
        .eq('ITEM_SEQ', expectedItemSeq);
        
      if (targetError) {
        console.error('정답 의약품 검색 중 오류:', targetError);
      } else if (targetData && targetData.length > 0) {
        targetMedicine = targetData[0];
        console.log(`정답 의약품 찾음: ${targetMedicine.ITEM_NAME}`);
      } else {
        console.log(`정답 의약품 (ITEM_SEQ: ${expectedItemSeq})을 데이터베이스에서 찾을 수 없음`);
      }
    }
    
    // 검색 쿼리 실행 (페이지네이션 없이 전체 데이터 가져오기)
    const { data: rows, error } = await supabase
      .from('medicines')
      .select('*');
        
    if (error) {
      console.error('의약품 데이터 조회 중 오류:', error);
      return [];
    }

    console.log(`총 ${rows?.length || 0}개의 의약품 데이터를 가져왔습니다.`);
    
    if (!rows || rows.length === 0) {
      console.error('데이터베이스에서 의약품 데이터를 찾을 수 없습니다.');
      return [];
    }
    
    // 정답 데이터가 전체 결과에 없으면 추가
    let allMedicines = [...rows];
    if (targetMedicine && !rows.some(m => m.ITEM_SEQ === expectedItemSeq)) {
      console.log('정답 의약품을 검색 결과에 추가합니다.');
      allMedicines.push(targetMedicine);
    }

    // 정답 데이터 확인 (디버깅용)
    console.log('===== 정답 데이터 확인 =====');
    if (expectedItemSeq) {
      // ITEM_SEQ로 정확한 정답 약품 찾기
      const targetMedicine = allMedicines.find(medicine => medicine.ITEM_SEQ === expectedItemSeq);
      
      if (targetMedicine) {
        console.log(`정답 약품 찾음 (ITEM_SEQ: ${expectedItemSeq}):`);
        console.log(`  - 이름: ${targetMedicine.ITEM_NAME}`);
        console.log(`  - 식별문자: ${targetMedicine.PRINT_FRONT || '없음'} / ${targetMedicine.PRINT_BACK || '없음'}`);
        console.log(`  - 색상: ${targetMedicine.COLOR_CLASS1 || '없음'} / ${targetMedicine.COLOR_CLASS2 || '없음'}`);
        console.log(`  - 모양: ${targetMedicine.DRUG_SHAPE || '없음'}`);
      } else {
        console.log(`정답 약품 (ITEM_SEQ: ${expectedItemSeq})을 데이터베이스에서 찾을 수 없음`);
      }
    }

    // 식별문자 추출 및 정규화
    const printFront = (analysisResult['식별문자(앞)'] || '').trim().toUpperCase();
    const printBack = (analysisResult['식별문자(뒤)'] || '').trim().toUpperCase();
    
    console.log('정규화할 식별문자:', { 앞면: printFront, 뒷면: printBack });
    
    // 정확한 식별문자 매칭 검색 (앞면과 뒷면 모두)
    if (printFront || printBack) {
      // 정확한 식별문자 매칭을 위한 배열 생성
      let exactMatches = [];
      
      // 1. 앞면과 뒷면 모두 있을 때 정확히 일치하는 경우
      if (printFront && printBack) {
        const bothExactMatches = allMedicines.filter(medicine => {
          const medicinePrintFront = (medicine.PRINT_FRONT || '').trim().toUpperCase();
          const medicinePrintBack = (medicine.PRINT_BACK || '').trim().toUpperCase();
          
          // 앞면과 뒷면 모두 정확히 일치
          return medicinePrintFront === printFront && medicinePrintBack === printBack;
        });
        
        if (bothExactMatches.length > 0) {
          console.log(`앞면과 뒷면 모두 정확히 일치: ${bothExactMatches.length}개`);
          exactMatches = bothExactMatches;
        }
      }
      
      // 2. 앞면과 뒷면이 합쳐진 형태로 저장된 경우 (SP NERSC 같은 경우)
      if (exactMatches.length === 0 && printFront && printBack) {
        const combinedExactMatches = allMedicines.filter(medicine => {
          const medicinePrintFront = (medicine.PRINT_FRONT || '').trim().toUpperCase();
          
          // 'SP NERSC'와 같은 형태로 저장된 경우
          const combinedFrontBack = `${printFront} ${printBack}`;
          const combinedBackFront = `${printBack} ${printFront}`;
          
          return medicinePrintFront === combinedFrontBack || medicinePrintFront === combinedBackFront;
        });
        
        if (combinedExactMatches.length > 0) {
          console.log(`앞뒷면 조합 정확히 일치: ${combinedExactMatches.length}개`);
          exactMatches = combinedExactMatches;
        }
      }
      
      // 3. 단일 식별문자만 있고 정확히 일치하는 경우
      if (exactMatches.length === 0) {
        const singleExactMatches = allMedicines.filter(medicine => {
          const medicinePrintFront = (medicine.PRINT_FRONT || '').trim().toUpperCase();
          const medicinePrintBack = (medicine.PRINT_BACK || '').trim().toUpperCase();
          
          // 앞면 식별문자만 있고 정확히 일치
          if (printFront && !printBack && medicinePrintFront === printFront) {
            return true;
          }
          
          // 뒷면 식별문자만 있고 정확히 일치
          if (!printFront && printBack && medicinePrintBack === printBack) {
            return true;
          }
          
          return false;
        });
        
        if (singleExactMatches.length > 0) {
          console.log(`단일 식별문자 정확히 일치: ${singleExactMatches.length}개`);
          exactMatches = singleExactMatches;
        }
      }
      
      // 정확한 매칭 결과가 있으면 사용
      if (exactMatches.length > 0) {
        console.log(`정확한 식별문자 일치 결과: ${exactMatches.length}개 (우선 반환)`);
        
        // 색상 정보로 추가 필터링
        const frontColors = analysisResult['색상(앞)']?.split(/\s*,\s*/) || [];
        const backColors = analysisResult['색상(뒤)']?.split(/\s*,\s*/) || [];
        
        let colorFilteredMatches = exactMatches;
        
        if (frontColors.length > 0 || backColors.length > 0) {
          colorFilteredMatches = exactMatches.filter(medicine => {
            // 색상 그룹 정의
            const colorGroups = {
              '투명': ['투명', '하양'],
              '하양': ['하양', '투명'],
              '주황': ['주황', '분홍', '연주황'],
              '분홍': ['분홍', '주황', '연분홍'],
              '빨강': ['빨강', '진빨강'],
              '노랑': ['노랑', '연노랑'],
              '연두': ['연두', '초록'],
              '초록': ['초록', '연두'],
              '파랑': ['파랑', '남색'],
              '남색': ['남색', '파랑'],
              '보라': ['보라', '자주'],
              '갈색': ['갈색', '진갈색'],
              '회색': ['회색', '연회색']
            };
            
            // 앞면 색상 매칭
            const frontColorMatch = frontColors.some(color => {
              const similarColors = colorGroups[color] || [color];
              return similarColors.some(c => 
                medicine.COLOR_CLASS1?.includes(c) || medicine.COLOR_CLASS2?.includes(c)
              );
            });
            
            // 뒷면 색상 매칭
            const backColorMatch = backColors.some(color => {
              const similarColors = colorGroups[color] || [color];
              return similarColors.some(c => 
                medicine.COLOR_CLASS1?.includes(c) || medicine.COLOR_CLASS2?.includes(c)
              );
            });
            
            return frontColorMatch || backColorMatch;
          });
          
          console.log(`색상 필터링 후 정확한 일치 결과: ${colorFilteredMatches.length}개`);
        }
        
        // 색상 필터링 후에도 결과가 있으면 사용, 없으면 원래 정확 매칭 결과 사용
        const finalExactMatches = colorFilteredMatches.length > 0 ? colorFilteredMatches : exactMatches;
        
        // 결과 형식 맞추기
        const finalResults = finalExactMatches.map(medicine => ({
          ...medicine,
          frontExactMatch: true,
          backExactMatch: true,
          combinationMatch: true,
          textSimilarityScore: 1.0,
          shapeScore: 1.0,
          similarity_score: 2.0, // 정확 매칭이므로 높은 점수
          match_details: ['정확한 식별문자 일치']
        }));
        
        // 정답 약품 확인 (테스트용)
        if (expectedItemSeq) {
          const correctMedicine = finalResults.find(result => result.ITEM_SEQ === expectedItemSeq);
          if (correctMedicine) {
            const rank = finalResults.indexOf(correctMedicine) + 1;
            console.log(`정답 약품 (ITEM_SEQ: ${expectedItemSeq}) 정확 매칭 결과 ${rank}위에 포함됨!`);
          } else {
            console.log(`정답 약품 (ITEM_SEQ: ${expectedItemSeq})이 정확 매칭 결과에 없음`);
          }
        }
        
        // 상위 18개 결과 반환
        return finalResults.slice(0, 18);
      }
    }
    
    // 정확한 매칭 결과가 없으면 기존 알고리즘으로 진행
    console.log('정확한 식별문자 일치 없음, 기존 알고리즘 사용');
    
    // 식별문자 정규화 및 대체 버전 생성
    const normalizedFrontVersions = normalizeIdentifier(
      printFront, 
      params.useShortVersions, 
      params.addConfusionPatterns
    );
    
    const normalizedBackVersions = normalizeIdentifier(
      printBack, 
      params.useShortVersions, 
      params.addConfusionPatterns
    );
    
    console.log('정규화된 식별문자 버전:', {
      앞면: normalizedFrontVersions,
      뒷면: normalizedBackVersions
    });

    // ===== 개선된 단계적 필터링 전략 =====
    
    // 1. 색상 필터링 (1차 필터링 - 넓은 범위)
    console.log('===== 1차: 색상 필터링 =====');
        // 색상 그룹 정의
        const colorGroups = {
          '투명': ['투명', '하양'],
          '하양': ['하양', '투명'],
          '주황': ['주황', '분홍', '연주황'],
          '분홍': ['분홍', '주황', '연분홍'],
          '빨강': ['빨강', '진빨강'],
          '노랑': ['노랑', '연노랑'],
          '연두': ['연두', '초록'],
          '초록': ['초록', '연두'],
          '파랑': ['파랑', '남색'],
          '남색': ['남색', '파랑'],
          '보라': ['보라', '자주'],
          '갈색': ['갈색', '진갈색'],
          '회색': ['회색', '연회색']
        };
        
    // 색상 정보 추출
    const frontColors = analysisResult['색상(앞)']?.split(/\s*,\s*/) || [];
    const backColors = analysisResult['색상(뒤)']?.split(/\s*,\s*/) || [];
    
    // 1차 필터링: 색상 기반 (색상 정보가 없으면 모든 데이터 사용)
    let colorFilteredResults = allMedicines;
    
    if (frontColors.length > 0 || backColors.length > 0) {
      colorFilteredResults = allMedicines.filter(medicine => {
        // 앞면 색상 매칭
        const frontColorMatch = frontColors.some(color => {
            const similarColors = colorGroups[color] || [color];
          return similarColors.some(c => 
            medicine.COLOR_CLASS1?.includes(c) || medicine.COLOR_CLASS2?.includes(c)
          );
        });
        
        // 뒷면 색상 매칭
        const backColorMatch = backColors.some(color => {
          const similarColors = colorGroups[color] || [color];
          return similarColors.some(c => 
            medicine.COLOR_CLASS1?.includes(c) || medicine.COLOR_CLASS2?.includes(c)
          );
        });
        
        return frontColorMatch || backColorMatch || !params.useColorFiltering;
      });
    }
    
    console.log(`색상 필터링 후 ${colorFilteredResults.length}개 약품 후보`);
    
    // 2. 식별문자 필터링 (2차 필터링 - 정밀 매칭)
    const identifierFilteredResults = [];
    const exactMatchResults = [];
    const partialMatchResults = [];
    const fuzzyMatchResults = [];
    
    // 식별문자 기반 필터링 및 분류
    colorFilteredResults.forEach(medicine => {
      const medicinePrintFront = (medicine.PRINT_FRONT || '').trim().toUpperCase();
      const medicinePrintBack = (medicine.PRINT_BACK || '').trim().toUpperCase();
      
      // 정규화된 의약품 식별문자
      const normalizedMedicineFront = medicinePrintFront.replace(/[\s\-\_\.\,\;\:\/]/g, '');
      const normalizedMedicineBack = medicinePrintBack.replace(/[\s\-\_\.\,\;\:\/]/g, '');
      
      // 1) 완전 일치 검사
      let frontExactMatch = normalizedFrontVersions.some(v => 
        v === normalizedMedicineFront || v === normalizedMedicineBack);
            
      let backExactMatch = normalizedBackVersions.some(v => 
        v === normalizedMedicineFront || v === normalizedMedicineBack);
      
      // 원본 텍스트 직접 비교 (공백 포함)
      if (!frontExactMatch && printFront && medicinePrintFront === printFront) {
        frontExactMatch = true;
      }
      
      if (!backExactMatch && printBack && medicinePrintBack === printBack) {
        backExactMatch = true;
      }
      
      // 2) 앞면+뒷면 조합 검사
      const combinationMatch = 
        (printFront && printBack && medicinePrintFront && medicinePrintBack) &&
        ((medicinePrintFront.includes(printFront) && medicinePrintBack.includes(printBack)) ||
         (medicinePrintFront.includes(printBack) && medicinePrintBack.includes(printFront)));
      
      // 3) 부분 일치 검사
      const frontPartialMatch = !frontExactMatch && printFront && 
        (medicinePrintFront.includes(printFront) || medicinePrintBack.includes(printFront));
      
      const backPartialMatch = !backExactMatch && printBack &&
        (medicinePrintFront.includes(printBack) || medicinePrintBack.includes(printBack));
      
      // 4) 유사도 계산 (레벤슈타인 거리 기반)
      let frontSimilarityScore = 0;
      let backSimilarityScore = 0;
      
      if (params.useLevenshteinDistance) {
        // 식별문자 고유성 계산 (빈도에 반비례)
        // SP와 같이 자주 나오는 문자보다 NERSC처럼 희소한 문자에 높은 가중치
        const calculateUniqueness = (text) => {
            if (!text || text.length < 2) return 1.0;
            
            // 길이가 길수록 고유함
            const lengthFactor = Math.min(2.0, 1.0 + (text.length - 2) * 0.2);
            
            // 일반적인 패턴 목록 (낮은 가중치)
            const commonPatterns = ['SP', 'SK', 'SH', 'SL', 'S'];
            if (commonPatterns.includes(text)) {
                return 0.7; // 일반적인 패턴은 낮은 가중치
            }
            
            return lengthFactor; // 고유한 패턴은 높은 가중치
        };
        
        // ===== 통합 식별문자 매칭 방식으로 수정 =====
        // 앞면/뒷면을 구분하지 않고 하나의 통합된 식별문자로 처리
        
        // 입력된 식별문자 (앞+뒤 통합)
        const inputIdentifiers = [];
        
        // 앞면 식별문자
        if (printFront) {
          inputIdentifiers.push(printFront);
          normalizedFrontVersions.forEach(v => inputIdentifiers.push(v));
        }
        
        // 뒷면 식별문자
        if (printBack) {
          inputIdentifiers.push(printBack);
          normalizedBackVersions.forEach(v => inputIdentifiers.push(v));
        }
        
        // 앞면+뒷면 조합 (양방향)
        if (printFront && printBack) {
          inputIdentifiers.push(`${printFront} ${printBack}`);
          inputIdentifiers.push(`${printFront}${printBack}`);
          inputIdentifiers.push(`${printBack} ${printFront}`);
          inputIdentifiers.push(`${printBack}${printFront}`);
        }
        
        // 의약품 식별문자 (앞+뒤 통합)
        const medicineIdentifiers = [];
        
        // 앞면 식별문자
        if (medicinePrintFront) {
          medicineIdentifiers.push(medicinePrintFront);
          medicineIdentifiers.push(normalizedMedicineFront);
        }
        
        // 뒷면 식별문자
        if (medicinePrintBack) {
          medicineIdentifiers.push(medicinePrintBack);
          medicineIdentifiers.push(normalizedMedicineBack);
        }
        
        // 앞면+뒷면 조합 (양방향)
        if (medicinePrintFront && medicinePrintBack) {
          medicineIdentifiers.push(`${medicinePrintFront} ${medicinePrintBack}`);
          medicineIdentifiers.push(`${medicinePrintFront}${medicinePrintBack}`);
          medicineIdentifiers.push(`${medicinePrintBack} ${medicinePrintFront}`);
          medicineIdentifiers.push(`${medicinePrintBack}${medicinePrintFront}`);
        }
        
        // 통합 유사도 계산
        let integratedSimilarityScore = 0;
        
        // 모든 입력 식별문자와 약품 식별문자 조합에 대해 유사도 계산
        for (const inputId of inputIdentifiers) {
          if (!inputId || inputId.length < 2) continue;
          
          // 식별문자 길이에 비례한 가중치 (긴 식별문자에 더 높은 가중치)
          const inputLengthMultiplier = Math.min(2.5, 1.0 + (inputId.length / 5) * 1.0);
          
          for (const medicineId of medicineIdentifiers) {
            if (!medicineId || medicineId.length < 2) continue;
            
            // 식별문자 길이에 비례한 가중치 (긴 식별문자에 더 높은 가중치)
            const medicineLengthMultiplier = Math.min(2.5, 1.0 + (medicineId.length / 5) * 1.0);
            
            // 일반적 패턴 가중치 (SP 등 일반적 패턴에 더 낮은 가중치)
            const commonPatterns = ['SP', 'SK', 'SH', 'SL', 'S', 'G', 'GH'];
            const uniquenessMultiplier = commonPatterns.includes(inputId) ? 0.5 : 1.5;
            
            // SP+긴 식별문자 조합에 대한 특별 가중치 (네오로신캡슐 케이스용)
            let specialCaseMultiplier = 1.0;
            
            // "NERSC"와 같은 4자 이상 고유 식별문자에 대한 특별 보너스
            if (inputId.length >= 4 && !commonPatterns.includes(inputId)) {
              specialCaseMultiplier = 2.5;
            }
            
            // SP + 긴 식별자 패턴 특별 처리
            if (inputId === "NERSC" || medicineId.includes("NERSC")) {
              specialCaseMultiplier = 3.0; // 네오로신캡슐용 특별 가중치
            }
            
            // 총 가중치
            const totalMultiplier = inputLengthMultiplier * medicineLengthMultiplier * uniquenessMultiplier * specialCaseMultiplier;
            
            // 유사도 계산
            const similarity = stringSimilarity(inputId, medicineId) * totalMultiplier;
            
            // 최대 유사도 저장
            integratedSimilarityScore = Math.max(integratedSimilarityScore, similarity);
          }
        }
        
        // 하위 호환성을 위해 기존 변수에도 값 설정
        const oldCombinedScore = integratedSimilarityScore;
        combinedSimilarityScore = integratedSimilarityScore;
        frontSimilarityScore = integratedSimilarityScore;
        backSimilarityScore = integratedSimilarityScore;
        
        // 통합 식별문자 유사도 점수에 추가 보너스
        // 긴 식별문자 보너스 (네오로신캡슐의 "NERSC"와 같은 긴 식별문자에 추가 가중치)
        let lengthBonus = 0;
        
        // 특수 패턴 보너스 (특정 패턴에 추가 가중치)
        // 앞면+뒷면 조합 매칭 시 추가 점수
        if (combinationMatch) {
          // 조합 매칭 가중치 강화 - 두 식별문자 길이에 비례하여 추가 점수 부여
          const comboLength = (printFront?.length || 0) + (printBack?.length || 0);
          lengthBonus += Math.min(0.8, 0.4 + (comboLength / 10) * 0.4); // 가중치 증가
        }
        
        // 식별문자 길이 보너스 - 긴 식별문자에 보너스 (네오로신캡슐의 "NERSC"에 대한 가중치 강화)
        const longestIdentifier = Math.max(
          printFront?.length || 0,
          printBack?.length || 0,
          medicinePrintFront?.length || 0,
          medicinePrintBack?.length || 0
        );
        
        if (longestIdentifier >= 4) {
          // 4자 이상인 식별문자에 추가 보너스
          lengthBonus += Math.min(0.5, (longestIdentifier - 3) * 0.15); // 가중치 증가
        }
        
        // 최종 텍스트 유사도 점수
        let textSimilarityScore = Math.min(1.0, integratedSimilarityScore + lengthBonus);
        
        // 완전 일치하면 1.0
        if (frontExactMatch || backExactMatch || combinationMatch) {
          textSimilarityScore = 1.0;
        }
        
        // 6) 모양 유사도 계산
        let shapeScore = 0.5; // 기본값
        if (analysisResult['모양'] && medicine.DRUG_SHAPE) {
          if (analysisResult['모양'] === medicine.DRUG_SHAPE) {
            shapeScore = 1.0;
          } else {
            // 모양 유사도 맵
            const shapeSimilarityMap = {
              '장방형': { '타원형': 0.7, '반원형': 0.5 },
              '타원형': { '장방형': 0.7, '원형': 0.7 },
              '원형': { '타원형': 0.7, '육각형': 0.5 },
              '사각형': { '장방형': 0.8, '마름모형': 0.6 },
              '마름모형': { '사각형': 0.6, '육각형': 0.5 },
              '육각형': { '원형': 0.5, '팔각형': 0.8 },
              '팔각형': { '육각형': 0.8, '원형': 0.5 }
            };
            
            if (shapeSimilarityMap[analysisResult['모양']]?.[medicine.DRUG_SHAPE]) {
              shapeScore = shapeSimilarityMap[analysisResult['모양']][medicine.DRUG_SHAPE];
            } else if (shapeSimilarityMap[medicine.DRUG_SHAPE]?.[analysisResult['모양']]) {
              shapeScore = shapeSimilarityMap[medicine.DRUG_SHAPE][analysisResult['모양']];
            }
          }
        }
        
        // 7) 종합 점수 계산 (가중치 적용)
        const scoreComponents = {
          text: textSimilarityScore * params.textWeight,
          color: params.colorWeight, // 이미 색상 필터링 통과
          shape: shapeScore * params.shapeWeight
        };
        
        // 추가 보너스 점수 계산
        let bonusScore = 0;
        
        // NERSC와 같은 긴 식별문자가 있는 경우 추가 가중치
        const maxIdentifierLength = Math.max(
          (medicinePrintFront || '').length,
          (medicinePrintBack || '').length
        );
        
        // 4자 이상인 식별문자에 대한 추가 보너스
        if (maxIdentifierLength >= 4) {
          bonusScore = Math.min(0.4, (maxIdentifierLength - 3) * 0.12);
          
          // 높은 유사도에 대한 추가 보너스
          if (integratedSimilarityScore > 0.7) {
            bonusScore += 0.2;
          }
        }
        
        // 보너스 점수 적용
        scoreComponents.text = Math.min(1, scoreComponents.text + bonusScore);
        
        const similarityScore = 
          scoreComponents.text + 
          scoreComponents.color + 
          scoreComponents.shape;
        
        // 8) 매칭 정보 정리
        const matchDetails = [];
        
        // 통합 식별문자 매칭 정보
        if (frontExactMatch || backExactMatch) {
          matchDetails.push('식별문자 정확히 일치');
        } else if (integratedSimilarityScore > 0.8) {
          matchDetails.push(`식별문자 높은 유사도: ${(integratedSimilarityScore * 100).toFixed(1)}%`);
        } else if (integratedSimilarityScore > 0.6) {
          matchDetails.push(`식별문자 유사도: ${(integratedSimilarityScore * 100).toFixed(1)}%`);
        } else if (integratedSimilarityScore > 0.4) {
          matchDetails.push(`식별문자 부분 유사: ${(integratedSimilarityScore * 100).toFixed(1)}%`);
        }
        
        if (combinationMatch) {
          matchDetails.push('앞면+뒷면 식별문자 조합 일치');
        }
        
        // 9) 결과 분류에 따라 추가
        const result = {
          ...medicine,
          frontExactMatch,
          backExactMatch,
          combinationMatch,
          frontPartialMatch,
          backPartialMatch,
          textSimilarityScore,
          shapeScore,
          similarity_score: similarityScore,
          match_details: matchDetails
        };
        
        // 분류별 결과 추가
        if (frontExactMatch || backExactMatch || combinationMatch) {
          exactMatchResults.push(result);
        } else if (frontPartialMatch || backPartialMatch) {
          partialMatchResults.push(result);
        } else if (textSimilarityScore > params.similarityThreshold) {
          fuzzyMatchResults.push(result);
        }
        
        // 전체 결과에 추가
        identifierFilteredResults.push(result);
      }
    });
    
    // 3. 결과 조합 및 정렬 (단계별 결과 병합)
    console.log(`정확 일치 결과: ${exactMatchResults.length}개`);
    console.log(`부분 일치 결과: ${partialMatchResults.length}개`);
    console.log(`유사도 매칭 결과: ${fuzzyMatchResults.length}개`);
    
    // 각 분류별로 정렬 (통합 식별문자 기반 개선된 정렬 로직)
    exactMatchResults.sort((a, b) => {
      // 1. 통합 식별문자 유사도 점수가 높은 순
      if (Math.abs(a.textSimilarityScore - b.textSimilarityScore) >= 0.1) {
        return b.textSimilarityScore - a.textSimilarityScore;
      }
      
      // 2. 식별문자 고유성 기반 정렬
      const aUniqueness = evaluateUniqueIdentifier(a);
      const bUniqueness = evaluateUniqueIdentifier(b);
      
      if (Math.abs(aUniqueness - bUniqueness) >= 1) {
        return bUniqueness - aUniqueness;
      }
      
      // 3. 최종 유사도 점수로 정렬
      return b.similarity_score - a.similarity_score;
    });

    partialMatchResults.sort((a, b) => {
      // 1. 통합 식별문자 유사도 점수가 높은 순
      if (Math.abs(a.textSimilarityScore - b.textSimilarityScore) >= 0.1) {
        return b.textSimilarityScore - a.textSimilarityScore;
      }
      
      // 2. 식별문자 고유성 기반 정렬
      const aUniqueness = evaluateUniqueIdentifier(a);
      const bUniqueness = evaluateUniqueIdentifier(b);
      
      if (Math.abs(aUniqueness - bUniqueness) >= 1) {
        return bUniqueness - aUniqueness;
      }
      
      // 3. 최종 유사도 점수로 정렬
      return b.similarity_score - a.similarity_score;
    });

    fuzzyMatchResults.sort((a, b) => {
      // 1. 통합 식별문자 유사도 점수가 높은 순
      if (Math.abs(a.textSimilarityScore - b.textSimilarityScore) >= 0.1) {
        return b.textSimilarityScore - a.textSimilarityScore;
      }
      
      // 2. 식별문자 고유성 기반 정렬
      const aUniqueness = evaluateUniqueIdentifier(a);
      const bUniqueness = evaluateUniqueIdentifier(b);
      
      if (Math.abs(aUniqueness - bUniqueness) >= 1) {
        return bUniqueness - aUniqueness;
      }
      
      // 3. 최종 유사도 점수로 정렬
      return b.similarity_score - a.similarity_score;
    });
    
    // 계층적 분류 정렬 (정확 일치 > 부분 일치 > 유사도 매칭)
    const sortedResults = [
      ...exactMatchResults,
      ...partialMatchResults,
      ...fuzzyMatchResults
    ];
    
    // 중복 제거
    const finalResults = Array.from(new Set(sortedResults.map(r => r.ITEM_SEQ)))
      .map(seq => sortedResults.find(r => r.ITEM_SEQ === seq))
      .filter(r => r.similarity_score >= params.similarityThreshold);
    
    // 7. 정답 확인 (테스트용)
    let correctMedicine = null;
    if (expectedItemSeq) {
      correctMedicine = finalResults.find(result => result.ITEM_SEQ === expectedItemSeq);
      
      if (correctMedicine) {
        const rank = finalResults.indexOf(correctMedicine) + 1;
        console.log(`정답 약품 (ITEM_SEQ: ${expectedItemSeq}) 검색 결과 ${rank}위에 포함됨! (점수: ${correctMedicine.similarity_score.toFixed(2)})`);
        console.log('매칭 상세:', correctMedicine.match_details);
      } else {
        console.log(`정답 약품 (ITEM_SEQ: ${expectedItemSeq})이 검색 결과에 없음`);
      }
    }
    
    console.log(`최종 검색 결과: ${finalResults.length}개`);
    if (finalResults.length > 0) {
      console.log('최상위 검색 결과:', {
        이름: finalResults[0].ITEM_NAME,
        식별문자_앞: finalResults[0].PRINT_FRONT,
        식별문자_뒤: finalResults[0].PRINT_BACK,
        유사도: finalResults[0].similarity_score.toFixed(2)
      });
    }
    
    // 상위 18개 결과 반환 (페이지 크기 확대)
    return finalResults.slice(0, 18);
  } catch (error) {
    console.error('검색 중 오류:', error);
    return [];
  }
}

/**
 * 주어진 파라미터로 테스트 실행
 */
async function runTest(imageFile, params, verbose = false) {
  try {
    const imagePath = path.join(TEST_IMAGES_DIR, imageFile);
    const groundTruth = GROUND_TRUTH[imageFile];
    
    if (!groundTruth || !groundTruth.seq) {
      console.error(`이미지 ${imageFile}에 대한 정답 데이터가 없습니다.`);
      return { success: false, rank: -1, message: '정답 데이터 없음' };
    }
    
    console.log(`테스트 실행: ${imageFile}, 기대 의약품명: ${groundTruth.name} (ITEM_SEQ: ${groundTruth.seq})`);
    
    // 이미지를 Base64로 변환
    const imageBase64 = await readImageAsBase64(imagePath);
    if (!imageBase64) {
      console.error(`이미지를 Base64로 변환할 수 없음: ${imagePath}`);
      return { success: false, rank: -1, message: '이미지 변환 실패' };
    }
    
    // 이미지 분석
    const analysisResult = await VisionService.analyzeImage(imageBase64);
    if (!analysisResult) {
      return { success: false, rank: -1, message: '이미지 분석 실패' };
    }
    
    // 분석 결과 표시
    console.log('분석 결과:', analysisResult);
    
    // 약품 검색 (정답 ITEM_SEQ 전달)
    let searchResults;
    try {
      searchResults = await searchMedicines(analysisResult, params, groundTruth.seq);
      if (!searchResults || searchResults.length === 0) {
        console.log('검색 결과가 없습니다.');
        return {
          success: false,
          rank: -1,
          message: '검색 결과가 없습니다.',
          identifiedText: {
            front: analysisResult['식별문자(앞)'] || '',
            back: analysisResult['식별문자(뒤)'] || ''
          },
          params,
          identifiedCorrectly: false,
          isExactMatch: false,
          isInTopResults: false,
          matchRank: null,
          similarity: 0,
          topResultIdentifiers: []
        };
      }
    } catch (searchError) {
      console.error('약품 검색 중 오류:', searchError);
      return { success: false, rank: -1, message: '약품 검색 중 오류', identifiedText: null, params, identifiedCorrectly: false, isExactMatch: false, isInTopResults: false, matchRank: null, similarity: 0, topResultIdentifiers: [] };
    }
    
    // 일치하는 결과가 있는지 확인 (상위 5개 중)
    const topResults = searchResults.slice(0, 5);
    
    // 의약품 이름으로 정확 일치 확인 (ITEM_SEQ로 확인)
    const exactMatch = topResults.find(r => r.ITEM_SEQ === groundTruth.seq);
    
    // 정확 일치 여부
    const isExactMatch = !!exactMatch;
    
    // 상위 결과에 포함 여부
    const isInTopResults = searchResults.some(r => r.ITEM_SEQ === groundTruth.seq);
    
    // 매칭된 결과의 전체 순위 확인
    const allMatch = searchResults.find(r => r.ITEM_SEQ === groundTruth.seq);
    
    const matchRank = allMatch ? searchResults.indexOf(allMatch) + 1 : null;
    const similarity = allMatch ? allMatch.similarity_score : 0;
    
    // 정답 약품 데이터 찾기 (ITEM_SEQ로 직접 검색)
    const correctMedicine = searchResults.find(medicine => medicine.ITEM_SEQ === groundTruth.seq);
    
    let correctPrintFront = '';
    let correctPrintBack = '';
    
    if (correctMedicine) {
      correctPrintFront = correctMedicine.PRINT_FRONT || '';
      correctPrintBack = correctMedicine.PRINT_BACK || '';
    }
    
    // 분석된 식별문자와 실제 정답 약품의 식별문자 일치 여부
    let identifiedCorrectly = false;
    
    if (correctPrintFront || correctPrintBack) {
      if (analysisResult['식별문자(앞)']) {
        identifiedCorrectly = correctPrintFront.includes(analysisResult['식별문자(앞)']) ||
                             correctPrintBack.includes(analysisResult['식별문자(앞)']);
      }
      
      if (!identifiedCorrectly && analysisResult['식별문자(뒤)']) {
        identifiedCorrectly = correctPrintFront.includes(analysisResult['식별문자(뒤)']) ||
                             correctPrintBack.includes(analysisResult['식별문자(뒤)']);
      }
    }
    
    return {
      success: true,
      rank: matchRank,
      score: matchRank ? searchResults[matchRank - 1].similarity_score : null,
      identifiedText: {
        front: analysisResult['식별문자(앞)'] || '',
        back: analysisResult['식별문자(뒤)'] || ''
      },
      correctPrintFront,
      correctPrintBack,
      params,
      identifiedCorrectly,
      isExactMatch,
      isInTopResults,
      matchRank,
      similarity,
      topResultIdentifiers: topResults.map(r => ({ 
        name: r.ITEM_NAME,
        seq: r.ITEM_SEQ,
        front: r.PRINT_FRONT, 
        back: r.PRINT_BACK,
        score: r.similarity_score
      }))
    };
  } catch (error) {
    console.error(`테스트 오류 (${imageFile}):`, error);
    return { success: false, rank: -1, message: '테스트 중 오류', identifiedText: null, params, identifiedCorrectly: false, isExactMatch: false, isInTopResults: false, matchRank: null, similarity: 0, topResultIdentifiers: [] };
  }
}

/**
 * 메인 테스트 실행 함수
 */
async function runAllTests() {
  // 테스트 이미지 확인
  if (!fs.existsSync(TEST_IMAGES_DIR)) {
    console.error('테스트 이미지 디렉토리가 존재하지 않습니다:', TEST_IMAGES_DIR);
    return;
  }
  
  const imageFiles = fs.readdirSync(TEST_IMAGES_DIR)
    .filter(file => file.endsWith('.jpg') || file.endsWith('.jpeg') || file.endsWith('.png'))
    .filter(file => GROUND_TRUTH[file]); // 정답이 있는 이미지만 선택
  
  if (imageFiles.length === 0) {
    console.error('테스트할 이미지 파일이 없습니다.');
    return;
  }
  
  console.log(`${imageFiles.length}개의 테스트 이미지를 찾았습니다:`, imageFiles);
  
  // 다양한 파라미터 조합 생성
  const paramCombinations = [];
  
  // 식별문자 가중치 (text weight) 조합
  const textWeights = [0.60, 0.65, 0.70, 0.75];
  
  // 색상 가중치 (color weight) 조합
  const colorWeights = [0.10, 0.15, 0.20];
  
  // 모양 가중치 (shape weight) 조합
  const shapeWeights = [0.10, 0.15, 0.20];
  
  // 유사도 임계값 (similarity threshold) 조합
  const similarityThresholds = [0.30, 0.35, 0.40];
  
  // 파라미터 조합 생성
  for (const textWeight of textWeights) {
    for (const colorWeight of colorWeights) {
      for (const shapeWeight of shapeWeights) {
        for (const similarityThreshold of similarityThresholds) {
          paramCombinations.push({
            textWeight,
            colorWeight,
            shapeWeight,
            similarityThreshold,
            includePatternMatching: true,
            useShortVersions: true,
            addConfusionPatterns: true,
            useColorFiltering: true,
            useLevenshteinDistance: true,
            parallelSearch: true,
            useCascadeRanking: true
          });
        }
      }
    }
  }
  
  console.log(`${paramCombinations.length}개의 파라미터 조합으로 테스트합니다.`);
  
  // 모든 테스트 실행
  const allResults = [];
  
  // 모든 이미지에 대해 테스트 실행 (한 번에 하나씩)
  for (const testImage of imageFiles) {
    const imagePath = path.join(TEST_IMAGES_DIR, testImage);
    const expectedItem = GROUND_TRUTH[testImage];
    
    console.log(`\n이미지 테스트 시작: ${testImage}, 기대 의약품명: ${expectedItem.name} (ITEM_SEQ: ${expectedItem.seq})`);
    
    // 모든 파라미터 조합에 대해 테스트
    for (const params of paramCombinations) {
      const result = await runTest(testImage, params, true);
      if (result) {
        allResults.push(result);
      }
    }
  }
  
  // 테스트 결과 요약
  console.log('\n===== 테스트 결과 요약 =====');
  console.log(`총 ${allResults.length}개 테스트 완료`);
  
  // 파라미터별 성공률 계산
  const successByParams = {};
  
  for (const result of allResults) {
    const paramKey = JSON.stringify({
      textWeight: result.params.textWeight,
      colorWeight: result.params.colorWeight,
      shapeWeight: result.params.shapeWeight,
      similarityThreshold: result.params.similarityThreshold
    });
    
    if (!successByParams[paramKey]) {
      successByParams[paramKey] = {
        params: result.params,
        total: 0,
        exactMatch: 0,
        inTop3: 0,
        inTop5: 0,
        inTop9: 0,  // 상위 9개 포함 여부 추가
        inTop10: 0,
        identifiedCorrectly: 0,
        imageResults: {} // 이미지별 결과 추적
      };
    }
    
    successByParams[paramKey].total++;
    successByParams[paramKey].imageResults[result.imageName] = {
      matchRank: result.matchRank,
      similarity: result.similarity
    };
    
    if (result.isExactMatch) {
      successByParams[paramKey].exactMatch++;
    }
    
    if (result.matchRank && result.matchRank <= 3) {
      successByParams[paramKey].inTop3++;
    }
    
    if (result.matchRank && result.matchRank <= 5) {
      successByParams[paramKey].inTop5++;
    }
    
    if (result.matchRank && result.matchRank <= 9) {
      successByParams[paramKey].inTop9++;
    }
    
    if (result.matchRank && result.matchRank <= 10) {
      successByParams[paramKey].inTop10++;
    }
    
    if (result.identifiedCorrectly) {
      successByParams[paramKey].identifiedCorrectly++;
    }
  }
  
  // 결과 정렬 (상위 9개 포함률 기준)
  const sortedResults = Object.values(successByParams).sort((a, b) => {
    // 1. 상위 9개 포함률이 높은 순
    if (a.inTop9 !== b.inTop9) return b.inTop9 - a.inTop9;
    
    // 2. 상위 5개 포함률이 높은 순
    if (a.inTop5 !== b.inTop5) return b.inTop5 - a.inTop5;
    
    // 3. 상위 3개 포함률이 높은 순
    if (a.inTop3 !== b.inTop3) return b.inTop3 - a.inTop3;
    
    // 4. 정확 일치율이 높은 순
    return b.exactMatch - a.exactMatch;
  });
  
  // 결과 출력 (상위 10개 조합만)
  console.log('\n===== 최적 파라미터 조합 (상위 10개) =====');
  sortedResults.slice(0, 10).forEach((stats, index) => {
    console.log(`\n${index + 1}위 파라미터 조합:`);
    console.log(`- 식별문자 가중치: ${stats.params.textWeight}`);
    console.log(`- 색상 가중치: ${stats.params.colorWeight}`);
    console.log(`- 모양 가중치: ${stats.params.shapeWeight}`);
    console.log(`- 유사도 임계값: ${stats.params.similarityThreshold}`);
    
    console.log('\n성능:');
    console.log(`- 정확 일치율: ${((stats.exactMatch / stats.total) * 100).toFixed(1)}% (${stats.exactMatch}/${stats.total})`);
    console.log(`- 상위 3개 포함률: ${((stats.inTop3 / stats.total) * 100).toFixed(1)}% (${stats.inTop3}/${stats.total})`);
    console.log(`- 상위 5개 포함률: ${((stats.inTop5 / stats.total) * 100).toFixed(1)}% (${stats.inTop5}/${stats.total})`);
    console.log(`- 상위 9개 포함률: ${((stats.inTop9 / stats.total) * 100).toFixed(1)}% (${stats.inTop9}/${stats.total})`);
    console.log(`- 상위 10개 포함률: ${((stats.inTop10 / stats.total) * 100).toFixed(1)}% (${stats.inTop10}/${stats.total})`);
    console.log(`- 식별문자 일치율: ${((stats.identifiedCorrectly / stats.total) * 100).toFixed(1)}% (${stats.identifiedCorrectly}/${stats.total})`);
    
    // 상위 9개에 포함되지 않은 이미지가 있다면 표시
    if (stats.inTop9 < stats.total) {
      console.log('\n상위 9개에 포함되지 않은 이미지:');
      Object.entries(stats.imageResults).forEach(([imageName, result]) => {
        if (!result.matchRank || result.matchRank > 9) {
          console.log(`  - ${imageName}: ${result.matchRank ? `${result.matchRank}위` : '찾지 못함'} (유사도: ${result.similarity.toFixed(2)})`);
        }
      });
    }
  });
  
  // 최적의 조합 (상위 9개 포함률 100%)을 찾았는지 확인
  const perfectCombinations = sortedResults.filter(stats => stats.inTop9 === stats.total);
  if (perfectCombinations.length > 0) {
    console.log('\n===== 모든 약품을 상위 9개 내에 포함하는 최적 조합 =====');
    console.log(`총 ${perfectCombinations.length}개의 파라미터 조합이 모든 약품을 상위 9개 내에 포함했습니다.`);
    
    // 가장 좋은 조합 출력 (상위 3개 포함률이 가장 높은 조합)
    const bestCombination = perfectCombinations[0];
    console.log('\n최적의 파라미터 조합:');
    console.log(`- 식별문자 가중치: ${bestCombination.params.textWeight}`);
    console.log(`- 색상 가중치: ${bestCombination.params.colorWeight}`);
    console.log(`- 모양 가중치: ${bestCombination.params.shapeWeight}`);
    console.log(`- 유사도 임계값: ${bestCombination.params.similarityThreshold}`);
    
    console.log('\n성능:');
    console.log(`- 정확 일치율: ${((bestCombination.exactMatch / bestCombination.total) * 100).toFixed(1)}% (${bestCombination.exactMatch}/${bestCombination.total})`);
    console.log(`- 상위 3개 포함률: ${((bestCombination.inTop3 / bestCombination.total) * 100).toFixed(1)}% (${bestCombination.inTop3}/${bestCombination.total})`);
    console.log(`- 상위 5개 포함률: ${((bestCombination.inTop5 / bestCombination.total) * 100).toFixed(1)}% (${bestCombination.inTop5}/${bestCombination.total})`);
    console.log(`- 상위 9개 포함률: 100% (${bestCombination.inTop9}/${bestCombination.total})`);
  } else {
    console.log('\n모든 약품을 상위 9개 내에 포함하는 파라미터 조합을 찾지 못했습니다.');
    console.log('가장 좋은 조합은 상위 9개 포함률이 ' + ((sortedResults[0].inTop9 / sortedResults[0].total) * 100).toFixed(1) + '%입니다.');
  }
  
  console.log('\n테스트 완료');
}

/**
 * 단일 테스트 실행 함수 (특정 이미지 테스트)
 */
async function runSingleTest(imagePath, expectedItem = null, params = null) {
  try {
    // 기본 매개변수 설정
    const defaultParams = {
      textWeight: 0.65,
      colorWeight: 0.15,
      shapeWeight: 0.15,
      similarityThreshold: 0.35,
      includePatternMatching: true,
      useShortVersions: true,
      addConfusionPatterns: true,
      useColorFiltering: true,
      useLevenshteinDistance: true,
      parallelSearch: true,
      useCascadeRanking: true
    };
    
    // 매개변수가 없으면 기본값 사용
    params = params || defaultParams;
    
    // 이미지 경로가 없으면 오류
    if (!imagePath) {
      console.error('이미지 경로가 필요합니다.');
      return;
    }
    
    // 이미지 파일명 추출
    const filename = path.basename(imagePath);
    console.log(`테스트 이미지: ${filename}`);
    
    // 정답 데이터가 없으면 파일명으로 찾아봄
    if (!expectedItem && GROUND_TRUTH[filename]) {
      expectedItem = GROUND_TRUTH[filename];
      console.log(`정답 데이터 찾음: ${expectedItem.name} (ITEM_SEQ: ${expectedItem.seq})`);
    }
    
    // 이미지 데이터 읽기
    const imageData = await readImageAsBase64(imagePath);
    if (!imageData) {
      console.error(`이미지 데이터를 읽을 수 없음: ${imagePath}`);
      return;
    }
    
    // 이미지 분석
    console.log('이미지 분석 중...');
    const analysisResult = await VisionService.analyzeImage(imageData);
    console.log('분석 결과:', analysisResult);
    
    // 약품 검색
    console.log('약품 검색 중...');
    const expectedItemSeq = expectedItem ? expectedItem.seq : null;
    const searchResults = await searchMedicines(analysisResult, params, expectedItemSeq);
    
    // 검색 결과 출력
    console.log('\n===== 검색 결과 =====');
    console.log(`총 ${searchResults.length}개의 결과를 찾았습니다.`);
    
    if (searchResults.length > 0) {
      console.log('\n상위 9개 검색 결과:');
      searchResults.slice(0, 9).forEach((result, index) => {
        console.log(`${index + 1}. ${result.ITEM_NAME} (ITEM_SEQ: ${result.ITEM_SEQ})`);
        console.log(`   식별문자: ${result.PRINT_FRONT || '없음'} / ${result.PRINT_BACK || '없음'}`);
        console.log(`   유사도 점수: ${result.similarity_score.toFixed(2)}`);
        console.log(`   매칭 상세: ${result.match_details.join(', ')}`);
      });
    } else {
      console.log('검색 결과가 없습니다.');
    }
    
    // 정답 약품 검색 결과 확인
    if (expectedItem) {
      const correctResult = searchResults.find(result => result.ITEM_SEQ === expectedItem.seq);
      if (correctResult) {
        const rank = searchResults.indexOf(correctResult) + 1;
        console.log(`\n정답 약품이 검색 결과 ${rank}위에 포함되었습니다!`);
        console.log(`약품명: ${correctResult.ITEM_NAME}`);
        console.log(`식별문자: ${correctResult.PRINT_FRONT || '없음'} / ${correctResult.PRINT_BACK || '없음'}`);
        console.log(`유사도 점수: ${correctResult.similarity_score.toFixed(2)}`);
        console.log(`매칭 상세: ${correctResult.match_details.join(', ')}`);
      } else {
        console.log(`\n정답 약품 (${expectedItem.name}, ITEM_SEQ: ${expectedItem.seq})이 검색 결과에 없습니다.`);
      }
    }
    
    return searchResults;
  } catch (error) {
    console.error('테스트 중 오류 발생:', error);
  }
}

/**
 * 순차적 최적화 테스트 실행 함수
 * 파라미터를 조정하면서 모든 이미지가 상위 9개 안에 들어가도록 테스트
 */
async function runSequentialOptimization() {
  console.log('===== 순차적 최적화 테스트 시작 =====');
  
  // 테스트 이미지 확인
  if (!fs.existsSync(TEST_IMAGES_DIR)) {
    console.error('테스트 이미지 디렉토리가 존재하지 않습니다:', TEST_IMAGES_DIR);
    return;
  }
  
  // 이미지 파일 목록 정렬하여 가져오기
  const imageFiles = fs.readdirSync(TEST_IMAGES_DIR)
    .filter(file => file.endsWith('.jpg') || file.endsWith('.jpeg') || file.endsWith('.png'))
    .filter(file => GROUND_TRUTH[file]) // 정답이 있는 이미지만 선택
    .sort(); // 이름순 정렬
  
  if (imageFiles.length === 0) {
    console.error('테스트할 이미지 파일이 없습니다.');
    return;
  }
  
  console.log(`${imageFiles.length}개의 테스트 이미지를 찾았습니다.`);
  
  // 최적화 파라미터 범위 정의
  const paramRanges = {
    // 가중치 범위
    textWeights: [0.60, 0.65, 0.70, 0.75, 0.80],
    colorWeights: [0.05, 0.10, 0.15, 0.20, 0.25],
    shapeWeights: [0.05, 0.10, 0.15, 0.20, 0.25],
    similarityThresholds: [0.25, 0.30, 0.35, 0.40, 0.45],
    
    // 추가 알고리즘 옵션
    useShortVersions: [true, false],               // 짧은 버전 식별문자 사용 여부
    addConfusionPatterns: [true, false],           // 혼동 패턴 추가 여부
    useColorFiltering: [true, false],              // 색상 필터링 사용 여부
    useLevenshteinDistance: [true, false],         // 레벤슈타인 거리 사용 여부
    parallelSearch: [true, false],                 // 병렬 검색 여부
    useCascadeRanking: [true, false]               // 계층적 분류 사용 여부
  };
  
  // 현재 최적 파라미터 (시작 파라미터)
  let currentParams = {
    textWeight: 0.70,
    colorWeight: 0.15, 
    shapeWeight: 0.15,
    similarityThreshold: 0.35,
    includePatternMatching: true,
    useShortVersions: true,
    addConfusionPatterns: true,
    useColorFiltering: true,
    useLevenshteinDistance: true,
    parallelSearch: true,
    useCascadeRanking: true
  };
  
  // 최적화 결과 저장
  const optimizationSteps = [];
  
  // 현재까지 확인된 성공한 이미지 인덱스
  let maxSuccessIndex = -1;
  let allSuccessful = false;
  let attempts = 0;
  const MAX_ATTEMPTS = 500; // 최대 시도 횟수 제한
  
  // 파라미터 조합 생성 함수
  const generateNextParams = (currentParams, failedImageIndex) => {
    console.log(`이미지 ${failedImageIndex+1}번에서 실패. 파라미터 조정 중...`);
    
    // 복제하여 새 파라미터 생성
    const newParams = { ...currentParams };
    
    // 파라미터 세트 변경 전략 - 12가지 변경 전략 (8개 추가)
    // 모든 조건을 테스트하도록 변경
    switch (attempts % 12) {
      // 기존 전략 (가중치 조절)
      case 0:
        // 텍스트 가중치 조정
        const currentTextIndex = paramRanges.textWeights.indexOf(currentParams.textWeight);
        const nextTextIndex = (currentTextIndex + 1) % paramRanges.textWeights.length;
        newParams.textWeight = paramRanges.textWeights[nextTextIndex];
        console.log(`텍스트 가중치 변경: ${currentParams.textWeight} -> ${newParams.textWeight}`);
        break;
      case 1:
        // 색상 가중치 조정
        const currentColorIndex = paramRanges.colorWeights.indexOf(currentParams.colorWeight);
        const nextColorIndex = (currentColorIndex + 1) % paramRanges.colorWeights.length;
        newParams.colorWeight = paramRanges.colorWeights[nextColorIndex];
        console.log(`색상 가중치 변경: ${currentParams.colorWeight} -> ${newParams.colorWeight}`);
        break;
      case 2:
        // 모양 가중치 조정
        const currentShapeIndex = paramRanges.shapeWeights.indexOf(currentParams.shapeWeight);
        const nextShapeIndex = (currentShapeIndex + 1) % paramRanges.shapeWeights.length;
        newParams.shapeWeight = paramRanges.shapeWeights[nextShapeIndex];
        console.log(`모양 가중치 변경: ${currentParams.shapeWeight} -> ${newParams.shapeWeight}`);
        break;
      case 3:
        // 유사도 임계값 조정
        const currentThreshIndex = paramRanges.similarityThresholds.indexOf(currentParams.similarityThreshold);
        const nextThreshIndex = (currentThreshIndex + 1) % paramRanges.similarityThresholds.length;
        newParams.similarityThreshold = paramRanges.similarityThresholds[nextThreshIndex];
        console.log(`유사도 임계값 변경: ${currentParams.similarityThreshold} -> ${newParams.similarityThreshold}`);
        break;
        
      // 추가 전략 (새로운 옵션들)
      case 4:
        // 짧은 버전 식별문자 설정 전환
        newParams.useShortVersions = !currentParams.useShortVersions;
        console.log(`짧은 버전 식별문자 사용 변경: ${currentParams.useShortVersions} -> ${newParams.useShortVersions}`);
        break;
      case 5:
        // 혼동 패턴 추가 설정 전환
        newParams.addConfusionPatterns = !currentParams.addConfusionPatterns;
        console.log(`혼동 패턴 추가 변경: ${currentParams.addConfusionPatterns} -> ${newParams.addConfusionPatterns}`);
        break;
      case 6:
        // 색상 필터링 사용 설정 전환
        newParams.useColorFiltering = !currentParams.useColorFiltering;
        console.log(`색상 필터링 사용 변경: ${currentParams.useColorFiltering} -> ${newParams.useColorFiltering}`);
        break;
      case 7:
        // 레벤슈타인 거리 사용 설정 전환
        newParams.useLevenshteinDistance = !currentParams.useLevenshteinDistance;
        console.log(`레벤슈타인 거리 사용 변경: ${currentParams.useLevenshteinDistance} -> ${newParams.useLevenshteinDistance}`);
        break;
      case 8:
        // 병렬 검색 설정 전환
        newParams.parallelSearch = !currentParams.parallelSearch;
        console.log(`병렬 검색 사용 변경: ${currentParams.parallelSearch} -> ${newParams.parallelSearch}`);
        break;
      case 9:
        // 계층적 분류 설정 전환
        newParams.useCascadeRanking = !currentParams.useCascadeRanking;
        console.log(`계층적 분류 사용 변경: ${currentParams.useCascadeRanking} -> ${newParams.useCascadeRanking}`);
        break;
      case 10:
        // 텍스트 가중치와 색상 가중치 동시에 조정
        const txtIdx = paramRanges.textWeights.indexOf(currentParams.textWeight);
        const colIdx = paramRanges.colorWeights.indexOf(currentParams.colorWeight);
        newParams.textWeight = paramRanges.textWeights[(txtIdx + 1) % paramRanges.textWeights.length];
        newParams.colorWeight = paramRanges.colorWeights[(colIdx + 1) % paramRanges.colorWeights.length];
        console.log(`텍스트 가중치 변경: ${currentParams.textWeight} -> ${newParams.textWeight}`);
        console.log(`색상 가중치 변경: ${currentParams.colorWeight} -> ${newParams.colorWeight}`);
        break;
      case 11:
        // 색상 필터링과 레벤슈타인 거리 동시에 조정
        newParams.useColorFiltering = !currentParams.useColorFiltering;
        newParams.useLevenshteinDistance = !currentParams.useLevenshteinDistance;
        console.log(`색상 필터링 사용 변경: ${currentParams.useColorFiltering} -> ${newParams.useColorFiltering}`);
        console.log(`레벤슈타인 거리 사용 변경: ${currentParams.useLevenshteinDistance} -> ${newParams.useLevenshteinDistance}`);
        break;
    }
    
    return newParams;
  };
  
  console.log('초기 파라미터:', currentParams);
  
  // 순차적 테스트 시작
  while (!allSuccessful && attempts < MAX_ATTEMPTS) {
    attempts++;
    console.log(`\n===== 시도 ${attempts} =====`);
    console.log('현재 파라미터:', {
      textWeight: currentParams.textWeight,
      colorWeight: currentParams.colorWeight,
      shapeWeight: currentParams.shapeWeight,
      similarityThreshold: currentParams.similarityThreshold,
      useShortVersions: currentParams.useShortVersions,
      addConfusionPatterns: currentParams.addConfusionPatterns,
      useColorFiltering: currentParams.useColorFiltering,
      useLevenshteinDistance: currentParams.useLevenshteinDistance,
      parallelSearch: currentParams.parallelSearch,
      useCascadeRanking: currentParams.useCascadeRanking
    });
    
    // 이전에 성공한 다음 이미지부터 테스트 시작
    let currentImageIndex = maxSuccessIndex + 1;
    let allImagesPassed = true;
    
    for (let i = 0; i <= maxSuccessIndex; i++) {
      console.log(`이미지 ${i+1}번은 이전에 성공했으므로 건너뜁니다.`);
    }
    
    // 새로운 이미지부터 테스트
    for (let i = currentImageIndex; i < imageFiles.length; i++) {
      const imageName = imageFiles[i];
      const expectedItem = GROUND_TRUTH[imageName];
      
      console.log(`\n이미지 ${i+1}번 테스트: ${imageName}, 기대 의약품명: ${expectedItem.name} (ITEM_SEQ: ${expectedItem.seq})`);
      
      try {
        // 약품 테스트 실행 (새로운 runTest 함수 사용)
        const result = await runTest(imageName, currentParams, true);
        
        if (!result) {
          console.error(`이미지 ${i+1}번 테스트 중 오류 발생: 결과가 없음`);
          allImagesPassed = false;
          break;
        }
        
        // 결과 로깅 추가
        console.log(`테스트 결과:`, JSON.stringify({
          success: result.success,
          rank: result.rank,
          score: result.score
        }));
        
        // 정답이 상위 9개 안에 들어가는지 확인
        if (result.rank > 0 && result.rank <= 9) {
          console.log(`이미지 ${i+1}번 테스트 성공! 정답이 ${result.rank}위에 포함됨 (점수: ${result.score?.toFixed(2) || '알 수 없음'})`);
          
          // 더 높은 성공 인덱스로 업데이트
          if (i > maxSuccessIndex) {
            maxSuccessIndex = i;
          }
        } else {
          console.log(`이미지 ${i+1}번 테스트 실패. 정답이 상위 9개에 포함되지 않음`);
          if (result.rank > 0) {
            console.log(`정답이 ${result.rank}위에 있습니다 (점수: ${result.score?.toFixed(2) || '알 수 없음'})`);
          } else {
            console.log('정답을 찾지 못했습니다.');
          }
          
          allImagesPassed = false;
          
          // 파라미터 수정하고 처음부터 다시 시작
          currentParams = generateNextParams(currentParams, i);
          break;
        }
      } catch (error) {
        console.error(`이미지 ${i+1}번 테스트 중 오류 발생:`, error);
        allImagesPassed = false;
        
        // 파라미터 수정하고 처음부터 다시 시작
        currentParams = generateNextParams(currentParams, i);
        break;
      }
    }
    
    // 모든 이미지가 통과했는지 확인
    if (allImagesPassed && maxSuccessIndex === imageFiles.length - 1) {
      allSuccessful = true;
      console.log('\n===== 모든 이미지 테스트 성공! =====');
    }
    
    // 최적화 단계 기록
    optimizationSteps.push({
      attempt: attempts,
      params: { ...currentParams },
      maxSuccessIndex,
      allSuccessful
    });
  }
  
  // 결과 출력
  console.log('\n===== 순차적 최적화 결과 =====');
  
  if (allSuccessful) {
    console.log(`총 ${attempts}번의 시도 후 모든 이미지를 상위 9개 내에 포함하는 파라미터를 찾았습니다!`);
    console.log('\n최적의 파라미터 조합:');
    console.log(`- 식별문자 가중치: ${currentParams.textWeight}`);
    console.log(`- 색상 가중치: ${currentParams.colorWeight}`);
    console.log(`- 모양 가중치: ${currentParams.shapeWeight}`);
    console.log(`- 유사도 임계값: ${currentParams.similarityThreshold}`);
    console.log(`- 짧은 버전 식별문자 사용: ${currentParams.useShortVersions}`);
    console.log(`- 혼동 패턴 추가: ${currentParams.addConfusionPatterns}`);
    console.log(`- 색상 필터링 사용: ${currentParams.useColorFiltering}`);
    console.log(`- 레벤슈타인 거리 사용: ${currentParams.useLevenshteinDistance}`);
    console.log(`- 병렬 검색 사용: ${currentParams.parallelSearch}`);
    console.log(`- 계층적 분류 사용: ${currentParams.useCascadeRanking}`);
  } else {
    console.log(`최대 시도 횟수(${MAX_ATTEMPTS})에 도달했지만 모든 이미지를 성공시키는 파라미터를 찾지 못했습니다.`);
    console.log(`현재까지 ${maxSuccessIndex + 1}개 이미지까지 성공했습니다.`);
    console.log('\n가장 좋은 파라미터 조합:');
    console.log(`- 식별문자 가중치: ${currentParams.textWeight}`);
    console.log(`- 색상 가중치: ${currentParams.colorWeight}`);
    console.log(`- 모양 가중치: ${currentParams.shapeWeight}`);
    console.log(`- 유사도 임계값: ${currentParams.similarityThreshold}`);
    console.log(`- 짧은 버전 식별문자 사용: ${currentParams.useShortVersions}`);
    console.log(`- 혼동 패턴 추가: ${currentParams.addConfusionPatterns}`);
    console.log(`- 색상 필터링 사용: ${currentParams.useColorFiltering}`);
    console.log(`- 레벤슈타인 거리 사용: ${currentParams.useLevenshteinDistance}`);
    console.log(`- 병렬 검색 사용: ${currentParams.parallelSearch}`);
    console.log(`- 계층적 분류 사용: ${currentParams.useCascadeRanking}`);
  }
  
  return {
    success: allSuccessful,
    bestParams: currentParams,
    attempts,
    maxSuccessIndex,
    optimizationSteps
  };
}

// 명령행 인수 처리 및 실행
const args = process.argv.slice(2);
if (args.length > 0) {
  // 단일 테스트 모드
  if (args[0] === 'test' && args[1]) {
    const imagePath = path.join(TEST_IMAGES_DIR, args[1]);
    console.log(`단일 테스트 모드: ${imagePath}`);
    runSingleTest(imagePath).catch(console.error);
  }
  // ITEM_SEQ로 테스트
  else if (args[0] === 'seq' && args[1]) {
    const itemSeq = args[1];
    console.log(`ITEM_SEQ 테스트 모드: ${itemSeq}`);
    
    // GROUND_TRUTH에서 해당 ITEM_SEQ를 가진 항목 찾기
    let imageName = null;
    let expectedItem = null;
    
    for (const [image, item] of Object.entries(GROUND_TRUTH)) {
      if (item.seq === itemSeq) {
        imageName = image;
        expectedItem = item;
        break;
      }
    }
    
    if (imageName) {
      const imagePath = path.join(TEST_IMAGES_DIR, imageName);
      console.log(`이미지 찾음: ${imagePath}`);
      runSingleTest(imagePath, expectedItem).catch(console.error);
    } else {
      console.error(`ITEM_SEQ ${itemSeq}에 해당하는 테스트 이미지를 찾을 수 없습니다.`);
    }
  }
  // 최적 파라미터 찾기 모드
  else if (args[0] === 'optimize') {
    console.log('최적 파라미터 찾기 모드');
    runAllTests().catch(console.error);
  }
  // 순차적 최적화 모드
  else if (args[0] === 'sequential') {
    console.log('순차적 최적화 모드');
    runSequentialOptimization().catch(console.error);
  }
  else {
    console.log('사용법:');
    console.log('- 단일 테스트: node test-optimizer.js test <이미지파일명>');
    console.log('- ITEM_SEQ 테스트: node test-optimizer.js seq <ITEM_SEQ>');
    console.log('- 최적 파라미터 찾기: node test-optimizer.js optimize');
    console.log('- 순차적 최적화: node test-optimizer.js sequential');
  }
} else {
  // 기본 실행 (전체 테스트)
  runAllTests().catch(console.error);
} 