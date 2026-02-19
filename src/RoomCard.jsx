// src/RoomCard.jsx

export default function RoomCard({ room }) {
  // 🌟 1. 데이터 키값 매칭 수정 (중요!)
  // mapmap.py에서 보내주는 키 이름은 '합주실 이름'인데, React에서는 '합주실'로 쓰고 있었을 수 있음.
  // 안전하게 둘 다 체크하도록 OR 연산자 사용.
  const name = room['합주실 이름'] || room.합주실 || "이름 없음";
  const time = room['예약 가능 시간'] || room.예약가능시간 || "-";
  const link = room['예약링크'] || room.예약링크 || "#";
  const lat = room.lat;
  const lon = room.lon;

  // 🌟 2. 위치 데이터 추론 (Data Inference)
  // mapmap.py가 '권역' 텍스트는 안 보내주므로, 이름으로 추론해서 보여줌 (UX 향상)
  let inferredLocation = "서울 마포/서대문"; 
  if (name.includes("홍대")) inferredLocation = "홍대입구역 부근";
  else if (name.includes("합정")) inferredLocation = "합정역 부근";
  else if (name.includes("신촌")) inferredLocation = "신촌역 부근";
  else if (name.includes("망원")) inferredLocation = "망원역 부근";
  else if (name.includes("연남")) inferredLocation = "연남동";
  else if (name.includes("상수")) inferredLocation = "상수역 부근";

  // 🌟 3. 가격 데이터 (아직 없으므로 별도 문의 처리)
  const price = room.가격 || "가격 별도 문의"; 

  return (
    <div className="group relative bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
      
      {/* 우측 상단 가격 배지 */}
      <div className="absolute top-4 right-4 bg-gray-100 text-gray-500 px-3 py-1 rounded-full text-xs font-bold border border-gray-200">
        💰 {price}
      </div>

      <div className="flex flex-col gap-3">
        {/* 헤더: 추론된 위치 태그 + 합주실 이름 */}
        <div>
            <span className="inline-block bg-indigo-50 text-indigo-600 text-xs px-2 py-1 rounded-md font-semibold mb-2 border border-indigo-100">
                📍 {inferredLocation}
            </span>
            <div className="flex items-center gap-2">
                <span className="text-2xl group-hover:scale-110 transition-transform">🎸</span>
                <h3 className="text-xl font-bold text-gray-800 leading-tight">
                    {name}
                </h3>
            </div>
        </div>
        
        {/* 시간 정보 */}
        <div className="flex items-center gap-2 text-gray-600 bg-gray-50 p-3 rounded-lg border border-gray-100">
          <span className="text-lg">⏰</span>
          <p className="font-medium text-sm">
            예약 가능: <span className="font-bold text-blue-600 text-base ml-1">{time}</span>
          </p>
        </div>

        {/* 🌟 4. 액션 버튼 그룹 (지도 버튼 추가!) */}
        <div className="flex gap-2 mt-2">
            {/* 네이버 지도 버튼 (좌표가 있을 때만 뜸) */}
            {lat && lon && (
                <a 
                href={`https://map.naver.com/v5/?c=${lon},${lat},15,0,0,0,dh`} 
                target="_blank" 
                rel="noreferrer" 
                className="flex-1 py-3.5 flex items-center justify-center gap-2 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-all active:scale-95"
                >
                <span>🗺️ 지도 보기</span>
                </a>
            )}

            {/* 예약 버튼 */}
            <a 
            href={link} 
            target="_blank" 
            rel="noreferrer" 
            className="flex-[2] py-3.5 flex items-center justify-center gap-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold rounded-xl hover:from-green-600 hover:to-emerald-700 transition-all shadow-md active:scale-95"
            >
            <span>예약하러 가기</span>
            <span>🚀</span>
            </a>
        </div>
      </div>
    </div>
  )
}