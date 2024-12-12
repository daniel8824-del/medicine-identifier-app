const fs = require('fs');
const path = require('path');

class VisionService {
  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not set in environment variables');
    }
    this.VISION_API_KEY = process.env.OPENAI_API_KEY;
  }

  async analyzePill(imagePath) {
    try {
      const imageBuffer = fs.readFileSync(imagePath);
      const base64Image = imageBuffer.toString('base64');

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.VISION_API_KEY}`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{
            role: "user",
            content: [
              {
                type: "text",
                text: "이 알약의 특징을 다음 형식으로 분석해주세요. 특히 색상 구분에 주의해주세요:\n" +
                      "모양: (원형/타원형/장방형/반원형/삼각형/사각형/마름모형/오각형/육각형/팔각형/기타)\n" +
                      "색상: (하양/노랑/주황/분홍/빨강/갈색/연두/초록/청록/파랑/남색/자주/보라/회색/투명)\n" +
                      "색상 구분 기준:\n" +
                      "- 하양: 불투명한 흰색. 알약 표면이 하얗게 보이며 빛이 투과되지 않는 경우. 유백색도 하양으로 분류\n" +
                      "- 투명: 유리나 젤처럼 완전히 투명하여 알약을 통해 반대편이 보이는 경우만. 연질캡슐에서 주로 관찰됨\n" +
                      "- 분홍: 연한 붉은색 계열 전체. 다음 색상은 모두 분홍으로 분류:\n" +
                      "  * 살구색\n" +
                      "  * 연어색\n" +
                      "  * 연한 산호색\n" +
                      "  * 파스텔 톤의 붉은색\n" +
                      "  * 밝은 코랄색\n" +
                      "  * 연한 붉은 계열 모두\n" +
                      "- 주황: 진한 오렌지색만. 다음 경우만 주황으로 분류:\n" +
                      "  * 귤색\n" +
                      "  * 진한 오렌지색\n" +
                      "  * 선명한 주황색\n" +
                      "- 빨강: 선명한 빨간색인 경우만. 연한 톤은 분홍으로 분류\n" +
                      "중요: 연한 붉은 계열이나 산호색 계열은 모두 분홍으로 분류해주세요. 주황색으로 분류하지 마세요.\n" +
                      "분할선: (없음/+형/-형/기타)\n" +
                      "표시: (문자나 숫자를 정확히 입력해주세요. 공백이 있다면 그대로 유지하고, 그리스 문자(Λ, Δ, Ω 등)가 있��면 그대로 입력해주세요.)\n\n" +
                      "주의사항:\n" +
                      "1. 색상 판단이 애매한 경우 위의 기준을 엄격히 따라주세요\n" +
                      "2. 특히 연한 붉은 계열은 반드시 분홍으로 분류해주세요\n" +
                      "3. 하얀색이면서 불투명한 경우는 반드시 하양으로 분류해주세요"
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${base64Image}`
                }
              }
            ]
          }],
          max_tokens: 300
        })
      });

      const result = await response.json();
      
      if (result.error) {
        console.error('GPT API 오류:', result.error);
        throw new Error(result.error.message);
      }

      return this.parseGPTResponse(result.choices[0].message.content);
    } catch (error) {
      console.error('이미지 분석 중 오류 발생:', error);
      throw error;
    }
  }

  parseGPTResponse(content) {
    try {
      const shapeMatch = content.match(/모양[:\s]*(원형|타원형|장방형|반원형|삼각형|사각형|마름모형|오각형|육각형|팔각형|기타)/i);
      const colorMatch = content.match(/색상[:\s]*([^,\n]*(?:,\s*[^,\n]*)*)/i);
      const lineMatch = content.match(/분할선[:\s]*(없음|\+형|-형|기타)/i);
      const textMatch = content.match(/표시[:\s]*([a-zA-Z0-9ΛΔΩ\s]+)/i);

      return {
        drug_shape: shapeMatch ? shapeMatch[1] : undefined,
        color_class: colorMatch ? colorMatch[1] : undefined,
        line_front: lineMatch ? lineMatch[1] : undefined,
        mark_code_front: textMatch ? textMatch[1].trim() : undefined,
        numOfRows: 20,
        pageNo: 1
      };
    } catch (error) {
      console.error('GPT 응답 파싱 중 오류:', error);
      return {
        numOfRows: 20,
        pageNo: 1
      };
    }
  }

  async testAnalyze(imageUrl) {
    try {
      const result = await this.analyzePill(imageUrl);
      console.log('분석 결과:', result);
      return result;
    } catch (error) {
      console.error('이미지 분석 테스트 실패:', error);
      throw error;
    }
  }
}

module.exports = VisionService; 