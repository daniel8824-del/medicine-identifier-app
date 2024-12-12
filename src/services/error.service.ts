class ErrorService {
  static handleAPIError(error: any) {
    if (error.response) {
      switch (error.response.status) {
        case 429:
          return '요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.';
        case 401:
          return 'API 인증에 실패했습니다.';
        default:
          return '서비스 요청 중 오류가 발생했습니다.';
      }
    }
    return '네트워크 오류가 발생했습니다.';
  }
} 