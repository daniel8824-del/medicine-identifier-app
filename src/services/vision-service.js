// VisionService 클래스
// 이미지 분석을 위한 OpenAI Vision API 서비스

const { OpenAI } = require('openai');

class VisionService {
  /**
   * 이미지 분석을 수행하는 메소드
   * @param {string} imageData - base64 인코딩된 이미지 데이터 
   * @returns {Promise<Object>} 분석 결과 객체
   */
  static async analyzeImage(imageData) {
    try {
      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });

      const systemPrompt = "당신은 의약품 이미지를 분석하는 전문가입니다.";
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
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
                      "  \"식별문자(뒤)\": \"보이는 문자나 숫자를 정확하게 입력\",\n" +
                      "  \"식별문자_특징\": \"양각|음각|인쇄|각인\"\n" +
                      "}\n" +
                      "주의사항:\n" +
                      "1. 반드시 위 JSON 형식으로만 응답해주세요.\n" +
                      "2. 식별문자가 전혀 보이지 않는 면은 \"없음\"으로 표시해주세요.\n" +
                      "3. 식별문자는 정확히 보이는 글자나 숫자만 입력해주세요. 추측하지 마세요.\n" +
                      "4. 식별문자에 하이픈(-) 혹은 슬래시(/)가 있다면 그대로 입력해주세요.\n" +
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

      // JSON 부분만 추출하여 파싱
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsedResult = JSON.parse(jsonMatch[0]);
        console.log('파싱 결과:', parsedResult);
        return parsedResult;
      }
      throw new Error('JSON 형식의 응답을 찾을 수 없습니다.');
    } catch (error) {
      console.error('Vision API 호출 중 오류:', error);
      throw error;
    }
  }
  
  /**
   * 테스트용 목업 데이터 반환 (API 호출 없이 테스트할 때 사용)
   * @param {string} imagePath - 이미지 경로 
   * @returns {Object} 목업 분석 결과
   */
  static getMockAnalysisResult(imagePath) {
    // 파일명에 따라 다른 목업 결과 반환
    const filename = imagePath.split('/').pop();
    
    if (filename.includes('C40')) {
      return {
        '제형': '정제',
        '모양': '타원형',
        '색상(앞)': '갈색',
        '색상(뒤)': '하양',
        '분할선(앞)': '없음',
        '분할선(뒤)': '없음',
        '식별문자(앞)': 'C40',
        '식별문자(뒤)': '없음',
        '식별문자_특징': '인쇄'
      };
    } 
    else if (filename.includes('WAL')) {
      return {
        '제형': '정제',
        '모양': '타원형',
        '색상(앞)': '하양',
        '색상(뒤)': '하양', 
        '분할선(앞)': '없음',
        '분할선(뒤)': '없음',
        '식별문자(앞)': 'WAL C40',
        '식별문자(뒤)': '없음',
        '식별문자_특징': '인쇄'
      };
    }
    else if (filename.includes('LC400')) {
      return {
        '제형': '연질캡슐',
        '모양': '타원형',
        '색상(앞)': '주황',
        '색상(뒤)': '주황',
        '분할선(앞)': '없음', 
        '분할선(뒤)': '없음',
        '식별문자(앞)': 'LC400',
        '식별문자(뒤)': '없음',
        '식별문자_특징': '인쇄'
      };
    }
    
    // 기본 목업 결과
    return {
      '제형': '정제',
      '모양': '원형',
      '색상(앞)': '하양',
      '색상(뒤)': '하양',
      '분할선(앞)': '없음',
      '분할선(뒤)': '없음',
      '식별문자(앞)': '불확실',
      '식별문자(뒤)': '없음',
      '식별문자_특징': '인쇄'
    };
  }
}

module.exports = { VisionService }; 