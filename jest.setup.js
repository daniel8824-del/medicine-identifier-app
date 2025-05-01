// 테스트용 환경 변수 설정
// Supabase 설정
process.env.SUPABASE_URL = 'https://yhaoqflmnidjllxfvanh.supabase.co';
process.env.SUPABASE_SECRET_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloYW9xZmxtbmlkamxseGZ2YW5oIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NTk5OTUxNywiZXhwIjoyMDYxNTc1NTE3fQ.NprKuylDb9GJjWM7-iq6ZPO6I1azDeTuTDVY4aTP35w';

// 매칭 알고리즘 파라미터
process.env.MATCH_TEXT_WEIGHT = '0.70';
process.env.MATCH_COLOR_WEIGHT = '0.15';
process.env.MATCH_SHAPE_WEIGHT = '0.15';
process.env.MATCH_SIMILARITY_THRESHOLD = '0.35';
process.env.MATCH_USE_SHORT_VERSIONS = 'true';
process.env.MATCH_ADD_CONFUSION_PATTERNS = 'true';
process.env.MATCH_USE_COLOR_FILTERING = 'true';
process.env.MATCH_USE_LEVENSHTEIN_DISTANCE = 'true';
process.env.MATCH_PARALLEL_SEARCH = 'true';
process.env.MATCH_CASCADE_RANKING = 'true'; 