class MedicineSearchService {
  constructor() {
    this.apiService = new MedicineAPIService();
    this.visionService = new VisionService();
  }

  async searchByImage(imageData) {
    try {
      const cacheKey = `image_search_${btoa(imageData).slice(0, 32)}`;
      const cachedResult = await CacheService.getCachedData(cacheKey);
      
      if (cachedResult) {
        return cachedResult;
      }

      const searchParams = await this.visionService.analyzePill(imageData);
      const searchResult = await this.apiService.searchMedicine(searchParams);
      await CacheService.cacheResponse(cacheKey, searchResult);

      return searchResult;
    } catch (error) {
      const errorMessage = ErrorService.handleAPIError(error);
      throw new Error(errorMessage);
    }
  }

  async searchByParams(params) {
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