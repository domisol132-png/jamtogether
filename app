import streamlit as st
import pandas as pd
import time
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options

# ==========================================
# ⚙️ 유령 로봇 세팅 함수
# ==========================================
def run_crawler(target_date):
    chrome_options = Options()
    chrome_options.add_argument("--headless=new") 
    chrome_options.add_argument("--window-size=1920,1080") 
    
    service = Service(ChromeDriverManager().install())
    driver = webdriver.Chrome(service=service, options=chrome_options) 
    
    rooms_to_check = [
        {"name": "홍대 그라운드합주실 S룸", "url": "https://m.booking.naver.com/booking/10/bizes/1061592/items/5587861"},
        {"name": "홍대 그라운드합주실 A1룸", "url": "https://m.booking.naver.com/booking/10/bizes/1061592/items/5588402"},
        {"name": "홍대 그라운드합주실 A2룸", "url": "https://m.booking.naver.com/booking/10/bizes/1061592/items/5588476"}
    ]

    final_data = []

    for room in rooms_to_check:
        driver.get(room["url"])
        time.sleep(1) 
        
        try:
            date_xpath = f"//span[text()='{target_date}']"
            target_date_element = driver.find_element(By.XPATH, date_xpath)
            driver.execute_script("arguments[0].click();", target_date_element)
            time.sleep(1) 
            
            time_slots = driver.find_elements(By.CSS_SELECTOR, "ul.time_list > li.time_item")
            available_times = []
            
            for slot in time_slots:
                class_name = slot.get_attribute("class")
                if "disabled" not in class_name:
                    time_text = slot.text.strip().replace('\n', ' ')
                    if time_text:
                        available_times.append(time_text)
                        
            if available_times:
                time_string = ", ".join(available_times)
                final_data.append({"합주실 이름": room['name'], "상태": "✅ 예약 가능", "예약 가능 시간": time_string})
            else:
                final_data.append({"합주실 이름": room['name'], "상태": "❌ 마감", "예약 가능 시간": "-"})
                
        except Exception as e:
            final_data.append({"합주실 이름": room['name'], "상태": "⚠️ 에러 (구조 다름)", "예약 가능 시간": "-"})

    driver.quit()
    
    # 수집한 데이터를 판다스 데이터프레임으로 변환해서 반환
    return pd.DataFrame(final_data)


# ==========================================
# 🎨 웹사이트 화면(UI) 그리기
# ==========================================
st.set_page_config(page_title="합주실 스캐너", page_icon="🎸")

st.title("🎸 홍대 합주실 빈 시간 탐색기")
st.write("원하는 날짜를 입력하고 버튼을 누르면, 로봇이 네이버 예약을 뒤져옵니다!")

# 고객이 직접 날짜를 입력할 수 있는 칸 만들기! (기본값: 16)
user_date = st.text_input("📅 며칠 빈 시간을 찾을까요? (숫자만 입력, 예: 16)", value="16")

# 버튼을 눌렀을 때 실행될 동작
if st.button("🚀 빈 시간 싹쓸이 시작!"):
    # 🌟 로딩 스피너 애니메이션 (고객이 지루하지 않게!)
    with st.spinner(f'유령 로봇이 {user_date}일자 네이버 예약을 광속으로 뒤지는 중... 삐리빅... 🤖'):
        
        # 크롤러 함수 실행! (결과를 result_df에 저장)
        result_df = run_crawler(user_date)
        
    st.success("🎉 탐색 완료! 결과를 확인하세요.")
    
    # 엑셀 파일 대신, 웹 화면에 예쁜 표(Table)로 바로 띄워주기!
    st.dataframe(result_df, use_container_width=True)
    
    # 눈 내리는 축하 애니메이션 ㅋㅋㅋ
    st.balloons()
