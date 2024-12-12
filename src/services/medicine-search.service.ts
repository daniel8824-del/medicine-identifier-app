class MedicineSearchService {
  private apiService: MedicineAPIService;
  private visionService: VisionService;
  private cacheService: CacheService;

  constructor() {
    this.apiService = new MedicineAPIService();
    this.visionService = new VisionService();
  }

  async searchByImage(imageData: string) {
    try {
      // 1. 이미지 캐시 확인
      const cacheKey = `image_search_${btoa(imageData).slice(0, 32)}`;
      const cachedResult = await CacheService.getCachedData(cacheKey);
      
      if (cachedResult) {
        return cachedResult;
      }

      // 2. Vision API로 이미지 분석
      const searchParams = await this.visionService.analyzePill(imageData);

      // 3. 분석된 특징으로 의약품 검색
      const searchResult = await this.apiService.searchMedicine(searchParams);

      // 4. 결과 캐싱
      await CacheService.cacheResponse(cacheKey, searchResult);

      return searchResult;
    } catch (error) {
      const errorMessage = ErrorService.handleAPIError(error);
      throw new Error(errorMessage);
    }
  }

  async searchByParams(params: MedicineSearchParams) {
    try {
      const cacheKey = `direct_search_${JSON.stringify(params)}`;
      const cachedResult = await CacheService.getCachedData(cacheKey);

      if (cachedResult) {
        return cachedResult;
      }

      const searchResult = await this.apiService.searchMedicine(params);
      await CacheService.cacheResponse(cacheKey, searchResult);

      return searchResult;
    } catch (error) {
      const errorMessage = ErrorService.handleAPIError(error);
      throw new Error(errorMessage);
    }
  }
} 