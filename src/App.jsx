import { useState, useEffect } from 'react'
import { useRef } from 'react';
import { Map, CustomOverlayMap, useKakaoLoader } from "react-kakao-maps-sdk"
import { Analytics } from "@vercel/analytics/react"
import toast, { Toaster } from 'react-hot-toast';
// 🌟 [핵심] 외부 링크 대신, 내 컴퓨터(node_modules)에 있는 기본 이미지 가져오기
import { STUDIO_DB } from './data.js';

// ... (이 아래 REGION_MAPPING 부터는 그대로 둬도 된다) ...
const REGION_MAPPING = {
    "홍대입구역 근처": ["그라운드합주실 본점", "그라운드합주실 홍대1호점", "제시뮤직 합주실 홍대점", "하모닉스 합주실", "하모닉스 합주실 2호점", "사운드시티 합주실 홍대역점", "호랑이합주실"],
    "합정/망원 ": ["그라운드합주실 합정1호점", "사운드시티 합주실 합정 본점", "Chama Studio", "에비로드 합주실"],
    "신촌/이대 ": ["그라운드합주실 신촌1호점", "라디오가가 합주실 신촌점"]
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
  const [started, setStarted] = useState(false);
// ==========================================
  // 🚀 [추가 1] 통신 폭파 제어기 & 로딩 그림자 요원
  // ==========================================
  const abortControllerRef = useRef(null);
  const loadingRef = useRef(loading);
  
  // 로딩 상태가 바뀔 때마다 최신 상태를 몰래 기록해둠 (stale closure 방지)
  useEffect(() => { loadingRef.current = loading; }, [loading]);

  // 🔥 [핵심] 조건 변경 감지 트립와이어 (Tripwire)
  useEffect(() => {
    // 로딩 중(검색 중)인데, 날짜/시간/합주실 조건이 하나라도 바뀌었다면?
    if (loadingRef.current && abortControllerRef.current) {
        abortControllerRef.current.abort(); // 허공에 날아가던 서버 요청의 목을 벤다!
        setLoading(false); // 로딩 스피너 즉시 끄기
        setSearchError("조건이 변경되어 이전 검색이 중단되었습니다.");
    }
  }, [date, startTime, endTime, minHours, selectedStudios]); 
  // ==========================================
  const sheetRef = useRef(null);
  const [activeStudio, setActiveStudio] = useState(null)
  // 🌟 [신규] FAQ 모달 상태
  const [isFaqOpen, setIsFaqOpen] = useState(false)
  const [kakaoLoading, kakaoError] = useKakaoLoader({
    appkey: "d627f6cea680314e7ba4743e4d1bff78", 
  })
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
    "앰프 진공관 예열하는 중...",
    "스네어 드럼 튜닝 중...",
    "마이크 테스트! 아, 아!",
    "이펙터 페달 연결하는 중...",
    "슬랩으로 그루브 시동 거는 중...",
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
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    
    // 이 엔진의 종료(청소) 버튼은 맨 마지막에 있어야 합니다.
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    
  }, []); // 👈 첫 번째 방 닫힘


 // 🚀 [신규] 백엔드 없이 프론트엔드에서 즉각적으로 핀(Pin) 렌더링
  useEffect(() => {
    // 1. STUDIO_DB에서 합주실 브랜드별로 '첫 번째 방'의 좌표와 링크만 뽑아내서 지도용 마커 배열 생성
    const localStudios = Object.keys(STUDIO_DB).map(studioName => ({
        name: studioName,
        lat: STUDIO_DB[studioName][0].lat,
        lon: STUDIO_DB[studioName][0].lon,
        // 특정 룸 링크가 아닌, 합주실 메인 홈 링크로 가공
        url: STUDIO_DB[studioName][0].url.split('/items')[0] 
    }));
    setAllStudios(localStudios);

    // 2. 초기 세팅: 앱 켜지자마자 12개 전부 선택된 상태로 둔다 (15개 리미터 통과)
    const allNames = Object.values(REGION_MAPPING).flat(); 
    setSelectedStudios(allNames);
  }, []);

  // 🌟 카카오톡 공유 SDK 초기화 (앱 켜질 때 1번만)
  useEffect(() => {
    // 대문자 Kakao를 쓴다 (지도는 소문자 kakao)
    if (window.Kakao && !window.Kakao.isInitialized()) {
      window.Kakao.init("d627f6cea680314e7ba4743e4d1bff78"); // 네 카카오 자바스크립트 키
    }
  }, []);
  
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

 // 🚀 [신규] 스마트폰을 티켓 인쇄소로 만드는 다이내믹 공유 엔진 (가로형 규격)
  const shareKakao = async (room) => {
    if (!window.Kakao) {
      toast.error("카카오톡 공유 엔진을 불러오지 못했습니다.");
      return;
    }

    // 1. 유저가 기다리지 않게 즉각적인 피드백 (토스트 알림)
    const toastId = toast.loading("준비 중입니다...");

    try {
      // 2. 가상의 도화지(Canvas) 생성
        const canvas = document.createElement("canvas");
        canvas.width = 800;  
        canvas.height = 500; // 👈 500으로 확정!
        const ctx = canvas.getContext("2d");

        const img = new Image();
        img.src = "/ticket.jpg"; // 네 파일명 맞는지 확인!

        // 🚨 [수정 1] async 추가: 폰트가 다운로드될 때까지 기다리는 마법
        img.onload = async () => {
          
          // 브라우저야, 폰트 다 불러올 때까지 여기서 멈추고 대기해!
          await document.fonts.ready; 

          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          // ==========================================
          // 🎨 4. 티켓 위에 텍스트 인쇄하기
          // ==========================================
          ctx.fillStyle = "#111111"; 
          ctx.textAlign = "left"; 
          ctx.textBaseline = "middle"; 
          
          // 📍 합주실 이름 (Pretendard 폰트 강제 적용)
          ctx.font = "900 42px 'Inter', 'Pretendard', sans-serif"; 
          ctx.letterSpacing = "-1px"; 
          
          // place : 라벨 우측 (X: 140, Y: 270 부근 - 800x500 비율에 맞춤)
          ctx.fillText(room.합주실, 140, 270, 600); 

          // 📍 날짜 & 시간
          ctx.font = "600 28px 'Inter', 'Pretendard', sans-serif"; 
          ctx.letterSpacing = "0px";

          // 날짜 가공: "03/18" 포맷팅
          const dateParts = date.split('-');
          const cleanDate = `${dateParts[1]}/${dateParts[2]}`;

          // 시간 가공 및 배열화
          const rawTime = room.예약가능시간;
          const cleanTimeSlots = rawTime
            .replace(/시/g, ':00')
            .replace(/~/g, ' - ')
            .split(',')
            .map(t => t.trim()); 

          // date : 라벨 우측 줄바꿈 렌더링 (X: 140, Y: 400 부근)
          let startY = 400; 
          const lineHeight = 36; 

          cleanTimeSlots.forEach((slot, idx) => {
            if (idx === 0) {
              ctx.fillText(`${cleanDate}, ${slot}`, 140, startY);
            } else {
              const offsetWidth = ctx.measureText(`${cleanDate}, `).width;
              ctx.fillText(`${slot}`, 140 + offsetWidth, startY + (idx * lineHeight));
            }
          });
          // ==========================================
          
          // 5. Blob 변환
          canvas.toBlob(async (blob) => {
            if (!blob) return;
            const file = new File([blob], "jam_ticket.jpg", { type: "image/jpeg" });

            try {
              const response = await window.Kakao.Share.uploadImage({ file: [file] });
              const uploadedImageUrl = response.infos.original.url;

              // 6. 진짜 카톡 메시지 발사!
              window.Kakao.Share.sendDefault({
                objectType: 'feed',
                content: {
                  title: `🎸 ${room.합주실} `,
                  description: `⏰ 시간: ${room.예약가능시간}\n📅 날짜: ${date}\n⚡ 지금 예약하기.`,
                  imageUrl: uploadedImageUrl, 
                  imageWidth: 800,  // 🚨 [수정 2] 카카오한테 가로 800이라고 통보
                  imageHeight: 500, // 🚨 [수정 3] 세로 500이라고 통보 (이래야 안 잘림!)
                  link: {
                    mobileWebUrl: room.예약링크,
                    webUrl: room.예약링크,
                  },
                },
                buttons: [
                  {
                    title: '예약 바로가기',
                    link: {
                      mobileWebUrl: room.예약링크,
                      webUrl: room.예약링크,
                    },
                  },
                ],
              });
              // 🚨 [여기에 추가!] 성공 시 로딩 팝업을 '성공'으로 바꾸고 닫아버림
              toast.success("준비 완료!", { id: toastId });
            } catch (uploadError) {
              console.error(uploadError);
              // 에러 났을 때도 팝업을 에러로 바꿔줌
              toast.error("카카오 업로드 실패!", { id: toastId });
            }
          }, "image/jpeg", 0.9);
        };

      img.onerror = () => {
        toast.error("티켓 템플릿을 불러오지 못했습니다.", { id: toastId });
      };

    } catch (error) {
      console.error(error);
      toast.error("티켓 생성 중 오류가 발생했습니다.", { id: toastId });
    }
  };
  const handleSearch = async () => {
    if (selectedStudios.length === 0) {
        setSearchError("⚠️ 최소 1개 이상의 합주실을 선택해주세요!")
        return
    }
    setSearchError("")
    setLoading(true)

    // 🚀 [추가 2] 새로운 통신을 시작할 때마다 새로운 제어기(리모컨)를 생성
    abortControllerRef.current = new AbortController();
    
    try {
      const targetRooms = [];
      selectedStudios.forEach(studioName => {
          if (STUDIO_DB[studioName]) {
              targetRooms.push(...STUDIO_DB[studioName]);
          }
      });

      const response = await fetch('https://jam-backend-yk57.onrender.com/search', {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
          },
          // 🚀 [추가 3] fetch에 제어기 연결 (이제 언제든 폭파 가능)
          signal: abortControllerRef.current.signal, 
          body: JSON.stringify({
              date: date,
              start_time: startTime,
              end_time: endTime,
              min_hours: minHours,
              rooms: targetRooms 
          })
      });
      
      if (!response.ok) throw new Error("서버 에러");
      const data = await response.json();
      
      const validRooms = data.results.filter(room => room.예약가능시간 !== "확인 불가");
      const errorRooms = data.results.filter(room => room.예약가능시간 === "확인 불가");
      
      const errorNames = [...new Set(errorRooms.map(r => r.합주실.split(" ")[0]))];
      setFailedStudios(errorNames);

      if (validRooms.length === 0 && errorRooms.length === 0) {
        setSearchError("😭 조건에 맞는 방이 없어요! 시간이나 날짜를 변경해보세요.")
        setLoading(false)
        return
      }

      if (validRooms.length === 0 && errorRooms.length > 0) {
         setSearchError(`⚠️ 네이버 예약 서버 지연으로 ${errorNames.join(", ")}의 상태를 확인할 수 없습니다. 잠시 후 다시 시도해주세요.`);
         setLoading(false)
         return
      }

      setRooms(validRooms)
      setIsSearched(true)
      setIsSearchOpen(false) 
      setSheetHeight(35) 

      if (validRooms.length > 0 && validRooms[0].lat) {
        setMapCenter([validRooms[0].lat, validRooms[0].lon])
      }
    } catch (error) {
      // 🚀 [추가 4] 유저가 조건을 바꿔서 강제로 폭파(Abort)된 경우의 예외 처리
      if (error.name === 'AbortError') {
          console.log("조건 변경으로 인해 검색이 중단되었습니다.");
          // 여기서 return 해버려서 밑에 있는 setLoading(false)나 "서버 통신 실패" 에러가 뜨는 걸 막음
          return; 
      }
      console.error(error);
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
      {/* 🚨 1. 지도를 완벽하게 덮고 있는 블랙 인트로 화면 */}
      {/* started가 true가 되면 투명해지면서(opacity-0) 부드럽게 사라짐! */}
      <div className={`absolute inset-0 z-[6000] transition-opacity duration-700 ease-in-out ${started ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
          <IntroScreen 
              onStart={() => setStarted(true)} 
              isReady={!kakaoLoading && !kakaoError} // 지도 로딩 끝났는지 찔러줌
          />
      </div>

      {/* 🚨 2. 유저 몰래 백그라운드에서 깔리고 있는 메인 지도 */}
      {/* 인트로 화면에 가려져 안 보이지만, 이미 통신을 끝내고 렌더링 중임 */}
      {!kakaoLoading && !kakaoError && (
        <Map 
          center={{ lat: mapCenter[0], lng: mapCenter[1] }} 
          isPanto={true} 
          style={{ width: "100vw", height: "100dvh", position: "absolute", top: 0, left: 0, zIndex: 0 }}
          level={4}
          onClick={() => setActiveStudio(null)} 
        >
          {!isSearched ? (
              // 🌑 검색 전: 세련된 슬레이트 네이비 마커 (1px 반투명 테두리 + 섬세한 그림자)
              allStudios.map((studio, index) => (
                <div key={`all-${index}`}>
                  <CustomOverlayMap position={{ lat: studio.lat, lng: studio.lon }} yAnchor={1}>
                      <div 
                        onClick={(e) => { e.stopPropagation(); setActiveStudio(studio.name); }}
                        className="relative flex items-center justify-center w-7 h-7 bg-[#2c2f33] rounded-[50%_50%_50%_0] -rotate-45 shadow-[0_3px_8px_rgba(0,0,0,0.25)] border border-white/70 cursor-pointer hover:scale-110 transition-transform"
                      >
                          <span className="text-white text-[11px] rotate-45">🎵</span>
                      </div>
                  </CustomOverlayMap>

                  {/* 💬 마커 클릭 팝업 */}
                  {activeStudio === studio.name && (
                    <CustomOverlayMap position={{ lat: studio.lat, lng: studio.lon }} yAnchor={1.6} zIndex={10} clickable={true}>
                        <div className="bg-white/95 backdrop-blur-sm p-3 rounded-2xl shadow-[0_8px_20px_rgba(0,0,0,0.15)] border border-gray-100 flex flex-col items-center min-w-[120px] animate-fade-in-up">
                            <span className="font-extrabold text-gray-800 text-sm mb-2">{studio.name}</span>
                            <button onClick={() => window.open(studio.url, '_blank')} className="bg-[#2c2f33] text-white text-xs font-bold px-4 py-2 rounded-xl w-full hover:bg-black transition-colors">
                                정보 보기
                            </button>
                        </div>
                    </CustomOverlayMap>
                  )}
                </div>
              ))
          ) : (
              // 🔴 검색 후: 시그니처 애플 레드 & 오렌지 (날렵한 테두리 적용)
              rooms.map((room, index) => {
                  const isError = room.예약가능시간.includes('확인');
                  return room.lat && room.lon ? (
                    <div key={`room-${index}`}>
                      <CustomOverlayMap position={{ lat: room.lat, lng: room.lon }} yAnchor={1}>
                          <div 
                            onClick={(e) => { e.stopPropagation(); setActiveStudio(room.합주실); }}
                            className={`relative flex items-center justify-center w-8 h-8 rounded-[50%_50%_50%_0] -rotate-45 border border-white/90 shadow-[0_4px_12px_rgba(0,0,0,0.3)] cursor-pointer animate-bounce-short ${isError ? 'bg-[#FF9500]' : 'bg-[#FF3B30]'}`}
                          >
                              <span className="text-white text-[12px] rotate-45">{isError ? '⚠️' : '🎵'}</span>
                          </div>
                      </CustomOverlayMap>

                      {/* 💬 마커 클릭 상세 예약 팝업 (초록색 버튼도 프리미엄 그린으로 변경) */}
                      {activeStudio === room.합주실 && (
                        <CustomOverlayMap position={{ lat: room.lat, lng: room.lon }} yAnchor={1.4} zIndex={10} clickable={true}>
                            <div className="bg-white/95 backdrop-blur-sm p-3.5 rounded-2xl shadow-[0_10px_25px_rgba(0,0,0,0.15)] border border-gray-100 flex flex-col items-center min-w-[160px] animate-fade-in-up">
                                <span className="font-extrabold text-gray-900 text-[15px] mb-1 truncate w-full text-center">{room.합주실}</span>
                                <span className="text-xs text-[#007AFF] font-extrabold mb-3">⏰ {room.예약가능시간}</span>
                                <button 
                                  onClick={() => window.open(room.예약링크, '_blank')} 
                                  className={`${isError ? 'bg-[#FF9500] hover:bg-[#E58600]' : 'bg-[#34C759] hover:bg-[#2EB350]'} text-white text-sm font-bold px-4 py-2.5 rounded-xl w-full hover:scale-105 active:scale-95 transition-all shadow-sm`}
                                >
                                    예약하기
                                </button>
                            </div>
                        </CustomOverlayMap>
                      )}
                    </div>
                  ) : null;
              })
          )}
        </Map>
      )}
      {/* 🚨 3. 유저가 '시작하기'를 누른 이후에만 전체 UI 등장 */}
      {started && (
        <>
          {/* FAQ 버튼 */}
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

          {/* FAQ 팝업 (모달) */}
          {isFaqOpen && (
            <div className="absolute inset-0 z-[4000] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
                 <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl relative">
                    <button onClick={() => setIsFaqOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-800 text-xl font-bold">✕</button>
                    
                    <h2 className="text-2xl font-extrabold text-gray-900 mb-6">🎸 자주 묻는 질문</h2>
                    
                    <div className="space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
                        <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                            <h3 className="font-bold text-blue-600 mb-1">📱 1초 만에 합주실 예약하기 (앱 설치)</h3>
                            <p className="text-xs text-gray-600 mb-3">매번 검색할 필요 없이 바탕화면에 앱을 깔아두세요!</p>
                            <button 
                                onClick={() => {
                                    if (deferredPrompt) {
                                        deferredPrompt.prompt();
                                        deferredPrompt.userChoice.then(() => setDeferredPrompt(null));
                                    } else {
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
                            <p className="text-sm text-gray-600 leading-relaxed">서울 내 합주실 예약 현황을 스캔하여 원하는 시간에 맞는 빈 방을 찾아주는 서비스입니다.</p>
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

          {/* 검색 팝업 (모달) */}
          {isSearchOpen && (
            <div className="absolute inset-0 z-[2000] bg-black/60 flex items-end sm:items-center justify-center sm:p-4 backdrop-blur-sm transition-opacity">
              <div className="bg-white w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl shadow-2xl h-[90vh] sm:h-auto max-h-[90vh] flex flex-col">
                <div className="p-6 pb-2 flex justify-between items-center border-b border-gray-100 shrink-0">
                  <h2 className="text-2xl font-extrabold text-gray-900"> 합주실 찾기 </h2>
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
                                const allNames = Object.values(REGION_MAPPING).flat();
                                if (selectedStudios.length === allNames.length) {
                                    setSelectedStudios([]); 
                                } else {
                                    setSelectedStudios(allNames); 
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
                        {loading ? (
                            <><span>{loadingPhrases[loadingIndex]}</span><span className="animate-spin">⏳</span></>
                        ) : (
                            <><span>조건에 맞는 방 찾기</span><span></span></>
                        )}
                    </button>
                </div>
              </div>
            </div>
          )}

          {/* 검색 결과 바텀 시트 */}
          {isSearched && rooms.length > 0 && !isSearchOpen && (
            <div 
              ref={sheetRef} 
              className="absolute bottom-0 left-0 w-full z-[1000] bg-white rounded-t-3xl shadow-[0_-5px_20px_rgba(0,0,0,0.1)] flex flex-col sm:max-h-[50vh] will-change-[height]"
              style={window.innerWidth > 640 ? {} : { height: `${sheetHeight}vh` }} 
            >
                <div 
                  className="w-full pt-4 pb-3 cursor-grab active:cursor-grabbing touch-none flex justify-center shrink-0 bg-transparent sm:hidden"
                  onTouchMove={handleDrag}
                  onTouchEnd={handleDragEnd}
                >
                    <div className="w-12 h-1.5 bg-gray-300 rounded-full hover:bg-gray-400"></div>
                </div>
                
                <div className="px-5 pb-2 shrink-0 border-b border-gray-100">
                    <h3 className="font-bold text-gray-800 text-lg">🎉 검색 결과 <span className="text-blue-600">{rooms.length}</span>개</h3>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3 custom-scrollbar">
                    {failedStudios.length > 0 && (
                        <div className="bg-orange-50 border border-orange-200 p-3 rounded-xl flex items-start gap-2 mb-3">
                            <span className="text-orange-500 mt-0.5">⚠️</span>
                            <p className="text-xs text-orange-700 leading-relaxed font-medium">
                                네이버 서버 지연으로 <br/>
                                <b>{failedStudios.join(", ")}</b>의 상태를 불러오지 못했습니다.
                            </p>
                        </div>
                    )}
                    {rooms.map((room, index) => {
                        // 1. 타임 칩을 위한 데이터 가공 (16시~18시 -> 16:00 - 18:00)
                        const timeSlots = room.예약가능시간 !== "확인 불가" 
                            ? room.예약가능시간.split(',').map(t => t.trim().replace(/시/g, ':00').replace(/~/g, ' - '))
                            : ["확인 불가"];

                        return (
                            <div 
                                key={index} 
                                onClick={() => {
                                    setMapCenter([room.lat, room.lon]); 
                                    setActiveStudio(room.합주실);       
                                    if (window.innerWidth <= 640) setSheetHeight(35); 
                                }}
                                className="flex justify-between items-center p-4 bg-gray-50 rounded-xl border border-gray-100 hover:border-black hover:shadow-md cursor-pointer transition-all gap-4"
                            >
                                {/* 🍎 좌측: 정보 구역 (방 이름 + 타임 칩) */}
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-extrabold text-gray-900 truncate text-base mb-2">{room.합주실}</h4>
                                    
                                    {/* 🚀 타임 칩(Time Chip) 렌더링 */}
                                    <div className="flex flex-wrap gap-1.5">
                                        {timeSlots.map((slot, i) => (
                                            <span 
                                                key={i} 
                                                className={`text-xs font-bold px-2.5 py-1 rounded-md shadow-sm border ${
                                                    slot === "확인 불가" 
                                                    ? "bg-red-50 text-red-600 border-red-100" 
                                                    : "bg-white text-gray-800 border-gray-200"
                                                }`}
                                            >
                                                {slot}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                                
                                {/* 🍎 우측: 통제 구역 (공유 + 예약 버튼 클러스터) */}
                                <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2 shrink-0">
                                    <button 
                                        onClick={(e) => {
                                            e.stopPropagation(); 
                                            shareKakao(room);
                                        }}
                                        className="flex items-center justify-center gap-1 bg-[#FEE500] text-[#3E2723] hover:bg-[#FDD835] text-[11px] font-extrabold w-[68px] h-[34px] rounded-lg transition-colors shadow-sm" 
                                        title="카톡으로 공유하기"
                                    >
                                        <svg viewBox="0 0 32 32" className="w-3.5 h-3.5 fill-current"><path d="M16 4.64c-6.96 0-12.64 4.48-12.64 10.08 0 3.52 2.32 6.64 5.76 8.48l-1.44 5.44c-0.08 0.4 0.32 0.64 0.64 0.48l6.16-4.08c0.48 0.08 0.96 0.08 1.52 0.08 6.96 0 12.64-4.48 12.64-10.08 0-5.6-5.68-10.08-12.64-10.08z"/></svg>
                                        공유
                                    </button>
                                    
                                    <a 
                                        href={room.예약링크} 
                                        target="_blank" 
                                        rel="noreferrer" 
                                        onClick={(e) => e.stopPropagation()} 
                                        className="bg-black text-white hover:bg-gray-800 text-sm font-bold flex items-center justify-center w-[68px] h-[34px] rounded-lg shadow-sm transition-all"
                                    >
                                        예약
                                    </a>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
// ==========================================
// 🚨 인트로 화면 컴포넌트 (App 컴포넌트 밖에, export 바로 위에 위치)
// ==========================================
const IntroScreen = ({ onStart, isReady }) => {
    const [animateStage, setAnimateStage] = useState(0);

    // 컴포넌트 마운트 시 애니메이션 시퀀스 시작
    useEffect(() => {
        const timer1 = setTimeout(() => setAnimateStage(1), 300);  // 0.3초 후 로고 & 카피 등장
        const timer2 = setTimeout(() => setAnimateStage(2), 1300); // 1.3초 후 버튼 등장
        return () => { clearTimeout(timer1); clearTimeout(timer2); };
    }, []);

    return (
        // 🍎 전체 여백 최적화: 모바일 가로 여백은 px-6으로 줄여서 공간 확보, sm 이상에서만 px-10 적용
        <div className="w-full h-full bg-white flex flex-col items-center justify-center px-6 sm:px-10 py-10 font-['Pretendard']">
            
            {/* 🍎 텍스트 영역: 좌측 정렬 유지 (items-start, text-left) */}
            <div className={`flex flex-col items-start w-full max-w-xs mb-16 sm:mb-20 transition-all duration-1000 ${animateStage >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
                
                {/* 🚀 반응형 로고 크기: 모바일에서는 text-5xl로 줄여서 잘림 방지, sm 이상에서만 text-7xl로 렌더링! */}
                <h1 className="font-['Inter'] font-black text-5xl sm:text-7xl text-black tracking-tighter mb-6 sm:mb-8 leading-none">
                    JAM<br />TOGETHER!
                </h1>
                
                {/* 🚀 반응형 한글 서브 카피: 모바일 text-2xl -> sm text-3xl */}
                <p className="font-extrabold text-2xl sm:text-3xl text-gray-900 leading-snug tracking-tight">
                    1초만에<br />
                    합주실 예약하기
                </p>
            </div>

            {/* 🍎 버튼 세션 */}
            <div className={`transition-all duration-1000 ${animateStage >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
                <button 
                    onClick={onStart} 
                    disabled={!isReady}
                    // 버튼 크기도 살짝 반응형으로 조절
                    className={`bg-black text-white font-bold text-lg sm:text-xl px-10 sm:px-12 py-3.5 sm:py-4 rounded-[40px] shadow-2xl transition-all flex items-center justify-center gap-3 w-56 sm:w-64
                    ${isReady ? 'hover:bg-gray-800 active:scale-95' : 'opacity-80 cursor-wait'}`}
                >
                    {!isReady ? (
                        <>
                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            <span className="text-base">지도 연결 중</span>
                        </>
                    ) : (
                        <span>시작하기</span>
                    )}
                </button>
            </div>
        </div>
    );
};

export default App;