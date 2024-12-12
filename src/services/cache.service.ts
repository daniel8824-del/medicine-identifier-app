class CacheService {
  private static readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 24시간

  static async cacheResponse(key: string, data: any) {
    try {
      const cacheData = {
        timestamp: Date.now(),
        data: data
      };
      await localStorage.setItem(key, JSON.stringify(cacheData));
    } catch (error) {
      console.error('캐시 저장 중 오류 발생:', error);
    }
  }

  static async getCachedData(key: string) {
    try {
      const cached = await localStorage.getItem(key);
      if (!cached) return null;

      const { timestamp, data } = JSON.parse(cached);
      if (Date.now() - timestamp > this.CACHE_DURATION) {
        await localStorage.removeItem(key);
        return null;
      }
      return data;
    } catch (error) {
      console.error('캐시 조회 중 오류 발생:', error);
      return null;
    }
  }
} 