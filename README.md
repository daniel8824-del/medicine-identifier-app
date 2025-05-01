# 의약품 식별 시스템

AI 기반 의약품 식별 시스템 - 식별문자 및 이미지를 통한 한국 의약품 식별 서비스

의약품을 빠르고 정확하게 식별할 수 있는 웹 및 모바일 애플리케이션입니다. 식별문자를 통한 정확한 검색과 AI 기반 이미지 분석을 활용하여 사용자가 쉽게 의약품을 식별하고 관련 정보를 확인할 수 있습니다.

## 주요 기능

- **식별문자 기반 검색**: 가장 정확한 의약품 식별 방법
- **다중 조건 검색**: 제형, 색상, 모양 등 복합 조건으로 검색
- **이미지 분석**: AI를 활용한 의약품 이미지 자동 분석
- **PWA 지원**: 모바일에서도 웹앱으로 사용 가능
- **모바일 앱**: Capacitor를 활용한 iOS/Android 앱 지원

## 기술 스택

- **Frontend**: HTML, CSS, JavaScript
- **Backend**: Node.js, Express
- **Database**: Supabase (PostgreSQL)
- **API 연동**: 식약처 의약품 정보 API
- **AI/ML**: OpenAI Vision API
- **이미지 처리**: Sharp
- **모바일**: Capacitor (iOS/Android)

## 식별 알고리즘 특징

- 정확한 식별문자 매칭 (특정 패턴 우선 처리)
- 식별문자 고유성 평가 시스템
- 통합 유사도 계산 알고리즘
- 계층적 결과 정렬 방식

## 설치 방법

1. 저장소 클론
```bash
git clone https://github.com/username/medicine-identifier-app.git
cd medicine-identifier-app
```

2. 의존성 설치
```bash
npm install
```

3. 환경 변수 설정
- `.env` 파일 생성
- 필요한 API 키 설정:
  - `OPENAI_API_KEY`: OpenAI API 키
  - `SUPABASE_URL`: Supabase URL
  - `SUPABASE_SECRET_KEY`: Supabase 비밀 키
  - `MEDICINE_API_KEY_ENCODED`: 식약처 의약품 API 키

4. 개발 서버 실행
```bash
npm run serve
```

5. 모바일 앱 빌드 (선택사항)
```bash
# iOS
npx cap add ios
npx cap open ios

# Android
npx cap add android
npx cap open android
```

## 식별문자 활용 팁

의약품 식별에 가장 효과적인 방법은 식별문자를 정확히 입력하는 것입니다:
- 의약품 앞면과 뒷면에 새겨진 문자, 숫자, 기호를 확인
- 앞뒷면 모두 입력 시 더 정확한 결과
- 흔한 식별문자 패턴: HW+CS(세나서트), AUK+R1(오스타틴) 등

## 라이선스

MIT License 

## 배포 방법

### Vercel 배포
1. [Vercel](https://vercel.com)에 GitHub 계정으로 로그인
2. New Project 선택
3. 해당 GitHub 저장소 import
4. 환경 변수 설정:
   - `OPENAI_API_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SECRET_KEY`
   - `MEDICINE_API_KEY_ENCODED`
5. Deploy 클릭

### 수동 배포
```bash
# 프로덕션 빌드
npm run build

# 정적 파일 배포
npm run deploy
```

## 개발 환경 설정

### 필수 요구사항
- Node.js 16.x 이상
- npm 8.x 이상
- Git

### 개발 서버 실행
```bash
# 개발 서버 시작
npm run dev

# 테스트 실행
npm run test

# 린트 검사
npm run lint
```

## 문제 해결

일반적인 문제 해결 방법:
1. 환경 변수가 올바르게 설정되었는지 확인
2. 의존성 패키지 재설치: `npm clean-install`
3. 개발 서버 재시작
4. 브라우저 캐시 삭제
