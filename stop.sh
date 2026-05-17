#!/bin/bash
# 停止主機監測系統

cd "$(dirname "$0")"

if [ -f logs/server.pid ]; then
  PID=$(cat logs/server.pid)
  if ps -p $PID > /dev/null 2>&1; then
    echo "正在停止主機監測系統 (PID: $PID)..."
    kill $PID
    sleep 1
    if ps -p $PID > /dev/null 2>&1; then
      echo "程序仍在執行，強制停止..."
      kill -9 $PID 2>/dev/null
    fi
    echo "✅ 已停止"
  else
    echo "程序 (PID: $PID) 已經不在執行"
  fi
  rm -f logs/server.pid
else
  echo "找不到 PID 檔案，嘗試用程序名稱停止..."
  pkill -f 'node server.js'
  echo "已嘗試停止"
fi