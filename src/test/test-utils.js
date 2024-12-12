const VisionService = require('../services/vision.service');
const MedicineAPIService = require('../services/api.service');
const path = require('path');

// Vision API 단독 테스트
async function testVisionAPI(imagePath) {
  try {
    const visionService = new VisionService();
    console.log('=== Vision API 테스트 ===');
    const result = await visionService.analyzePill(imagePath);
    console.log('분석 결과:', result);
    return result;
  } catch (error) {
    console.error('Vision API 테스트 실패:', error);
    throw error;
  }
}

// 식약처 API 단독 테스트
async function testMedicineAPI(params) {
  try {
    const apiService = new MedicineAPIService();
    console.log('=== 식약처 API 테스트 ===');
    const result = await apiService.searchMedicine(params);
    console.log('검색 결과:', result);
    return result;
  } catch (error) {
    console.error('식약처 API 테스트 실패:', error);
    throw error;
  }
}

module.exports = {
  testVisionAPI,
  testMedicineAPI
}; 