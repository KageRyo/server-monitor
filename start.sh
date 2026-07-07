#!/bin/bash
# 啟動主機監測系統（背景執行）

cd "$(dirname "$0")"

mkdir -p logs data

PORT_VALUE="${PORT:-}"
if [ -z "$PORT_VALUE" ] && [ -f .env ]; then
  PORT_VALUE=$(grep -E '^PORT=' .env | tail -n 1 | cut -d '=' -f 2- | tr -d "\"'")
fi
PORT_VALUE="${PORT_VALUE:-3000}"

# 如果已經在執行，先停止
if [ -f logs/server.pid ]; then
  OLD_PID=$(cat logs/server.pid)
  if ps -p $OLD_PID > /dev/null 2>&1; then
    echo "偵測到舊程序 (PID: $OLD_PID)，正在停止..."
    kill $OLD_PID 2>/dev/null
    sleep 1
  fi
fi

# 啟動
# server.js 會自行寫入並輪替 logs/monitor.log；這裡只覆寫保存啟動期錯誤。
# setsid 讓背景程序脫離目前 shell，避免從 SSH/Codex 啟動後被呼叫端帶著結束。
setsid node server.js > logs/startup.log 2>&1 < /dev/null &
NEW_PID=$!
echo $NEW_PID > logs/server.pid

sleep 2

if ps -p $NEW_PID > /dev/null 2>&1; then
  echo "✅ 主機監測系統已啟動 (PID: $NEW_PID)"
  echo "   請用瀏覽器開啟："
  echo "   http://localhost:${PORT_VALUE}"
  echo "   區域網路網址請查看 logs/monitor.log"
  echo ""
  echo "   日誌位置：logs/monitor.log"
else
  echo "❌ 啟動失敗，請查看 logs/startup.log 或 logs/monitor.log"
fi
