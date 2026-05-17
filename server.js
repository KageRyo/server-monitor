const express = require('express');
const ping = require('ping');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const DATA_FILE = path.join(__dirname, 'data', 'monitors.json');
const CHECK_INTERVAL = parseInt(process.env.CHECK_INTERVAL || '30000', 10); // 預設 30 秒

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// In-memory state
let monitors = [];
let lastGlobalCheck = null;
let isChecking = false;

function generateId(ip) {
  return ip.replace(/\./g, '-');
}

function loadFromFile() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      const data = JSON.parse(raw);
      if (Array.isArray(data.monitors)) {
        monitors = data.monitors.map(m => ({
          id: m.id || generateId(m.ip),
          ip: m.ip,
          name: m.name || m.ip,
          group: m.group || 'server',
          status: m.status || 'unknown',
          responseTime: m.responseTime || null,
          lastCheck: m.lastCheck || null,
          history: Array.isArray(m.history) ? m.history.slice(-60) : [],
          totalChecks: m.totalChecks || 0,
          upChecks: m.upChecks || 0,
          notes: m.notes || ''
        }));
        lastGlobalCheck = data.lastGlobalCheck || null;
        console.log(`Loaded ${monitors.length} monitors from ${DATA_FILE}`);
        return;
      }
    }
  } catch (e) {
    console.error('Failed to load data file:', e.message);
  }

  // No seed data — start completely empty for open-source safety
  monitors = [];
  lastGlobalCheck = null;
  console.log('No monitor data found. Starting with an empty list.');
}

function saveToFile() {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const payload = {
      monitors,
      lastGlobalCheck,
      savedAt: new Date().toISOString()
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(payload, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to save data:', e.message);
  }
}

async function probe(ip) {
  try {
    const res = await ping.promise.probe(ip, {
      timeout: 4,
      extra: ['-c', '1', '-W', '3']
    });
    const alive = !!res.alive;
    let rtt = null;
    if (alive) {
      const t = res.time;
      if (typeof t === 'number') rtt = Math.round(t);
      else if (typeof t === 'string' && t !== 'unknown') rtt = Math.round(parseFloat(t));
    }
    return { alive, rtt };
  } catch (err) {
    return { alive: false, rtt: null };
  }
}

function updateMonitor(monitor, result) {
  const now = new Date();
  const wasUp = monitor.status === 'up';

  monitor.status = result.alive ? 'up' : 'down';
  monitor.responseTime = result.rtt;
  monitor.lastCheck = now.toISOString();

  monitor.totalChecks = (monitor.totalChecks || 0) + 1;
  if (result.alive) monitor.upChecks = (monitor.upChecks || 0) + 1;

  monitor.history.push({
    time: now.toISOString(),
    alive: result.alive,
    rtt: result.rtt
  });
  if (monitor.history.length > 60) {
    monitor.history.shift();
  }
}

async function runAllChecks(isManual = false) {
  if (isChecking) return;
  isChecking = true;

  console.log(`[${new Date().toISOString()}] Running checks for ${monitors.length} monitors...`);

  const tasks = monitors.map(async (m) => {
    const result = await probe(m.ip);
    updateMonitor(m, result);
  });

  await Promise.all(tasks);

  lastGlobalCheck = new Date().toISOString();
  saveToFile();
  isChecking = false;

  console.log('Checks completed.');
}

// 取得目前所有使用的群組（動態）
// 「伺服器」永遠排第一，其餘依中文排序
function getAllGroups() {
  const groupSet = new Set(monitors.map(m => m.group || 'server'));
  const groups = Array.from(groupSet);

  // 把 "server" 移到最前面
  const serverIndex = groups.indexOf('server');
  if (serverIndex > -1) {
    groups.splice(serverIndex, 1);
    groups.unshift('server');
  }

  // 其餘群組依中文排序
  groups.sort((a, b) => {
    if (a === 'server') return -1;
    if (b === 'server') return 1;
    return (a || '').localeCompare(b || '', 'zh-Hant');
  });

  return groups;
}

function getSortedMonitors() {
  const groups = getAllGroups();
  const grouped = {};
  groups.forEach(g => { grouped[g] = []; });

  monitors.forEach(m => {
    const g = m.group || 'server';
    if (!grouped[g]) grouped[g] = [];
    grouped[g].push(m);
  });

  // 每組內部排序
  Object.keys(grouped).forEach(g => {
    grouped[g].sort((a, b) => (a.name || a.ip).localeCompare(b.name || b.ip, 'zh-Hant'));
  });

  // 展平成陣列，並帶上可讀的 groupLabel（預設用 group 名稱）
  const result = [];
  // 相容舊資料：把 legacy group key 轉成好看的中文
  const legacyMap = {
    nas: 'NAS',
    edge: '邊緣版',
    printer: '印表機'
  };

  groups.forEach(g => {
    const label = g === 'server' ? '伺服器' : (legacyMap[g] || g);
    grouped[g].forEach(m => {
      result.push({ ...m, groupLabel: label });
    });
  });

  return result;
}

function getStats() {
  const total = monitors.length;
  const up = monitors.filter(m => m.status === 'up').length;
  const down = monitors.filter(m => m.status === 'down').length;
  const unknown = total - up - down;

  let avgUptime = 0;
  if (total > 0) {
    const uptimes = monitors.map(m => {
      if (!m.totalChecks || m.totalChecks === 0) return 100;
      return (m.upChecks / m.totalChecks) * 100;
    });
    avgUptime = uptimes.reduce((a, b) => a + b, 0) / total;
  }

  return {
    total,
    up,
    down,
    unknown,
    avgUptime: Math.round(avgUptime * 10) / 10,
    lastGlobalCheck
  };
}

// === REST API ===

// Get all monitors + stats
app.get('/api/monitors', (req, res) => {
  res.json({
    monitors: getSortedMonitors(),
    stats: getStats(),
    isChecking
  });
});

// Add new monitor
app.post('/api/monitors', (req, res) => {
  const { ip, name, group } = req.body;
  if (!ip || typeof ip !== 'string') {
    return res.status(400).json({ error: 'IP is required' });
  }
  // Basic IP validation
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip.trim())) {
    return res.status(400).json({ error: 'Invalid IP format' });
  }
  const cleanIp = ip.trim();
  const id = generateId(cleanIp);

  if (monitors.find(m => m.id === id)) {
    return res.status(409).json({ error: 'Monitor with this IP already exists' });
  }

  const newMonitor = {
    id,
    ip: cleanIp,
    name: name && name.trim() ? name.trim() : cleanIp,
    group: group && group.trim() ? group.trim() : 'server',
    status: 'unknown',
    responseTime: null,
    lastCheck: null,
    history: [],
    totalChecks: 0,
    upChecks: 0,
    notes: ''
  };

  monitors.push(newMonitor);
  saveToFile();
  res.status(201).json(newMonitor);
});

// Update monitor (name / group)
app.put('/api/monitors/:id', (req, res) => {
  const { id } = req.params;
  const { name, group } = req.body;

  const monitor = monitors.find(m => m.id === id);
  if (!monitor) return res.status(404).json({ error: 'Not found' });

  if (name && typeof name === 'string') monitor.name = name.trim();
  if (group && typeof group === 'string' && group.trim()) {
    monitor.group = group.trim();
  }
  if (typeof req.body.notes === 'string') {
    monitor.notes = req.body.notes.trim();
  }

  saveToFile();
  res.json(monitor);
});

// Delete monitor
app.delete('/api/monitors/:id', (req, res) => {
  const { id } = req.params;
  const idx = monitors.findIndex(m => m.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });

  monitors.splice(idx, 1);
  saveToFile();
  res.json({ success: true });
});

// Force check single monitor
app.post('/api/monitors/:id/check', async (req, res) => {
  const { id } = req.params;
  const monitor = monitors.find(m => m.id === id);
  if (!monitor) return res.status(404).json({ error: 'Not found' });

  const result = await probe(monitor.ip);
  updateMonitor(monitor, result);
  saveToFile();

  const label = monitor.group === 'server' ? '伺服器' : monitor.group;
  res.json({
    ...monitor,
    groupLabel: label || '伺服器'
  });
});

// Force check all
app.post('/api/check-all', async (req, res) => {
  if (isChecking) {
    return res.status(429).json({ error: 'Check already in progress' });
  }
  await runAllChecks(true);
  res.json({
    success: true,
    stats: getStats(),
    monitors: getSortedMonitors()
  });
});

// Simple health
app.get('/api/health', (req, res) => {
  res.json({ ok: true, monitors: monitors.length, lastCheck: lastGlobalCheck });
});

// Start background checker
function startChecker() {
  // First check shortly after start
  setTimeout(() => {
    runAllChecks().catch(console.error);
  }, 1500);

  setInterval(() => {
    runAllChecks().catch(console.error);
  }, CHECK_INTERVAL);
}

// Get all non-internal IPv4 addresses for LAN access
function getLocalIPs() {
  const nets = os.networkInterfaces();
  const results = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        results.push(net.address);
      }
    }
  }
  return results;
}

// Boot
loadFromFile();
startChecker();

app.listen(PORT, '0.0.0.0', () => {
  const ips = getLocalIPs();

  console.log(`\n✅ 主機監測系統已啟動`);
  console.log(`   本機瀏覽：  http://localhost:${PORT}`);

  if (ips.length > 0) {
    console.log(`   區域網路：`);
    ips.forEach(ip => {
      console.log(`                 http://${ip}:${PORT}`);
    });
  } else {
    console.log(`   區域網路：  http://<本機IP>:${PORT}`);
  }

  console.log(`   監測主機數：${monitors.length}`);
  console.log(`   自動檢查間隔：${CHECK_INTERVAL / 1000} 秒\n`);
});