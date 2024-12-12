const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
require('dotenv').config();
const sharp = require('sharp');

// HTML 엔티티 디코딩 함수
function decodeHTMLEntities(text) {
    if (!text) return '';
    
    const entities = {
        '&amp;': '&',
        '&lt;': '<',
        '&gt;': '>',
        '&quot;': '"',
        '&#39;': "'",
        '&#x2F;': '/',
        '&#x60;': '`',
        '&#x3D;': '=',
        '&nbsp;': ' '
    };
    
    return text.replace(/&[#\w]+;/g, entity => {
        const decoded = entities[entity];
        return decoded || entity;
    });
}

// 의약품 API 설정
const MEDICINE_API_BASE_URL = 'http://apis.data.go.kr/1471000/MdcinGrnIdntfcInfoService01';
const API_ENDPOINT = '/getMdcinGrnIdntfcInfoList01';

if (!process.env.MEDICINE_API_KEY_ENCODED) {
  throw new Error('MEDICINE_API_KEY_ENCODED is not set in environment variables');
}
const API_KEY = process.env.MEDICINE_API_KEY_ENCODED;

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({limit: '50mb'}));
app.use(express.urlencoded({limit: '50mb', extended: true}));
app.use(express.static('public'));

// 요청 크기 제한 증가
app.use(express.json({limit: '50mb'}));
app.use(express.urlencoded({limit: '50mb', extended: true}));

// CORS 설정 추가
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// 타임아웃 설정
app.use((req, res, next) => {
    req.setTimeout(300000); // 5분
    res.setTimeout(300000); // 5분
    next();
});

// SQLite 데이터베스 설정
const dbPath = path.join(__dirname, 'medicines.db');
const db = new sqlite3.Database(dbPath);

// 데이터베이스 초기화
function initializeDatabase() {
    console.log('데이터베이스 초기화 중...');
    db.serialize(() => {
        // 테이블 생성
        db.run(`
            CREATE TABLE IF NOT EXISTS medicines (
                ITEM_SEQ TEXT PRIMARY KEY,
                ITEM_NAME TEXT,
                ENTP_NAME TEXT,
                CHART TEXT,
                PRINT_FRONT TEXT,
                PRINT_BACK TEXT,
                DRUG_SHAPE TEXT,
                COLOR_CLASS1 TEXT,
                COLOR_CLASS2 TEXT,
                LINE_FRONT TEXT,
                LINE_BACK TEXT,
                LENG_LONG TEXT,
                LENG_SHORT TEXT,
                THICK TEXT,
                CLASS_NAME TEXT,
                ETC_OTC_NAME TEXT,
                ITEM_PERMIT_DATE TEXT,
                FORM_CODE_NAME TEXT,
                MARK_CODE_FRONT_ANAL TEXT,
                MARK_CODE_BACK_ANAL TEXT,
                ITEM_IMAGE TEXT,
                MARK_CODE_FRONT_IMG TEXT,
                MARK_CODE_BACK_IMG TEXT,
                ITEM_ENG_NAME TEXT,
                EDI_CODE TEXT,
                last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 인덱스 생성
        db.run('CREATE INDEX IF NOT EXISTS idx_item_name ON medicines(ITEM_NAME)');
        db.run('CREATE INDEX IF NOT EXISTS idx_entp_name ON medicines(ENTP_NAME)');
        db.run('CREATE INDEX IF NOT EXISTS idx_print_front ON medicines(PRINT_FRONT)');
        db.run('CREATE INDEX IF NOT EXISTS idx_print_back ON medicines(PRINT_BACK)');
        db.run('CREATE INDEX IF NOT EXISTS idx_color_class1 ON medicines(COLOR_CLASS1)');
        db.run('CREATE INDEX IF NOT EXISTS idx_color_class2 ON medicines(COLOR_CLASS2)');
        db.run('CREATE INDEX IF NOT EXISTS idx_line_front ON medicines(LINE_FRONT)');
        db.run('CREATE INDEX IF NOT EXISTS idx_line_back ON medicines(LINE_BACK)');
        db.run('CREATE INDEX IF NOT EXISTS idx_drug_shape ON medicines(DRUG_SHAPE)');
        db.run('CREATE INDEX IF NOT EXISTS idx_form_code_name ON medicines(FORM_CODE_NAME)');
        
        // 복합 인덱스 추가
        db.run('CREATE INDEX IF NOT EXISTS idx_colors ON medicines(COLOR_CLASS1, COLOR_CLASS2)');
        db.run('CREATE INDEX IF NOT EXISTS idx_prints ON medicines(PRINT_FRONT, PRINT_BACK)');
        db.run('CREATE INDEX IF NOT EXISTS idx_shape_form ON medicines(DRUG_SHAPE, FORM_CODE_NAME)');
    });
}

// 데이터베이스 초기화 실행
initializeDatabase();

// XML 파싱 함수
function parseXMLResponse(xmlString, showLogs = false) {
    const resultCode = xmlString.match(/<resultCode>(.*?)<\/resultCode>/)?.[1];
    const resultMsg = xmlString.match(/<resultMsg>(.*?)<\/resultMsg>/)?.[1];
    
    if (resultCode !== '00') {
        if (showLogs) {
            console.log('API 응답 코드:', resultCode);
            console.log('API 응답 메시지:', resultMsg);
        }
        return { totalCount: 0, items: [] };
    }
    
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    
    const totalCountMatch = xmlString.match(/<totalCount>(\d+)<\/totalCount>/);
    const totalCount = totalCountMatch ? parseInt(totalCountMatch[1]) : 0;
    
    while ((match = itemRegex.exec(xmlString)) !== null) {
        const itemXml = match[1];
        const item = {};
        
        [
            'ITEM_SEQ', 'ITEM_NAME', 'ENTP_SEQ', 'ENTP_NAME', 'CHART',
            'ITEM_IMAGE', 'PRINT_FRONT', 'PRINT_BACK', 'DRUG_SHAPE',
            'COLOR_CLASS1', 'COLOR_CLASS2', 'LINE_FRONT', 'LINE_BACK',
            'LENG_LONG', 'LENG_SHORT', 'THICK', 'IMG_REGIST_TS',
            'CLASS_NO', 'CLASS_NAME', 'ETC_OTC_NAME', 'ITEM_PERMIT_DATE',
            'FORM_CODE_NAME', 'MARK_CODE_FRONT_ANAL', 'MARK_CODE_BACK_ANAL',
            'MARK_CODE_FRONT_IMG', 'MARK_CODE_BACK_IMG', 'CHANGE_DATE',
            'MARK_CODE_FRONT', 'MARK_CODE_BACK', 'ITEM_ENG_NAME', 'EDI_CODE'
        ].forEach(field => {
            const fieldRegex = new RegExp(`<${field}>(.*?)<\/${field}>`);
            const fieldMatch = itemXml.match(fieldRegex);
            item[field] = fieldMatch ? decodeHTMLEntities(fieldMatch[1]) : '';
        });
        
        items.push(item);
    }
    
    return { totalCount, items };
}

// 지연 함수
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// API 요청 함수 (시도 로직 포함)
async function fetchWithRetry(url, retries = 3, delayMs = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await axios.get(url);
            return response;
        } catch (error) {
            if (i === retries - 1) throw error;
            console.log(`요청 실패, ${delayMs}ms 후 재시도... (${i + 1}/${retries})`);
            await delay(delayMs);
        }
    }
}

// 데이터 수집 및 저장
async function collectAndSaveData() {
    return new Promise(async (resolve, reject) => {
        try {
            console.log('데이터 수집 시작...');
            
            // 전체 이터 수 확인
            const countUrl = `${MEDICINE_API_BASE_URL}${API_ENDPOINT}?serviceKey=${API_KEY}&pageNo=1&numOfRows=1&type=xml`;
            const countResponse = await fetchWithRetry(countUrl);
            const countResult = parseXMLResponse(countResponse.data, false);
            const totalCount = countResult.totalCount || 0;
            const totalPages = Math.ceil(totalCount / 100);

            console.log(`전체 의약품 수: ${totalCount}개 (${totalPages} 페이지)`);

            let processedCount = 0;
            
            // 데이터베이스 초기화
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');
                db.run('DELETE FROM medicines', [], async (err) => {
                    if (err) {
                        console.error('기존 데이터 삭제 중 오류:', err);
                        db.run('ROLLBACK');
                        reject(err);
                        return;
                    }

                    const stmt = db.prepare(`
                        INSERT OR REPLACE INTO medicines (
                            ITEM_SEQ, ITEM_NAME, ENTP_NAME, CHART,
                            PRINT_FRONT, PRINT_BACK, DRUG_SHAPE,
                            COLOR_CLASS1, COLOR_CLASS2, LINE_FRONT, LINE_BACK,
                            LENG_LONG, LENG_SHORT, THICK,
                            CLASS_NAME, ETC_OTC_NAME, ITEM_PERMIT_DATE,
                            FORM_CODE_NAME, MARK_CODE_FRONT_ANAL, MARK_CODE_BACK_ANAL,
                            ITEM_IMAGE, MARK_CODE_FRONT_IMG, MARK_CODE_BACK_IMG,
                            ITEM_ENG_NAME, EDI_CODE
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `);

                    // 각 페이지의 데이터 수집 및 저장
                    const processPage = async (page) => {
                        try {
                            const url = `${MEDICINE_API_BASE_URL}${API_ENDPOINT}?serviceKey=${API_KEY}&pageNo=${page}&numOfRows=100&type=xml`;
                            const response = await fetchWithRetry(url);
                            const result = parseXMLResponse(response.data, false);
                            
                            if (result.items && result.items.length > 0) {
                                for (const item of result.items) {
                                    stmt.run(
                                        item.ITEM_SEQ || '',
                                        item.ITEM_NAME || '',
                                        item.ENTP_NAME || '',
                                        item.CHART || '',
                                        item.PRINT_FRONT || '',
                                        item.PRINT_BACK || '',
                                        item.DRUG_SHAPE || '',
                                        item.COLOR_CLASS1 || '',
                                        item.COLOR_CLASS2 || '',
                                        item.LINE_FRONT || '',
                                        item.LINE_BACK || '',
                                        item.LENG_LONG || '',
                                        item.LENG_SHORT || '',
                                        item.THICK || '',
                                        item.CLASS_NAME || '',
                                        item.ETC_OTC_NAME || '',
                                        item.ITEM_PERMIT_DATE || '',
                                        item.FORM_CODE_NAME || '',
                                        item.MARK_CODE_FRONT_ANAL || '',
                                        item.MARK_CODE_BACK_ANAL || '',
                                        item.ITEM_IMAGE || '',
                                        item.MARK_CODE_FRONT_IMG || '',
                                        item.MARK_CODE_BACK_IMG || '',
                                        item.ITEM_ENG_NAME || '',
                                        item.EDI_CODE || ''
                                    );
                                }
                                processedCount += result.items.length;
                                const progress = ((page / totalPages) * 100).toFixed(1);
                                console.log(`진행 중: ${page}/${totalPages} 페이지 (${progress}%) - ${processedCount}/${totalCount}개 저장됨`);
                            }
                        } catch (error) {
                            console.error(`페이지 ${page} 처리 중 오류:`, error);
                            throw error;
                        }
                    };

                    // 모든 페이지 처리
                    for (let page = 1; page <= totalPages; page++) {
                        await processPage(page);
                    }

                    // 트랜잭션 완료
                    db.run('COMMIT', (err) => {
                        if (err) {
                            console.error('트랜잭션 커밋 중 오류:', err);
                            db.run('ROLLBACK');
                            reject(err);
                            return;
                        }
                        console.log('데이터 수집 완료!');
                        console.log(`총 ${processedCount}개의 의약품 정보가 저장되었습니다.`);
                        resolve();
                    });
                });
            });
        } catch (error) {
            console.error('데이터 수집 중 오류:', error);
            reject(error);
        }
    });
}

// 제형 매핑 정의
const FORM_TYPE_MAPPING = {
    '정제': ['정제'],      // '정제'라는 단어가 포함  제형
    '질캡슐': ['경질'],  // '질'이라는 단어가 포함된 모든 제형
    '연질캡슐': ['연질']   // '연질'이라는 단어가 포함된 모든 제형
};

// OpenAI Vision API 설정
const { OpenAI } = require('openai');
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Vision 서비스 클래스
class VisionService {
    static async analyzeImage(imageData) {
        try {
            const systemPrompt = "당신은 의약품 이미지를 분석하는 전문가입니다.";
            const response = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content: systemPrompt
                    },
                    {
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text: "이 의약품의 특징을 분석해주세요. 식별문자 판독이 가장 중요하며, 다음 사항들을 특히 주의해서 분석해주세요:\n\n" +
                                      "1. 식별문자 판독이 가장 중요합니다. 모든 글자를 정확하게 식별하려 노력해주세요.\n" +
                                      "2. 투명한 약품은 대부분 연질캡슐제입니다. 제형 판단 시 이를 고려해주세요.\n" +
                                      "3. 투명하거나 반사광이 있는 약품은 식별문자가 보이기 어려우므로 더욱 주의 게 관찰해주세요.\n" +
                                      "4. 식별문자가 있는 부분의 윤곽을 자세히 관찰하세요.\n" +
                                      "5. 식별문자가 여러 부분으로 나뉘어 있다면, 각 부분을 개별적으로 분석하세요.\n" +
                                      "6. 특히 'S'와 '5', 'B'와 '8', 'I'와 '1' 등 혼동되기 쉬운 문자는 더욱 신중히 관찰하세요.\n" +
                                      "7. 식별문자가 'SI', 'PDN'처럼 그룹으로 나뉘어 있을 수 있으니 주의해서 보세요.\n" +
                                      "8. 반사광이 있더라도 식별문자의 윤곽이나 일부가 보인다면 최대한 판독해주세요.\n\n" +
                                      "분석 결과를 다음 JSON 형식으로 정확히 알려주세요:\n" +
                                      "{\n" +
                                      "  \"제형\": \"정제|경질캡슐|연질캡슐\",\n" +
                                      "  \"모양\": \"원형|타원형|장방형|반원형|삼각형|사각형|마름모형|오형|육각형|팔각형\",\n" +
                                      "  \"색상(앞)\": \"하양|노랑|주황|분홍|빨강|갈색|연두|초록|청록|파랑|색|주황|보라|회색|투명\",\n" +
                                      "  \"색상(뒤)\": \"하양|노랑|주황|분홍|빨강|갈색|연두|초록|청록|파랑|남색|자주|보라|회색|투명\",\n" +
                                      "  \"분할선(앞)\": \"없음|+형|-형|기타\",\n" +
                                      "  \"분할선(뒤)\": \"없음|+형|-형|기타\",\n" +
                                      "  \"식별문자(앞)\": \"보이는 문자나 숫자를 정확하게 입력\",\n" +
                                      "  \"식별문자(뒤)\": \"보이는 문자��� 숫자를 정확하게 입력\",\n" +
                                      "  \"식별문자_특징\": \"양각|음각|인쇄|각인\"\n" +
                                      "}\n" +
                                      "주의사항:\n" +
                                      "1. 반드시 위 JSON 형식으로만 응답해주세요.\n" +
                                      "2. 식별문자가 전혀 보이지 않는 면은 \"없음\"으로 표시해주세요.\n" +
                                      "3. 식별문자는 정확히 보이는 글자나 숫자만 입력해주세요. 추측하지 마세요.\n" +
                                      "4. 별문자에 이픈(-) 호가 있다면 그대로 입력해주세요.\n" +
                                      "4. 식별문자에 하이픈(-) 호가 있다면 그대로 입력해주세요.\n" +
                                      "5. 식별문자가 완전히 불확실한 경우만 \"불확실\"로 표시하고, 일부라도 보이면 보이는 부분을 입력해주세요.\n" +
                                      "6. 식별문자의 깊이감(양각/음각)도 함께 분석해주세요."
                            },
                            {
                                type: "image_url",
                                image_url: {
                                    url: imageData
                                }
                            }
                        ]
                    }
                ],
                max_tokens: 500,
                temperature: 0.1
            });

            const content = response.choices[0].message.content;
            console.log('GPT 응답:', content);

            try {
                // JSON 문열에서 실제 JSON 부분만 추출
                const jsonMatch = content.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const parsedResult = JSON.parse(jsonMatch[0]);
                    console.log('파싱 결과:', parsedResult);
                    return parsedResult;
                }
                throw new Error('JSON 형식의 응답을 찾을 수 없습니다.');
            } catch (parseError) {
                console.error('JSON 파싱 중 오류:', parseError);
                throw new Error('응답 파싱에 실패했습니다.');
            }
        } catch (error) {
            console.error('Vision API 호출 중 오류:', error);
            throw error;
        }
    }
}

// 색상 그룹 정의
const colorGroups = {
    '투명': ['투명', '하양'],
    '하양': ['하양', '투명'],
    '주황': ['주황', '분홍', '연주황'],
    '분홍': ['분홍', '주황', '연분홍'],
    '빨강': ['빨강', '진빨강'],
    '노랑': ['노랑', '연노랑'],
    '연두': ['연두', '초록'],
    '초록': ['초록', '연두'],
    '파랑': ['파랑', '남색'],
    '남색': ['남색', '파랑'],
    '보라': ['보라', '자주'],
    '갈색': ['갈색', '진갈색'],
    '회색': ['회색', '연회색']
};

// 색상 유사도 맵 정의
const colorSimilarityMap = {
    '파랑': { '남색': 0.8, '청록': 0.7, '보라': 0.6 },
    '남색': { '파랑': 0.8, '보라': 0.7, '청록': 0.6 },
    '빨강': { '주황': 0.7, '분홍': 0.7, '보라': 0.5 },
    '주황': { '강': 0.7, '랑': 0.7, '분홍': 0.5 },
    '노랑': { '주황': 0.7, '연두': 0.6 },
    '연두': { '초록': 0.8, '노랑': 0.6 },
    '초록': { '연두': 0.8, '청록': 0.7 },
    '보라': { '남색': 0.7, '분홍': 0.6, '파랑': 0.6 },
    '분홍': { '빨강': 0.7, '보라': 0.6 },
    '회색': { '하양': 0.6, '정': 0.6 },
    '갈색': { '주황': 0.5, '빨강': 0.4 }
};

// 모양 유사도 맵 정의
const shapeSimilarityMap = {
    '장방형': { '타원형': 0.7, '반원형': 0.5 },
    '타원형': { '장방형': 0.7, '원형': 0.7 },
    '원형': { '타원형': 0.7, '육각형': 0.5 },
    '사각형': { '장방형': 0.8, '마름모형': 0.6 },
    '마름모형': { '사각형': 0.6, '육각형': 0.5 },
    '육각형': { '원형': 0.5, '팔각형': 0.8 },
    '팔각형': { '육각형': 0.8, '원형': 0.5 }
};

// 제형 유사도 맵 정의
const formSimilarityMap = {
    '경질캡제': { '연질캡슐제': 0.8, '장용성캡슐제': 0.7 },
    '연질캡슐제': { '경질캡슐제': 0.8, '장용캡슐제': 0.7 },
    '필름코팅정': { '당정': 0.7, '장용성필름코팅정': 0.8 },
    '당의정': { '필름코팅정': 0.7, '서방정': 0.6 },
    '서방정': { '장용성정': 0.7, '필름코팅정': 0.6 },
    '장용성정': { '서방정': 0.7, '장용성필���코팅정': 0.8 }
};

// 퍼지 유사도 계산 함수
function calculateSimilarity(value1, value2, similarityMap) {
    if (!value1 || !value2) return 0;
    if (value1 === value2) return 1;
    
    const similarity = similarityMap[value1]?.[value2] || similarityMap[value2]?.[value1] || 0;
    return similarity;
}

// 색상 유사도 계산 함수
function calculateColorSimilarity(color1Front, color1Back, color2Front, color2Back) {
    const normalizeColor = (color) => {
        if (!color) return [];
        // 쉼표로 구분된 여러 색상을 배열로 변환
        return color.split(/\s*,\s*/).map(c => c.trim());
    };

    const colors1Front = normalizeColor(color1Front);
    const colors1Back = normalizeColor(color1Back);
    const colors2Front = normalizeColor(color2Front);
    const colors2Back = normalizeColor(color2Back);

    // 앞면끼리, 뒷면끼리 비교
    const frontScore = calculateColorSetSimilarity(colors1Front, colors2Front);
    const backScore = calculateColorSetSimilarity(colors1Back, colors2Back);
    const directScore = (frontScore + backScore) / 2;

    // 앞뒷면 교차 비교
    const crossScore = calculateColorSetSimilarity(
        [...colors1Front, ...colors1Back],
        [...colors2Front, ...colors2Back]
    );

    return Math.max(directScore, crossScore);
}

// 색상 트 간 유사도 계산
function calculateColorSetSimilarity(colors1, colors2) {
    if (!colors1.length || !colors2.length) return 0;

    let matchCount = 0;
    const totalColors = Math.max(colors1.length, colors2.length);

    for (const color1 of colors1) {
        for (const color2 of colors2) {
            if (color1 === color2 || colorSimilarityMap[color1]?.[color2]) {
                matchCount++;
                break;
            }
        }
    }

    return matchCount / totalColors;
}

// 텍스트 부분 매칭 계산 함수
function calculatePartialTextMatch(text1Front, text1Back, text2Front, text2Back) {
    // 그리스 문자와 일반 문자를 모두 포함하 매칭
    const normalizeText = (text) => {
        return text.replace(/[^a-zA-Z0-9ΛΔΩ]/g, '').toUpperCase();
    };

    text1Front = normalizeText(text1Front);
    text1Back = normalizeText(text1Back);
    text2Front = normalizeText(text2Front);
    text2Back = normalizeText(text2Back);

    if (!text1Front && !text1Back) return 0;

    let maxScore = 0;
    const texts1 = [text1Front, text1Back].filter(t => t);
    const texts2 = [text2Front, text2Back].filter(t => t);

    for (const t1 of texts1) {
        for (const t2 of texts2) {
            let score = 0;
            const minLength = Math.min(t1.length, t2.length);
            const maxLength = Math.max(t1.length, t2.length);

            for (let i = 0; i < minLength; i++) {
                if (t1[i] === t2[i]) score++;
            }

            const currentScore = score / maxLength;
            maxScore = Math.max(maxScore, currentScore);
        }
    }

    return maxScore;
}

// 이미지 캐시 설정
const imageCache = new Map();
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24시간

// 검색 API 엔드포인트
app.get('/api/search', (req, res) => {
    const { 
        item_name, 
        entp_name, 
        print,
        drug_shape, 
        color_class1,
        color_class2, 
        form_code_name,
        line_front,
        line_back,
        page = 1, 
        limit = 10 
    } = req.query;
    
    const offset = (page - 1) * limit;
    
    console.log('검색 요청 파라미터:', req.query);
    
    let query = 'SELECT * FROM medicines WHERE 1=1';
    let countQuery = 'SELECT COUNT(*) as total FROM medicines WHERE 1=1';
    let params = [];
    
    try {
        // 기본 검색 조건들
        if (item_name) {
            query += ' AND ITEM_NAME LIKE ?';
            countQuery += ' AND ITEM_NAME LIKE ?';
            params.push(`%${item_name}%`);
        }
        
        if (entp_name) {
            query += ' AND ENTP_NAME LIKE ?';
            countQuery += ' AND ENTP_NAME LIKE ?';
            params.push(`%${entp_name}%`);
        }
        
        if (print) {
            query += ' AND (PRINT_FRONT LIKE ? OR PRINT_BACK LIKE ?)';
            countQuery += ' AND (PRINT_FRONT LIKE ? OR PRINT_BACK LIKE ?)';
            params.push(`%${print}%`, `%${print}%`);
        }
        
        if (drug_shape) {
            query += ' AND DRUG_SHAPE = ?';
            countQuery += ' AND DRUG_SHAPE = ?';
            params.push(drug_shape);
        }
        
        // 검색 조건
        if (color_class1 !== undefined) {
            query += ' AND (COLOR_CLASS1 LIKE ? OR COLOR_CLASS2 LIKE ?)';
            countQuery += ' AND (COLOR_CLASS1 LIKE ? OR COLOR_CLASS2 LIKE ?)';
            params.push(`%${color_class1}%`, `%${color_class1}%`);
        }
        
        if (form_code_name) {
            query += ' AND FORM_CODE_NAME LIKE ?';
            countQuery += ' AND FORM_CODE_NAME LIKE ?';
            params.push(`%${form_code_name}%`);
        }

        // 분할선 검색 조건 (앞면)
        if (line_front) {
            const decodedLineFront = decodeURIComponent(line_front);
            console.log('서버에서 처리하는 앞면 분할선 값:', decodedLineFront);
            
            if (decodedLineFront === '없음') {
                query += ` AND (LINE_FRONT = '' OR LINE_FRONT IS NULL)`;
                countQuery += ` AND (LINE_FRONT = '' OR LINE_FRONT IS NULL)`;
            } else if (decodedLineFront === '+형') {
                query += ' AND LINE_FRONT = "+"';
                countQuery += ' AND LINE_FRONT = "+"';
            } else if (decodedLineFront === '-형') {
                query += ' AND LINE_FRONT = "-"';
                countQuery += ' AND LINE_FRONT = "-"';
            } else if (decodedLineFront === '기타') {
                query += ` AND LINE_FRONT NOT IN ('', '+', '-') AND LINE_FRONT IS NOT NULL`;
                countQuery += ` AND LINE_FRONT NOT IN ('', '+', '-') AND LINE_FRONT IS NOT NULL`;
            }
        }

        // 분할선 검색 조건 (뒷면)
        if (line_back) {
            const decodedLineBack = decodeURIComponent(line_back);
            console.log('서버에서 처리하는 뒷면 분할선 값:', decodedLineBack);
            
            if (decodedLineBack === '없음') {
                query += ` AND (LINE_BACK = '' OR LINE_BACK IS NULL)`;
                countQuery += ` AND (LINE_BACK = '' OR LINE_BACK IS NULL)`;
            } else if (decodedLineBack === '+형') {
                query += ' AND LINE_BACK = "+"';
                countQuery += ' AND LINE_BACK = "+"';
            } else if (decodedLineBack === '-형') {
                query += ' AND LINE_BACK = "-"';
                countQuery += ' AND LINE_BACK = "-"';
            } else if (decodedLineBack === '기타') {
                query += ` AND LINE_BACK NOT IN ('', '+', '-') AND LINE_BACK IS NOT NULL`;
                countQuery += ` AND LINE_BACK NOT IN ('', '+', '-') AND LINE_BACK IS NOT NULL`;
            }
        }

        // 내림차순 정렬 추가 (의약품명을 기준으로)
        query += ' ORDER BY TRIM(ITEM_NAME) ASC';
        
        // 디버깅을 위한 쿼리 로깅
        console.log('실행될 쿼리:', query);
        console.log('실행될 카운트 쿼리:', countQuery);
        console.log('파라미터:', params);

        // 전체 개수 조회
        db.get(countQuery, params, (err, row) => {
            if (err) {
                console.error('검색 카운트 쿼리 실행 중 오류:', err);
                return res.status(500).json({ error: '검색 중 오류가 발생했습니다.' });
            }
            
            const total = row.total;
            const totalPages = Math.ceil(total / limit);
            
            // 페이지네이션 용
            query += ' LIMIT ? OFFSET ?';
            params.push(limit, offset);
            
            // 실제 데이터 조회
            db.all(query, params, (err, rows) => {
                if (err) {
                    console.error('검색 쿼리 실행 중 오류:', err);
                    return res.status(500).json({ error: '검색 중 오류가 발생했습니다.' });
                }
                
                res.json({
                    items: rows,
                    pagination: {
                        total,
                        totalPages,
                        currentPage: parseInt(page),
                        limit: parseInt(limit)
                    }
                });
            });
        });
    } catch (error) {
        console.error('검색 처리 중 예외 발생:', error);
        res.status(500).json({ error: '검색 중 오류가 발생했습니다.' });
    }
});

// 데이터베이스 상 확인
app.get('/api/db-status', (req, res) => {
    db.get(
        'SELECT COUNT(*) as count, MAX(last_updated) as last_updated FROM medicines',
        (err, row) => {
            if (err) {
                res.status(500).json({
                    success: false,
                    error: '데이터베이스 상태 확인 중 오류가 발생했습니다.',
                    message: err.message
                });
                return;
            }

            res.json({
                success: true,
                count: row.count,
                lastUpdated: row.last_updated
            });
        }
    );
});

// 데이터 업데이트
app.post('/api/update-data', async (req, res) => {
    try {
        await collectAndSaveData();
        res.json({ success: true, message: '데이터 업데이트 완료' });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: '데이터 업데이트 실패',
            message: error.message
        });
    }
});

// 서버 시작  데이 확인
db.get('SELECT COUNT(*) as count FROM medicines', (err, row) => {
    if (err) {
        console.error('이터베이스 확인 중 오류:', err);
        return;
    }

    if (row.count === 0) {
        console.log('데이터베이스가 비어있습니다. 초기 이터를 수집합니다...');
        collectAndSaveData().catch(console.error);
    } else {
        console.log(`데이터베이스에 ${row.count}개의 데이터가 있습니다.`);
    }
});

// 이미지 프록시 엔드포인트
app.get('/api/proxy-image', async (req, res) => {
    const imageUrl = req.query.url?.trim();
    if (!imageUrl) {
        return res.status(400).send('Image URL is required');
    }

    // 캐시 확인
    const cachedImage = imageCache.get(imageUrl);
    if (cachedImage && (Date.now() - cachedImage.timestamp < CACHE_DURATION)) {
        res.set('Content-Type', cachedImage.contentType);
        return res.send(cachedImage.data);
    }

    try {
        const response = await axios({
            url: imageUrl,
            responseType: 'arraybuffer',
            headers: {
                'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
            }
        });

        // 이미지 최적화
        const optimizedImage = await sharp(response.data)
            .resize(400, 400, {  // 최대 크기 제한
                fit: 'inside',
                withoutEnlargement: true
            })
            .webp({ quality: 80 })  // WebP 형식으로 변환, 품질 80%
            .toBuffer();

        // 캐시에 저장
        imageCache.set(imageUrl, {
            data: optimizedImage,
            contentType: 'image/webp',
            timestamp: Date.now()
        });

        res.set('Content-Type', 'image/webp');
        res.send(optimizedImage);
    } catch (error) {
        console.error('이미지 프록시 에러:', error);
        res.status(500).send('이미지를 가져오는데 실패했습니다');
    }
});

// 제형 데이터 확인 임시 
app.get('/api/check-forms', (req, res) => {
    db.all('SELECT FORM_CODE_NAME, COUNT(*) as count FROM medicines GROUP BY FORM_CODE_NAME', [], (err, rows) => {
        if (err) {
            console.error('제형 데이터 조회 중 오류:', err);
            res.status(500).json({ error: '데이터 조회 중 오류가 발생했습니다.' });
            return;
        }
        console.log('제형 데이터 수:', rows);
        res.json(rows);
    });
});

// 제형 데이터 확인 API
app.get('/api/form-types', (req, res) => {
    const query = `
        SELECT FORM_CODE_NAME, COUNT(*) as count 
        FROM medicines 
        GROUP BY FORM_CODE_NAME
        ORDER BY count DESC
    `;
    
    db.all(query, [], (err, rows) => {
        if (err) {
            console.error('제형 데이터 조회 중 오류:', err);
            res.status(500).json({ error: '데이터 조회 중 오류가 발생했습니다.' });
            return;
        }
        
        console.log('데이터베이스의 제형 종와 개수:', rows);
        res.json(rows);
    });
});

// 이미지 분석 API 엔드포인트
app.post('/api/analyze-image', async (req, res) => {
    try {
        const { imageData } = req.body;
        if (!imageData) {
            return res.status(400).json({ error: '이미지 데이터가 없습니.' });
        }

        console.log('이미지 분석 시작...');
        const analysisResult = await VisionService.analyzeImage(imageData);
        console.log('분석 결과:', analysisResult);

        // 본 검색 쿼리
        const query = `
            SELECT *
            FROM medicines
            WHERE 1=1
        `;

        // 쿼리 실행
        db.all(query, [], (err, rows) => {
            if (err) {
                console.error('검색 쿼리 실행 중 오류:', err);
                return res.status(500).json({ error: '검색 중 오류가 발생했습니다.' });
            }

            console.log('전체 의약품 수:', rows.length);

            // 1차: 색상 기반 필터링
            const colorFilteredResults = rows.filter(medicine => {
                const frontColors = analysisResult['색상(앞)']?.split(/\s*,\s*/);
                const backColors = analysisResult['색상(뒤)']?.split(/\s*,\s*/);
                
                const frontColorMatch = frontColors?.some(color => {
                    const similarColors = colorGroups[color] || [color];
                    return similarColors.some(c => 
                        medicine.COLOR_CLASS1?.includes(c) || medicine.COLOR_CLASS2?.includes(c)
                    );
                });
                
                const backColorMatch = backColors?.some(color => {
                    const similarColors = colorGroups[color] || [color];
                    return similarColors.some(c => 
                        medicine.COLOR_CLASS1?.includes(c) || medicine.COLOR_CLASS2?.includes(c)
                    );
                });
                
                return frontColorMatch || backColorMatch;
            });

            console.log('색상 필터링 후 의약품 수:', colorFilteredResults.length);

            // 2차: 유사도 계산 및 점수 부여
            const scoredResults = colorFilteredResults.map(medicine => {
                let score = 0;
                let matchDetails = [];
                let weightAdjustments = {
                    form: 0.2,      // 제형 가중치
                    color: 0.1,     // 색상 가중치 낮춤
                    shape: 0.15,    // 모양 가중치
                    text: 0.5,      // 식별문자 가중치 높임
                    line: 0.05      // 분할선 가중치
                };

                // 식별문자 매칭 (가중치: weightAdjustments.text)
                const printFront = (analysisResult['식별문자(앞)'] || '').toUpperCase();
                const printBack = (analysisResult['식별문자(뒤)'] || '').toUpperCase();
                const medicinePrintFront = (medicine.PRINT_FRONT || '').toUpperCase();
                const medicinePrintBack = (medicine.PRINT_BACK || '').toUpperCase();

                if (printFront || printBack) {
                    if ((printFront && (medicinePrintFront.includes(printFront) || medicinePrintBack.includes(printFront))) ||
                        (printBack && (medicinePrintFront.includes(printBack) || medicinePrintBack.includes(printBack)))) {
                        score += weightAdjustments.text;
                        matchDetails.push('식별문자 일치');
                    } else {
                        // 부분 매칭 시도 (기존 로직 유지)
                        // ... existing code ...
                    }
                }

                // 색상 매칭 (가중치: weightAdjustments.color)
                if (analysisResult['색상(앞)'] || analysisResult['색상(뒤)']) {
                    const colorScore = calculateColorSimilarity(
                        analysisResult['색상(앞)'],
                        analysisResult['색상(뒤)'],
                        medicine.COLOR_CLASS1,
                        medicine.COLOR_CLASS2
                    );
                    score += colorScore * weightAdjustments.color;
                    if (colorScore > 0) {
                        matchDetails.push(`색상 유사도: ${(colorScore * 100).toFixed(1)}%`);
                    }
                }

                // 제형 매칭
                if (analysisResult['제형']) {
                    const formScore = calculateSimilarity(
                        analysisResult['제형'],
                        medicine.FORM_CODE_NAME,
                        formSimilarityMap
                    );
                    score += formScore * weightAdjustments.form;
                    if (formScore > 0) {
                        matchDetails.push(`제형 유사도: ${(formScore * 100).toFixed(1)}%`);
                    }
                }

                // 모양 매칭 (가중치: weightAdjustments.shape)
                if (analysisResult['��양']) {
                    const shapeScore = calculateSimilarity(
                        analysisResult['모양'],
                        medicine.DRUG_SHAPE,
                        shapeSimilarityMap
                    );
                    score += shapeScore * weightAdjustments.shape;
                    if (shapeScore > 0) {
                        matchDetails.push(`모양 유사도: ${(shapeScore * 100).toFixed(1)}%`);
                    }
                }

                // 분할선 매칭 (가중치: weightAdjustments.line)
                if (analysisResult['분할선(앞)'] === medicine.LINE_FRONT ||
                    analysisResult['분할선(뒤)'] === medicine.LINE_BACK) {
                    score += weightAdjustments.line;
                    matchDetails.push('분할선 일치');
                }

                return {
                    ...medicine,
                    similarity_score: score,
                    match_details: matchDetails
                };
            });

            // 결과 정렬 및 필터링
            const results = scoredResults
                .filter(item => item.similarity_score > 0.08)
                .map(item => {
                    // 각 항목별 점수 추출
                    const textMatch = item.match_details.find(d => d === '식별문자 일치') ? 1 :
                        item.match_details.find(d => d.includes('식별문자 부분 일치')) ? 
                        parseFloat(item.match_details.find(d => d.includes('식별문자 부분 일치')).match(/\d+\.?\d*/)[0]) / 100 : 0;
                        
                    const colorMatch = item.match_details.find(d => d.includes('색상 유사도')) ?
                        parseFloat(item.match_details.find(d => d.includes('색상 유사도')).match(/\d+\.?\d*/)[0]) / 100 : 0;
                        
                    const shapeMatch = item.match_details.find(d => d.includes('모양 유사도')) ?
                        parseFloat(item.match_details.find(d => d.includes('모양 유사도')).match(/\d+\.?\d*/)[0]) / 100 : 0;
                        
                    const formMatch = item.match_details.find(d => d.includes('제형 유사도')) ?
                        parseFloat(item.match_details.find(d => d.includes('제형 유사도')).match(/\d+\.?\d*/)[0]) / 100 : 0;

                    const lineMatch = item.match_details.includes('분할선 일치') ? 1 : 0;
                        
                    return {
                        ...item,
                        textScore: textMatch,
                        colorScore: colorMatch,
                        shapeScore: shapeMatch,
                        formScore: formMatch,
                        lineScore: lineMatch
                    };
                })
                .sort((a, b) => {
                    if (a.textScore !== b.textScore) return b.textScore - a.textScore;
                    if (a.colorScore !== b.colorScore) return b.colorScore - a.colorScore;
                    if (a.shapeScore !== b.shapeScore) return b.shapeScore - a.shapeScore;
                    if (a.formScore !== b.formScore) return b.formScore - a.formScore;
                    return b.lineScore - a.lineScore;
                })
                .slice(0, 30);  // 상위 30개 결과만 반환

            res.json({
                results: results,
                currentPage: 1
            });
        });
    } catch (error) {
        console.error('이미지 분석 중 오류:', error);
        res.status(500).json({ error: '이미지 분석 중 오류가 발생했습니다.' });
    }
});

// 색상 데이터 확인용 API
app.get('/api/check-colors', (req, res) => {
    const query = `
        SELECT 
            COLOR_CLASS1 as color,
            COUNT(*) as count 
        FROM medicines 
        WHERE COLOR_CLASS1 IS NOT NULL AND COLOR_CLASS1 != ''
        GROUP BY COLOR_CLASS1
        UNION ALL
        SELECT 
            COLOR_CLASS2 as color,
            COUNT(*) as count 
        FROM medicines 
        WHERE COLOR_CLASS2 IS NOT NULL AND COLOR_CLASS2 != ''
        GROUP BY COLOR_CLASS2
        ORDER BY count DESC
    `;
    
    db.all(query, [], (err, rows) => {
        if (err) {
            console.error('색상 데이터 조회 중 오류:', err);
            res.status(500).json({ error: '데이터 조회 중 오류가 발생했습니다.' });
            return;
        }
        console.log('색상별 이터 수:', rows);
        res.json(rows);
    });
});

// 분할선 데이터 확인용 API 추가
app.get('/api/check-lines', (req, res) => {
    const query = `
        SELECT DISTINCT 
            LINE_FRONT, 
            LINE_BACK,
            COUNT(*) as count 
        FROM medicines 
        GROUP BY LINE_FRONT, LINE_BACK
        ORDER BY count DESC
    `;
    
    db.all(query, [], (err, rows) => {
        if (err) {
            console.error('분할 데이터 조회 오 오류:', err);
            res.status(500).json({ error: '데이터 조회 중 오류가 발생했습니다.' });
            return;
        }
        console.log('데이터베이스의 분할선 종류와 개수:', rows);
        res.json(rows);
    });
});

// 버 시작 시 샘플 데이터 확인
db.all(`
    SELECT ITEM_NAME, LINE_FRONT 
    FROM medicines 
    WHERE ITEM_NAME IN (
        '가스디알정50밀리그램(메크로틴산마네슘)',
        '페라트라정2.5밀리그(레트졸)'
    )
`, [], (err, rows) => {
    if (err) {
        console.error('샘플 이터 조회 오류:', err);
    } else {
        console.log('샘플 약품의 분할선 터:', rows);
    }
});

app.listen(port, () => {
    console.log(`서버가 ${port} 포트에서 실행 중입니다`);
});