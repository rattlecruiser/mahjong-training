@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo  聽牌訓練 - 區網分享伺服器
echo ============================================
echo.
echo [1/2] 正在建置最新版本...
call npm run build
if errorlevel 1 (
  echo 建置失敗，請截圖上方錯誤訊息。
  pause
  exit /b 1
)
echo.
echo [2/2] 啟動伺服器...
echo.
echo 請把下方「Network:」後面的網址（http://192.168.x.x:4173）
echo 傳給同一個 Wi-Fi / 區網的人，用手機或電腦瀏覽器開啟即可。
echo 關閉此視窗 = 停止分享。
echo.
call npx vite preview --host --port 4173
pause
