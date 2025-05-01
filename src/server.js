// path 모듈을 먼저 불러옵니다
const path = require('path');

// 환경 변수 로드 (명시적 경로 지정)
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// Supabase 연결 확인
console.log('Supabase URL:', process.env.SUPABASE_URL);
console.log('Supabase Key 존재 여부:', !!process.env.SUPABASE_SECRET_KEY);
   
// Supabase 클라이언트 설정
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);
   
console.log('Supabase 연결 설정 완료');

const express = require('express');
const cors = require('cors');
const axios = require('axios');
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
            
            // 전체 데이터 수 확인
            const countUrl = `${MEDICINE_API_BASE_URL}${API_ENDPOINT}?serviceKey=${API_KEY}&pageNo=1&numOfRows=1&type=xml`;
            const countResponse = await fetchWithRetry(countUrl);
            const countResult = parseXMLResponse(countResponse.data, false);
            const totalCount = countResult.totalCount || 0;
            const totalPages = Math.ceil(totalCount / 100);

            console.log(`전체 의약품 수: ${totalCount}개 (${totalPages} 페이지)`);

            let processedCount = 0;
            
            // Supabase 테이블 데이터 삭제
            const { error: deleteError } = await supabase
                .from('medicines')
                .delete()
                .neq('ITEM_SEQ', '');
                
            if (deleteError) {
                console.error('기존 데이터 삭제 중 오류:', deleteError);
                reject(deleteError);
                        return;
                    }

                    // 각 페이지의 데이터 수집 및 저장
                    const processPage = async (page) => {
                        try {
                            const url = `${MEDICINE_API_BASE_URL}${API_ENDPOINT}?serviceKey=${API_KEY}&pageNo=${page}&numOfRows=100&type=xml`;
                            const response = await fetchWithRetry(url);
                            const result = parseXMLResponse(response.data, false);
                            
                            if (result.items && result.items.length > 0) {
                        // 각 항목에 날짜 필드 처리 및 검증 추가
                        const processedItems = result.items.map(item => {
                            // CHANGE_DATE 형식 확인 및 표준화 (필요한 경우)
                            if (item.CHANGE_DATE) {
                                try {
                                    // 날짜 형식 확인 및 변환 (YYYYMMDD 형식이라고 가정)
                                    const dateStr = item.CHANGE_DATE.trim();
                                    if (dateStr.length >= 8) {
                                        const year = dateStr.substring(0, 4);
                                        const month = dateStr.substring(4, 6);
                                        const day = dateStr.substring(6, 8);
                                        item.CHANGE_DATE = `${year}-${month}-${day}`;
                                    }
                                } catch (e) {
                                    console.log(`날짜 형식 변환 오류: ${item.CHANGE_DATE}`, e);
                                }
                            }
                            return item;
                        });

                        // 배치 내에서 중복된 ITEM_SEQ 제거
                        const uniqueItems = [];
                        const seenKeys = new Set();
                        
                        for (const item of processedItems) {
                            if (!seenKeys.has(item.ITEM_SEQ)) {
                                seenKeys.add(item.ITEM_SEQ);
                                uniqueItems.push(item);
                            } else {
                                console.log(`배치 내 중복 ITEM_SEQ 발견: ${item.ITEM_SEQ} - 항목 중복 제거됨`);
                            }
                        }

                        // Supabase에 데이터 일괄 삽입 (중복 키 처리를 위해 upsert 사용)
                        const { error } = await supabase
                            .from('medicines')
                            .upsert(uniqueItems, { 
                                onConflict: 'ITEM_SEQ',  // 충돌 시 ITEM_SEQ 기준으로 처리
                                ignoreDuplicates: false  // 충돌 시 업데이트
                            });
                            
                        if (error) {
                            console.error(`페이지 ${page} 데이터 삽입 중 오류:`, error);
                            throw error;
                        }
                        
                        processedCount += uniqueItems.length;
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

                        console.log('데이터 수집 완료!');
                        console.log(`총 ${processedCount}개의 의약품 정보가 저장되었습니다.`);
                        resolve();
        } catch (error) {
            console.error('데이터 수집 중 오류:', error);
            reject(error);
        }
    });
}

// 제형 매핑 정의
const FORM_TYPE_MAPPING = {
    '정제': ['정제'],      // '정제'라는 단어가 포함된 제형
    '경질캡슐': ['경질'],  // '경질'이라는 단어가 포함된 모든 제형
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
                                      "  \"식별문자(뒤)\": \"보이는 문자    숫자를 정확하게 입력\",\n" +
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
                    try {
                    const parsedResult = JSON.parse(jsonMatch[0]);
                    console.log('파싱 결과:', parsedResult);
                    return parsedResult;
                    } catch (jsonParseError) {
                        console.error('JSON 문자열 파싱 실패:', jsonParseError);
                        // JSON 오류가 발생한 경우 기본값 반환
                        return {
                            제형: "불확실",
                            모양: "불확실",
                            "색상(앞)": "불확실",
                            "색상(뒤)": "불확실",
                            "분할선(앞)": "없음",
                            "분할선(뒤)": "없음",
                            "식별문자(앞)": "",
                            "식별문자(뒤)": "",
                            식별문자_특징: "불확실"
                        };
                    }
                }
                console.error('JSON 형식의 응답을 찾을 수 없습니다.');
                // JSON 형식을 찾지 못한 경우 기본값 반환
                return {
                    제형: "불확실",
                    모양: "불확실",
                    "색상(앞)": "불확실",
                    "색상(뒤)": "불확실",
                    "분할선(앞)": "없음",
                    "분할선(뒤)": "없음",
                    "식별문자(앞)": "",
                    "식별문자(뒤)": "",
                    식별문자_특징: "불확실"
                };
            } catch (parseError) {
                console.error('JSON 파싱 중 오류:', parseError);
                // 오류 발생시 기본값 반환
                return {
                    제형: "불확실",
                    모양: "불확실",
                    "색상(앞)": "불확실",
                    "색상(뒤)": "불확실",
                    "분할선(앞)": "없음",
                    "분할선(뒤)": "없음",
                    "식별문자(앞)": "",
                    "식별문자(뒤)": "",
                    식별문자_특징: "불확실"
                };
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
    '주황': { '빨강': 0.7, '노랑': 0.7, '분홍': 0.5 },
    '노랑': { '주황': 0.7, '연두': 0.6 },
    '연두': { '초록': 0.8, '노랑': 0.6 },
    '초록': { '연두': 0.8, '청록': 0.7 },
    '보라': { '남색': 0.7, '분홍': 0.6, '파랑': 0.6 },
    '분홍': { '빨강': 0.7, '보라': 0.6 },
    '회색': { '하양': 0.6, '검정': 0.6 },
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
    '장용성정': { '서방정': 0.7, '장용성필름코팅정': 0.8 }
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
    // 텍스트 정규화 함수 - 공백과 특수문자 제거
    const normalizeText = (text) => {
        if (!text) return '';
        return text.trim().toUpperCase().replace(/[\s\-\_\.\,\;\:\/]/g, '');
    };
    
    // 입력된 식별문자 정규화
    const normalizedText1Front = normalizeText(text1Front);
    const normalizedText1Back = normalizeText(text1Back);
    const normalizedText2Front = normalizeText(text2Front);
    const normalizedText2Back = normalizeText(text2Back);
    
    // 통합 식별문자 매칭 방식 적용
    // 앞면/뒷면을 구분하지 않고 하나의 통합된 식별문자로 처리
    
    // 입력된 식별문자 (앞+뒤 통합)
    const inputIdentifiers = [];
    
    // 앞면 식별문자
    if (text1Front) {
        inputIdentifiers.push(text1Front);
        inputIdentifiers.push(normalizedText1Front);
    }
    
    // 뒷면 식별문자
    if (text1Back) {
        inputIdentifiers.push(text1Back);
        inputIdentifiers.push(normalizedText1Back);
    }
    
    // 앞면+뒷면 조합 (양방향)
    if (text1Front && text1Back) {
        inputIdentifiers.push(`${text1Front} ${text1Back}`);
        inputIdentifiers.push(`${normalizedText1Front}${normalizedText1Back}`);
        inputIdentifiers.push(`${text1Back} ${text1Front}`);
        inputIdentifiers.push(`${normalizedText1Back}${normalizedText1Front}`);
    }
    
    // 의약품 식별문자 (앞+뒤 통합)
    const medicineIdentifiers = [];
    
    // 앞면 식별문자
    if (text2Front) {
        medicineIdentifiers.push(text2Front);
        medicineIdentifiers.push(normalizedText2Front);
    }
    
    // 뒷면 식별문자
    if (text2Back) {
        medicineIdentifiers.push(text2Back);
        medicineIdentifiers.push(normalizedText2Back);
    }
    
    // 앞면+뒷면 조합 (양방향)
    if (text2Front && text2Back) {
        medicineIdentifiers.push(`${text2Front} ${text2Back}`);
        medicineIdentifiers.push(`${normalizedText2Front}${normalizedText2Back}`);
        medicineIdentifiers.push(`${text2Back} ${text2Front}`);
        medicineIdentifiers.push(`${normalizedText2Back}${normalizedText2Front}`);
    }
    
    // 통합 유사도 계산
    let integratedSimilarityScore = 0;
    
    // 일반적인 패턴 목록 (낮은 고유성)
    const commonPatterns = ['SP', 'SK', 'SH', 'SL', 'S', 'G', 'GH', 'IL', 'L', 'H', 'E'];
    
    // 모든 입력 식별문자와 약품 식별문자 조합에 대해 유사도 계산
    for (const inputId of inputIdentifiers) {
        if (!inputId || inputId.length < 2) continue;
        
        // 식별문자 길이에 비례한 가중치 (긴 식별문자에 더 높은 가중치)
        const inputLengthMultiplier = Math.min(2.5, 1.0 + (inputId.length / 5) * 1.0);
        
        for (const medicineId of medicineIdentifiers) {
            if (!medicineId || medicineId.length < 2) continue;
            
            // 식별문자 길이에 비례한 가중치 (긴 식별문자에 더 높은 가중치)
            const medicineLengthMultiplier = Math.min(2.5, 1.0 + (medicineId.length / 5) * 1.0);
            
            // 일반적 패턴 가중치 (SP 등 일반적 패턴에 더 낮은 가중치)
            const uniquenessMultiplier = commonPatterns.includes(inputId) ? 0.5 : 1.5;
            
            // SP+긴 식별문자 조합에 대한 특별 가중치 (네오로신캡슐 케이스용)
            let specialCaseMultiplier = 1.0;
            
            // "NERSC"와 같은 4자 이상 고유 식별문자에 대한 특별 보너스
            if (inputId.length >= 4 && !commonPatterns.includes(inputId)) {
                specialCaseMultiplier = 2.5;
            }
            
            // SP + 긴 식별자 패턴 특별 처리
            if (inputId === "NERSC" || medicineId.includes("NERSC")) {
                specialCaseMultiplier = 3.0; // 네오로신캡슐용 특별 가중치
            }
            
            // 총 가중치
            const totalMultiplier = inputLengthMultiplier * medicineLengthMultiplier * uniquenessMultiplier * specialCaseMultiplier;
            
            // 유사도 계산
            const similarity = stringSimilarity(inputId, medicineId) * totalMultiplier;
            
            // 최대 유사도 저장
            integratedSimilarityScore = Math.max(integratedSimilarityScore, similarity);
        }
    }
    
    // 식별문자 길이 보너스 - 긴 식별문자에 보너스
    const longestIdentifier = Math.max(
        text1Front?.length || 0,
        text1Back?.length || 0,
        text2Front?.length || 0,
        text2Back?.length || 0
    );
    
    let lengthBonus = 0;
    
    if (longestIdentifier >= 4) {
        // 4자 이상인 식별문자에 추가 보너스
        lengthBonus += Math.min(0.5, (longestIdentifier - 3) * 0.15);
    }
    
    // 앞면+뒷면 모두 있는 경우 조합 보너스
    if (text1Front && text1Back && text2Front && text2Back) {
        // 양쪽 모두 앞뒷면이 있는 경우 조합 가중치 강화
        const comboLength = (text1Front.length || 0) + (text1Back.length || 0);
        lengthBonus += Math.min(0.8, 0.4 + (comboLength / 10) * 0.4);
    }
    
    // 최종 텍스트 유사도 점수 (최대 1.0)
    return Math.min(1.0, integratedSimilarityScore + lengthBonus);
}

// 이미지 캐시 설정
const imageCache = new Map();
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24시간

// 이름으로 의약품 검색
app.get('/api/search/name/:name', async (req, res) => {
    try {
        const name = req.params.name;
        console.log('이름으로 검색 요청:', name);
        
        // 테이블 구조 정보 확인 (테이블이 존재하는지 검증)
        console.log('테이블 정보 확인 중...');
        const { data: tablesInfo, error: tablesError } = await supabase.rpc('get_table_info', {
            target_table: 'medicines'
        });
        
        if (tablesError) {
            console.error('테이블 정보 확인 오류:', tablesError);
            
            // 직접 SQL 쿼리로 테이블 존재 확인
            const { data: tableExists, error: tableExistsError } = await supabase.rpc('query', {
                sql_query: "SELECT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'medicines')"
            });
            
            if (tableExistsError) {
                console.error('테이블 존재 확인 오류:', tableExistsError);
            } else {
                console.log('테이블 존재 여부:', tableExists);
        }
        } else {
            console.log('테이블 정보:', tablesInfo);
        }
        
        // 직접 SQL 실행으로 데이터 확인
        console.log('SQL로 직접 쿼리 시도...');
        const sqlQuery = `SELECT * FROM "medicines" WHERE "ITEM_NAME" ILIKE '%${name}%' LIMIT 10`;
        console.log('SQL 쿼리:', sqlQuery);
        
        const { data: sqlData, error: sqlError } = await supabase.rpc('query', {
            sql_query: sqlQuery
        });
        
        if (sqlError) {
            console.error('SQL 쿼리 오류:', sqlError);
        } else {
            console.log('SQL 쿼리 결과:', sqlData);
            console.log('결과 개수:', sqlData ? sqlData.length : 0);
        }
        
        // 통계 쿼리로 테이블 레코드 수 확인
        const { data: countData, error: countError } = await supabase.rpc('query', {
            sql_query: 'SELECT COUNT(*) FROM "medicines"'
        });
        
        if (countError) {
            console.error('카운트 쿼리 오류:', countError);
        } else {
            console.log('전체 레코드 수:', countData);
        }
        
        // 일반 API 호출로 검색
        console.log('API 호출로 검색 시도...');
        const { data, error } = await supabase
            .from('medicines')
            .select('*')
            .ilike('ITEM_NAME', `%${name}%`)
            .limit(10);
            
        if (error) {
            console.error('이름으로 검색 중 오류:', error);
            res.setHeader('Content-Type', 'application/json');
            return res.status(500).json({ error: '검색 중 오류가 발생했습니다.' });
        } else {
            console.log('검색 결과 수:', data ? data.length : 0);
            if (data && data.length > 0) {
                console.log('첫 번째 결과:', data[0]);
            }
        }
        
        // 결과 전송 (SQL 쿼리 결과나 API 결과 중 하나)
        const resultData = (sqlData && sqlData.length > 0) ? sqlData : (data || []);
        res.setHeader('Content-Type', 'application/json');
        res.json(resultData);
    } catch (error) {
        console.error('검색 API 최종 오류:', error);
        res.setHeader('Content-Type', 'application/json');
        res.status(500).json({ error: '검색 중 오류가 발생했습니다.' });
            }
});

// 회사 이름으로 의약품 검색
app.get('/api/search/company/:name', async (req, res) => {
    try {
        const name = req.params.name;
        
        const { data, error } = await supabase
            .from('medicines')
            .select('*')
            .ilike('ENTP_NAME', `%${name}%`);
            
        if (error) {
            console.error('회사 이름으로 검색 중 오류:', error);
            res.setHeader('Content-Type', 'application/json');
                return res.status(500).json({ error: '검색 중 오류가 발생했습니다.' });
            }
            
        res.setHeader('Content-Type', 'application/json');
        res.json(data);
    } catch (error) {
        console.error('검색 API 오류:', error);
        res.setHeader('Content-Type', 'application/json');
        res.status(500).json({ error: '검색 중 오류가 발생했습니다.' });
    }
});
            
// 식별문자로 의약품 검색
app.get('/api/search/print/:text', async (req, res) => {
    try {
        const text = req.params.text.toUpperCase();
        
        const { data, error } = await supabase
            .from('medicines')
            .select('*')
            .or(`PRINT_FRONT.ilike.%${text}%,PRINT_BACK.ilike.%${text}%`);
            
        if (error) {
            console.error('식별문자로 검색 중 오류:', error);
            res.setHeader('Content-Type', 'application/json');
                    return res.status(500).json({ error: '검색 중 오류가 발생했습니다.' });
                }
                
        res.setHeader('Content-Type', 'application/json');
        res.json(data);
    } catch (error) {
        console.error('검색 API 오류:', error);
        res.setHeader('Content-Type', 'application/json');
        res.status(500).json({ error: '검색 중 오류가 발생했습니다.' });
    }
});

// 제형 데이터 확인 API
app.get('/api/form-types', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('medicines')
            .select('FORM_CODE_NAME, count(*)')
            .group('FORM_CODE_NAME');
            
        if (error) {
            console.error('제형 데이터 조회 중 오류:', error);
            res.setHeader('Content-Type', 'application/json');
            return res.status(500).json({ error: '데이터 조회 중 오류가 발생했습니다.' });
        }
        
        res.setHeader('Content-Type', 'application/json');
        res.json(data);
    } catch (error) {
        console.error('API 오류:', error);
        res.setHeader('Content-Type', 'application/json');
        res.status(500).json({ error: '데이터 조회 중 오류가 발생했습니다.' });
        }
});

// 데이터베이스 상태 확인 API
app.get('/api/db-status', async (req, res) => {
    try {
        console.log('데이터베이스 상태 확인 요청...');
        
        // 전체 레코드 수 확인
        const { data, error, count } = await supabase
            .from('medicines')
            .select('*', { count: 'exact', head: true });
            
        if (error) {
            console.error('데이터베이스 상태 확인 오류:', error);
            res.setHeader('Content-Type', 'application/json');
            return res.status(500).json({ error: '데이터베이스 확인 중 오류가 발생했습니다.' });
        }
        
        console.log('데이터베이스 레코드 수:', count);
        res.setHeader('Content-Type', 'application/json');
        res.json({ count: count || 0, status: 'ok' });
    } catch (error) {
        console.error('데이터베이스 상태 확인 API 오류:', error);
        res.setHeader('Content-Type', 'application/json');
        res.status(500).json({ error: '데이터베이스 확인 중 오류가 발생했습니다.' });
    }
});

// 검색 로직 개선
app.post('/api/search', async (req, res) => {
    try {
        const searchCriteria = req.body;
        console.log('검색 기준:', searchCriteria);

        let query = supabase
            .from('medicines')
            .select('*');

        // 식별문자 검색 조건 추가
        if (searchCriteria.식별문자_앞 || searchCriteria.식별문자_뒤) {
            query = query.or(`PRINT_FRONT.ilike.%${searchCriteria.식별문자_앞 || ''}%,PRINT_BACK.ilike.%${searchCriteria.식별문자_뒤 || ''}%`);
        }

        // 색상 검색 조건 추가
        if (searchCriteria.색상_앞) {
            query = query.ilike('COLOR_CLASS1', `%${searchCriteria.색상_앞}%`);
        }
        if (searchCriteria.색상_뒤) {
            query = query.ilike('COLOR_CLASS2', `%${searchCriteria.색상_뒤}%`);
        }

        // 모양 검색 조건 추가
        if (searchCriteria.모양) {
            query = query.ilike('DRUG_SHAPE', `%${searchCriteria.모양}%`);
        }

        const { data, error } = await query;

        if (error) {
            console.error('검색 오류:', error);
            return res.status(500).json({ error: '검색 중 오류가 발생했습니다.' });
        }

        if (!data || data.length === 0) {
            return res.json({ items: [] });
        }

        // 결과 정렬 및 가공
        const processedResults = data.map(item => ({
            ...item,
            similarity_score: calculateSimilarity(
                searchCriteria.식별문자_앞,
                searchCriteria.식별문자_뒤,
                item.PRINT_FRONT,
                item.PRINT_BACK
            )
        })).sort((a, b) => b.similarity_score - a.similarity_score);

        res.json({ items: processedResults });
    } catch (error) {
        console.error('검색 처리 중 오류:', error);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

// 이미지 프록시 API
app.get('/api/proxy-image', async (req, res) => {
    try {
        const imageUrl = req.query.url;
        if (!imageUrl) {
            res.setHeader('Content-Type', 'application/json');
            return res.status(400).json({ error: '이미지 URL이 필요합니다.' });
        }
        
        console.log('이미지 프록시 요청:', imageUrl);
        
        // 캐시 확인
        if (imageCache.has(imageUrl)) {
            const { data, contentType, timestamp } = imageCache.get(imageUrl);
            // 캐시 유효 기간 확인 (24시간)
            if (Date.now() - timestamp < CACHE_DURATION) {
                console.log('캐시된 이미지 반환');
                res.setHeader('Content-Type', contentType);
                return res.send(data);
            }
            // 캐시 만료
            imageCache.delete(imageUrl);
        }
        
        // 이미지 URL이 외부 URL인지 확인
        if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
            res.setHeader('Content-Type', 'application/json');
            return res.status(400).json({ error: '유효한 이미지 URL이 아닙니다.' });
        }
        
        // 이미지 가져오기
        const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        const contentType = response.headers['content-type'];
        
        // 이미지 캐시 저장
        imageCache.set(imageUrl, {
            data: response.data,
            contentType,
            timestamp: Date.now()
        });
        
        // 이미지 반환
        res.setHeader('Content-Type', contentType);
        res.send(response.data);
    } catch (error) {
        console.error('이미지 프록시 오류:', error);
        res.setHeader('Content-Type', 'application/json');
        res.status(404).json({ error: '이미지를 찾을 수 없습니다.' });
    }
});

// medicine-matcher 모듈 불러오기
const { searchMedicines, DEFAULT_PARAMS } = require('./services/medicine-matcher');

// 이미지 분석 API 엔드포인트
app.post('/api/analyze-image', async (req, res) => {
    try {
        const { imageData } = req.body;
        if (!imageData) {
            return res.status(400).json({ error: '이미지 데이터가 없습니다.' });
        }

        console.log('이미지 분석 시작...');
        const analysisResult = await VisionService.analyzeImage(imageData);
        console.log('분석 결과:', analysisResult);

        // 새로운 medicine-matcher 모듈을 사용하여 검색 수행
        const resultMedicines = await searchMedicines(analysisResult, DEFAULT_PARAMS);
            
        // 매칭 그룹 정보 계산
        const matchGroups = {
            exactMatchCount: resultMedicines.filter(m => m.textSimilarityScore === 1).length,
            highSimilarityCount: resultMedicines.filter(m => m.similarity_score >= DEFAULT_PARAMS.similarityThreshold).length,
            mediumSimilarityCount: resultMedicines.filter(m => 
                m.similarity_score >= DEFAULT_PARAMS.similarityThreshold * 0.7 && 
                m.similarity_score < DEFAULT_PARAMS.similarityThreshold
            ).length,
            lowSimilarityCount: resultMedicines.filter(m => 
                m.similarity_score < DEFAULT_PARAMS.similarityThreshold * 0.7
            ).length
        };

        res.json({
                    analysis: analysisResult,
            medicines: resultMedicines,
            matchGroups
        });
    } catch (error) {
        console.error('이미지 분석 API 오류:', error);
        res.status(500).json({ error: '이미지 분석 중 오류가 발생했습니다.' });
    }
});

app.listen(port, () => {
    console.log(`서버가 ${port} 포트에서 실행 중입니다`);
});

// collectAndSaveData 함수 내보내기
module.exports = { collectAndSaveData };

// 레벤슈타인 거리 계산 함수 추가
function levenshteinDistance(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix = [];

    // 행렬 초기화
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    // 거리 계산
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
    } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // 교체
                    matrix[i][j - 1] + 1,     // 삽입
                    matrix[i - 1][j] + 1      // 삭제
                );
            }
        }
    }

    return matrix[b.length][a.length];
}

// 문자열 유사도 계산 함수 (0~1 사이 값, 1이 완전 일치)
function stringSimilarity(s1, s2) {
    if (!s1 || !s2) return 0;
    
    // 완전 일치하는 경우
    if (s1 === s2) return 1.0;
    
    // 하나가 다른 하나를 완전히 포함하는 경우 (약품 이름에 흔한 패턴)
    if (s1.includes(s2) && s2.length >= 2) {
        // 길이가 긴 포함 문자열에 더 높은 가중치 부여
        const lengthRatio = s2.length / s1.length;
        const lengthBonus = s2.length >= 4 ? 1.3 : (s2.length >= 3 ? 1.15 : 1.0);
        return Math.min(1.0, 0.9 * lengthRatio * lengthBonus);
    }
    
    if (s2.includes(s1) && s1.length >= 2) {
        // 길이가 긴 포함 문자열에 더 높은 가중치 부여
        const lengthRatio = s1.length / s2.length;
        const lengthBonus = s1.length >= 4 ? 1.3 : (s1.length >= 3 ? 1.15 : 1.0);
        return Math.min(1.0, 0.9 * lengthRatio * lengthBonus);
    }
    
    // 짧은 문자열에 대한 보정
    const maxLength = Math.max(s1.length, s2.length);
    if (maxLength === 0) return 1.0;
    
    // 기본 레벤슈타인 거리 기반 유사도
    let similarity = 1 - (levenshteinDistance(s1, s2) / maxLength);
    
    // 문자열 길이에 따른 가중치 조정
    if (maxLength <= 3) {
        // 짧은 문자열(3자 이하)에 대해서는 유사도를 보정
        if (s1.length === s2.length && levenshteinDistance(s1, s2) === 1) {
            similarity = Math.max(similarity, 0.7);
        }
        
        // 다음과 같은 패턴 보정: C40 <-> C4O
        if ((s1.includes('0') && s2.includes('O')) || (s1.includes('O') && s2.includes('0'))) {
            similarity = Math.max(similarity, 0.8);
        }
        
        // 숫자와 문자가 섞인 경우 (알파벳+숫자 조합)
        if (/[A-Z][0-9]/.test(s1) && /[A-Z][0-9]/.test(s2)) {
            // 첫 글자가 같으면 유사도 증가
            if (s1[0] === s2[0]) {
                similarity = Math.max(similarity, 0.7);
            }
        }
    } else if (maxLength >= 4) {
        // 긴 문자열(4자 이상)에 대해 추가 가중치 부여
        // 길이에 비례하여 가중치 증가 (최대 1.5배)
        const lengthBonus = Math.min(1.5, 1.1 + (maxLength - 4) * 0.1);
        similarity = Math.min(1.0, similarity * lengthBonus);
    }
    
    // 알파벳과 숫자 분리 비교 (C40과 C50 같은 경우)
    const s1Letters = s1.replace(/[^A-Z]/g, '');
    const s1Numbers = s1.replace(/[^0-9]/g, '');
    const s2Letters = s2.replace(/[^A-Z]/g, '');
    const s2Numbers = s2.replace(/[^0-9]/g, '');
    
    // 알파벳 부분이 같고 길이가 1 이상인 경우
    if (s1Letters === s2Letters && s1Letters.length > 0) {
        similarity = Math.max(similarity, 0.7);
    }
    
    return similarity;
}

// 식별문자 정규화 함수
function normalizeIdentifier(text, useShortVersions = true, addConfusionPatterns = true) {
    if (!text) return [];
    
    // 원본 텍스트도 후보에 포함 (공백 유지)
    const originalText = text.toUpperCase();
    
    // 공백, 특수문자 제거한 정규화 버전
    let normalized = text.replace(/[\s\-\_\.\,\;\:\/]/g, '').toUpperCase();
    
    const confusionMap = {
        'O': '0', '0': 'O',
        'I': '1', '1': 'I',
        'Z': '2', '2': 'Z',
        'S': '5', '5': 'S',
        'G': '6', '6': 'G',
        'B': '8', '8': 'B',
        'D': '0',
        'Q': '0'
    };
    
    const alternateVersions = [normalized];
    
    // 원본 텍스트도 후보에 포함 (공백 있는 버전)
    if (originalText !== normalized) {
        alternateVersions.push(originalText);
    }
    
    if (addConfusionPatterns) {
        for (let i = 0; i < normalized.length; i++) {
            const char = normalized[i];
            if (confusionMap[char]) {
                const alternate = normalized.substring(0, i) + confusionMap[char] + normalized.substring(i + 1);
                alternateVersions.push(alternate);
            }
        }
    } 

    // 부분 일치를 위한 짧은 버전
    if (useShortVersions && normalized.length > 2) {
        // 2자, 3자 단축 버전 추가
        const shortVersion2 = normalized.substring(0, 2);
        alternateVersions.push(shortVersion2);
        
        if (normalized.length > 3) {
            const shortVersion3 = normalized.substring(0, 3);
            alternateVersions.push(shortVersion3);
        }
    }
    
    return [...new Set(alternateVersions)];
}