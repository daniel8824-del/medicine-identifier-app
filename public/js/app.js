// 전역 변수
let currentPage = 1;
let totalPages = 1;
let lastSearchParams = null;

// API 기본 URL 설정
const API_BASE_URL = (() => {
    const hostname = window.location.hostname;
    if (hostname === 'localhost') {
        return 'http://localhost:3000';  // 로컬 테스트용
    } else if (hostname.includes('ngrok')) {
        return '';  // ngrok 사용 시 상대 경로 사용
    } else if (hostname === '10.0.2.2') {
        return 'http://10.0.2.2:3000';  // 안드로이드 에뮬레이터용
    }
    return '';  // 기타 환경에서는 상대 경로 사용
})();

// 제형 검색을 위한 매핑 객체
const formCodeMapping = {
    "정제": "정제",      // '정제'라는 단어가 포함된 모든 제형
    "경질캡슐": "경질",  // '경질'이라는 단어가 포함된 모든 제형
    "연질캡슐": "연질"   // '연질'이라는 단어가 포함된 모든 제형
};

// 디바이스 타입 체크 함수 수정
function isMobileDevice() {
    return window.navigator.userAgent.includes('Android') 
        || window.navigator.userAgent.includes('iPhone')
        || window.navigator.userAgent.includes('Mobile')  // 크롬 모바일 시뮬레이션 감지
        || window.innerWidth <= 768;  // 화면 크기로도 체크
}

// 페이지네이션 HTML 생성 함수
function createPaginationHTML(currentPage, totalPages) {
    return `
        <div class="pagination">
            <button class="page-btn" id="prev-page" ${currentPage <= 1 ? 'disabled' : ''}>이전</button>
            <span id="page-info">${currentPage} / ${totalPages}</span>
            <button class="page-btn" id="next-page" ${currentPage >= totalPages ? 'disabled' : ''}>다음</button>
        </div>`;
}

// 이미지 검색 결과 표시 함수
function displayImageSearchResults(data) {
    const searchResults = document.querySelector('.search-results');
    if (!data || !data.results || data.results.length === 0) {
        searchResults.innerHTML = '<div class="no-results">검색 결과가 없습니다.</div>';
        return;
    }

    // 이미지 목을 후순위로 정렬
    const sortedResults = [...data.results].sort((a, b) => {
        const aHasImage = a.ITEM_IMAGE && a.ITEM_IMAGE.trim() !== '';
        const bHasImage = b.ITEM_IMAGE && b.ITEM_IMAGE.trim() !== '';
        if (aHasImage === bHasImage) return 0;
        return aHasImage ? -1 : 1;
    });
    
    // 정렬된 결과로 data 객체 업데이트
    data.results = sortedResults;

    // 클라이언트 페이지네이션
    const itemsPerPage = 9;
    const currentPage = parseInt(data.currentPage || 1);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const totalPages = Math.ceil(data.results.length / itemsPerPage);

    if (isMobileDevice()) {
        let html = '<div class="medicine-grid">';
        html += data.results.slice(startIndex, endIndex).map((medicine, index) => {
            const imageUrl = medicine.ITEM_IMAGE ? 
                `/api/proxy-image?url=${encodeURIComponent(medicine.ITEM_IMAGE)}` : 
                null;
                
            return `
            <div class="medicine-grid-item" data-index="${index}">
                ${imageUrl ? 
                    `<img src="${imageUrl}" alt="${medicine.ITEM_NAME}" onerror="this.style.display='none';">` : 
                    '<div class="no-image">No Image</div>'}
            </div>`;
        }).join('');
        html += '</div>';

        html += createPaginationHTML(currentPage, totalPages);

        html += `
        <div id="medicineModal" class="medicine-modal">
            <div class="modal-content">
                <span class="close-button">&times;</span>
                <div id="modalContent"></div>
            </div>
        </div>`;

        searchResults.innerHTML = html;

        document.querySelectorAll('.medicine-grid-item').forEach(item => {
            item.addEventListener('click', () => {
                const index = parseInt(item.dataset.index);
                const medicine = data.results[startIndex + index];
                const modal = document.getElementById('medicineModal');
                const modalContent = document.getElementById('modalContent');

                modalContent.innerHTML = `
                    <div class="medicine-detail">
                        <div class="medicine-image">
                            ${medicine.ITEM_IMAGE ? 
                                `<img src="/api/proxy-image?url=${encodeURIComponent(medicine.ITEM_IMAGE)}" 
                                    alt="${medicine.ITEM_NAME}" onerror="this.style.display='none';">` : 
                                ''}
                        </div>
                        <div class="medicine-info">
                            <h3>${medicine.ITEM_NAME || '-'}</h3>
                            <p><strong>업체명:</strong> ${medicine.ENTP_NAME || '-'}</p>
                            <p><strong>제형:</strong> ${medicine.FORM_CODE_NAME || '-'}</p>
                            <p><strong>모양:</strong> ${medicine.DRUG_SHAPE || '-'}</p>
                            <p><strong>색상(앞):</strong> ${medicine.COLOR_CLASS1 || '-'}</p>
                            <p><strong>색상(뒤):</strong> ${medicine.COLOR_CLASS2 || '-'}</p>
                            <p><strong>분할선(앞):</strong> ${medicine.LINE_FRONT ? medicine.LINE_FRONT : '없음'}</p>
                            <p><strong>분할선(뒤):</strong> ${medicine.LINE_BACK ? medicine.LINE_BACK : '없음'}</p>
                            <p><strong>식별문자(앞):</strong> ${medicine.PRINT_FRONT || '-'}</p>
                            <p><strong>식별문자(뒤):</strong> ${medicine.PRINT_BACK || '-'}</p>
                            <p><strong>분류:</strong> ${medicine.CLASS_NAME || '-'}</p>
                            <p><strong>전문/일반:</strong> ${medicine.ETC_OTC_NAME || '-'}</p>
                        </div>
                    </div>
                `;

                modal.style.display = 'block';
            });
        });

        const closeButton = document.querySelector('.close-button');
        if (closeButton) {
            closeButton.addEventListener('click', () => {
                document.getElementById('medicineModal').style.display = 'none';
            });
        }

        window.addEventListener('click', (event) => {
            const modal = document.getElementById('medicineModal');
            if (event.target === modal) {
                modal.style.display = 'none';
            }
        });
    } else {
        // 데스크톱에서는 기존 형태로 표시
        let html = '<div class="medicine-list">';
        html += data.results.slice(startIndex, endIndex).map(medicine => {
            const imageUrl = medicine.ITEM_IMAGE ? 
                `/api/proxy-image?url=${encodeURIComponent(medicine.ITEM_IMAGE)}` : 
                null;
                
            return `
            <div class="medicine-item">
                <div class="medicine-image">
                    ${imageUrl ? 
                        `<img src="${imageUrl}" alt="${medicine.ITEM_NAME}" onerror="this.parentElement.classList.add('no-image');">` : 
                        ''}
                </div>
                <div class="medicine-info">
                    <h3>${medicine.ITEM_NAME || '-'}</h3>
                    <p><strong>업체명:</strong> ${medicine.ENTP_NAME || '-'}</p>
                    <p><strong>제형:</strong> ${medicine.FORM_CODE_NAME || '-'}</p>
                    <p><strong>모양:</strong> ${medicine.DRUG_SHAPE || '-'}</p>
                    <p><strong>색상(앞):</strong> ${medicine.COLOR_CLASS1 || '-'}</p>
                    <p><strong>색상(뒤):</strong> ${medicine.COLOR_CLASS2 || '-'}</p>
                    <p><strong>분할선(앞):</strong> ${medicine.LINE_FRONT ? medicine.LINE_FRONT : '없음'}</p>
                    <p><strong>분할선(뒤):</strong> ${medicine.LINE_BACK ? medicine.LINE_BACK : '없음'}</p>
                    <p><strong>식별문자(앞):</strong> ${medicine.PRINT_FRONT || '-'}</p>
                    <p><strong>식별문자(뒤):</strong> ${medicine.PRINT_BACK || '-'}</p>
                    <p><strong>분류:</strong> ${medicine.CLASS_NAME || '-'}</p>
                    <p><strong>전문/일반:</strong> ${medicine.ETC_OTC_NAME || '-'}</p>
                </div>
            </div>
        `}).join('');
        html += '</div>';

        html += createPaginationHTML(currentPage, totalPages);

        searchResults.innerHTML = html;
    }

    // 페이지네이션 이벤트 리스너
    const prevButton = document.getElementById('prev-page');
    const nextButton = document.getElementById('next-page');
    
    if (prevButton) {
        prevButton.onclick = () => {
            if (currentPage > 1) {
                data.currentPage = currentPage - 1;
                displayImageSearchResults(data);
            }
        };
    }
    
    if (nextButton) {
        nextButton.onclick = () => {
            if (currentPage < totalPages) {
                data.currentPage = currentPage + 1;
                displayImageSearchResults(data);
            }
        };
    }
}

// 검색 결과 표시 함수
function displaySearchResults(results, pagination) {
    if (isMobileDevice()) {
        displayMobileGridView(results, pagination);
        return;
    }

    const searchResults = document.querySelector('.search-results');
    if (!results || results.length === 0) {
        searchResults.innerHTML = '<div class="no-results">검색 결과가 없습니다.</div>';
        return;
    }

    // 검색 결과 표
    let html = '<div class="medicine-list">';
    html += results.map(medicine => {
        const imageUrl = medicine.ITEM_IMAGE ? 
            `/api/proxy-image?url=${encodeURIComponent(medicine.ITEM_IMAGE)}` : 
            null;
            
        return `
        <div class="medicine-item">
            <div class="medicine-image">
                ${imageUrl ? 
                    `<img src="${imageUrl}" alt="${medicine.ITEM_NAME}" onerror="this.parentElement.classList.add('no-image');">` : 
                    ''}
            </div>
            <div class="medicine-info">
                <h3>${medicine.ITEM_NAME || '-'}</h3>
                <p><strong>업체명:</strong> ${medicine.ENTP_NAME || '-'}</p>
                <p><strong>제형:</strong> ${medicine.FORM_CODE_NAME || '-'}</p>
                <p><strong>모양:</strong> ${medicine.DRUG_SHAPE || '-'}</p>
                <p><strong>색상(앞):</strong> ${medicine.COLOR_CLASS1 || '-'}</p>
                <p><strong>색상(뒤):</strong> ${medicine.COLOR_CLASS2 || '-'}</p>
                <p><strong>분할선(앞):</strong> ${medicine.LINE_FRONT ? medicine.LINE_FRONT : '없음'}</p>
                <p><strong>분할선(뒤):</strong> ${medicine.LINE_BACK ? medicine.LINE_BACK : '없음'}</p>
                <p><strong>식별문자(앞):</strong> ${medicine.PRINT_FRONT || '-'}</p>
                <p><strong>식별문자(뒤):</strong> ${medicine.PRINT_BACK || '-'}</p>
                <p><strong>분류:</strong> ${medicine.CLASS_NAME || '-'}</p>
                <p><strong>전문/일반:</strong> ${medicine.ETC_OTC_NAME || '-'}</p>
            </div>
        </div>
    `}).join('');
    html += '</div>';

    // 페이지네이션 추가
    if (pagination) {
        currentPage = pagination.currentPage;
        totalPages = pagination.totalPages;
        html += createPaginationHTML(currentPage, totalPages);
    }

    searchResults.innerHTML = html;
    setupPaginationListeners();
}

// 페이지네이션 버튼 이벤트 리스너 설정
function setupPaginationListeners() {
    const prevButton = document.getElementById('prev-page');
    const nextButton = document.getElementById('next-page');
    
    if (prevButton) {
        prevButton.onclick = () => {
            if (currentPage > 1) {
                performSearch(currentPage - 1);
            }
        };
    }
    
    if (nextButton) {
        nextButton.onclick = () => {
            if (currentPage < totalPages) {
                performSearch(currentPage + 1);
            }
        };
    }
}

// 검색 실행 함수
async function performSearch(page = 1) {
    const searchForm = document.querySelector('.search-form');
    if (!searchForm) return;

    const formData = new FormData(searchForm);
    const params = new URLSearchParams();

    // 검색 파라미터 설정
    for (let [key, value] of formData.entries()) {
        if (key === 'line_front') {
            console.log('분할선 값:', value);
            if (value && value !== '전체') {
                params.append(key, value);
            }
        } else if (value && value !== '전체') {
            if (key === 'form_code_name') {
                const searchTerm = formCodeMapping[value];
                if (searchTerm) {
                    params.append('form_code_name', searchTerm);
                } else {
                    params.append(key, value);
                }
            } else if (key === 'color_class1') {
                if (value === '') {
                    params.append(key, '명');
                } else {
                    params.append(key, value);
                }
            } else {
                params.append(key, value);
            }
        }
    }
    
    // 디버깅을 위한 로그 추가
    console.log('검색 URL:', `/api/search?${params}`);
    console.log('검색 파라미터:', params.toString());

    // 페이지 정보 추가
    params.append('page', page);
    params.append('limit', '9');

    try {
        console.log('검색 요청 시작');
        const response = await fetch(`/api/search?${params}`);
        console.log('검색 응답 상태:', response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('검색 실패:', errorText);
            throw new Error('검색 중 오류가 발생했습니다.');
        }
        
        const data = await response.json();
        console.log('검색 결과:', data);
        
        if (data.items) {
            displaySearchResults(data.items, data.pagination);
        } else {
            console.log('검색 결과 없음');
            displaySearchResults([], null);
        }
    } catch (error) {
        console.error('검색 중 오류 발생:', error);
        displaySearchResults([], null);
    }
}

// 검색 폼 제출 핸들러
async function handleSearch(event) {
    event.preventDefault();
    await performSearch(1);
}

// DOM이 로드되 실행
document.addEventListener('DOMContentLoaded', async function() {
    // 기존 이벤트 리스너 제거
    const searchForm = document.querySelector('.search-form');
    if (searchForm) {
        const newSearchForm = searchForm.cloneNode(true);
        searchForm.parentNode.replaceChild(newSearchForm, searchForm);
        
        // 새로 이벤트 리스너 등록
        newSearchForm.addEventListener('submit', handleSearch);
    }

    // 탭 전환 기능 추가
    setupTabs();
    
    // 데이터베이스 상태 확인
    try {
        const response = await fetch('/api/db-status');
        const data = await response.json();
        console.log('데이터베이스 상태:', data);
        
        if (data.count === 0) {
            console.log('데이터베이스가 비어있습니다. 초기 데이터를 수집합니다...');
            await updateDatabase();
        }
    } catch (error) {
        console.error('데이터베이스 상태 확인 중 오류:', error);
    }

    // 색상 체크박스 단일 선택 처리
    const colorCheckboxes = document.querySelectorAll('input[name="color_class1"]');
    colorCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            if (this.checked) {
                // 다른 모든 체크박스 해제
                colorCheckboxes.forEach(otherCheckbox => {
                    if (otherCheckbox !== this) {
                        otherCheckbox.checked = false;
                    }
                });
            }
        });
    });
}); 

// 탭 설정 함수
function setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-menu button');
    const searchForm = document.querySelector('.search-form');
    const photoSearchTemplate = document.getElementById('photo-search-template');
    let photoSearchDiv = null;

    // 사진 검색 템플릿을 DOM에 추가
    if (photoSearchTemplate) {
        photoSearchDiv = document.importNode(photoSearchTemplate.content, true).querySelector('.photo-search');
        searchForm.parentNode.insertBefore(photoSearchDiv, searchForm.nextSibling);
        
        // 사진 검색 기능 초기화 - DOM 요소가 추가된 직후에 호출
        setupPhotoSearch();
    }

    // 초기화 함수
    function resetAll() {
        // 검색 폼 초기화
        searchForm.reset();
        // 검색 결과 초기화
        const searchResults = document.querySelector('.search-results');
        if (searchResults) {
            searchResults.innerHTML = '';
        }
        // 사진 검색 초기화
        if (photoSearchDiv) {
            const previewContainer = document.getElementById('previewContainer');
            if (previewContainer) {
                previewContainer.innerHTML = '';
            }
            const videoElement = document.getElementById('videoElement');
            if (videoElement && videoElement.srcObject) {
                videoElement.srcObject.getTracks().forEach(track => track.stop());
                videoElement.srcObject = null;
            }
            const cameraContainer = document.getElementById('cameraContainer');
            if (cameraContainer) {
                cameraContainer.style.display = 'none';
            }
        }
    }

    // 초기화 버튼에 이벤트 리스너 추가
    const resetButtons = document.querySelectorAll('.btn-reset');
    resetButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            resetAll();
        });
    });

    tabButtons.forEach((button, index) => {
        button.addEventListener('click', () => {
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            // 탭 전환 시 초기화
            resetAll();

            if (index === 0) {
                searchForm.style.display = 'block';
                if (photoSearchDiv) {
                    photoSearchDiv.style.display = 'none';
                }
            } else {
                searchForm.style.display = 'none';
                if (photoSearchDiv) {
                    photoSearchDiv.style.display = 'block';
                }
            }
        });
    });
}

// 사진 검색 관련 변수
let currentStream = null;
let currentFacingMode = 'environment'; // 후면 카메라가 기본

// 사진 검색 기능 설정
function setupPhotoSearch() {
    const fileInput = document.querySelector('#fileInput');
    const uploadBtn = document.querySelector('.upload-btn');
    const cameraBtn = document.querySelector('.camera-btn');
    const previewContainer = document.querySelector('#previewContainer');
    const photoSearchBtn = document.querySelector('#photoSearchBtn');
    const photoResetBtn = document.querySelector('#photoResetBtn');
    const videoElement = document.querySelector('#videoElement');
    const cameraContainer = document.querySelector('#cameraContainer');
    const captureBtn = document.querySelector('#captureBtn');
    const closeCameraBtn = document.querySelector('#closeCameraBtn');

    if (!fileInput || !uploadBtn || !cameraBtn || !previewContainer || !photoSearchBtn || 
        !photoResetBtn || !videoElement || !cameraContainer || !captureBtn || 
        !closeCameraBtn) {
        console.error('필요한 DOM 요소를 찾을 수 없습니다.');
        return;
    }

    // 파일 업로드 처리
    uploadBtn.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                previewContainer.innerHTML = `<img src="${e.target.result}" alt="미리보기">`;
                cameraContainer.style.display = 'none';
            };
            reader.readAsDataURL(file);
        }
    });

    // 카메라 기능
    cameraBtn.addEventListener('click', async () => {
        try {
            // 카메라 권한 요청
            const permissionResult = await navigator.permissions.query({ name: 'camera' });
            if (permissionResult.state === 'denied') {
                alert('카메라 권한이 거부되었습니다. 설정에서 권한을 허용해주세요.');
                return;
            }

            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' }
            });
            videoElement.srcObject = stream;
            videoElement.style.display = 'block';
            previewContainer.innerHTML = '';
            previewContainer.appendChild(videoElement);
            cameraContainer.style.display = 'block';
            cameraContainer.style.position = 'relative';
            previewContainer.appendChild(cameraContainer);
        } catch (error) {
            console.error('카메라 접근 실패:', error);
            alert('카메라 접근에 실패했습니다. 카메��� 권한을 확인해주세요.');
        }
    });

    // 촬영 버튼
    captureBtn.addEventListener('click', () => {
        if (videoElement.srcObject) {
            const canvas = document.createElement('canvas');
            canvas.width = videoElement.videoWidth;
            canvas.height = videoElement.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(videoElement, 0, 0);
            
            const imageUrl = canvas.toDataURL('image/jpeg');
            previewContainer.innerHTML = `<img src="${imageUrl}" alt="촬영된 이미지">`;
            
            stopCamera();
            cameraContainer.style.display = 'none';
        }
    });

    // 카메라 닫기 버튼
    closeCameraBtn.addEventListener('click', () => {
        stopCamera();
        cameraContainer.style.display = 'none';
    });

    // 초기화 버튼
    photoResetBtn.addEventListener('click', () => {
        stopCamera();
        cameraContainer.style.display = 'none';
        previewContainer.innerHTML = '';
        fileInput.value = '';
    });

    // 검색 버튼
    photoSearchBtn.addEventListener('click', async () => {
        const img = previewContainer.querySelector('img');
        if (!img) {
            alert('먼저 사진을 촬영하거나 업로드해주세요.');
            return;
        }

        try {
            const response = await fetch('/api/analyze-image', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    imageData: img.src
                })
            });

            if (!response.ok) {
                throw new Error('이미지 분석에 실패했습니다.');
            }

            const result = await response.json();
            console.log('이미지 분석 결과:', result);
            
            // 검색 결과 표시
            if (result && result.results) {
                displayImageSearchResults(result);
            } else {
                displayImageSearchResults({ results: [] });
            }
        } catch (error) {
            console.error('이미지 검색 중 오류:', error);
            alert('이미지 검색에 실패했습니다.');
        }
    });
}

// 카메라 시작 함수
async function startCamera() {
    try {
        if (currentStream) {
            stopCamera();
        }

        const constraints = {
            video: {
                facingMode: { exact: currentFacingMode }
            }
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        const videoElement = document.getElementById('videoElement');
        
        if (videoElement) {
            videoElement.srcObject = stream;
            currentStream = stream;
        }
    } catch (error) {
        console.error('카메라 시작 실패:', error);
        // 후면 카메라 실패 시 전면 카메라 시도
        if (currentFacingMode === 'environment') {
            currentFacingMode = 'user';
            await startCamera();
        } else {
            throw error;
        }
    }
}

// 카메라 중지 함수
function stopCamera() {
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
        currentStream = null;
        
        const videoElement = document.getElementById('videoElement');
        if (videoElement) {
            videoElement.srcObject = null;
        }
    }
}

function createMedicineCard(medicine) {
    return `
        <div class="medicine-card">
            <h3>${medicine.ITEM_NAME}</h3>
            <div class="medicine-info">
                <p><strong>업체명:</strong> ${medicine.ENTP_NAME || '-'}</p>
                <p><strong>제형:</strong> ${medicine.FORM_CODE_NAME || '-'}</p>
                <p><strong>모양:</strong> ${medicine.DRUG_SHAPE || '-'}</p>
                <p><strong>색상(앞):</strong> ${medicine.COLOR_CLASS1 || '-'}</p>
                <p><strong>색상(뒤):</strong> ${medicine.COLOR_CLASS2 || '-'}</p>
                <p><strong>분할선(앞):</strong> ${medicine.LINE_FRONT ? medicine.LINE_FRONT : '없음'}</p>
                <p><strong>분할선(뒤):</strong> ${medicine.LINE_BACK ? medicine.LINE_BACK : '없음'}</p>
                <p><strong>식별문자(앞):</strong> ${medicine.PRINT_FRONT || '-'}</p>
                <p><strong>식별문자(뒤):</strong> ${medicine.PRINT_BACK || '-'}</p>
                <p><strong>분류:</strong> ${medicine.CLASS_NAME || '-'}</p>
                <p><strong>전문/일반:</strong> ${medicine.ETC_OTC_NAME || '-'}</p>
            </div>
            ${medicine.ITEM_IMAGE ? `<img src="/api/proxy-image?url=${encodeURIComponent(medicine.ITEM_IMAGE)}" alt="의약품 이미지" onerror="this.style.display='none'">` : ''}
        </div>
    `;
}

// 모바일용 리드 뷰 표시 함수
function displayMobileGridView(results, pagination) {
    const searchResults = document.querySelector('.search-results');
    if (!results || results.length === 0) {
        searchResults.innerHTML = '<div class="no-results">검색 결과가 없습니다.</div>';
        return;
    }

    let html = '<div class="medicine-grid">';
    html += results.map((medicine, index) => {
        const imageUrl = medicine.ITEM_IMAGE ? 
            `/api/proxy-image?url=${encodeURIComponent(medicine.ITEM_IMAGE)}` : 
            '#';
            
        return `
        <div class="medicine-grid-item" data-index="${index}">
            <img src="${imageUrl}" 
                alt="${medicine.ITEM_NAME}" 
                onerror="this.style.display='none'">
        </div>`;
    }).join('');
    html += '</div>';

    // 페이지네이션 추가
    if (pagination) {
        html += createPaginationHTML(pagination.currentPage, pagination.totalPages);
    }

    // 모달 추가
    html += `
    <div id="medicineModal" class="medicine-modal" style="display: none;">
        <div class="modal-content">
            <span class="close-button">&times;</span>
            <div id="modalContent"></div>
        </div>
    </div>`;

    searchResults.innerHTML = html;

    // 그리드 아이템 클릭 이벤트
    document.querySelectorAll('.medicine-grid-item').forEach(item => {
        item.addEventListener('click', () => {
            const index = parseInt(item.dataset.index);
            const medicine = results[index];
            showMedicineDetail(medicine);
        });
    });

    // 페이지네이션 이벤트
    const prevButton = document.getElementById('prev-page');
    const nextButton = document.getElementById('next-page');
    
    if (prevButton) {
        prevButton.onclick = () => {
            if (pagination && pagination.currentPage > 1) {
                performSearch(pagination.currentPage - 1);
            }
        };
    }
    
    if (nextButton) {
        nextButton.onclick = () => {
            if (pagination && pagination.currentPage < pagination.totalPages) {
                performSearch(pagination.currentPage + 1);
            }
        };
    }

    // 모달 닫기 버튼 이벤트
    const closeButton = document.querySelector('.close-button');
    if (closeButton) {
        closeButton.addEventListener('click', () => {
            document.getElementById('medicineModal').style.display = 'none';
        });
    }
}

// 의약품 상세 정보 표시
function showMedicineDetail(medicine) {
    const modalContent = document.getElementById('modalContent');
    const modal = document.getElementById('medicineModal');
    
    const imageUrl = medicine.ITEM_IMAGE ? 
        `/api/proxy-image?url=${encodeURIComponent(medicine.ITEM_IMAGE)}` : 
        '#';

    modalContent.innerHTML = `
        <div class="medicine-detail">
            <div class="medicine-image">
                <img src="${imageUrl}" 
                    alt="${medicine.ITEM_NAME}" 
                    onerror="this.style.display='none'">
            </div>
            <div class="medicine-info">
                <h3>${medicine.ITEM_NAME || '-'}</h3>
                <p><strong>업체명:</strong> ${medicine.ENTP_NAME || '-'}</p>
                <p><strong>제형:</strong> ${medicine.FORM_CODE_NAME || '-'}</p>
                <p><strong>모양:</strong> ${medicine.DRUG_SHAPE || '-'}</p>
                <p><strong>색상(앞):</strong> ${medicine.COLOR_CLASS1 || '-'}</p>
                <p><strong>색상(뒤):</strong> ${medicine.COLOR_CLASS2 || '-'}</p>
                <p><strong>분할선(앞):</strong> ${medicine.LINE_FRONT ? medicine.LINE_FRONT : '없음'}</p>
                <p><strong>분할선(뒤):</strong> ${medicine.LINE_BACK ? medicine.LINE_BACK : '없음'}</p>
                <p><strong>식별문자(앞):</strong> ${medicine.PRINT_FRONT || '-'}</p>
                <p><strong>식별문자(뒤):</strong> ${medicine.PRINT_BACK || '-'}</p>
                <p><strong>분류:</strong> ${medicine.CLASS_NAME || '-'}</p>
                <p><strong>전문/일반:</strong> ${medicine.ETC_OTC_NAME || '-'}</p>
            </div>
        </div>
    `;

    modal.style.display = 'block';
}

// CSS 스타일 수정
const mobileStyle = document.createElement('style');
mobileStyle.textContent = `
    .medicine-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;
        padding: 8px;
    }

    .medicine-grid-item {
        aspect-ratio: 1;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
        background-color: #f5f5f5;
        border-radius: 8px;
        padding: 4px;
    }

    .medicine-grid-item img {
        max-width: 100%;
        max-height: 100%;
        width: auto;
        height: auto;
        object-fit: contain;
    }

    .medicine-modal {
        display: none;
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0,0,0,0.7);
        z-index: 1000;
    }

    .modal-content {
        position: relative;
        background-color: white;
        margin: 15% auto;
        padding: 20px;
        width: 90%;
        max-height: 70vh;
        overflow-y: auto;
        border-radius: 8px;
    }

    .close-button {
        position: absolute;
        right: 10px;
        top: 10px;
        font-size: 24px;
        cursor: pointer;
    }
`;

// 모바일 환경에서만 스타일 적용
if (isMobileDevice()) {
    document.head.appendChild(mobileStyle);
}

function openModal(medicineData) {
    const modal = document.createElement('div');
    modal.className = 'medicine-modal';
    document.body.classList.add('modal-open');  // 모달 열 때 body에 클래스 추가
    
    // ... existing modal content code ...

    // 모달 닫기 버튼 클릭 이벤트
    closeButton.addEventListener('click', () => {
        document.body.removeChild(modal);
        document.body.classList.remove('modal-open');  // 모달 닫을 때 body에서 클래스 제거
    });

    // 모달 외부 클릭 시 닫기
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
            document.body.classList.remove('modal-open');  // 모달 닫을 때 body에서 클래스 제거
        }
    });

    // 터치 이벤트 방지
    modal.addEventListener('touchmove', (e) => {
        if (e.target === modal) {
            e.preventDefault();
        }
    }, { passive: false });

    document.body.appendChild(modal);
}