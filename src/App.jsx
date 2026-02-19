import { useState, useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import { Analytics } from "@vercel/analytics/react"
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import toast, { Toaster } from 'react-hot-toast';
// 🌟 [핵심] 외부 링크 대신, 내 컴퓨터(node_modules)에 있는 기본 이미지 가져오기
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

// ---------------------------------------------------------
// 📍 [Ultimate Fix] 로컬 이미지 + CSS 필터 (절대 안 깨짐)
// ---------------------------------------------------------

// 🔴 검색 결과용 (CSS로 빨갛게 만든 핀)
const RedIcon = L.icon({
  iconUrl: icon,          // 로컬 기본 이미지
  shadowUrl: iconShadow,  // 로컬 그림자
  iconSize: [25, 41],     // 표준 크기
  iconAnchor: [12, 41],   // 뾰족한 끝 위치
  popupAnchor: [1, -34],
  className: 'red-filter' // 🌟 CSS 마법 적용! (파랑 -> 빨강)
});

// 🌑 구경 모드용 (CSS로 회색으로 만든 핀)
const GrayIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  className: 'gray-filter' // 🌟 CSS 마법 적용! (파랑 -> 회색)
});

// 기본 아이콘 덮어쓰기
L.Marker.prototype.options.icon = RedIcon;

// 지도 이동 도우미
function ChangeView({ center, zoom }) {
  const map = useMap();
  map.setView(center, zoom);
  return null;
}

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
  const [allStudios, setAllStudios] = useState([]) 
  const [rooms, setRooms] = useState([])           
  const [isSearched, setIsSearched] = useState(false)
  const [selectedStudios, setSelectedStudios] = useState([])
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [loading, setLoading] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(true) 
  
  // 🌟 [신규] FAQ 모달 상태
  const [isFaqOpen, setIsFaqOpen] = useState(false)
  
  // 🌟 한국 시간(KST) 기준으로 오늘 날짜를 YYYY-MM-DD 형식으로 가져오는 마법의 함수
  const getTodayKST = () => {
    const offset = new Date().getTimezoneOffset() * 60000;
    return new Date(Date.now() - offset).toISOString().split('T')[0];
  };

  // ❌ 기존: const [date, setDate] = useState('2026-02-22')
  // ✅ 수정: 이제 접속할 때마다 '오늘 날짜'가 기본으로 뜹니다.
  const [date, setDate] = useState(getTodayKST());
  const [startTime, setStartTime] = useState(16)
  const [endTime, setEndTime] = useState(22)
  const [minHours, setMinHours] = useState(2)
  const [mapCenter, setMapCenter] = useState([37.556, 126.924])
  const [expandedRegions, setExpandedRegions] = useState(["홍대입구역 근처"])
  const [searchError, setSearchError] = useState("")
  const [sheetHeight, setSheetHeight] = useState(35);


  // 🌟 [추가] 록스타 로딩 문구 리스트 & 현재 인덱스
  const loadingPhrases = [
    "탐색 중...",
    "🎸 앰프 진공관 예열하는 중...",
    "🥁 스네어 드럼 튜닝 중...",
    "🎤 마이크 테스트! 아, 아!",
    "🔌 이펙터 페달 연결하는 중...",
    "😎 묵묵히 베이스를 메고 합주실의 무게 중심을 잡는 중...",
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
      setSheetHeight(newHeight);
    }
  };
  // 🌟 1번 엔진: PWA 설치 팝업 가로채기
  useEffect(() => {
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
      
      if (data.results.length === 0) {
        setSearchError("😭 조건에 맞는 방이 없어요! 시간이나 날짜를 변경해보세요.")
        setLoading(false)
        return
      }

      setRooms(data.results)
      setIsSearched(true)
      setIsSearchOpen(false) 
      setSheetHeight(35) // 🌟 [추가] 새 검색 시 바텀 시트 높이를 다시 기본 35vh로 리셋

      if (data.results.length > 0 && data.results[0].lat) {
        setMapCenter([data.results[0].lat, data.results[0].lon])
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
    <div className="relative w-full h-screen overflow-hidden font-sans bg-gray-100">
      {/* 🌟 [필수] 토스트 기계 설치 (return 문 안쪽, 맨 위에 두면 됨) */}
      <Toaster />
      <Analytics /> {/* 🚀 이 한 줄이 방문자 데이터를 수집한다! */}
      <MapContainer center={mapCenter} zoom={15} style={{ height: "100%", width: "100%", zIndex: 0 }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap' />
        <ChangeView center={mapCenter} zoom={15} />

        {!isSearched ? (
            allStudios.map((studio, index) => (
                <Marker key={index} position={[studio.lat, studio.lon]} icon={GrayIcon}>
                    <Popup>
                        <div className="text-center p-1 min-w-[150px]">
                            <h3 className="font-extrabold text-gray-800 text-lg mb-2">{studio.name}</h3>
                            <a href={studio.url} target="_blank" className="block w-full bg-gray-800 text-white px-3 py-2.5 rounded-lg text-sm font-bold hover:bg-black transition-colors shadow-md">
                                🔗 예약 페이지 이동
                            </a>
                        </div>
                    </Popup>
                </Marker>
            ))
        ) : (
            rooms.map((room, index) => (
                room.lat && room.lon ? (
                  <Marker key={index} position={[room.lat, room.lon]} icon={RedIcon}>
                    <Popup>
                      <div className="text-center p-1 min-w-[150px]">
                        <span className="inline-block bg-blue-100 text-blue-600 text-xs px-2 py-0.5 rounded mb-1 font-bold">예약 가능!</span>
                        <h3 className="font-bold text-lg text-gray-900 mb-1">{room.합주실}</h3>
                        <p className="font-bold text-blue-600 mb-3 text-base">{room.예약가능시간}</p>
                        <a href={room.예약링크} target="_blank" className="block w-full bg-green-500 text-white px-3 py-2.5 rounded-lg text-sm font-bold hover:bg-green-600 transition-colors shadow-md">🚀 예약하러 가기</a>
                      </div>
                    </Popup>
                  </Marker>
                ) : null
            ))
        )}
      </MapContainer>

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

      {/* 🌟 수정: PC(화면 넓음)일 때는 높이 자동, 모바일일 때만 드래그 높이 적용 */}
      {isSearched && rooms.length > 0 && !isSearchOpen && (
        <div 
          className="absolute bottom-0 left-0 w-full z-[1000] bg-white rounded-t-3xl shadow-[0_-5px_20px_rgba(0,0,0,0.1)] flex flex-col sm:max-h-[50vh]"
          style={window.innerWidth > 640 ? {} : { height: `${sheetHeight}vh`, transition: 'height 0.05s ease-out' }} 
        >
            {/* 🚀 드래그 핸들: PC에서는 아예 숨기고(sm:hidden), 마우스 이벤트(onMouseMove)는 삭제! */}
            <div 
              className="w-full pt-4 pb-3 cursor-grab active:cursor-grabbing touch-none flex justify-center shrink-0 bg-transparent sm:hidden"
              onTouchMove={handleDrag}
              // ❌ onMouseMove={handleDrag} <-- 이 줄을 아예 지워버려라!
            >
                <div className="w-12 h-1.5 bg-gray-300 rounded-full hover:bg-gray-400 transition-colors"></div>
            </div>
            
            {/* 결과 개수 헤더 */}
            <div className="px-5 pb-2 shrink-0 border-b border-gray-100">
                <h3 className="font-bold text-gray-800 text-lg">🎉 검색 결과 <span className="text-blue-600">{rooms.length}</span>개</h3>
            </div>

            {/* 방 목록 */}
            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3 custom-scrollbar">
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