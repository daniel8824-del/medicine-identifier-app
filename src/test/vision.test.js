const VisionService = require('../services/vision.service');
const path = require('path');

async function testVisionService() {
  try {
    const visionService = new VisionService();
    
    // 테스트 이미지의 정확한 경로 지정
    const testImagePath = path.join(__dirname, '..', 'test-images', 'test-pill.jpg');
    console.log('이미지 경로:', testImagePath); // 경로 확인용
    
    console.log('=== 이미지 분석 테스트 ===');
    const result = await visionService.testAnalyze(testImagePath);
    
    console.log('분석된 특징:', {
      모양: result.drug_shape,
      색상: result.color_class,
      분할선: result.line_front,
      표시: result.mark_code_front
    });
  } catch (error) {
    console.error('Vision API 테스트 실패:', error);
  }
}

testVisionService();