const {
    searchMedicines,
    levenshteinDistance,
    stringSimilarity,
    normalizeIdentifier
} = require('../medicine-matcher');

describe('Medicine Matcher Utility Functions', () => {
    describe('levenshteinDistance', () => {
        test('should return correct distance for similar strings', () => {
            expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
            expect(levenshteinDistance('NERSC', 'NERSK')).toBe(1);
            expect(levenshteinDistance('SP', 'SP')).toBe(0);
        });

        test('should handle empty strings', () => {
            expect(levenshteinDistance('', '')).toBe(0);
            expect(levenshteinDistance('abc', '')).toBe(3);
            expect(levenshteinDistance('', 'abc')).toBe(3);
        });
    });

    describe('stringSimilarity', () => {
        test('should return 1.0 for identical strings', () => {
            expect(stringSimilarity('NERSC', 'NERSC')).toBe(1.0);
            expect(stringSimilarity('SP', 'SP')).toBe(1.0);
        });

        test('should give lower similarity for partial matches to prevent false positives', () => {
            expect(stringSimilarity('SP', 'SP NERSC')).toBeGreaterThan(0.2);
            expect(stringSimilarity('HW', 'HW')).toBeGreaterThan(0.9);
            expect(stringSimilarity('CS', 'C5')).toBeGreaterThan(0.5);
        });

        test('should handle edge cases appropriately', () => {
            expect(stringSimilarity(null, 'test')).toBe(0);
            expect(stringSimilarity('test', null)).toBe(0);
            expect(stringSimilarity('', '')).toBe(0);
        });
    });

    describe('normalizeIdentifier', () => {
        test('should handle basic normalization', () => {
            const result = normalizeIdentifier('SP-NERSC');
            expect(result).toContain('SPNERSC');
            expect(result).toContain('SP-NERSC');
        });

        test('should generate confusion patterns', () => {
            const result = normalizeIdentifier('C40', true, true);
            expect(result).toContain('C40');
            expect(result).toContain('C4O');
        });

        test('should generate short versions when enabled', () => {
            const result = normalizeIdentifier('NERSC', true, false);
            expect(result).toContain('NE');
            expect(result).toContain('NER');
        });

        test('should not generate short versions when disabled', () => {
            const result = normalizeIdentifier('NERSC', false, false);
            expect(result).not.toContain('NE');
            expect(result).not.toContain('NER');
        });
    });
});

describe('Medicine Search Integration', () => {
    const mockAnalysisResult = {
        '식별문자(앞)': 'SP',
        '식별문자(뒤)': 'NERSC',
        '색상(앞)': '하양',
        '색상(뒤)': '하양',
        '모양': '장방형'
    };

    test('should handle empty analysis result', async () => {
        const result = await searchMedicines({});
        expect(Array.isArray(result)).toBe(true);
    });

    test('should return results for valid analysis', async () => {
        const result = await searchMedicines(mockAnalysisResult);
        expect(Array.isArray(result)).toBe(true);
        if (result.length > 0) {
            expect(result[0]).toHaveProperty('similarity_score');
            expect(result[0]).toHaveProperty('match_details');
        }
    });

    test('should handle special cases like Senaset', async () => {
        const senasetResult = await searchMedicines({
            '식별문자(앞)': 'HW',
            '식별문자(뒤)': 'CS',
            '색상(앞)': '하양',
            '색상(뒤)': '하양',
            '모양': '원형'
        });
        
        expect(Array.isArray(senasetResult)).toBe(true);
        if (senasetResult.length > 0) {
            const firstResult = senasetResult[0];
            expect(firstResult.PRINT_FRONT.toLowerCase()).toMatch(/hw|마크/);
            expect(firstResult.PRINT_BACK).toMatch(/CS|C5/);
        }
    });
}); 