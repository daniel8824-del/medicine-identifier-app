const MedicineAPIService = require('../services/api.service');

async function testAPIService() {
  try {
    const apiService = new MedicineAPIService();
    
    // 1. 기본 검색 테스트
    console.log('=== 기본 검색 테스트 ===');
    const basicResult = await apiService.testSearch();
    
    // 2. 상세 검색 테스트
    console.log('\n=== 상세 정보 테스트 ===');
    if (basicResult && basicResult.length > 0) {
      const itemSeq = basicResult[0].ITEM_SEQ;
      const detailResult = await apiService.searchDetailInfo(itemSeq);
      console.log('상세 정보:', detailResult);
    }
  } catch (error) {
    console.error('API 테스트 실패:', error);
  }
}

testAPIService();