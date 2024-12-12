interface MedicineSearchParams {
  item_name?: string;
  entp_name?: string;
  item_seq?: string;
  img_regist_ts?: string;
  pageNo?: number;
  numOfRows?: number;
  edi_code?: string;
}

class MedicineAPIService {
  private readonly BASE_URL = 'http://apis.data.go.kr/1471000/MdcinGrnIdntfcInfoService01';
  private readonly API_KEY = '발급받은_API_키';

  async searchMedicine(params: MedicineSearchParams) {
    try {
      const queryParams = new URLSearchParams({
        serviceKey: this.API_KEY,
        pageNo: String(params.pageNo || 1),
        numOfRows: String(params.numOfRows || 10),
        type: 'json',
        ...params
      });

      const response = await fetch(`${this.BASE_URL}/getMdcinGrnIdntfcInfoList01?${queryParams}`);
      const data = await response.json();
      
      return data.body.items;
    } catch (error) {
      console.error('의약품 검색 중 오류 발생:', error);
      throw error;
    }
  }
} 