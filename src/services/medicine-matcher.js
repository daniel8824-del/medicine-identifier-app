const { createClient } = require('@supabase/supabase-js');

// 환경 변수에서 Supabase 설정 가져오기
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY
);

// 환경 변수에서 파라미터 가져오기 (기본값 포함)
const DEFAULT_PARAMS = {
    textWeight: parseFloat(process.env.MATCH_TEXT_WEIGHT || '0.70'),
    colorWeight: parseFloat(process.env.MATCH_COLOR_WEIGHT || '0.15'),
    shapeWeight: parseFloat(process.env.MATCH_SHAPE_WEIGHT || '0.15'),
    similarityThreshold: parseFloat(process.env.MATCH_SIMILARITY_THRESHOLD || '0.35'),
    useShortVersions: process.env.MATCH_USE_SHORT_VERSIONS !== 'false',
    addConfusionPatterns: process.env.MATCH_ADD_CONFUSION_PATTERNS !== 'false',
    useColorFiltering: process.env.MATCH_USE_COLOR_FILTERING !== 'false',
    useLevenshteinDistance: process.env.MATCH_USE_LEVENSHTEIN_DISTANCE !== 'false',
    parallelSearch: process.env.MATCH_PARALLEL_SEARCH !== 'false',
    useCascadeRanking: process.env.MATCH_CASCADE_RANKING !== 'false'
};

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

// 모양 유사도 맵
const shapeSimilarityMap = {
    '장방형': { '타원형': 0.7, '반원형': 0.5 },
    '타원형': { '장방형': 0.7, '원형': 0.7 },
    '원형': { '타원형': 0.7, '육각형': 0.5 },
    '사각형': { '장방형': 0.8, '마름모형': 0.6 },
    '마름모형': { '사각형': 0.6, '육각형': 0.5 },
    '육각형': { '원형': 0.5, '팔각형': 0.8 },
    '팔각형': { '육각형': 0.8, '원형': 0.5 }
};

// 유틸리티 함수들
function levenshteinDistance(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix = [];

    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }

    return matrix[b.length][a.length];
}

function stringSimilarity(s1, s2) {
    if (!s1 || !s2) return 0;
    if (s1 === s2) return 1.0;
    
    if (s1.includes(s2) && s2.length >= 2) {
        const lengthRatio = s2.length / s1.length;
        const lengthBonus = s2.length >= 4 ? 1.3 : (s2.length >= 3 ? 1.15 : 1.0);
        return Math.min(1.0, 0.9 * lengthRatio * lengthBonus);
    }
    
    if (s2.includes(s1) && s1.length >= 2) {
        const lengthRatio = s1.length / s2.length;
        const lengthBonus = s1.length >= 4 ? 1.3 : (s1.length >= 3 ? 1.15 : 1.0);
        return Math.min(1.0, 0.9 * lengthRatio * lengthBonus);
    }
    
    const maxLength = Math.max(s1.length, s2.length);
    if (maxLength === 0) return 1.0;
    
    let similarity = 1 - (levenshteinDistance(s1, s2) / maxLength);
    
    if (maxLength <= 3) {
        if (s1.length === s2.length && levenshteinDistance(s1, s2) === 1) {
            similarity = Math.max(similarity, 0.7);
        }
        
        if ((s1.includes('0') && s2.includes('O')) || (s1.includes('O') && s2.includes('0'))) {
            similarity = Math.max(similarity, 0.8);
        }
        
        if (/[A-Z][0-9]/.test(s1) && /[A-Z][0-9]/.test(s2)) {
            if (s1[0] === s2[0]) {
                similarity = Math.max(similarity, 0.7);
            }
        }
    } else if (maxLength >= 4) {
        const lengthBonus = Math.min(1.5, 1.1 + (maxLength - 4) * 0.1);
        similarity = Math.min(1.0, similarity * lengthBonus);
    }
    
    const s1Letters = s1.replace(/[^A-Z]/g, '');
    const s2Letters = s2.replace(/[^A-Z]/g, '');
    
    if (s1Letters === s2Letters && s1Letters.length > 0) {
        similarity = Math.max(similarity, 0.7);
    }
    
    return similarity;
}

function normalizeIdentifier(text, useShortVersions = true, addConfusionPatterns = true) {
    if (!text) return [];
    
    const originalText = text.toUpperCase();
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

    if (useShortVersions && normalized.length > 2) {
        const shortVersion2 = normalized.substring(0, 2);
        alternateVersions.push(shortVersion2);
        
        if (normalized.length > 3) {
            const shortVersion3 = normalized.substring(0, 3);
            alternateVersions.push(shortVersion3);
        }
    }
    
    return [...new Set(alternateVersions)];
}

// 색상 유사도 계산 함수
function calculateColorSimilarity(color1Front, color1Back, color2Front, color2Back) {
    const normalizeColor = (color) => {
        if (!color) return [];
        return color.split(/\s*,\s*/).map(c => c.trim());
    };

    const colors1Front = normalizeColor(color1Front);
    const colors1Back = normalizeColor(color1Back);
    const colors2Front = normalizeColor(color2Front);
    const colors2Back = normalizeColor(color2Back);

    const frontScore = calculateColorSetSimilarity(colors1Front, colors2Front);
    const backScore = calculateColorSetSimilarity(colors1Back, colors2Back);
    const directScore = (frontScore + backScore) / 2;

    const crossScore = calculateColorSetSimilarity(
        [...colors1Front, ...colors1Back],
        [...colors2Front, ...colors2Back]
    );

    return Math.max(directScore, crossScore);
}

// 색상 세트 간 유사도 계산
function calculateColorSetSimilarity(colors1, colors2) {
    if (!colors1.length || !colors2.length) return 0;

    let matchCount = 0;
    const totalColors = Math.max(colors1.length, colors2.length);

    for (const color1 of colors1) {
        for (const color2 of colors2) {
            if (color1 === color2 || (colorGroups[color1] && colorGroups[color1].includes(color2))) {
                matchCount++;
                break;
            }
        }
    }

    return matchCount / totalColors;
}

// 모양 유사도 계산
function calculateShapeSimilarity(shape1, shape2) {
    if (!shape1 || !shape2) return 0;
    if (shape1 === shape2) return 1.0;
    
    return shapeSimilarityMap[shape1]?.[shape2] || 
           shapeSimilarityMap[shape2]?.[shape1] || 
           0;
}

// 식별문자 고유성 평가
function evaluateUniqueIdentifier(medicine) {
    const commonPatterns = ['SP', 'SK', 'SH', 'SL', 'S', 'G', 'GH', 'IL', 'L', 'H', 'E'];
    const specialPatterns = ['CS', 'AUK', 'R1', 'C5'];
    
    const frontText = (medicine.PRINT_FRONT || '').trim().toUpperCase();
    const backText = (medicine.PRINT_BACK || '').trim().toUpperCase();
    
    let uniquenessScore = 0;
    
    const allIdentifiers = [frontText, backText].filter(text => text && text.length > 0);
    const combinedIdentifier = allIdentifiers.join('');
    
    if (combinedIdentifier.length >= 4) {
        uniquenessScore += Math.min(4, combinedIdentifier.length * 0.5);
    } else if (combinedIdentifier.length > 0) {
        uniquenessScore += combinedIdentifier.length * 0.3;
    }
    
    const hasCommonPattern = commonPatterns.some(pattern => 
        frontText === pattern || backText === pattern
    );
    
    const hasSpecialPattern = specialPatterns.some(pattern => 
        frontText.includes(pattern) || backText.includes(pattern)
    );
    
    if (hasSpecialPattern) {
        uniquenessScore += 3.0;
        
        if ((frontText.includes('HW') || frontText.toLowerCase().includes('hw')) && 
            (backText.includes('CS') || backText.includes('C5'))) {
            uniquenessScore += 2.0;
        }
    } else if (!hasCommonPattern) {
        uniquenessScore += 2;
    } else if (allIdentifiers.length > 1) {
        uniquenessScore += 1;
    }
    
    allIdentifiers.forEach(text => {
        if (text && text.length >= 4 && !commonPatterns.includes(text)) {
            uniquenessScore += 1.5;
        }
    });
    
    if (/\d/.test(combinedIdentifier)) {
        uniquenessScore += 1.0;
    }
    
    return uniquenessScore;
}

// 메인 검색 함수
async function searchMedicines(analysisResult, params = DEFAULT_PARAMS) {
    try {
        const { data: rows, error } = await supabase
            .from('medicines')
            .select('*');
            
        if (error) {
            console.error('의약품 데이터 조회 중 오류:', error);
            return [];
        }

        const printFront = (analysisResult['식별문자(앞)'] || '').trim().toUpperCase();
        const printBack = (analysisResult['식별문자(뒤)'] || '').trim().toUpperCase();
        
        // 정확한 매칭 검색
        let exactMatches = [];
        
        if (printFront || printBack) {
            // 1. 앞면과 뒷면 모두 정확히 일치
            if (printFront && printBack) {
                exactMatches = rows.filter(medicine => {
                    const medicinePrintFront = (medicine.PRINT_FRONT || '').trim().toUpperCase();
                    const medicinePrintBack = (medicine.PRINT_BACK || '').trim().toUpperCase();
                    return medicinePrintFront === printFront && medicinePrintBack === printBack;
                });
            }
            
            // 2. 앞면과 뒷면이 합쳐진 형태로 저장된 경우 (SP NERSC)
            if (exactMatches.length === 0 && printFront && printBack) {
                exactMatches = rows.filter(medicine => {
                    const medicinePrintFront = (medicine.PRINT_FRONT || '').trim().toUpperCase();
                    const medicinePrintBack = (medicine.PRINT_BACK || '').trim().toUpperCase();
                    
                    const combinedFrontBack = `${printFront} ${printBack}`;
                    const combinedBackFront = `${printBack} ${printFront}`;
                    
                    return medicinePrintFront === combinedFrontBack || 
                           medicinePrintFront === combinedBackFront || 
                           medicinePrintBack === combinedFrontBack || 
                           medicinePrintBack === combinedBackFront;
                });
            }
            
            // 3. 특수 케이스 처리 (세나서트, 오스타틴 등)
            if (exactMatches.length === 0) {
                exactMatches = rows.filter(medicine => {
                    const medicinePrintFront = (medicine.PRINT_FRONT || '').trim().toUpperCase();
                    const medicinePrintBack = (medicine.PRINT_BACK || '').trim().toUpperCase();
                    
                    // 세나서트 (HW+CS)
                    if ((printFront === 'HW' || printFront.toLowerCase() === 'hw') && 
                        (printBack === 'CS' || printBack === 'C5')) {
                        return (medicinePrintFront === 'HW' || 
                                medicinePrintFront.toLowerCase() === 'hw' || 
                                medicinePrintFront === '마크') &&
                               (medicinePrintBack === 'CS' || medicinePrintBack === 'C5');
                    }
                    
                    // 오스타틴 (AUK+R1)
                    if ((printFront === 'AUK' || printFront === 'ΛUK') && printBack === 'R1') {
                        return (medicinePrintFront === 'AUK' || medicinePrintFront === 'ΛUK') && 
                               medicinePrintBack === 'R1';
                    }
                    
                    return false;
                });
            }
            
            // 4. 단일 식별문자 정확 매칭
            if (exactMatches.length === 0) {
                exactMatches = rows.filter(medicine => {
                    const medicinePrintFront = (medicine.PRINT_FRONT || '').trim().toUpperCase();
                    const medicinePrintBack = (medicine.PRINT_BACK || '').trim().toUpperCase();
                    
                    if (printFront && !printBack) {
                        return medicinePrintFront === printFront ||
                               medicinePrintFront.toLowerCase() === printFront.toLowerCase();
                    }
                    
                    if (!printFront && printBack) {
                        return medicinePrintBack === printBack ||
                               medicinePrintBack.toLowerCase() === printBack.toLowerCase();
                    }
                    
                    return false;
                });
            }
            
            // 5. 정규화된 부분 매칭
            if (exactMatches.length === 0) {
                const normalizedFront = printFront.replace(/[\s\-\_\.\,\;\:\/]/g, '');
                const normalizedBack = printBack ? printBack.replace(/[\s\-\_\.\,\;\:\/]/g, '') : '';
                
                exactMatches = rows.filter(medicine => {
                    const medicinePrintFront = (medicine.PRINT_FRONT || '').trim().toUpperCase().replace(/[\s\-\_\.\,\;\:\/]/g, '');
                    const medicinePrintBack = (medicine.PRINT_BACK || '').trim().toUpperCase().replace(/[\s\-\_\.\,\;\:\/]/g, '');
                    
                    return medicinePrintFront.includes(normalizedFront) || 
                           medicinePrintBack.includes(normalizedBack) ||
                           (normalizedBack && (
                               medicinePrintFront.includes(normalizedBack) || 
                               medicinePrintBack.includes(normalizedFront)
                           ));
                });
            }
            
            if (exactMatches.length > 0) {
                // 정확 매칭 결과에 대한 추가 점수 계산
                const finalResults = exactMatches.map(medicine => {
                    const colorScore = calculateColorSimilarity(
                        analysisResult['색상(앞)'],
                        analysisResult['색상(뒤)'],
                        medicine.COLOR_CLASS1,
                        medicine.COLOR_CLASS2
                    );
                    
                    const shapeScore = analysisResult['모양'] ? 
                        calculateShapeSimilarity(analysisResult['모양'], medicine.DRUG_SHAPE) : 0;
                    
                    const uniquenessScore = evaluateUniqueIdentifier(medicine);
                    
                    const matchDetails = ['정확한 식별문자 일치'];
                    
                    if (colorScore > 0.5) {
                        matchDetails.push(`색상 유사도: ${(colorScore * 100).toFixed(1)}%`);
                    }
                    if (shapeScore > 0.5) {
                        matchDetails.push(`모양 유사도: ${(shapeScore * 100).toFixed(1)}%`);
                    }
                    
                    return {
                        ...medicine,
                        frontExactMatch: true,
                        backExactMatch: true,
                        combinationMatch: true,
                        textSimilarityScore: 1.0,
                        colorScore,
                        shapeScore,
                        uniquenessScore,
                        similarity_score: 2.0 + (uniquenessScore * 0.2),
                        match_details: matchDetails
                    };
                });
                
                // 결과 정렬
                finalResults.sort((a, b) => {
                    // 세나서트 특별 처리
                    const aIsSenaset = (a.PRINT_FRONT === '마크' || a.PRINT_FRONT?.toLowerCase() === 'hw') && 
                                     (a.PRINT_BACK === 'CS' || a.PRINT_BACK === 'C5');
                    const bIsSenaset = (b.PRINT_FRONT === '마크' || b.PRINT_FRONT?.toLowerCase() === 'hw') && 
                                     (b.PRINT_BACK === 'CS' || b.PRINT_BACK === 'C5');
                    
                    if (aIsSenaset && !bIsSenaset) return -1;
                    if (!aIsSenaset && bIsSenaset) return 1;
                    
                    // 오스타틴 특별 처리
                    const aIsOstatin = (a.PRINT_FRONT === 'ΛUK' || a.PRINT_FRONT === 'AUK') && a.PRINT_BACK === 'R1';
                    const bIsOstatin = (b.PRINT_FRONT === 'ΛUK' || b.PRINT_FRONT === 'AUK') && b.PRINT_BACK === 'R1';
                    
                    if (aIsOstatin && !bIsOstatin) return -1;
                    if (!aIsOstatin && bIsOstatin) return 1;
                    
                    // 일반적인 정렬 기준
                    if (Math.abs(a.uniquenessScore - b.uniquenessScore) >= 1.0) {
                        return b.uniquenessScore - a.uniquenessScore;
                    }
                    
                    if (Math.abs(a.colorScore - b.colorScore) > 0.2) {
                        return b.colorScore - a.colorScore;
                    }
                    
                    return b.shapeScore - a.shapeScore;
                });
                
                return finalResults.slice(0, 15);
            }
            
            // 정확 매칭이 없는 경우 유사도 기반 검색
            const scoredResults = rows.map(medicine => {
                const uniquenessScore = evaluateUniqueIdentifier(medicine);
                
                const colorScore = calculateColorSimilarity(
                    analysisResult['색상(앞)'],
                    analysisResult['색상(뒤)'],
                    medicine.COLOR_CLASS1,
                    medicine.COLOR_CLASS2
                );
                
                const shapeScore = analysisResult['모양'] ? 
                    calculateShapeSimilarity(analysisResult['모양'], medicine.DRUG_SHAPE) : 0;
                
                const textSimilarityScore = Math.max(
                    stringSimilarity(printFront, medicine.PRINT_FRONT),
                    stringSimilarity(printBack, medicine.PRINT_BACK),
                    stringSimilarity(printFront, medicine.PRINT_BACK),
                    stringSimilarity(printBack, medicine.PRINT_FRONT)
                );
                
                const similarityScore = 
                    textSimilarityScore * params.textWeight +
                    colorScore * params.colorWeight +
                    shapeScore * params.shapeWeight +
                    (uniquenessScore * 0.1);
                
                const matchDetails = [];
                if (textSimilarityScore > 0.5) {
                    matchDetails.push(`식별문자 유사도: ${(textSimilarityScore * 100).toFixed(1)}%`);
                }
                if (colorScore > 0.5) {
                    matchDetails.push(`색상 유사도: ${(colorScore * 100).toFixed(1)}%`);
                }
                if (shapeScore > 0.5) {
                    matchDetails.push(`모양 유사도: ${(shapeScore * 100).toFixed(1)}%`);
                }
                
                return {
                    ...medicine,
                    textSimilarityScore,
                    colorScore,
                    shapeScore,
                    uniquenessScore,
                    similarity_score: similarityScore,
                    match_details: matchDetails
                };
            });
            
            // 유사도 기반 결과 정렬
            scoredResults.sort((a, b) => {
                if (Math.abs(a.textSimilarityScore - b.textSimilarityScore) >= 0.1) {
                    return b.textSimilarityScore - a.textSimilarityScore;
                }
                
                if (Math.abs(a.uniquenessScore - b.uniquenessScore) >= 1.0) {
                    return b.uniquenessScore - a.uniquenessScore;
                }
                
                return b.similarity_score - a.similarity_score;
            });
            
            return scoredResults
                .filter(r => r.similarity_score >= params.similarityThreshold)
                .slice(0, 15);
        } else {
            // 식별문자가 없는 경우 색상과 모양으로만 검색
            const colorShapeResults = rows.map(medicine => {
                const colorScore = calculateColorSimilarity(
                    analysisResult['색상(앞)'],
                    analysisResult['색상(뒤)'],
                    medicine.COLOR_CLASS1,
                    medicine.COLOR_CLASS2
                );
                
                const shapeScore = analysisResult['모양'] ? 
                    calculateShapeSimilarity(analysisResult['모양'], medicine.DRUG_SHAPE) : 0;
                
                const similarityScore = colorScore * 0.7 + shapeScore * 0.3;
                
                const matchDetails = [];
                if (colorScore > 0.5) {
                    matchDetails.push(`색상 유사도: ${(colorScore * 100).toFixed(1)}%`);
                }
                if (shapeScore > 0.5) {
                    matchDetails.push(`모양 유사도: ${(shapeScore * 100).toFixed(1)}%`);
                }
                
                return {
                    ...medicine,
                    colorScore,
                    shapeScore,
                    similarity_score: similarityScore,
                    match_details: matchDetails
                };
            });
            
            colorShapeResults.sort((a, b) => {
                if (Math.abs(a.colorScore - b.colorScore) > 0.2) {
                    return b.colorScore - a.colorScore;
                }
                return b.shapeScore - a.shapeScore;
            });
            
            return colorShapeResults
                .filter(r => r.similarity_score >= 0.4)
                .slice(0, 15);
        }
    } catch (error) {
        console.error('검색 중 오류:', error);
        return [];
    }
}

module.exports = {
    searchMedicines,
    DEFAULT_PARAMS,
    // 테스트를 위해 유틸리티 함수들도 export
    levenshteinDistance,
    stringSimilarity,
    normalizeIdentifier,
    calculateColorSimilarity,
    calculateShapeSimilarity,
    evaluateUniqueIdentifier
}; 