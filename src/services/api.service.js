class MedicineAPIService {
  constructor() {
    // 모든 환경에서 동일한 API 엔드포인트 사용
    this.BASE_URL = 'http://apis.data.go.kr/1471000/MdcinGrnIdntfcInfoService01';
    
    if (!process.env.MEDICINE_API_KEY_ENCODED) {
      throw new Error('MEDICINE_API_KEY_ENCODED is not set in environment variables');
    }
    this.ENCODED_API_KEY = process.env.MEDICINE_API_KEY_ENCODED;
  }

  async searchMedicine(params) {
    try {
      const otherParams = new URLSearchParams({
        pageNo: params.pageNo || 1,
        numOfRows: params.numOfRows || 10,
        type: 'json',
        ...params
      }).toString();

      const url = `${this.BASE_URL}/getMdcinGrnIdntfcInfoList01?serviceKey=${this.ENCODED_API_KEY}&${otherParams}`;
      console.log('요청 URL:', url);

      const response = await fetch(url);
      const text = await response.text();
      console.log('응답 내용:', text);

      try {
        const data = JSON.parse(text);
        return data.body?.items || [];
      } catch (parseError) {
        console.error('JSON 파싱 오류:', parseError);
        throw new Error('API 응답이 JSON 형식이 아닙니다');
      }
    } catch (error) {
      console.error('의약품 검색 중 오류 발생:', error);
      throw error;
    }
  }

  async searchDetailInfo(itemSeq) {
    try {
      const otherParams = new URLSearchParams({
        item_seq: itemSeq,
        pageNo: 1,
        numOfRows: 1,
        type: 'json'
      }).toString();

      const url = `${this.BASE_URL}/getMdcinGrnIdntfcInfoList01?serviceKey=${this.ENCODED_API_KEY}&${otherParams}`;
      console.log('상세 정보 요청 URL:', url);

      const response = await fetch(url);
      const text = await response.text();
      console.log('상세 정보 응답:', text);

      try {
        const data = JSON.parse(text);
        return data.body?.items?.[0] || null;
      } catch (parseError) {
        console.error('JSON 파싱 오류:', parseError);
        throw new Error('API 응답이 JSON 형식이 아닙니다');
      }
    } catch (error) {
      console.error('의약품 상세 정보 조회 중 오류 발생:', error);
      throw error;
    }
  }

  async testSearch() {
    try {
      const params = {
        pageNo: 1,
        numOfRows: 3,
        type: 'json'
      };
      
      const result = await this.searchMedicine(params);
      console.log('검색 결과:', result);
      return result;
    } catch (error) {
      console.error('테스트 검색 실패:', error);
      throw error;
    }
  }
}

module.exports = MedicineAPIService; 