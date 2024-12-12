const VisionService = require('../services/vision.service');
const MedicineAPIService = require('../services/api.service');
const path = require('path');

async function searchPillByImage(imagePath) {
  try {
    // 1. Vision API로 이미지 분석
    const visionService = new VisionService();
    console.log('=== Vision API 분석 시작 ===');
    const searchParams = await visionService.analyzePill(imagePath);
    console.log('Vision API 분석 결과:', searchParams);

    // 2. 분석 결과로 의약품 검색
    const apiService = new MedicineAPIService();
    console.log('\n=== 의약품 검색 시작 ===');
    const searchResult = await apiService.searchMedicine(searchParams);
    console.log('검색된 의약품:', searchResult);

    return {
      params: searchParams,
      results: searchResult
    };
  } catch (error) {
    console.error('의약품 검색 실패:', error);
    throw error;
  }
}

// 통합 테스트
async function testIntegration() {
  try {
    const testImagePath = path.join(__dirname, '..', 'test-images', 'test-pill.jpg');
    const result = await searchPillByImage(testImagePath);
    console.log('\n=== 통합 테스트 결과 ===');
    console.log('분석 파라미터:', result.params);
    console.log('검색 결과:', result.results);
  } catch (error) {
    console.error('통합 테스트 실패:', error);
  }
}

// 테스트 실행
testIntegration();

module.exports = { searchPillByImage }; 