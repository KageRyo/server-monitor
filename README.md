# 主機監測系統

一個輕量、乾淨、適合自架的伺服器 / NAS / 設備在線監測工具，類似 Uptime Kuma 的簡化版本。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 特色

- **零依賴**：只需要 Node.js 即可運行
- **即時監測**：每 30 秒自動 ping 檢查所有主機
- **視覺化**：狀態卡片 + 最近檢查心跳圖
- **自訂類別**：可自由新增「伺服器、NAS、印表機、邊緣裝置」等分類
- **備註功能**：每台主機可加入放置位置或維護備註
- **篩選功能**：可快速只看上線或離線的主機
- **資料本地化**：所有資料僅儲存在 `data/monitors.json`，隱私安全
- **適合開源**：預設不帶任何主機清單，方便直接 fork 使用

## 快速開始

### 1. 安裝

```bash
git clone https://github.com/KageRyo/server-monitor.git
cd server-monitor
npm install
```

### 2. 啟動

```bash
./start.sh
```

啟動後會顯示可存取的網址，例如：

```
   主機監測系統已啟動
   本機瀏覽：  http://localhost:3000
   區域網路：  http://你的IP:3000
```

第一次開啟網頁會看到引導畫面，點擊右上角「新增主機」即可開始使用。

## 加入監測目標

有兩種方式：

1. **推薦**：直接在網頁右上角點「新增主機」
2. **批次匯入**：複製 `monitors.example.json` 為 `data/monitors.json`，然後自行編輯

## 常用指令

```bash
# 啟動服務
./start.sh

# 停止服務
./stop.sh

# 查看即時日誌
tail -f logs/monitor.log
```

## 推薦長期執行方式

建議使用 [PM2](https://pm2.keymetrics.io/) 進行程序管理：

```bash
npm install -g pm2
pm2 start server.js --name "host-monitor"
pm2 save
pm2 startup
```

## 資料儲存說明

- 所有監測目標、備註、檢查歷史都儲存在：`data/monitors.json`
- 執行日誌位於：`logs/monitor.log`

**重要**：`data/` 與 `logs/` 資料夾已被 `.gitignore` 忽略，不會上傳到 GitHub，保護你的主機 IP 與備註資訊。

每台主機最多保留最近 60 筆檢查歷史（約 30 分鐘），超過會自動刪除最舊的紀錄，避免檔案無限成長。

## 環境變數（可選）

可建立 `.env` 檔案自訂設定：

```env
PORT=3000
CHECK_INTERVAL=30000
```

完整範例請參考 `.env.example`。

## 技術堆疊

- Node.js + Express
- 純前端（Tailwind CSS + Vanilla JS）
- 資料儲存：本地 JSON 檔案

## License

本專案採用 [MIT License](LICENSE)。
