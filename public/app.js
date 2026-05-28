let currentReport   = '';
let currentFilename = '';
let currentSummary  = '';
let activeTab       = 'paste';
let reviewHistory   = [];
let folderResults   = [];
let allHistory      = [];
let filteredHistory = [];
let selectedReview  = null;
let scoreChart      = null;


function switchView(view, el) {
  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
  el.classList.add('active');

  document.getElementById('view-review').style.display  = 'none';
  document.getElementById('view-history').style.display = 'none';

  document.getElementById('view-' + view).style.display = view === 'review' ? 'flex' : 'block';
}


function switchTab(tab, el) {
  activeTab = tab;

  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');

  document.getElementById('tab-paste').style.display  = tab === 'paste'  ? 'block' : 'none';
  document.getElementById('tab-upload').style.display = tab === 'upload' ? 'block' : 'none';
  document.getElementById('tab-folder').style.display = tab === 'folder' ? 'block' : 'none';
  document.getElementById('tab-github').style.display = tab === 'github' ? 'block' : 'none';
}


document.getElementById('upload-zone')?.addEventListener('click', () => {
  document.getElementById('file-input').click();
});

document.getElementById('file-input')?.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    const p = document.querySelector('#tab-upload .upload-zone p');
    if (p) p.textContent = '✓ ' + file.name + ' selected';
    document.getElementById('filename').value = file.name;
  }
});

const uploadZone = document.getElementById('upload-zone');
if (uploadZone) {
  uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.style.borderColor = '#00b4ff';
    uploadZone.style.background  = 'rgba(0,180,255,0.05)';
  });
  uploadZone.addEventListener('dragleave', () => {
    uploadZone.style.borderColor = '#0a3a5a';
    uploadZone.style.background  = 'transparent';
  });
  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.style.borderColor = '#0a3a5a';
    uploadZone.style.background  = 'transparent';
    const file = e.dataTransfer.files[0];
    if (file) {
      const dt = new DataTransfer();
      dt.items.add(file);
      document.getElementById('file-input').files = dt.files;
      const p = uploadZone.querySelector('p');
      if (p) p.textContent = '✓ ' + file.name + ' selected';
      document.getElementById('filename').value = file.name;
    }
  });
}

document.getElementById('folder-zone')?.addEventListener('click', () => {
  document.getElementById('folder-input').click();
});

document.getElementById('folder-input')?.addEventListener('change', (e) => {
  const files     = Array.from(e.target.files);
  const supported = ['js','ts','py','java','cpp','cs','go','rb','php','jsx','tsx'];

  const codeFiles = files.filter(f => {
    const ext = f.name.split('.').pop().toLowerCase();
    return supported.includes(ext);
  });

  const countEl = document.getElementById('folder-file-count');
  if (countEl) {
    countEl.style.display = 'block';
    countEl.textContent   = `✓ ${codeFiles.length} code files found in ${files.length} total files`;
  }

  const zoneP = document.querySelector('#folder-zone p');
  if (zoneP) {
    const folderName = files[0]?.webkitRelativePath?.split('/')[0] || 'folder';
    zoneP.textContent = '✓ Folder selected: ' + folderName;
  }
});

function printHelp() {
  renderIdleLines([
    { text: '-- Available Commands --',             cls: 'head' },
    { text: '',                                     cls: 'dim'  },
    { text: 'review <filename>  — set filename',   cls: 'txt'  },
    { text: 'history            — show log',        cls: 'txt'  },
    { text: 'clear              — clear output',    cls: 'txt'  },
    { text: 'help               — this message',    cls: 'txt'  },
    { text: '',                                     cls: 'dim'  },
    { text: 'Shortcut: Ctrl+Enter to run review',  cls: 'dim'  },
  ]);
}

function showHistoryCmd() {
  if (reviewHistory.length === 0) {
    flashError('No reviews yet. Run a review first.');
    return;
  }
  renderIdleLines([
    { text: '-- Session Review History --', cls: 'head' },
    { text: '',                             cls: 'dim'  },
    ...reviewHistory.map((h, i) => ({
      text: `${i + 1}. ${h.filename}  [${h.time}]  score: ${h.score}/10`,
      cls:  h.score >= 7 ? 'ok' : h.score >= 4 ? 'txt' : 'warn'
    }))
  ]);
}

async function runReview() {
  if (activeTab === 'folder') {
    runFolderReview();
    return;
  }
  if (activeTab === 'github') { runGitHubReview(); return; }

  const filename = document.getElementById('filename').value.trim() || 'code.js';
  let code = '';

  if (activeTab === 'paste') {
    code = document.getElementById('code').value.trim();
    if (!code) { flashError('No code found. Paste some code first.'); return; }
  } else {
    const file = document.getElementById('file-input').files[0];
    if (!file) { flashError('No file selected. Please upload a file first.'); return; }
    code = await file.text();
  }

  showLoadingState(':: ANALYZING CODE — PLEASE WAIT ::');

  try {
    let response;

    if (activeTab === 'paste') {
      response = await fetch('/api/review', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ code, filename })
      });
    } else {
      const file     = document.getElementById('file-input').files[0];
      const formData = new FormData();
      formData.append('file', file);
      response = await fetch('/api/review', { method: 'POST', body: formData });
    }

    const data = await response.json();

    if (data.success) {
      currentReport   = data.report;
      currentFilename = filename;

      hideAllOutputs();
      document.getElementById('report').style.display = 'block';
      document.getElementById('report-filename').textContent = filename + '_review.md';

      renderReport(data.report, 'report-content');
      updateScore(data.report);
      addToFileList(filename, data.report);

      const match = data.report.match(/(\d+)\s*\/\s*10/);
      const score = match ? parseInt(match[1]) : 5;
      reviewHistory.unshift({
        filename, report: data.report, score,
        time: new Date().toLocaleTimeString()
      });

    } else {
      throw new Error(data.error || 'Unknown error');
    }

  } catch (err) {
    hideAllOutputs();
    document.getElementById('idle').style.display = 'block';
    flashError('Error: ' + err.message);
  }
}

async function runFolderReview() {
  const input     = document.getElementById('folder-input');
  const files     = Array.from(input.files);
  const supported = ['js','ts','py','java','cpp','cs','go','rb','php','jsx','tsx'];

  const codeFiles = files.filter(f => {
    const ext = f.name.split('.').pop().toLowerCase();
    return supported.includes(ext);
  });

  if (codeFiles.length === 0) {
    flashError('No supported code files found. Select a folder with code files.');
    return;
  }
  if (codeFiles.length > 10) {
    flashError(`Too many files (${codeFiles.length}). Max 10 files per review.`);
    return;
  }

  showLoadingState(`:: REVIEWING ${codeFiles.length} FILES — PLEASE WAIT ::`);

  try {
    const formData = new FormData();
    codeFiles.forEach(f => formData.append('files', f));

    const res  = await fetch('/api/review-folder', { method: 'POST', body: formData });
    const data = await res.json();

    if (data.success) {
      folderResults  = data.results;
      currentSummary = data.summary;

      hideAllOutputs();
      document.getElementById('folder-dashboard').style.display = 'block';

      renderDashboard(data.results);
      data.results.forEach(r => addToFileList(r.filename, r.report));

    } else {
      throw new Error(data.error);
    }

  } catch (err) {
    hideAllOutputs();
    document.getElementById('idle').style.display = 'block';
    flashError('Folder review failed: ' + err.message);
  }
}

function renderReport(text, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  text.split('\n').forEach((line, i) => {
    const row = document.createElement('div');
    row.className = 'out-line';

    const num = document.createElement('span');
    num.className   = 'ln';
    num.textContent = i + 1;

    const txt = document.createElement('span');
    const lo  = line.toLowerCase();

    if      (line.startsWith('#'))                                        txt.className = 'head';
    else if (lo.includes('bug') || lo.includes('error'))                  txt.className = 'warn';
    else if (lo.includes('secur') || lo.includes('vulnerab'))             txt.className = 'warn';
    else if (lo.includes('hardcode') || lo.includes('inject'))            txt.className = 'warn';
    else if (lo.includes('/10') || lo.includes('score'))                  txt.className = 'hi';
    else if (lo.includes('✅') || lo.includes('good') || lo.includes('clean')) txt.className = 'ok';
    else if (line.trim() === '' || line.startsWith('---'))                txt.className = 'dim';
    else                                                                  txt.className = 'txt';

    txt.textContent = line;
    row.appendChild(num);
    row.appendChild(txt);
    container.appendChild(row);
  });

  container.scrollTop = 0;
}

function renderIdleLines(lines) {
  hideAllOutputs();
  document.getElementById('idle').style.display = 'block';

  const scroll = document.querySelector('#idle .output-scroll');
  if (!scroll) return;
  scroll.innerHTML = '';

  lines.forEach((item, i) => {
    const row = document.createElement('div');
    row.className = 'out-line';

    const num = document.createElement('span');
    num.className   = 'ln';
    num.textContent = i + 1;

    const txt = document.createElement('span');
    txt.className   = item.cls || 'txt';
    txt.textContent = item.text;

    row.appendChild(num);
    row.appendChild(txt);
    scroll.appendChild(row);
  });
}

function renderDashboard(results) {
  const avg    = (results.reduce((a, b) => a + b.score, 0) / results.length).toFixed(1);
  const worst  = [...results].sort((a, b) => a.score - b.score)[0];
  const best   = [...results].sort((a, b) => b.score - a.score)[0];
  const avgCls = avg >= 7 ? 'green' : avg >= 4 ? 'yellow' : 'red';

  document.getElementById('dash-summary').innerHTML = `
    <div class="dash-stat">
      <span class="dash-stat-val">${results.length}</span>
      <span class="dash-stat-label">Files</span>
    </div>
    <div class="dash-stat">
      <span class="dash-stat-val ${avgCls}">${avg}</span>
      <span class="dash-stat-label">Avg Score</span>
    </div>
    <div class="dash-stat">
      <span class="dash-stat-val green">${best.score}</span>
      <span class="dash-stat-label">Best</span>
    </div>
    <div class="dash-stat">
      <span class="dash-stat-val red">${worst.score}</span>
      <span class="dash-stat-label">Worst</span>
    </div>
  `;

  const container = document.getElementById('dash-files');
  container.innerHTML = '';

  [...results].sort((a, b) => a.score - b.score).forEach((r, i) => {
    const cls   = r.score >= 7 ? 'hi' : r.score >= 4 ? 'mid' : 'low';
    const barCls = r === best ? 'best' : cls;

    const row = document.createElement('div');
    row.className = 'dash-file-row' + (i === 0 ? ' active' : '');
    row.innerHTML = `
      <span class="dash-file-name">${r === worst ? '⚠ ' : ''}${r.filename}</span>
      <div class="dash-bar-wrap">
        <div class="dash-bar ${barCls}" style="width:${r.score * 10}%"></div>
      </div>
      <span class="dash-score-badge ${cls}">${r.score}/10</span>
    `;

    row.addEventListener('click', () => {
      document.querySelectorAll('.dash-file-row').forEach(el => el.classList.remove('active'));
      row.classList.add('active');
      document.getElementById('dash-viewing').textContent = r.filename + '_review.md';
      renderReport(r.report, 'dash-report-content');
      updateScore(r.report);
    });

    container.appendChild(row);
  });

  document.getElementById('dash-viewing').textContent = worst.filename + ' (needs most work)';
  renderReport(worst.report, 'dash-report-content');
  updateScore(worst.report);
}

function updateScore(reportText) {
  const match = reportText.match(/(\d+)\s*\/\s*10/);
  const score = match ? parseInt(match[1]) : null;

  if (score !== null) {
    document.getElementById('score-num').textContent  = score;
    document.getElementById('score-bar').style.width  = (score * 10) + '%';
  }

  const bugCount  = (reportText.match(/bug|error|undefined|null pointer/gi) || []).length;
  const secCount  = (reportText.match(/secur|inject|vulnerab|hardcode|password|secret/gi) || []).length;
  const perfCount = (reportText.match(/perform|inefficien|slow|O\(n/gi) || []).length;

  const bugEl  = document.getElementById('st-bugs');
  const secEl  = document.getElementById('st-sec');
  const perfEl = document.getElementById('st-perf');
  const qualEl = document.getElementById('st-qual');

  bugEl.textContent  = bugCount  > 0 ? bugCount + ' found' : 'clean';
  bugEl.className    = 'sv ' + (bugCount  > 0 ? 'red'    : 'green');
  secEl.textContent  = secCount  > 1 ? 'issues'          : 'ok';
  secEl.className    = 'sv ' + (secCount  > 1 ? 'red'    : 'green');
  perfEl.textContent = perfCount > 0 ? 'warnings'        : 'ok';
  perfEl.className   = 'sv ' + (perfCount > 0 ? 'yellow' : 'green');

  if (score !== null) {
    if      (score >= 8) { qualEl.textContent = 'excellent'; qualEl.className = 'sv green';  }
    else if (score >= 6) { qualEl.textContent = 'good';      qualEl.className = 'sv green';  }
    else if (score >= 4) { qualEl.textContent = 'fair';      qualEl.className = 'sv yellow'; }
    else                 { qualEl.textContent = 'poor';      qualEl.className = 'sv red';    }
  } else {
    qualEl.textContent = '--';
    qualEl.className   = 'sv';
  }
}

function addToFileList(filename, reportText) {
  const list = document.getElementById('file-list');
  document.querySelectorAll('.file-item').forEach(i => i.classList.remove('active'));

  const placeholder = list.querySelector('div:not(.file-item)');
  if (placeholder) placeholder.remove();

  const match = reportText.match(/(\d+)\s*\/\s*10/);
  const score = match ? parseInt(match[1]) : 5;
  const cls   = score >= 7 ? 'hi' : score >= 4 ? 'mid' : 'low';

  const item = document.createElement('div');
  item.className = 'file-item active';
  item.innerHTML =
    '<span class="fname">' + filename + '</span>' +
    '<span class="fscore ' + cls + '">' + score + '/10</span>';

  item.addEventListener('click', () => {
    const entry = reviewHistory.find(h => h.filename === filename);
    if (entry) {
      hideAllOutputs();
      document.getElementById('report').style.display = 'block';
      document.getElementById('report-filename').textContent = filename + '_review.md';
      renderReport(entry.report, 'report-content');
      updateScore(entry.report);
    }
  });

  list.insertBefore(item, list.firstChild);

  const items = list.querySelectorAll('.file-item');
  if (items.length > 8) items[items.length - 1].remove();
}

function downloadReport() {
  if (!currentReport) return;
  triggerDownload(
    currentReport,
    'review_' + currentFilename.replace(/\.[^/.]+$/, '') + '_' + Date.now() + '.md'
  );
}

function downloadSummary() {
  if (!currentSummary) return;
  triggerDownload(currentSummary, 'folder_summary_' + Date.now() + '.md');
}

function triggerDownload(content, filename) {
  const blob = new Blob([content], { type: 'text/markdown' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function hideAllOutputs() {
  document.getElementById('loading').style.display          = 'none';
  document.getElementById('idle').style.display             = 'none';
  document.getElementById('report').style.display           = 'none';
  document.getElementById('folder-dashboard').style.display = 'none';
}

function showLoadingState(msg) {
  hideAllOutputs();
  const p = document.querySelector('.loading p');
  if (p) p.textContent = msg || ':: ANALYZING CODE — PLEASE WAIT ::';
  document.getElementById('loading').style.display = 'block';
}

function showIdle() {
  renderIdleLines([
    { text: '-- AI Code Reviewer --',         cls: 'dim'  },
    { text: 'System ready.',                       cls: 'ok'   },
    { text: 'Paste code or upload a file.',        cls: 'txt'  },
    { text: 'Use Folder tab for project review.',  cls: 'txt'  },
  ]);
}

function flashError(msg) {
  renderIdleLines([
    { text: '-- ERROR --',                           cls: 'warn' },
    { text: msg,                                     cls: 'warn' },
    { text: '',                                      cls: 'dim'  },
    { text: 'Type "help" for available commands.',   cls: 'dim'  },
  ]);
}

function loadHistory() {
  fetch('/api/history')
    .then(r => r.json())
    .then(data => {
      if (data.success) {
        allHistory = data.history;
        filterChart('all', document.querySelector('.chart-filter.active'));
      }
    })
    .catch(() => {
      const list = document.getElementById('history-list');
      list.innerHTML = '';
      const err = document.createElement('div');
      err.className   = 'history-empty';
      err.style.color = '#e87d3e';
      err.textContent = 'Could not load history. Is the server running?';
      list.appendChild(err);
    });
}

function filterChart(range, el) {
  document.querySelectorAll('.chart-filter').forEach(f => f.classList.remove('active'));
  if (el) el.classList.add('active');

  const now = new Date();
  let filtered = [...allHistory];

  if (range === 'today') {
    filtered = allHistory.filter(h =>
      new Date(h.time).toDateString() === now.toDateString()
    );
  } else if (range === 'week') {
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    filtered = allHistory.filter(h => new Date(h.time) >= weekAgo);
  }

  filteredHistory = filtered;
  renderHistoryStats(filtered);
  renderHistoryList(filtered);
  renderChart(filtered);
}

function renderHistoryStats(history) {
  const statsEl = document.getElementById('history-stats');
  if (history.length === 0) { statsEl.style.display = 'none'; return; }
  statsEl.style.display = 'flex';

  const scores = history.filter(h => h.score !== null).map(h => h.score);
  const avg    = scores.length ? (scores.reduce((a,b) => a+b,0) / scores.length).toFixed(1) : '--';
  const best   = scores.length ? Math.max(...scores) : '--';
  const worst  = scores.length ? Math.min(...scores) : '--';

  let trend = '—';
  if (scores.length >= 4) {
    const half   = Math.floor(scores.length / 2);
    const recent = scores.slice(0, half).reduce((a,b) => a+b,0) / half;
    const older  = scores.slice(half).reduce((a,b) => a+b,0) / half;
    const diff   = (recent - older).toFixed(1);
    trend = diff > 0 ? '↑ +' + diff : diff < 0 ? '↓ ' + diff : '→ 0';
  }

  const avgCls   = avg   >= 7 ? 'green' : avg   >= 4 ? 'yellow' : 'red';
  const worstCls = worst  < 4 ? 'red'   : worst  < 7 ? 'yellow' : 'green';
  const trendCls = trend.startsWith('↑') ? 'green' : trend.startsWith('↓') ? 'red' : '';

  document.getElementById('hstat-total').textContent = history.length;

  const avgEl = document.getElementById('hstat-avg');
  avgEl.textContent = avg;
  avgEl.className   = 'hstat-val ' + avgCls;

  document.getElementById('hstat-best').textContent  = best;
  document.getElementById('hstat-worst').textContent = worst;
  document.getElementById('hstat-worst').className   = 'hstat-val ' + worstCls;

  const trendEl = document.getElementById('hstat-trend');
  trendEl.textContent = trend;
  trendEl.className   = 'hstat-val ' + trendCls;
}

function renderHistoryList(history) {
  const list = document.getElementById('history-list');
  list.innerHTML = '';

  if (history.length === 0) {
    const empty = document.createElement('div');
    empty.className   = 'history-empty';
    empty.textContent = 'No reviews yet. Go to Review tab and run your first review.';
    list.appendChild(empty);
    return;
  }

  history.forEach((h, i) => {
    const score  = h.score;
    const cls    = score >= 7 ? 'hi' : score >= 4 ? 'mid' : 'low';
    const time   = new Date(h.time).toLocaleString('en-IN', {
      day: '2-digit', month: 'short',
      hour: '2-digit', minute: '2-digit'
    });

    const row = document.createElement('div');
    row.className = 'history-row' + (i === 0 ? ' active' : '');
    row.innerHTML = `
      <span class="hrow-index">${i + 1}</span>
      <span class="hrow-name">${h.filename}</span>
      <span class="hrow-time">${time}</span>
      <span class="hrow-type">${h.type || 'single'}</span>
      <span class="hrow-badge ${cls}">${score !== null ? score + '/10' : 'N/A'}</span>
    `;

    row.addEventListener('click', () => {
      document.querySelectorAll('.history-row').forEach(r => r.classList.remove('active'));
      row.classList.add('active');
      selectedReview = h;
      showHistoryDetail(h);
    });

    list.appendChild(row);
  });

  if (history.length > 0) {
    selectedReview = history[0];
    showHistoryDetail(history[0]);
  }
}

function showHistoryDetail(h) {
  const detailEl = document.getElementById('history-detail');
  detailEl.style.display = 'block';
  renderReport(h.report, 'history-detail-content');
  updateScore(h.report);
}

function downloadSelectedReview() {
  if (!selectedReview) return;
  triggerDownload(
    selectedReview.report,
    'review_' + selectedReview.filename.replace(/\.[^/.]+$/, '') + '_' + Date.now() + '.md'
  );
}

function loadChartJs(callback) {
  if (window.Chart) { callback(); return; }
  const s   = document.createElement('script');
  s.src     = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js';
  s.onload  = callback;
  s.onerror = () => console.error('Failed to load Chart.js');
  document.head.appendChild(s);
}

function renderChart(history) {
  const canvas  = document.getElementById('score-chart');
  const emptyEl = document.getElementById('chart-empty');
  const scored  = history.filter(h => h.score !== null).reverse();

  if (scored.length === 0) {
    canvas.style.display  = 'none';
    emptyEl.style.display = 'block';
    if (scoreChart) { scoreChart.destroy(); scoreChart = null; }
    return;
  }

  canvas.style.display  = 'block';
  emptyEl.style.display = 'none';

  const labels    = scored.map(h => {
    const d = new Date(h.time);
    return d.getDate() + '/' + (d.getMonth()+1) + ' ' +
      d.getHours().toString().padStart(2,'0') + ':' +
      d.getMinutes().toString().padStart(2,'0');
  });
  const scores    = scored.map(h => h.score);
  const pointClrs = scores.map(s => s >= 7 ? '#5af078' : s >= 4 ? '#eac54f' : '#e87d3e');

  loadChartJs(() => {
    if (scoreChart) { scoreChart.destroy(); scoreChart = null; }

    scoreChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label:                'Score',
          data:                 scores,
          borderColor:          '#00b4ff',
          borderWidth:          2,
          pointBackgroundColor: pointClrs,
          pointBorderColor:     pointClrs,
          pointRadius:          5,
          pointHoverRadius:     7,
          fill:                 true,
          backgroundColor:      'rgba(0,180,255,0.05)',
          tension:              0.3,
        }]
      },
      options: {
        responsive:          false,
        maintainAspectRatio: false,
        animation:           { duration: 600, easing: 'easeInOutQuart' },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#010e1f',
            borderColor:     '#0a3a5a',
            borderWidth:     1,
            titleColor:      '#00b4ff',
            bodyColor:       '#7ec8e3',
            titleFont:       { family: 'JetBrains Mono', size: 11 },
            bodyFont:        { family: 'JetBrains Mono', size: 10 },
            callbacks: {
              title: (items) => scored[items[0].dataIndex].filename,
              label: (item)  => 'Score: ' + item.raw + '/10'
            }
          }
        },
        scales: {
          x: {
            ticks: { color: '#0a4a6a', font: { family: 'JetBrains Mono', size: 9 }, maxRotation: 45 },
            grid:  { color: '#051525' }
          },
          y: {
            min:   0,
            max:   10,
            ticks: {
              color:    '#0a4a6a',
              font:     { family: 'JetBrains Mono', size: 9 },
              stepSize: 2,
              callback: (v) => v + '/10'
            },
            grid: { color: '#051525' }
          }
        }
      }
    });
  });
}

async function clearHistory() {
  if (!confirm('Clear all review history and output files? This cannot be undone.')) return;

  try {
    const res  = await fetch('/api/history', { method: 'DELETE' });
    const data = await res.json();

    if (data.success) {
      allHistory      = [];
      filteredHistory = [];
      selectedReview  = null;
      reviewHistory   = [];

      // Hide panels
      document.getElementById('history-detail').style.display = 'none';
      document.getElementById('history-stats').style.display  = 'none';

      // Reset list
      const list = document.getElementById('history-list');
      list.innerHTML = '';
      const empty = document.createElement('div');
      empty.className   = 'history-empty';
      empty.textContent = 'History cleared. Run a review to start fresh.';
      list.appendChild(empty);

      // Reset chart
      if (scoreChart) { scoreChart.destroy(); scoreChart = null; }
      document.getElementById('score-chart').style.display = 'none';
      const chartEmpty = document.getElementById('chart-empty');
      chartEmpty.style.display = 'block';
      chartEmpty.textContent   = 'History cleared. Run a review to start fresh.';

    } else {
      throw new Error(data.error || 'Delete failed');
    }

  } catch (err) {
    const list = document.getElementById('history-list');
    list.innerHTML = '';
    const errEl = document.createElement('div');
    errEl.className   = 'history-empty';
    errEl.style.color = '#e87d3e';
    errEl.textContent = 'Error: ' + err.message;
    list.appendChild(errEl);
  }
}

async function runGitHubReview() {
  const repoUrl = document.getElementById('github-url').value.trim();
  const statusEl = document.getElementById('github-status');

  if (!repoUrl) {
    statusEl.style.display = 'block';
    statusEl.className     = 'github-status error';
    statusEl.textContent   = '❌ Please enter a GitHub repo URL first.';
    return;
  }

  if (!repoUrl.includes('github.com')) {
    statusEl.style.display = 'block';
    statusEl.className     = 'github-status error';
    statusEl.textContent   = '❌ URL must be a valid github.com link.';
    return;
  }

  statusEl.style.display = 'block';
  statusEl.className     = 'github-status';
  statusEl.textContent   = '🐙 Fetching repo files from GitHub...';

  showLoadingState(':: FETCHING GITHUB REPO — PLEASE WAIT ::');

  try {
    const res  = await fetch('/api/review-github', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ repoUrl })
    });

    const data = await res.json();

    if (data.success) {
      folderResults  = data.results;
      currentSummary = data.summary;

      statusEl.className   = 'github-status success';
      statusEl.textContent = `✅ Reviewed ${data.results.length} files from ${data.repo}`;

      hideAllOutputs();
      document.getElementById('folder-dashboard').style.display = 'block';

      renderDashboard(data.results);
      data.results.forEach(r => addToFileList(r.filename, r.report));

    } else {
      throw new Error(data.error);
    }

  } catch (err) {
    hideAllOutputs();
    document.getElementById('idle').style.display = 'block';
    statusEl.className   = 'github-status error';
    statusEl.textContent = '❌ ' + err.message;
    flashError('GitHub review failed: ' + err.message);
  }
}

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'Enter') runReview();
});

showIdle();