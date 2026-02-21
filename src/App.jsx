import { useState, useEffect } from 'react'
import { useRef } from 'react';
import { Map, CustomOverlayMap } from "react-kakao-maps-sdk"
import { Analytics } from "@vercel/analytics/react"
import toast, { Toaster } from 'react-hot-toast';
// 🌟 [핵심] 외부 링크 대신, 내 컴퓨터(node_modules)에 있는 기본 이미지 가져오기


// ... (이 아래 REGION_MAPPING 부터는 그대로 둬도 된다) ...
const REGION_MAPPING = {
    "홍대입구역 근처": ["그라운드합주실 본점", "그라운드합주실 홍대1호점", "제시뮤직 합주실 홍대점", "하모닉스 합주실", "하모닉스 합주실 2호점", "사운드시티 합주실 홍대역점", "호랑이합주실"],
    "합정/망원 ": ["그라운드합주실 합정1호점", "Chama Studio", "에비로드 합주실"],
    "신촌/이대 ": ["그라운드합주실 신촌1호점"]
}

// 🌟 [수정] 모바일 화면에서 튀어나가지 않는 반응형 TimeInput 컴포넌트
const TimeInput = ({ label, value, setValue, suffix, min = 0, max = 24 }) => {
    const handleDecrement = () => { if (value > min) setValue(Number(value) - 1) }
    const handleIncrement = () => { if (value < max) setValue(Number(value) + 1) }

    return (
        <div className="flex-1 min-w-0"> {/* min-w-0 추가: 박스 탈출 방지 */}
            <label className="text-xs font-bold text-gray-500 mb-1 block truncate">{label}</label>
            <div className="flex items-center bg-white border border-gray-200 rounded-xl overflow-hidden h-11"> {/* h-12 -> h-11로 살짝 다이어트 */}
                {/* w-10 -> w-8 로 줄여서 모바일 공간 확보 */}
                <button onClick={handleDecrement} className="w-8 sm:w-10 h-full bg-gray-50 text-gray-500 hover:bg-gray-200 active:bg-gray-300 font-bold text-lg transition-colors border-r border-gray-100">−</button>
                <div className="flex-1 flex items-center justify-center gap-0.5 sm:gap-1 min-w-0 px-1">
                    <input type="number" value={value} onChange={(e) => setValue(Number(e.target.value))} className="w-6 sm:w-8 text-center font-bold text-base sm:text-lg outline-none bg-transparent"/>
                    <span className="text-[10px] sm:text-xs text-gray-400 whitespace-nowrap truncate">{suffix}</span>
                </div>
                <button onClick={handleIncrement} className="w-8 sm:w-10 h-full bg-gray-50 text-gray-500 hover:bg-gray-200 active:bg-gray-300 font-bold text-lg transition-colors border-l border-gray-100">+</button>
            </div>
        </div>
    )
}

function App() {
  const [kakaoReady, setKakaoReady] = useState(false);

  const [allStudios, setAllStudios] = useState([]) 
  const [rooms, setRooms] = useState([])           
  const [isSearched, setIsSearched] = useState(false)
  const [selectedStudios, setSelectedStudios] = useState([])
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [loading, setLoading] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(true) 
  const sheetRef = useRef(null);

  // 🌟 [신규] FAQ 모달 상태
  const [isFaqOpen, setIsFaqOpen] = useState(false)
  
  // 🌟 한국 시간(KST) 기준으로 오늘 날짜를 YYYY-MM-DD 형식으로 가져오는 마법의 함수
  const getTodayKST = () => {
    const offset = new Date().getTimezoneOffset() * 60000;
    return new Date(Date.now() - offset).toISOString().split('T')[0];
  };

  // ✅ 수정: 이제 접속할 때마다 '오늘 날짜'가 기본으로 뜹니다.
  const [date, setDate] = useState(getTodayKST());
  const [startTime, setStartTime] = useState(16)
  const [endTime, setEndTime] = useState(22)
  const [minHours, setMinHours] = useState(2)
  const [mapCenter, setMapCenter] = useState([37.556, 126.924])
  const [expandedRegions, setExpandedRegions] = useState(["홍대입구역 근처"])
  const [searchError, setSearchError] = useState("")
  const [sheetHeight, setSheetHeight] = useState(35);
  const [failedStudios, setFailedStudios] = useState([]); // 🌟 [추가] 에러 난 합주실 보관소
  // 🌟 [추가] 록스타 로딩 문구 리스트 & 현재 인덱스
  const loadingPhrases = [
    "탐색 중...",
    "🎸 앰프 진공관 예열하는 중...",
    "🥁 스네어 드럼 튜닝 중...",
    "🎤 마이크 테스트! 아, 아!",
    "🔌 이펙터 페달 연결하는 중...",
    "🤘 슬랩으로 그루브 시동 거는 중...",
    "🎧 춤을 추며 절망이랑 싸울 거야..."
  ];
  const [loadingIndex, setLoadingIndex] = useState(0);

  // 🌟 [추가] 물리 엔진: 손가락/마우스의 Y좌표를 계산해서 높이를 조절하는 함수
  const handleDrag = (e) => {
    // PC에서 마우스 클릭을 떼면 작동하지 않게 방어
    if (e.type === 'mousemove' && e.buttons !== 1) return;

    // 터치(모바일)와 마우스(PC)의 Y좌표를 모두 가져옴
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const windowHeight = window.innerHeight;
    // 전체 화면 대비 손가락 위치를 % (vh)로 계산
    const newHeight = ((windowHeight - clientY) / windowHeight) * 100;
    // 시트가 너무 작아지거나(15vh) 화면을 다 덮지 않게(85vh) 제한
    if (newHeight >= 15 && newHeight <= 85) {
      // 🚀 핵심: setSheetHeight를 쓰지 않고 HTML 요소에 직접 값을 꽂아버림 (렌더링 부하 제로)
      if (sheetRef.current) {
        sheetRef.current.style.height = `${newHeight}vh`;
      }
    }
  };
  // 🌟 [신규] 손가락을 뗐을 때만 딱 한 번 리액트 상태를 업데이트해서 동기화
  const handleDragEnd = (e) => {
    const clientY = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;
    const windowHeight = window.innerHeight;
    const newHeight = ((windowHeight - clientY) / windowHeight) * 100;
    
    if (newHeight >= 15 && newHeight <= 85) {
      setSheetHeight(newHeight); // 손 뗄 때만 최종 위치 저장
    }
  };
  // 🌟 1번 엔진: PWA 설치 팝업 가로채기
  useEffect(() => {
    const radar = setInterval(() => {
      if (window.kakao && window.kakao.maps) {
        window.kakao.maps.load(() => {
          setKakaoReady(true); // 시동 켜짐!
          clearInterval(radar); // 레이더 종료
        });
      }
    }, 100);
    
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    
    // 이 엔진의 종료(청소) 버튼은 맨 마지막에 있어야 합니다.
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    
  }, []); // 👈 첫 번째 방 닫힘


  // 🌟 2번 엔진: 백엔드 서버와 통신하기 (이제 회색 불이 켜질 겁니다!)
  useEffect(() => {
    fetch('https://jam-backend-yk57.onrender.com/all-studios')
      .then(res => res.json())
      .then(data => {
        setAllStudios(data.studios)
        const allNames = Object.values(REGION_MAPPING).flat(); 
        setSelectedStudios(allNames)
      })
      .catch(err => console.error("로딩 실패:", err))
  }, []); // 👈 두 번째 방 닫힘
  
  useEffect(() => {
    let interval;
    if (loading) {
      interval = setInterval(() => {
        setLoadingIndex((prev) => (prev + 1) % loadingPhrases.length);
      }, 2000); // 2.0초(2000ms)마다 변경
    } else {
      setLoadingIndex(0); // 로딩이 끝나면 다시 처음으로 리셋
    }
    return () => clearInterval(interval); // 컴포넌트가 꺼지면 타이머도 청소
  }, [loading]);

  const toggleStudio = (name) => {
    if (selectedStudios.includes(name)) {
      setSelectedStudios(selectedStudios.filter(s => s !== name))
    } else {
      setSelectedStudios([...selectedStudios, name])
    }
  }

  const toggleRegion = (regionName, e) => {
    e.stopPropagation()
    const studiosInRegion = REGION_MAPPING[regionName]
    const allSelected = studiosInRegion.every(s => selectedStudios.includes(s))

    if (allSelected) {
        setSelectedStudios(selectedStudios.filter(s => !studiosInRegion.includes(s)))
    } else {
        const newSelection = new Set([...selectedStudios, ...studiosInRegion])
        setSelectedStudios([...newSelection])
    }
  }

  const toggleAccordion = (regionName) => {
    if (expandedRegions.includes(regionName)) {
        setExpandedRegions(expandedRegions.filter(r => r !== regionName))
    } else {
        setExpandedRegions([...expandedRegions, regionName])
    }
  }

 // 🌟 [수정] 텍스트 복사 함수 (alert 삭제 -> toast 적용)
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      toast.success("📋 텍스트 복사 완료! 합주실을 공유하세요.", {
        duration: 3000,
        position: 'bottom-center',
        style: {
          background: '#333',
          color: '#fff',
          fontWeight: 'bold',
          borderRadius: '20px',
        },
      }) // ✅ 이게 바로 섹시한 토스트다.
    })
  }

  const handleSearch = async () => {
    if (selectedStudios.length === 0) {
        setSearchError("⚠️ 최소 1개 이상의 합주실을 선택해주세요!")
        return
    }
    setSearchError("")
    setLoading(true)
    
    try {
      // 🚨 대참사의 원인이었던 파라미터 부분을 정상 복구했다.
      const queryParams = new URLSearchParams({
        date: date,
        start_time: startTime,
        end_time: endTime,
        min_hours: minHours
      })
      
      selectedStudios.forEach(s => queryParams.append('studios', s))

      const response = await fetch(`https://jam-backend-yk57.onrender.com/search?${queryParams.toString()}`)
      const data = await response.json()
      
      // 🚀 [추가] 백엔드에서 받은 데이터를 '정상'과 '실패'로 쪼갭니다.
      const validRooms = data.results.filter(room => room.예약가능시간 !== "확인 불가");
      const errorRooms = data.results.filter(room => room.예약가능시간 === "확인 불가");
      
      // 실패한 합주실 이름만 중복 없이 추출 (예: '그라운드', '하모닉스')
      const errorNames = [...new Set(errorRooms.map(r => r.합주실.split(" ")[0]))];
      setFailedStudios(errorNames);

      // 😭 완벽하게 탐색했지만 진짜 빈 방이 없는 경우 (True Empty)
      if (validRooms.length === 0 && errorRooms.length === 0) {
        setSearchError("😭 조건에 맞는 방이 없어요! 시간이나 날짜를 변경해보세요.")
        setLoading(false)
        return
      }

      // ⚠️ 빈 방은 하나도 없는데, 서버가 터진 합주실만 있는 경우
      if (validRooms.length === 0 && errorRooms.length > 0) {
         setSearchError(`⚠️ 네이버 예약 서버 지연으로 ${errorNames.join(", ")}의 상태를 확인할 수 없습니다. 잠시 후 다시 시도해주세요.`);
         setLoading(false)
         return
      }

      // ✅ 하나라도 빈 방을 찾은 경우 (에러가 일부 섞여 있어도 바텀 시트를 올림)
      setRooms(validRooms)
      setIsSearched(true)
      setIsSearchOpen(false) 
      setSheetHeight(35) 

      if (validRooms.length > 0 && validRooms[0].lat) {
        setMapCenter([validRooms[0].lat, validRooms[0].lon])
      }
    } catch (error) {
      setSearchError("서버 통신 실패! 백엔드를 확인해주세요.")
    }
    setLoading(false)
  }

  const handleReset = () => {
    setIsSearched(false)
    setRooms([])
    setIsSearchOpen(true)
    setSearchError("")
  }

  return (
    <div className="relative w-full h-[100dvh] overflow-hidden font-sans bg-gray-100 overscroll-none touch-pan-x touch-pan-y">
      {/* 🌟 [필수] 토스트 기계 설치 (return 문 안쪽, 맨 위에 두면 됨) */}
      <Toaster />
      <Analytics /> 
{/* 🛡️ 4. 엔진 부팅 중일 때의 방어막 */}
      {!kakaoReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-0">
            <span className="text-xl font-bold text-gray-400 animate-pulse">🗺️ 카카오 지도 렌더링 준비 중...</span>
        </div>
      )}

      {/* 🚀 5. 시동이 완벽하게 걸렸을 때만 순수하게 지도 렌더링! */}
      {kakaoReady && (
        <Map 
          center={{ lat: mapCenter[0], lng: mapCenter[1] }} 
          style={{ width: "100vw", height: "100dvh", position: "absolute", top: 0, left: 0, zIndex: 0 }}
          level={4}
        >
        {!isSearched ? (
          // 🌑 검색 전: 회색의 시크한 알약 모양 마커 (모든 합주실)
          allStudios.map((studio, index) => (
              <CustomOverlayMap key={index} position={{ lat: studio.lat, lng: studio.lon }} yAnchor={1}>
                  <div 
                    onClick={() => window.open(studio.url, '_blank')}
                    className="bg-gray-800 text-white px-3 py-1.5 rounded-full shadow-md border border-gray-600 text-xs font-bold opacity-80 hover:opacity-100 hover:scale-110 transition-all cursor-pointer whitespace-nowrap"
                  >
                      {studio.name}
                  </div>
              </CustomOverlayMap>
          ))
      ) : (
          // 🔴 검색 후: 빈 방이 있는 합주실만 빨간색으로 통통 튀게 강조 (토스 스타일 UX)
          rooms.map((room, index) => (
              room.lat && room.lon ? (
                <CustomOverlayMap key={index} position={{ lat: room.lat, lng: room.lon }} yAnchor={1}>
                    <div className="flex flex-col items-center animate-bounce-short">
                        <div className="bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-t-md">
                            {room.예약가능시간.includes('확인') ? '⚠️ 확인불가' : '예약가능!'}
                        </div>
                        <div 
                          onClick={() => window.open(room.예약링크, '_blank')}
                          className={`${room.예약가능시간.includes('확인') ? 'bg-orange-500' : 'bg-red-500'} text-white px-4 py-2 rounded-b-xl rounded-tr-xl shadow-lg border-2 border-white text-sm font-extrabold hover:scale-110 transition-all cursor-pointer whitespace-nowrap`}
                        >
                            {room.합주실}
                        </div>
                    </div>
                </CustomOverlayMap>
              ) : null
          ))
      )}
    </Map>
      )}
      {/* 🌟 갇혀있던 FAQ 버튼 구출 (z-index: 1000 -> 3000으로 승급!) */}
      <button 
        onClick={() => setIsFaqOpen(true)}
        className="absolute top-6 right-4 sm:right-6 z-[3000] bg-white text-gray-600 w-11 h-11 rounded-full shadow-lg flex items-center justify-center font-bold text-xl border border-gray-200 hover:bg-gray-50 hover:scale-105 transition-all"
      >
        ?
      </button>

      {/* 조건 변경 버튼 */}
      {!isSearchOpen && (
         <div className="absolute top-6 left-1/2 transform -translate-x-1/2 z-[1000] w-full max-w-sm px-4 flex justify-center">
            {isSearched ? (
                <button onClick={() => setIsSearchOpen(true)} className="bg-white text-blue-600 px-8 py-3 rounded-full shadow-lg font-bold border border-blue-100 text-sm hover:bg-blue-50 hover:scale-105 transition-all">
                    🔍 조건 변경하기
                </button>
            ) : (
                <button onClick={() => setIsSearchOpen(true)} className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3.5 rounded-full shadow-xl font-bold animate-bounce text-lg">
                  🎸 빈 합주실 찾기
                </button>
            )}
         </div>
      )}

      {/* 🌟 FAQ 팝업 (모달) */}
      {isFaqOpen && (
        <div className="absolute inset-0 z-[4000] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
             <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl relative">
                <button onClick={() => setIsFaqOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-800 text-xl font-bold">✕</button>
                
                <h2 className="text-2xl font-extrabold text-gray-900 mb-6">🎸 자주 묻는 질문</h2>
                
                <div className="space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
                    
                    {/* 🚀 신규: 앱 설치 유도 섹션 */}
                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                        <h3 className="font-bold text-blue-600 mb-1">📱 1초 만에 합주실 예약하기 (앱 설치)</h3>
                        <p className="text-xs text-gray-600 mb-3">매번 검색할 필요 없이 바탕화면에 앱을 깔아두세요!</p>
                        <button 
                            onClick={() => {
                                if (deferredPrompt) {
                                    deferredPrompt.prompt();
                                    deferredPrompt.userChoice.then(() => setDeferredPrompt(null));
                                } else {
                                    // 아이폰(Safari)은 자동 설치 팝업을 지원하지 않으므로 수동 안내
                                    alert("🍎 아이폰: 하단 '공유[↑]' 버튼 ➔ '홈 화면에 추가'\n🤖 안드로이드: 우측 상단 '⋮' 메뉴 ➔ '홈 화면에 추가'");
                                }
                            }}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg font-bold shadow transition-colors flex items-center justify-center gap-2"
                        >
                            ⬇️ 잼투게더 앱 설치하기
                        </button>
                    </div>

                    <div className="bg-gray-50 p-4 rounded-xl">
                        <h3 className="font-bold text-gray-800 mb-1">Q. 잼투게더는 무엇인가요?</h3>
                        <p className="text-sm text-gray-600 leading-relaxed">서울 내 합주실 예약 현황을 실시간으로 스캔하여 원하는 시간에 맞는 빈 방을 찾아주는 서비스입니다.</p>
                    </div>

                    <div className="bg-gray-50 p-4 rounded-xl">
                        <h3 className="font-bold text-gray-800 mb-1">Q. 건의사항 및 문의</h3>
                        <p className="text-sm text-gray-600 leading-relaxed">
                            버그 제보나 추가되었으면 하는 합주실이 있다면 언제든 연락주세요!<br/>
                            📧 <span className="font-extrabold text-gray-900">roomonf2re@gmail.com</span>
                        </p>
                    </div>
                </div>

                <button onClick={() => setIsFaqOpen(false)} className="w-full mt-6 bg-gray-800 text-white py-3 rounded-xl font-bold shadow-lg">닫기</button>
             </div>
        </div>
      )}

      {/* 검색 팝업 */}
      {isSearchOpen && (
        <div className="absolute inset-0 z-[2000] bg-black/60 flex items-end sm:items-center justify-center sm:p-4 backdrop-blur-sm transition-opacity">
          <div className="bg-white w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl shadow-2xl h-[90vh] sm:h-auto max-h-[90vh] flex flex-col">
            <div className="p-6 pb-2 flex justify-between items-center border-b border-gray-100 shrink-0">
              <h2 className="text-2xl font-extrabold text-gray-900">🎸 빈 방 찾기</h2>
              <button onClick={() => setIsSearchOpen(false)} className="text-sm font-bold text-gray-500 hover:text-gray-800 bg-gray-100 px-3 py-1.5 rounded-full transition-colors">
                 🗺️ 지도만 볼래요
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                {/* 날짜/시간 섹션 */}
                <div className="bg-gray-50 p-5 rounded-2xl border border-gray-100">
                    <label className="text-xs font-bold text-gray-500 mb-2 block">📅 날짜 선택</label>
                    <input type="date" value={date} min={getTodayKST()} onChange={e => setDate(e.target.value)} className="w-full p-3.5 bg-white border border-gray-200 rounded-xl mb-4 outline-none focus:border-blue-500 text-lg font-bold text-gray-800"/>
                    <div className="flex gap-3">
                        <TimeInput label="시작 시간" value={startTime} setValue={setStartTime} suffix="시 부터" />
                        <TimeInput label="종료 시간" value={endTime} setValue={setEndTime} suffix="시 까지" />
                    </div>
                    <div className="mt-4">
                        <TimeInput label="최소 이용 시간" value={minHours} setValue={setMinHours} suffix="시간 이상" min={1} max={6} />
                    </div>
                </div>

                {/* 합주실 선택 */}
                <div>
                    <div className="flex justify-between items-center mb-3">
                        <h3 className="text-sm font-bold text-gray-800">🎯 지역별 합주실 선택</h3>
                        <button onClick={() => {
        // 🌟 서버 데이터가 아닌, 확실한 프론트엔드 맵핑 데이터 사용
                            const allNames = Object.values(REGION_MAPPING).flat();
                            if (selectedStudios.length === allNames.length) {
                                setSelectedStudios([]); // 꽉 차있으면 모두 해제
                            } else {
                                setSelectedStudios(allNames); // 아니면 모두 선택
                            }
                        }} className="text-xs text-gray-400 underline hover:text-blue-600">
                              모두 해제 / 선택
                       </button>
                    </div>
                    
                    {Object.entries(REGION_MAPPING).map(([region, studios]) => (
                        <div key={region} className="mb-3 border border-gray-200 rounded-xl overflow-hidden">
                            <div onClick={() => toggleAccordion(region)} className="bg-white p-4 flex justify-between items-center cursor-pointer hover:bg-gray-50 transition-colors">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-extrabold text-gray-800">{region}</span>
                                    <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-bold">{studios.filter(s => selectedStudios.includes(s)).length}/{studios.length}</span>
                                </div>
                                <span className={`text-gray-400 transition-transform duration-300 ${expandedRegions.includes(region) ? 'rotate-180' : ''}`}>▼</span>
                            </div>

                            {expandedRegions.includes(region) && (
                                <div className="p-3 bg-gray-50 border-t border-gray-100 animate-fade-in-down">
                                    <div className="flex justify-end mb-2">
                                        <button onClick={(e) => toggleRegion(region, e)} className="text-xs text-blue-600 font-bold hover:underline">{studios.every(s => selectedStudios.includes(s)) ? "전체 해제" : "이 구역 전체 선택"}</button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        {studios.map((studioName) => (
                                            <div key={studioName} onClick={() => toggleStudio(studioName)} className={`cursor-pointer p-3 rounded-lg border text-sm font-medium transition-all flex items-center gap-2 active:scale-95 ${selectedStudios.includes(studioName) ? 'bg-blue-500 border-blue-500 text-white shadow-sm' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-100'}`}>
                                                <div className={`w-3 h-3 rounded-full border flex items-center justify-center shrink-0 ${selectedStudios.includes(studioName) ? 'border-white bg-white' : 'border-gray-300'}`}>{selectedStudios.includes(studioName) && <span className="text-blue-500 text-[8px] font-bold">✓</span>}</div>
                                                <span className="truncate text-xs">{studioName}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            <div className="p-6 pt-4 border-t border-gray-100 bg-white rounded-b-3xl shrink-0">
                {searchError && <div className="mb-3 text-center bg-red-50 text-red-600 text-sm font-bold p-3 rounded-xl animate-pulse">{searchError}</div>}
                
                <button onClick={handleSearch} className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-xl text-lg shadow-lg hover:shadow-xl transition-all active:scale-95 flex justify-center items-center gap-2">
                    {/* 🌟 수정: 밋밋한 텍스트 대신 살아 숨쉬는 록스타 로딩 문구 이식! */}
                    {loading ? (
                        <><span>{loadingPhrases[loadingIndex]}</span><span className="animate-spin">⏳</span></>
                    ) : (
                        <><span>조건에 맞는 방 찾기</span><span>🚀</span></>
                    )}
                </button>
            </div>
          </div>
        </div>
      )}

      {/* 🌟 수정: ref={sheetRef} 추가 및 transition 완전 제거 */}
      {isSearched && rooms.length > 0 && !isSearchOpen && (
        <div 
          ref={sheetRef} 
          className="absolute bottom-0 left-0 w-full z-[1000] bg-white rounded-t-3xl shadow-[0_-5px_20px_rgba(0,0,0,0.1)] flex flex-col sm:max-h-[50vh] will-change-[height]"
          style={window.innerWidth > 640 ? {} : { height: `${sheetHeight}vh` }} 
        >
            {/* 🌟 수정: onTouchEnd={handleDragEnd} 추가 */}
            <div 
              className="w-full pt-4 pb-3 cursor-grab active:cursor-grabbing touch-none flex justify-center shrink-0 bg-transparent sm:hidden"
              onTouchMove={handleDrag}
              onTouchEnd={handleDragEnd}
            >
                <div className="w-12 h-1.5 bg-gray-300 rounded-full hover:bg-gray-400"></div>
            </div>
            
            {/* 결과 개수 헤더 */}
            <div className="px-5 pb-2 shrink-0 border-b border-gray-100">
                <h3 className="font-bold text-gray-800 text-lg">🎉 검색 결과 <span className="text-blue-600">{rooms.length}</span>개</h3>
            </div>

            {/* 방 목록 */}
            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3 custom-scrollbar">
                
                {/* 🛡️ 방폭문 UI: 실패한 합주실이 있을 때만 경고 배너 출력 */}
                {failedStudios.length > 0 && (
                    <div className="bg-orange-50 border border-orange-200 p-3 rounded-xl flex items-start gap-2 mb-3">
                        <span className="text-orange-500 mt-0.5">⚠️</span>
                        <p className="text-xs text-orange-700 leading-relaxed font-medium">
                            네이버 서버 지연으로 <br/>
                            <b>{failedStudios.join(", ")}</b>의 상태를 불러오지 못했습니다.
                        </p>
                    </div>
                )}
                {rooms.map((room, index) => (
                    <div key={index} className="flex justify-between items-center p-4 bg-gray-50 rounded-xl border border-gray-100 hover:border-blue-200 transition-colors">
                        
                        {/* 🌟 텍스트 영역이 왼쪽 공간만 차지하도록 방어 (flex-1 min-w-0 mr-3) */}
                        <div className="flex-1 min-w-0 mr-3">
                            <div className="flex items-center gap-2 mb-1">
                                {/* 🌟 truncate를 넣어서 이름이 길면 '...'으로 잘리게 만듦 */}
                                <h4 className="font-bold text-gray-900 truncate text-base">{room.합주실}</h4>
                                <button 
                                    onClick={() => copyToClipboard(`🎸 [잼투게더] ${date} ${room.합주실} 예약 가능!\n⏰ 시간: ${room.예약가능시간}\n🔗 예약하기: ${room.예약링크}`)}
                                    className="text-gray-400 hover:text-blue-600 text-xs border border-gray-200 px-1.5 py-0.5 rounded transition-colors shrink-0" 
                                    title="공유 텍스트 복사"
                                >
                                    📋
                                </button>
                            </div>
                            <p className="text-sm text-blue-600 font-bold">⏰ {room.예약가능시간}</p>
                        </div>
                        
                        {/* 🌟 예약 버튼 절대 안 찌그러지게 고정 (shrink-0) */}
                        <a href={room.예약링크} target="_blank" rel="noreferrer" className="bg-green-500 text-white px-4 py-2.5 rounded-lg font-bold text-sm shadow hover:bg-green-600 active:scale-95 transition-all shrink-0">예약</a>
                    </div>
                ))}
            </div>
        </div>
      )}
    </div>
  )
}

export default App