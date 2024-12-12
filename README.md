# Medicine Identifier App

AI 기반 의약품 식별 시스템 - 알약 이미지를 통한 한국 의약품 식별 서비스

## 주요 기능

- 알약 이미지 업로드 및 분석
- AI 기반 의약품 식별
- 의약품 정보 제공
- 모바일 친화적 UI

## 기술 스택

- Frontend: React.js
- Backend: Node.js, Express
- AI/ML: TensorFlow.js
- Database: MongoDB
- Image Processing: Sharp
- Mobile: Capacitor (iOS/Android)

## 설치 방법

1. 저장소 클론
```bash
git clone https://github.com/daniel8824-del/medicine-identifier-app.git
```

2. 의존성 설치
```bash
npm install
```

3. 환경 변수 설정
- `.env` 파일 생성 (`.env.example` 참고)
- 필요한 API 키 및 설정 추가

4. 개발 서버 실행
```bash
npm start
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

## 라이선스

MIT License 
