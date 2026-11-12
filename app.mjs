import { FORM, PHOTO_FORM, mapProfilePoint, canonicalDecimal, gradeSubmission, regradeSubmission, emptyAnswers, scoreCSV, scanForm, hasFormMarkers, scanSignature } from './core.mjs';
import { extractAnswerKeyVariants, importRosterFile, readDocument } from './imports.mjs';

const root = document.querySelector('#app'), toastBox = document.querySelector('#toast');
let db, toastTimer, objectURLs = [], cameraStream, cameraTimer, cameraBusy = false, cameraSession = 0;

const state = {
  view: 'batches',
  batchId: null,
  submissionId: null,
  modal: null,
  captureDraft: null,
  reviewDraft: null,
  reviewPreview: null,
  importDraft: null,
  examKeyVariants: null,
  activeExamCode: '',
  viewer: { zoom: 1, rotate: 0, panX: 0, panY: 0, page: 1, highlightKey: '' }
};

const pageLabels = {
  batches: 'Đợt chấm',
  batch: 'Danh sách đợt',
  'batch-detail': 'Bài chấm',
  submission: 'Phiếu chấm',
  exams: 'Đề thi',
  roster: 'Danh sách lớp'
};

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const icon = (name) => ({
  mark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/><path d="m15.5 17 1.5 1.5 3-4"/></svg>',
  scan: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M8 8h8v8H8zM2 12h4M18 12h4"/></svg>',
  exam: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h8l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M15 3v5h5M9 13h6M9 17h6M9 9h2"/></svg>',
  people: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2ZM17 5.5a3 3 0 0 1 0 5.8M18 14a5 5 0 0 1 3 4.5V20"/></svg>',
  file: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 14h8M8 18h8M8 10h2"/></svg>',
  upload: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m0 0-4 4m4-4 4 4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M5 19h14"/></svg>',
  zoomIn: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35M11 8v6M8 11h6"/></svg>',
  zoomOut: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35M8 11h6"/></svg>',
  rotate: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>',
  fit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>',
  moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 15.2A8.5 8.5 0 0 1 8.8 3.5 8.5 8.5 0 1 0 20.5 15.2Z"/></svg>',
  sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg>'
})[name] || '';

function setTheme(theme, persist = false) {
  const dark = theme === 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#000000' : '#F2F2F7');
  if (persist) try { localStorage.setItem('qm-cham-theme', dark ? 'dark' : 'light'); } catch {}
  const button = root.querySelector('.theme-toggle');
  if (button) {
    const label = dark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối';
    button.innerHTML = icon(dark ? 'sun' : 'moon');
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', String(dark));
    button.title = label;
  }
}

const systemTheme = matchMedia('(prefers-color-scheme: dark)');
let savedTheme;
try { savedTheme = localStorage.getItem('qm-cham-theme'); } catch {}
setTheme(savedTheme === 'dark' || savedTheme === 'light' ? savedTheme : systemTheme.matches ? 'dark' : 'light');
systemTheme.addEventListener('change', event => {
  try { if (localStorage.getItem('qm-cham-theme')) return; } catch {}
  setTheme(event.matches ? 'dark' : 'light');
});

function openDatabase() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('qm-cham-local', 1);
    req.onupgradeneeded = () => {
      const store = req.result;
      for (const name of ['exams', 'batches', 'roster', 'submissions', 'photos']) {
        if (!store.objectStoreNames.contains(name)) store.createObjectStore(name, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function request(store, method, value) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, method === 'getAll' || method === 'get' ? 'readonly' : 'readwrite');
    const req = value === undefined ? transaction.objectStore(store)[method]() : transaction.objectStore(store)[method](value);
    let result;
    req.onsuccess = () => { result = req.result; };
    req.onerror = () => reject(req.error);
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error || new Error('Không lưu được dữ liệu trên thiết bị.'));
    transaction.onabort = () => reject(transaction.error || new Error('Không lưu được dữ liệu trên thiết bị.'));
  });
}

const all = store => request(store, 'getAll');
async function save(store, value) { await request(store, 'put', value); }
function saveMany(store, values) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, 'readwrite'), objectStore = transaction.objectStore(store);
    values.forEach(value => objectStore.put(value));
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error('Không lưu được dữ liệu trên thiết bị.'));
    transaction.onabort = () => reject(transaction.error || new Error('Không lưu được dữ liệu trên thiết bị.'));
  });
}
async function remove(store, id) { await request(store, 'delete', id); }
function savePaper(submission, first, second) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['submissions', 'photos'], 'readwrite'), photos = transaction.objectStore('photos');
    if (first) photos.put({ id: submission.firstPageId, blob: first });
    if (second) photos.put({ id: submission.secondPageId, blob: second });
    transaction.objectStore('submissions').put(submission);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Không lưu được ảnh bài trên thiết bị.'));
    transaction.onabort = () => reject(transaction.error || new Error('Không lưu được ảnh bài trên thiết bị.'));
  });
}
function deletePaper(submission) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['submissions', 'photos'], 'readwrite'), papers = transaction.objectStore('submissions'), photos = transaction.objectStore('photos');
    papers.delete(submission.id);
    if (submission.firstPageId) photos.delete(submission.firstPageId);
    if (submission.secondPageId) photos.delete(submission.secondPageId);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Không xóa được bài.'));
    transaction.onabort = () => reject(transaction.error || new Error('Không xóa được bài.'));
  });
}

const localState = async () => ({ exams: await all('exams'), batches: await all('batches'), roster: await all('roster'), submissions: await all('submissions') });
function notify(message) { toastBox.textContent = message; toastBox.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toastBox.classList.remove('show'), 2900); }
function releaseURLs() { for (const url of objectURLs) URL.revokeObjectURL(url); objectURLs = []; }
function photoURL(blob) { if (!blob) return ''; const url = URL.createObjectURL(blob); objectURLs.push(url); return url; }
function fmt(value) { return (Number(value) || 0).toLocaleString('vi-VN', { maximumFractionDigits: 3 }); }
function sortNewest(rows) { return rows.sort((a, b) => b.createdAt - a.createdAt); }
function policyFor(exam) { return { ...(exam.policy || { multipleChoiceTotal: 0, trueFalseTotal: 0, numericTotal: 0, sectionTwoRule: 'perStatement', multipleChoiceQuestionPoints: [], trueFalseQuestionPoints: [], numericQuestionPoints: [] }), questionCounts: exam.questionCounts || { multipleChoice: 40, trueFalse: 8, numeric: 6 } }; }
function scoreFor(exam, answers) { return gradeSubmission(exam.answerKey, answers, policyFor(exam)); }
function statusPill(submission) { return submission.needsReview ? '<span class="pill warn">Cần rà soát</span>' : submission.confirmed ? '<span class="pill">Đã xác nhận</span>' : '<span class="pill neutral">Tạm tính</span>'; }
function resetViewer() { state.viewer = { zoom: 1, rotate: 0, panX: 0, panY: 0, page: 1, highlightKey: '' }; }

function navItems(className) {
  const activeView = ['batch', 'batch-detail', 'submission'].includes(state.view) ? 'batches' : state.view;
  const itemClass = className === 'segmented-tabs' ? 'segmented-tab' : 'tab';
  return `<nav class="${className}" aria-label="Điều hướng chính">${[['batches', 'scan', 'Chấm bài'], ['exams', 'exam', 'Đề thi'], ['roster', 'people', 'Danh sách']].map(([view, symbol, label]) => `<button class="${itemClass}" data-action="navigate" data-view="${view}" aria-current="${activeView === view ? 'page' : 'false'}">${icon(symbol)}<span>${label}</span></button>`).join('')}</nav>`;
}

async function render() {
  releaseURLs();
  const data = await localState();
  if (state.view === 'submission' && state.reviewPreview) {
    data.submissions = data.submissions.map(item => item.id === state.reviewPreview.id ? state.reviewPreview : item);
  }
  const photos = state.view === 'submission' ? await submissionPhotos(data.submissions.find(item => item.id === state.submissionId)) : {};
  const storageMessage = navigator.onLine ? 'Lưu cục bộ trên thiết bị' : 'Ngoại tuyến · Lưu trên thiết bị';
  const dark = document.documentElement.dataset.theme === 'dark';
  const buttonLabel = dark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối';
  const isSplit = state.view === 'submission';

  root.innerHTML = `
    <header class="topbar">
      <a class="brand" href="#" data-action="home">
        <span class="brand-mark">QM</span>
        <span class="brand-copy"><strong>QM Chấm</strong><small>Phiếu THPT 2025</small></span>
      </a>
      ${navItems('segmented-tabs')}
      <div class="topbar-tools">
        <span class="storage-status" title="${esc(storageMessage)}" aria-label="${esc(storageMessage)}">
          <i class="status-dot ${navigator.onLine ? '' : 'offline'}"></i>
          <span>${storageMessage}</span>
        </span>
        <button class="theme-toggle" type="button" data-action="toggle-theme" aria-label="${buttonLabel}" aria-pressed="${dark}" title="${buttonLabel}">
          ${icon(dark ? 'sun' : 'moon')}
        </button>
      </div>
    </header>
    ${installHint()}
    <main id="main" class="${isSplit ? 'split-mode' : ''}">${await page(data, photos)}</main>
    ${navItems('tabbar')}
  `;
  attachOffline();
}

function attachOffline() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js').catch(() => notify('Chưa bật lưu ngoại tuyến. Mở lại khi có mạng.'));
}

function installHint() {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent), installed = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  return ios && !installed ? '<aside class="notice neutral install-hint"><span aria-hidden="true">i</span><div><strong>Cài app lên màn hình chính</strong><p>Mở bằng Safari, chạm Chia sẻ → Thêm vào Màn hình chính để dùng ổn định khi ngoại tuyến.</p></div></aside>' : '';
}

async function page(data, photos = {}) {
  if (state.view === 'batch') return batchPage(data);
  if (state.view === 'exams') return examsPage(data);
  if (state.view === 'roster') return rosterPage(data);
  if (state.view === 'batch-detail') return batchDetailPage(data);
  if (state.view === 'submission') return submissionPage(data, photos);
  return batchListPage(data);
}

function batchListPage({ batches, exams, submissions }) {
  const recent = sortNewest(batches.slice()).slice(0, 4);
  const open = batch => `<button class="card batch-card" data-action="open-batch" data-id="${esc(batch.id)}"><span class="card-icon">${icon('people')}</span><span class="card-copy"><strong>${esc(batch.className)}</strong><p>${esc(exams.find(e => e.id === batch.examId)?.name || 'Đề đã xóa')} · ${new Date(batch.createdAt).toLocaleDateString('vi-VN')}</p></span><span class="card-end"><strong>${submissions.filter(s => s.batchId === batch.id).length} / 100</strong>bài đã chấm</span></button>`;
  return `
    <section class="hero">
      <div class="hero-copy">
        <p class="eyebrow">Chấm trắc nghiệm · THPT 2025</p>
        <h1>Từ phiếu giấy đến bảng điểm.</h1>
        <p class="lede">Quét phiếu 3 phần (A–D, Đúng/Sai, Trả lời ngắn), rà soát ô cảnh báo và xuất bảng điểm Excel. Toàn bộ dữ liệu lưu cục bộ trên thiết bị.</p>
        <div class="actions">
          ${exams.length ? `<button class="button" data-action="scan-entry">${icon('scan')}Quét phiếu</button><button class="button secondary" data-action="new-batch">${icon('plus')}Tạo đợt chấm</button>` : `<button class="button" data-action="navigate" data-view="exams">${icon('exam')}Thêm đáp án để chấm</button>`}
        </div>
      </div>
      <div class="hero-art" aria-hidden="true">
        <div class="sheet-illustration">
          <div class="sheet-row"><i></i><i class="active"></i><i></i><i></i></div>
          <div class="sheet-row"><i class="active"></i><i></i><i></i><i></i></div>
          <div class="sheet-row"><i></i><i></i><i class="active"></i><i></i></div>
          <div class="sheet-rule"></div>
          <div class="sheet-row"><i></i><i class="active"></i><i></i><i></i></div>
          <div class="sheet-row"><i class="active"></i><i></i><i></i><i></i></div>
          <div class="sheet-row"><i></i><i></i><i class="active"></i><i></i></div>
        </div>
      </div>
    </section>
    <section class="stats">
      <article class="stat"><span>Đề thi</span><strong>${exams.length}</strong><span>Đáp án lưu cục bộ</span></article>
      <article class="stat"><span>Đợt chấm</span><strong>${batches.length}</strong><span>Theo từng lớp học</span></article>
      <article class="stat"><span>Bài cần rà soát</span><strong>${submissions.filter(s => s.needsReview).length}</strong><span>Ô mờ, trống hoặc lệch mã</span></article>
    </section>
    <div class="section-heading">
      <div><p class="eyebrow">Tiếp tục công việc</p><h2>Đợt chấm gần đây</h2></div>
      ${recent.length ? `<button class="button quiet" data-action="navigate" data-view="batch">Xem tất cả ${icon('arrow')}</button>` : ''}
    </div>
    ${recent.length ? `<div class="stack">${recent.map(open).join('')}</div>` : `<div class="empty"><p>${exams.length ? 'Tạo đợt chấm đầu tiên rồi quét phiếu học sinh.' : 'Bắt đầu bằng đề thi và thang điểm. Đáp án có thể nhập tay hoặc đọc từ tệp.'}</p><button class="button" data-action="${exams.length ? 'scan-entry' : 'navigate'}" ${exams.length ? '' : 'data-view="exams"'}>${icon(exams.length ? 'scan' : 'exam')}${exams.length ? 'Bắt đầu quét phiếu' : 'Tạo đề thi'}</button></div>`}
    <p class="helper" style="margin-top:20px">Hỗ trợ mẫu phiếu QM 2025. Kiểm tra các ô gắn cờ cảnh báo trước khi chốt điểm.</p>
  `;
}

function examsPage({ exams }) {
  const rows = exams.map(exam => {
    const counts = exam.questionCounts || { multipleChoice: 40, trueFalse: 8, numeric: 6 };
    return `<button class="card batch-card" data-action="edit-exam" data-id="${esc(exam.id)}"><span class="card-icon">${icon('exam')}</span><span class="card-copy"><strong>${esc(exam.name)}</strong><p>Mã ${esc(exam.code)} · ${examComplete(exam) ? `Đủ ${counts.multipleChoice + counts.trueFalse * 4 + counts.numeric} mục` : answerStatus(exam)}</p></span><span class="card-end">${icon('arrow')}</span></button>`;
  }).join('');
  return `
    <p class="eyebrow">Thiết lập đáp án và thang điểm</p>
    <div class="toolbar">
      <div><h1>Đề thi</h1><p class="lede">Tạo khóa đáp án một lần. Đợt chấm đối chiếu tự động theo mã đề.</p></div>
      <div class="actions" style="margin:0">
        ${exams.length ? `<button class="button secondary" data-action="scan-entry">${icon('scan')}Quét phiếu</button>` : ''}
        <button class="button" data-action="edit-exam">${icon('plus')}Tạo đề</button>
      </div>
    </div>
    ${rows ? `<div class="stack">${rows}</div>` : `<div class="empty"><p>Chưa có đề thi. Tạo đáp án và áp dụng thang điểm chuẩn THPT 2025 để bắt đầu.</p><button class="button" data-action="edit-exam">${icon('plus')}Tạo đề đầu tiên</button></div>`}
  `;
}

function answerStatus(exam) {
  const [mc, tf, numeric] = keyCounts(exam.answerKey), expected = exam.questionCounts || { multipleChoice: 40, trueFalse: 8, numeric: 6 };
  return `${mc}/${expected.multipleChoice} câu A–D · ${tf}/${expected.trueFalse * 4} ý Đ/S · ${numeric}/${expected.numeric} câu số`;
}

function examComplete(exam) {
  const key = exam?.answerKey;
  if (!key) return false;
  const expected = exam.questionCounts || { multipleChoice: 40, trueFalse: 8, numeric: 6 };
  return Array.from({ length: expected.multipleChoice }, (_, i) => key.multipleChoice?.[i]).every(Boolean)
    && Array.from({ length: expected.trueFalse * 4 }, (_, i) => key.trueFalse?.[i]).every(value => typeof value === 'boolean')
    && Array.from({ length: expected.numeric }, (_, i) => key.numeric?.[i]).every(value => /^-?\d+(?:[.,]\d+)?$/.test(String(value ?? '')));
}

function rosterPage({ roster }) {
  const classes = [...new Set(roster.map(row => row.className).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi'));
  const groups = classes.map(name => {
    const rows = roster.filter(row => row.className === name);
    return `<details class="card answer-card"><summary>${esc(name)} <span class="pill neutral">${rows.length} học sinh</span></summary><div class="stack" style="margin-top:12px">${rows.map(row => `<div class="submission-row"><span class="avatar-number">${esc(row.seatNumber.slice(-3))}</span><span class="card-copy"><strong>${esc(row.fullName)}</strong><p>SBD ${esc(row.seatNumber)}</p></span><button class="button quiet sm" data-action="delete-roster" data-id="${esc(row.id)}" aria-label="Xóa ${esc(row.fullName)}">Xóa</button></div>`).join('')}</div></details>`;
  }).join('');

  return `
    <p class="eyebrow">Ghép tên tự động theo số báo danh</p>
    <div class="toolbar">
      <div><h1>Danh sách lớp</h1><p class="lede">Họ tên học sinh tự động điền khi SBD khớp. Dữ liệu lưu cục bộ trên thiết bị.</p></div>
      <div class="actions" style="margin:0">
        <button class="button secondary sm" data-action="download-roster-template">${icon('download')}Mẫu CSV</button>
        <button class="button secondary sm" data-action="download-roster-xlsx">${icon('download')}Mẫu Excel</button>
      </div>
    </div>
    <div class="dropzone" id="roster-dropzone">
      <div class="dropzone-icon">${icon('upload')}</div>
      <div>
        <strong>Kéo thả tệp CSV hoặc Excel (.xlsx) vào đây</strong>
        <p class="helper" style="margin:4px 0 0">Cần có cột SBD, Họ tên và Lớp. SBD trùng trong cùng lớp được tự động cảnh báo.</p>
      </div>
      <div class="dropzone-actions">
        <button class="button" type="button" data-action="import-roster">${icon('file')}Chọn tệp danh sách</button>
      </div>
    </div>
    ${groups ? `<div class="section-heading"><div><h2>Các lớp đã nhập (${classes.length})</h2></div></div><div class="stack">${groups}</div>` : `<div class="empty"><p>Chưa có danh sách lớp nào. Kéo thả tệp CSV/XLSX vào khung phía trên hoặc tải file mẫu để chuẩn bị dữ liệu.</p></div>`}
  `;
}

function batchPage({ batches }) {
  const rows = sortNewest(batches.slice()).map(batch => `<button class="card batch-card" data-action="open-batch" data-id="${esc(batch.id)}"><span class="card-icon">${icon('people')}</span><span class="card-copy"><strong>${esc(batch.className)}</strong><p>${new Date(batch.createdAt).toLocaleDateString('vi-VN')} · ${esc(batch.examName)}</p></span><span class="card-end">Mở ${icon('arrow')}</span></button>`).join('');
  return `
    <p class="eyebrow">Lớp học và kết quả</p>
    <div class="toolbar">
      <div><h1>Đợt chấm</h1><p class="lede">Mỗi đợt tối đa 100 bài, gắn với một lớp và một đề thi.</p></div>
      <button class="button" data-action="new-batch">${icon('plus')}Tạo đợt</button>
    </div>
    ${rows ? `<div class="stack">${rows}</div>` : `<div class="empty"><p>Tạo đề thi trước, sau đó mở đợt chấm theo lớp.</p><button class="button" data-action="new-batch">${icon('plus')}Tạo đợt chấm</button></div>`}
  `;
}

function batchDetailPage({ batches, exams, submissions, roster }) {
  const batch = batches.find(item => item.id === state.batchId);
  if (!batch) { state.view = 'batches'; return batchListPage({ batches, exams, submissions }); }
  const exam = exams.find(item => item.id === batch.examId), papers = sortNewest(submissions.filter(item => item.batchId === batch.id).slice());
  const rosterClass = roster.filter(item => item.className === batch.className);
  const rows = papers.map(s => `<button class="card submission-row" data-action="open-submission" data-id="${esc(s.id)}"><span class="avatar-number">${esc(s.seatNumber === '????????' ? '?' : s.seatNumber.slice(-3))}</span><span class="card-copy"><strong>${esc(s.studentName || 'Chưa ghép tên')} · SBD ${esc(s.seatNumber)}</strong><p>${statusPill(s)} ${s.examCode === exam?.code ? '' : `<span class="pill red">Mã ${esc(s.examCode)} ≠ ${esc(exam?.code)}</span>`}</p></span><span class="card-end"><strong>${fmt(s.score.totalEarned)} / ${fmt(s.score.totalPossible)}</strong>${new Date(s.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span></button>`).join('');

  return `
    <div class="breadcrumb"><button data-action="navigate" data-view="batches">Đợt chấm</button><span>/</span><span>${esc(batch.className)}</span></div>
    <p class="eyebrow">${esc(exam?.name || 'Đề đã xóa')} · Mã ${esc(exam?.code || '')}</p>
    <div class="toolbar">
      <div><h1>Lớp ${esc(batch.className)}</h1><p class="lede">${papers.length} / 100 bài đã lưu${rosterClass.length ? ` · ${rosterClass.length} học sinh trong danh sách` : ''}</p></div>
      <div class="actions" style="margin:0">
        <button class="button secondary" data-action="export-csv" data-id="${esc(batch.id)}" ${papers.length ? '' : 'disabled'}>${icon('download')}Xuất CSV</button>
        <button class="button" data-action="new-submission" data-id="${esc(batch.id)}" ${papers.length >= 100 ? 'disabled' : ''}>${icon('scan')}Quét phiếu</button>
      </div>
    </div>
    ${!examComplete(exam) ? `<div class="notice warning"><span aria-hidden="true">!</span><div><strong>Đáp án chưa đủ theo số câu trong đề</strong><p>Kiểm tra khóa đáp án trước khi dùng để chấm.</p><button class="button quiet sm" style="margin-top:8px" data-action="edit-exam" data-id="${esc(exam?.id)}">Mở đáp án</button></div></div>` : ''}
    ${rows ? `<div class="stack">${rows}</div>` : `<div class="empty"><p>Quét phiếu để hiện điểm nháp. Kiểm tra các ô bị đánh dấu trước khi chốt.</p><button class="button" data-action="new-submission" data-id="${esc(batch.id)}">${icon('scan')}Quét phiếu đầu tiên</button></div>`}
  `;
}

async function submissionPhotos(item) {
  if (!item) return {};
  const [first, second] = await Promise.all([
    item.firstPageId ? request('photos', 'get', item.firstPageId) : null,
    item.secondPageId ? request('photos', 'get', item.secondPageId) : null
  ]);
  return { first: first?.blob, second: second?.blob };
}

function warningTargetInfo(message) {
  const mc = message.match(/^I-(\d+)/);
  if (mc) return { target: `mc-${Number(mc[1]) - 1}`, type: 'mc', index: Number(mc[1]) - 1 };
  const tf = message.match(/^II-(\d+)([abcd])/);
  if (tf) return { target: `tf-${(Number(tf[1]) - 1) * 4 + 'abcd'.indexOf(tf[2])}`, type: 'tf', index: (Number(tf[1]) - 1) * 4 + 'abcd'.indexOf(tf[2]) };
  const num = message.match(/^III-(\d+)/);
  if (num) return { target: `num-${Number(num[1]) - 1}`, type: 'num', index: Number(num[1]) - 1 };
  if (/^SBD/i.test(message)) return { target: 'seatNumber', type: 'seat', index: 0 };
  if (/^Mã đề/i.test(message)) return { target: 'examCode', type: 'code', index: 0 };
  return { target: '', type: 'other', index: -1 };
}

function buildOverlayMarks(reviewItems, activeTarget = '', scanMeta = null) {
  const profile = scanMeta?.profile === 'photo' ? PHOTO_FORM : FORM;
  const observed = scanMeta?.observed;
  const poly = (x1, y1, x2, y2, isActive) => {
    const pts = [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]
      .map(pt => mapProfilePoint(pt, observed, profile))
      .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
      .join(' ');
    return `<polygon class="overlay-mark ${isActive ? 'active' : ''}" points="${pts}" />`;
  };
  const marks = [];
  for (const msg of reviewItems) {
    const info = warningTargetInfo(msg);
    const isActive = activeTarget && info.target === activeTarget;
    if (info.type === 'mc' && info.index >= 0 && info.index < 40) {
      const block = Math.floor(info.index / 10), row = info.index % 10;
      const xs = profile.mcColumns[block], y = profile.mcRows[row];
      marks.push(poly(xs[0] - 8, y - 6, xs[3] + 8, y + 6, isActive));
    } else if (info.type === 'tf' && info.index >= 0 && info.index < 32) {
      const q = Math.floor(info.index / 4), j = info.index % 4;
      const xs = profile.tfColumns[q], y = profile.tfRows[j];
      marks.push(poly(xs[0] - 8, y - 6, xs[1] + 8, y + 6, isActive));
    } else if (info.type === 'num' && info.index >= 0 && info.index < 6) {
      const cols = profile.numericColumns[info.index];
      marks.push(poly(cols[0] - 8, profile.signRow - 8, cols[3] + 8, profile.digitRows[9] + 8, isActive));
    } else if (info.type === 'seat') {
      marks.push(poly(profile.seatColumns[0] - 7, profile.identityRows[0] - 7, profile.seatColumns[7] + 7, profile.identityRows[9] + 7, isActive));
    } else if (info.type === 'code') {
      marks.push(poly(profile.codeColumns[0] - 7, profile.identityRows[0] - 7, profile.codeColumns[3] + 7, profile.identityRows[9] + 7, isActive));
    }
  }
  return marks.join('');
}

function submissionPage({ submissions, batches, exams }, { first, second }) {
  const item = submissions.find(s => s.id === state.submissionId);
  if (!item) { state.view = 'batch-detail'; return batchDetailPage({ submissions, batches, exams: [], roster: [] }); }
  const score = item.score, reviewItems = item.answers.reviewItems || [];
  const currentExam = exams.find(exam => exam.code === item.examCode) || exams.find(exam => exam.id === item.examId);
  const counts = currentExam?.questionCounts || { multipleChoice: 40, trueFalse: 8, numeric: 6 };
  const activeImg = state.viewer.page === 2 && second ? second : first || second;
  const imgUrl = activeImg ? photoURL(activeImg) : '';
  const { zoom, rotate, panX, panY, highlightKey } = state.viewer;
  const seatWarn = reviewItems.some(m => /^SBD/i.test(m));
  const codeWarn = reviewItems.some(m => /^Mã đề/i.test(m));

  return `
    <div class="breadcrumb">
      <button data-action="open-batch" data-id="${esc(item.batchId)}">Lớp ${esc(item.className)}</button>
      <span>/</span>
      <span class="tabular">SBD ${esc(item.seatNumber)}</span>
    </div>
    <div class="review-split">
      <aside class="review-viewer-col" aria-label="Ảnh phiếu bài làm">
        <div class="viewer-toolbar">
          <div class="viewer-controls">
            <button type="button" class="button quiet sm" data-action="viewer-zoom-out" title="Thu nhỏ" aria-label="Thu nhỏ">${icon('zoomOut')}</button>
            <span class="viewer-zoom-label" id="viewer-zoom-label">${Math.round(zoom * 100)}%</span>
            <button type="button" class="button quiet sm" data-action="viewer-zoom-in" title="Phóng to" aria-label="Phóng to">${icon('zoomIn')}</button>
            <button type="button" class="button quiet sm" data-action="viewer-fit" title="Vừa khung">${icon('fit')}Vừa khung</button>
            <button type="button" class="button quiet sm" data-action="viewer-rotate" title="Xoay 90°">${icon('rotate')}Xoay</button>
          </div>
          ${first && second ? `<div class="viewer-controls"><button type="button" class="button sm ${state.viewer.page === 1 ? '' : 'secondary'}" data-action="viewer-page" data-page="1">Trang 1</button><button type="button" class="button sm ${state.viewer.page === 2 ? '' : 'secondary'}" data-action="viewer-page" data-page="2">Trang 2</button></div>` : ''}
        </div>
        <div class="viewer-viewport" id="viewer-viewport">
          ${imgUrl ? `
            <div class="viewer-stage" id="viewer-stage" style="transform: translate(${panX}px, ${panY}px) scale(${zoom}) rotate(${rotate}deg)">
              <img class="viewer-image" src="${imgUrl}" alt="Ảnh phiếu bài làm" draggable="false">
              <svg class="omr-overlay" id="omr-overlay" viewBox="0 0 ${FORM.pageWidth} ${FORM.pageHeight}" preserveAspectRatio="none" aria-hidden="true">
                ${state.viewer.page === 1 ? buildOverlayMarks(reviewItems, highlightKey, item.scanMeta) : ''}
              </svg>
            </div>
          ` : `<div class="viewer-empty">Không có ảnh gốc (phiếu được nhập thủ công).</div>`}
        </div>
      </aside>

      <div class="review-editor-col">
        <form id="review-form" data-id="${esc(item.id)}">
          <section class="result-header-card">
            <div class="result-title-row">
              <div>
                <p class="eyebrow">Lớp ${esc(item.className)}</p>
                ${item.studentName
                  ? `<h1>${esc(item.studentName)}</h1>`
                  : `<h1 class="unmatched-name">Thí sinh chưa ghép tên</h1><p class="unmatched-hint">Chưa có SBD ${esc(item.seatNumber)} trong danh sách lớp</p>`}
              </div>
              ${statusPill(item)}
            </div>
            <div class="inline-meta-grid">
              <div class="inline-meta-field">
                <label for="inline-exam">Đề thi</label>
                <select id="inline-exam" class="inline-meta-input" data-action="select-submission-exam">
                  ${exams.map(e => `<option value="${esc(e.id)}" ${e.code === item.examCode ? 'selected' : ''}>${esc(e.name)} (${esc(e.code)})</option>`).join('')}
                </select>
              </div>
              <div class="inline-meta-field ${seatWarn ? 'has-warning' : ''}" data-question-target="seatNumber">
                <label for="inline-seat">SBD</label>
                <input id="inline-seat" class="inline-meta-input" name="seatNumber" inputmode="numeric" maxlength="8" value="${esc(item.seatNumber)}">
              </div>
              <div class="inline-meta-field ${codeWarn ? 'has-warning' : ''}" data-question-target="examCode">
                <label for="inline-code">Mã đề</label>
                <input id="inline-code" class="inline-meta-input" name="examCode" inputmode="numeric" maxlength="4" value="${esc(item.examCode)}">
              </div>
            </div>
            <div class="score-strip">
              ${[
                ['Phần I', score.multipleChoiceEarned, score.multipleChoicePossible, false],
                ['Phần II', score.trueFalseEarned, score.trueFalsePossible, false],
                ['Phần III', score.numericEarned, score.numericPossible, false],
                ['Tổng điểm', score.totalEarned, score.totalPossible, true]
              ].map(([label, earned, total, isTotal]) => `<div class="score-chip ${isTotal ? 'total' : ''}"><span>${label}</span><strong>${fmt(earned)} <small>/ ${fmt(total)}</small></strong></div>`).join('')}
            </div>
          </section>

          ${item.scorePreview ? `<section class="notice"><span aria-hidden="true">i</span><div><strong>Bản xem trước · chưa lưu</strong><p>Bấm “Lưu nháp” để lưu tạm hoặc “Chốt & Tiếp” để hoàn tất.</p></div></section>` : ''}
          ${item.regradePending ? `<section class="notice warning"><span aria-hidden="true">!</span><div><strong>Thay đổi đã lưu, điểm chưa chấm lại</strong><p>Bấm “Chấm lại” hoặc “Chốt & Tiếp” để cập nhật điểm theo mã đề ${esc(item.examCode)}.</p></div></section>` : ''}

          ${reviewItems.length ? `
            <details class="warning-panel" ${reviewItems.length <= 4 ? 'open' : ''}>
              <summary>
                <span class="warning-summary-title"><i class="warning-summary-dot" aria-hidden="true"></i>${reviewItems.length} mục cần lưu ý</span>
                <span class="pill neutral">Chạm để đối chiếu</span>
              </summary>
              <div class="warning-chips">
                ${reviewItems.map(msg => {
                  const info = warningTargetInfo(msg);
                  return `<button type="button" class="warning-chip" data-action="focus-warning" data-target="${esc(info.target)}">${esc(msg)}</button>`;
                }).join('')}
              </div>
            </details>
          ` : ''}

          ${answerEditor(item.answers, counts, reviewItems, currentExam?.answerKey)}

          <div class="sticky-action-bar">
            <label class="check-inline">
              <input type="checkbox" name="reviewed" ${item.reviewed ? 'checked' : ''}>
              <span>Đã đối chiếu</span>
            </label>
            <div class="sticky-buttons">
              <button class="button danger sm" type="button" data-action="delete-submission" data-id="${esc(item.id)}">Xóa</button>
              <button class="button secondary sm" type="submit" name="action" value="save">Lưu nháp</button>
              <button class="button secondary sm" type="submit" name="action" value="regrade">Chấm lại</button>
              <button class="button sm" type="submit" name="action" value="finalize-next">${icon('mark')}Chốt & Tiếp</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  `;
}

function mcRowMarkup(prefix, index, value, label, hasWarning = false, keyVal = undefined) {
  const val = value || '';
  const hasKey = keyVal !== undefined && keyVal !== null && keyVal !== '';
  return `
    <div class="mc-row ${hasWarning ? 'has-warning' : ''}" data-question-target="${prefix}-${index}">
      <span class="q-num">${esc(label)}</span>
      <input type="hidden" id="${prefix}-${index}" name="${prefix}-${index}" value="${esc(val)}" ${hasKey ? `data-key="${esc(keyVal)}"` : ''}>
      <div class="choice-group" role="group" aria-label="${esc(label)}">
        ${['A', 'B', 'C', 'D'].map(opt => {
          const pressed = val === opt;
          const cls = hasKey ? (pressed ? (opt === keyVal ? 'is-correct' : 'is-wrong') : (opt === keyVal ? 'is-key-hint' : '')) : '';
          return `<button type="button" class="choice-btn ${cls}" data-action="pick-choice" data-target="${prefix}-${index}" data-value="${opt}" aria-pressed="${pressed}">${opt}</button>`;
        }).join('')}
      </div>
    </div>
  `;
}

function tfCardMarkup(prefix, qIndex, values, warningSet = new Set(), keyValues = undefined) {
  const subs = ['a', 'b', 'c', 'd'].map((letter, j) => {
    const idx = qIndex * 4 + j;
    const raw = values?.[idx];
    const strVal = raw === true ? 'true' : raw === false ? 'false' : '';
    const keyRaw = keyValues?.[idx];
    const hasKey = typeof keyRaw === 'boolean';
    const keyStr = hasKey ? String(keyRaw) : '';
    const hasWarn = warningSet.has(`${prefix}-${idx}`);
    const clsTrue = hasKey ? (strVal === 'true' ? (keyStr === 'true' ? 'is-correct' : 'is-wrong') : (keyStr === 'true' ? 'is-key-hint' : '')) : '';
    const clsFalse = hasKey ? (strVal === 'false' ? (keyStr === 'false' ? 'is-correct' : 'is-wrong') : (keyStr === 'false' ? 'is-key-hint' : '')) : '';
    return `
      <div class="tf-subrow ${hasWarn ? 'has-warning' : ''}" data-question-target="${prefix}-${idx}">
        <span class="tf-label">Ý ${letter})</span>
        <input type="hidden" id="${prefix}-${idx}" name="${prefix}-${idx}" value="${strVal}" ${hasKey ? `data-key="${keyStr}"` : ''}>
        <div class="choice-group" role="group" aria-label="Câu ${qIndex + 1} ý ${letter}">
          <button type="button" class="choice-btn ${clsTrue}" data-action="pick-choice" data-target="${prefix}-${idx}" data-value="true" aria-pressed="${strVal === 'true'}">Đ</button>
          <button type="button" class="choice-btn ${clsFalse}" data-action="pick-choice" data-target="${prefix}-${idx}" data-value="false" aria-pressed="${strVal === 'false'}">S</button>
        </div>
      </div>
    `;
  }).join('');
  return `<div class="tf-card"><div class="tf-card-head"><span class="tf-q-num">Câu ${qIndex + 1}</span></div><div class="tf-subrows">${subs}</div></div>`;
}

function answerEditor(answers, counts = { multipleChoice: 40, trueFalse: 8, numeric: 6 }, reviewItems = [], answerKey = null) {
  const warningTargets = new Set(reviewItems.map(m => warningTargetInfo(m).target).filter(Boolean));
  const mc = Array.from({ length: counts.multipleChoice }, (_, i) => mcRowMarkup('mc', i, answers.multipleChoice?.[i], `Câu ${String(i + 1).padStart(2, '0')}`, warningTargets.has(`mc-${i}`), answerKey?.multipleChoice?.[i])).join('');
  const tf = Array.from({ length: counts.trueFalse }, (_, q) => tfCardMarkup('tf', q, answers.trueFalse, warningTargets, answerKey?.trueFalse)).join('');
  const numeric = Array.from({ length: counts.numeric }, (_, i) => {
    const val = answers.numeric?.[i] || '';
    const keyVal = answerKey?.numeric?.[i];
    const hasKey = keyVal !== undefined && keyVal !== null && String(keyVal).trim() !== '';
    const cVal = canonicalDecimal(val), cKey = canonicalDecimal(keyVal);
    const numCls = hasKey && String(val).trim() ? (cVal !== null && cVal === cKey ? 'is-correct' : 'is-wrong') : '';
    return `
      <div class="numeric-card ${warningTargets.has(`num-${i}`) ? 'has-warning' : ''}" data-question-target="num-${i}">
        <label for="num-${i}">Câu ${i + 1}</label>
        <input id="num-${i}" class="numeric-input ${numCls}" name="num-${i}" inputmode="decimal" autocomplete="off" value="${esc(val)}" ${hasKey ? `data-key="${esc(keyVal)}"` : ''} placeholder="—">
        ${hasKey ? `<span class="numeric-key-hint">Đáp án: ${esc(keyVal)}</span>` : ''}
      </div>
    `;
  }).join('');

  return `
    <details class="card answer-card" open><summary>Phần I · ${counts.multipleChoice} câu A–D</summary><div class="mc-list">${mc}</div></details>
    <details class="card answer-card" open><summary>Phần II · ${counts.trueFalse} câu Đúng / Sai</summary><div class="tf-list">${tf}</div></details>
    <details class="card answer-card" open><summary>Phần III · ${counts.numeric} câu trả lời ngắn</summary><div class="numeric-list">${numeric}</div></details>
  `;
}

function defaultKey() { return { multipleChoice: Array(40).fill(''), trueFalse: Array(32).fill(null), numeric: Array(6).fill('') }; }

function keyInputs(key, counts = { multipleChoice: 40, trueFalse: 8, numeric: 6 }) {
  const choices = Array.from({ length: counts.multipleChoice }, (_, i) => mcRowMarkup('key-mc', i, key.multipleChoice?.[i], `Câu ${String(i + 1).padStart(2, '0')}`)).join('');
  const tf = Array.from({ length: counts.trueFalse }, (_, q) => tfCardMarkup('key-tf', q, key.trueFalse)).join('');
  const numeric = Array.from({ length: counts.numeric }, (_, i) => `
    <div class="numeric-card">
      <label for="key-num-${i}">Câu ${i + 1}</label>
      <input id="key-num-${i}" class="numeric-input" name="key-num-${i}" inputmode="decimal" value="${esc(key.numeric?.[i] ?? '')}" placeholder="-1,25">
    </div>
  `).join('');
  return `
    <details class="card answer-card" open><summary>Phần I · ${counts.multipleChoice} câu A–D</summary><div class="mc-list">${choices}</div></details>
    <details class="card answer-card"><summary>Phần II · ${counts.trueFalse} câu Đúng / Sai</summary><div class="tf-list">${tf}</div></details>
    <details class="card answer-card"><summary>Phần III · ${counts.numeric} câu số</summary><div class="numeric-list">${numeric}</div></details>
  `;
}

function syncPickerButtons(container) {
  if (!container) return;
  container.querySelectorAll('.choice-btn[data-target]').forEach(btn => {
    const input = container.querySelector(`#${CSS.escape(btn.dataset.target)}`);
    if (!input) return;
    const pressed = input.value === btn.dataset.value;
    btn.setAttribute('aria-pressed', String(pressed));
    const keyVal = input.dataset.key;
    btn.classList.remove('is-correct', 'is-wrong', 'is-key-hint');
    if (keyVal !== undefined && keyVal !== '') {
      if (pressed) btn.classList.add(btn.dataset.value === keyVal ? 'is-correct' : 'is-wrong');
      else if (btn.dataset.value === keyVal) btn.classList.add('is-key-hint');
    }
  });
}

function dialogShell(title, body, buttons, formId) {
  const submit = `<button class="button" type="submit" ${formId ? `form="${esc(formId)}"` : ''}>Lưu</button>`;
  const actions = buttons || `<button class="button secondary" type="button" data-action="close-dialog">Hủy</button>${submit}`;
  return `<dialog id="dialog"><div class="dialog-head"><div><p class="eyebrow">QM Chấm · Lưu cục bộ</p><h2>${esc(title)}</h2></div><button class="icon-button" type="button" data-action="close-dialog" aria-label="Đóng">×</button></div><div class="dialog-body">${body}<div id="dialog-feedback" class="notice warning" role="alert" hidden></div></div><div class="dialog-foot">${actions}</div></dialog>`;
}

function showDialog(title, body, formId, buttons) {
  state.modal = { title, body, formId, buttons };
  root.insertAdjacentHTML('beforeend', dialogShell(title, body, buttons, formId));
  const dialog = root.querySelector('#dialog');
  dialog.addEventListener('click', event => { if (event.target === dialog) closeDialog(); });
  dialog.addEventListener('close', () => {
    if (root.querySelector('#dialog') === dialog) {
      stopCamera(); state.modal = null; state.captureDraft = null; state.importDraft = null; state.examKeyVariants = null; state.activeExamCode = ''; dialog.remove();
    }
  });
  dialog.showModal();
}

function updateDialog(body) {
  const dialog = root.querySelector('#dialog'); if (!dialog) return;
  const open = dialog.open; dialog.querySelector('.dialog-body').innerHTML = body;
  if (open && !dialog.open) dialog.showModal();
}

function closeDialog() {
  stopCamera(); state.modal = null; state.captureDraft = null; state.importDraft = null; state.examKeyVariants = null; state.activeExamCode = '';
  root.querySelector('#dialog')?.close(); root.querySelector('#dialog')?.remove();
}

function setCameraStatus(message) {
  if (state.captureDraft) state.captureDraft.cameraStatus = message;
  const status = root.querySelector('#camera-status');
  if (status) { status.textContent = message; status.hidden = false; }
}

function stopCamera() {
  cameraSession++; clearTimeout(cameraTimer); cameraTimer = null;
  cameraStream?.getTracks().forEach(track => track.stop()); cameraStream = null; cameraBusy = false;
  disableCaptureFields(false);
  const video = root.querySelector('#scan-camera'); if (video) { video.pause(); video.srcObject = null; }
  const live = root.querySelector('#live-camera'); if (live) live.hidden = true;
  const start = root.querySelector('[data-action="start-camera"]'), stop = root.querySelector('[data-action="stop-camera"]');
  if (start) { start.hidden = false; start.disabled = false; }
  if (stop) stop.hidden = true;
  setCameraStatus(state.captureDraft?.cameraStable ? 'Đã quét ổn định. Điểm tạm tính đã hiện.' : 'Đã dừng camera. Quét lại để xác nhận.');
}

function disableCaptureFields(disabled) {
  root.querySelectorAll('#capture-form input:not([type="file"]), #capture-form select, #capture-form textarea, #capture-form .choice-btn').forEach(field => field.disabled = disabled);
}

async function newBatchDialog(scanAfterCreate = false) {
  const { exams } = await localState();
  if (!exams.length) { state.view = 'exams'; await render(); notify('Tạo đề thi trước khi mở đợt chấm.'); return; }
  const body = `<form id="batch-form" data-scan-after-create="${scanAfterCreate}"><div class="form-grid"><label class="field"><span>Tên lớp</span><input name="className" maxlength="48" required placeholder="Ví dụ: 12A1"></label><label class="field"><span>Đề thi</span><select name="examId" required>${exams.map(e => `<option value="${esc(e.id)}">${esc(e.name)} · Mã ${esc(e.code)}</option>`).join('')}</select></label></div><p class="helper" style="margin-top:10px">Mỗi lớp nhận tối đa 100 bài trong đợt này.</p></form>`;
  showDialog('Đợt chấm mới', body, 'batch-form');
}

function examDialog(exam) {
  state.examKeyVariants = exam ? [{ code: exam.code, key: exam.answerKey, questionCounts: exam.questionCounts }] : null;
  state.activeExamCode = exam?.code || '';
  const counts = exam?.questionCounts || { multipleChoice: 40, trueFalse: 8, numeric: 6 };
  const key = exam?.answerKey || defaultKey();
  const policy = exam?.policy || { multipleChoiceTotal: '', trueFalseTotal: '', numericTotal: '', sectionTwoRule: 'perStatement', multipleChoiceQuestionPoints: [], trueFalseQuestionPoints: [], numericQuestionPoints: [] };
  const hasAdvanced = policy.multipleChoiceQuestionPoints?.length || policy.trueFalseQuestionPoints?.length || policy.numericQuestionPoints?.length;

  const body = `
    <form id="exam-form" data-id="${esc(exam?.id || '')}" data-code="${esc(exam?.code || '')}">
      <div class="form-grid">
        <label class="field"><span>Tên đề</span><input name="name" required maxlength="80" value="${esc(exam?.name || '')}" placeholder="Ví dụ: Kiểm tra giữa kỳ 1"></label>
        <label class="field"><span>Mã đề (4 số)</span><input name="examCodeInput" inputmode="numeric" maxlength="4" value="${esc(exam?.code || '')}" placeholder="Ví dụ: 1101" ${exam ? 'disabled' : ''}></label>
        <label class="field full">
          <span>Đọc đáp án và mã đề từ tệp (.xlsx, .docx, .pdf)</span>
          <input name="keyFile" type="file" accept=".xlsx,.docx,.pdf">
          <small>Tệp có thể chứa nhiều cột mã đề; app tự tách từng đề theo mã trong tệp.</small>
        </label>
      </div>
      <div id="key-import-preview" class="helper" role="status" style="margin-top:8px"></div>

      <div class="preset-bar">
        <span>Thang điểm nhanh (Tổng 10 điểm)</span>
        <button type="button" class="button sm" data-action="apply-thpt-2025">Áp dụng thang điểm chuẩn THPT 2025</button>
      </div>

      <div class="form-grid" style="margin-top:12px">
        <label class="field"><span>Tổng điểm Phần I</span><input name="multipleChoiceTotal" type="text" inputmode="decimal" pattern="[0-9]+([.,][0-9]{1,2})?" required value="${esc(policy.multipleChoiceTotal)}"></label>
        <label class="field"><span>Tổng điểm Phần II</span><input name="trueFalseTotal" type="text" inputmode="decimal" pattern="[0-9]+([.,][0-9]{1,2})?" required value="${esc(policy.trueFalseTotal)}"></label>
        <label class="field"><span>Tổng điểm Phần III</span><input name="numericTotal" type="text" inputmode="decimal" pattern="[0-9]+([.,][0-9]{1,2})?" required value="${esc(policy.numericTotal)}"></label>
        <label class="field"><span>Cách chấm Phần II</span><select name="sectionTwoRule"><option value="perStatement" ${policy.sectionTwoRule === 'perStatement' ? 'selected' : ''}>Tính điểm từng ý</option><option value="allOrNothing" ${policy.sectionTwoRule === 'allOrNothing' ? 'selected' : ''}>Đúng đủ 4 ý mới tính điểm câu</option></select></label>
      </div>

      <details class="advanced-weights" ${hasAdvanced ? 'open' : ''}>
        <summary>Tùy chọn nâng cao: Điểm riêng từng câu</summary>
        <div class="form-grid">
          <label class="field full"><span>Phần I · điểm từng câu (cách nhau bởi dấu ;)</span><input name="weightsMC" value="${esc(policy.multipleChoiceQuestionPoints?.join('; ') || '')}" placeholder="Bỏ trống để chia đều từ tổng điểm"></label>
          <label class="field full"><span>Phần II · điểm từng câu</span><input name="weightsTF" value="${esc(policy.trueFalseQuestionPoints?.join('; ') || '')}" placeholder="Bỏ trống để chia đều từ tổng điểm"></label>
          <label class="field full"><span>Phần III · điểm từng câu</span><input name="weightsNumeric" value="${esc(policy.numericQuestionPoints?.join('; ') || '')}" placeholder="Bỏ trống để chia đều từ tổng điểm"></label>
        </div>
      </details>

      <div class="section-heading"><div><p class="eyebrow">Chạm trực tiếp để chọn đáp án</p><h2>Khóa đáp án</h2></div></div>
      <div id="exam-key-inputs" class="stack">${keyInputs(key, counts)}</div>
    </form>
  `;
  showDialog(exam ? 'Sửa đề thi' : 'Tạo đề thi', body, 'exam-form');
}

function captureDialog(batch, data) {
  const exam = data.exams.find(e => e.id === batch.examId);
  const draft = { batchId: batch.id, examId: batch.examId, className: batch.className, seatNumber: '', examCode: exam?.code || '', expectedExamCode: exam?.code || '', questionCounts: exam?.questionCounts || { multipleChoice: 40, trueFalse: 8, numeric: 6 }, firstPage: null, secondPage: null, scanResult: null, examKey: exam?.answerKey || {}, policy: exam ? policyFor(exam) : {}, photoNames: {}, studentName: '', confirmed: false };
  state.captureDraft = draft;
  captureDialogContent(draft, data);
}

function syncCaptureExam(draft, exams, targetExam) {
  if (!targetExam) return;
  draft.examId = targetExam.id;
  draft.expectedExamCode = targetExam.code;
  draft.questionCounts = targetExam.questionCounts || { multipleChoice: 40, trueFalse: 8, numeric: 6 };
  draft.examKey = targetExam.answerKey || {};
  draft.policy = policyFor(targetExam);
  if (draft.scanResult) {
    filterUnusedWarnings(draft.scanResult.answers, draft.questionCounts);
    draft.score = scoreFor(targetExam, draft.scanResult.answers);
  }
}

function captureDialogContent(draft, data) {
  const exam = data.exams.find(e => e.id === draft.examId), matches = data.roster.filter(x => x.className === draft.className && x.seatNumber === draft.seatNumber);
  const warning = matches.length > 1 ? `<div class="notice warning"><span>!</span><div><strong>SBD trùng trong ${esc(draft.className)}</strong><p>Sửa danh sách lớp trước khi ghép tên. Bài vẫn lưu để rà soát.</p></div></div>` : draft.seatNumber && matches.length === 0 ? `<div class="notice warning"><span>!</span><div><strong>Chưa có SBD này trong lớp</strong><p>Tên sẽ để trống. Có thể ghép sau trong danh sách lớp.</p></div></div>` : draft.examCode && draft.expectedExamCode && draft.examCode !== draft.expectedExamCode ? `<div class="notice warning"><span>!</span><div><strong>Mã đọc được ${esc(draft.examCode)} khác mã đề đã chọn ${esc(draft.expectedExamCode)}</strong><p>Đối chiếu mã đề trước khi lưu điểm.</p></div></div>` : '';
  const result = captureResultMarkup(draft);
  const scanner = `<div class="camera-actions"><button class="button secondary" type="button" data-action="start-camera" ${cameraStream ? 'hidden' : ''}>Quét tự động bằng camera</button><button class="button quiet" type="button" data-action="stop-camera" ${cameraStream ? '' : 'hidden'}>Dừng camera</button></div><div id="live-camera" class="live-camera" ${cameraStream ? '' : 'hidden'}><video id="scan-camera" autoplay muted playsinline aria-label="Khung quét phiếu"></video><span class="camera-frame" aria-hidden="true"></span></div><p id="camera-status" class="helper" role="status" ${cameraStream || draft.cameraStatus ? '' : 'hidden'}>${esc(draft.cameraStatus || 'Đưa đủ bốn mốc đen trang 1 vào khung, giữ yên để app tự quét.')}</p>`;
  const uploadStatus = draft.uploadStatus ? `<div class="notice ${draft.uploadError ? 'error' : ''}" role="status"><span>${draft.uploadError ? '!' : 'i'}</span><div>${esc(draft.uploadStatus)}</div></div>` : '';
  const body = `<form id="capture-form"><input type="hidden" name="batchId" value="${esc(draft.batchId)}"><div class="form-grid"><label class="field full"><span>Đề thi</span><select name="captureExamId" data-action="select-capture-exam">${data.exams.map(e => `<option value="${esc(e.id)}" ${e.id === draft.examId ? 'selected' : ''}>${esc(e.name)} · Mã ${esc(e.code)}</option>`).join('')}</select></label><label class="field"><span>Số báo danh · 8 số</span><input name="seatNumber" inputmode="numeric" maxlength="8" value="${esc(draft.seatNumber)}" placeholder="Đọc tự động từ phiếu"></label><label class="field"><span>Mã đề · 4 số</span><input name="examCode" inputmode="numeric" maxlength="4" value="${esc(draft.examCode)}"></label></div>${scanner}${warning}<div id="capture-result">${result}</div>${uploadStatus}<div class="capture-pair">${captureSlot(1, draft.scanPage || draft.firstPage)}</div><label class="field"><span>Nhập phiếu PDF thay vì chụp</span><input type="file" data-pdf accept="application/pdf,.pdf"><small>Đọc trang đầu trên thiết bị. PDF scan cần đúng mẫu và ảnh rõ mốc căn chỉnh.</small></label><details class="card answer-card" ${draft.scanResult ? '' : 'open'}><summary>${draft.scanResult ? 'Sửa đáp án trước khi lưu' : 'Nhập đáp án thủ công'}</summary><div class="stack" style="margin-top:12px">${answerEditor(draft.scanResult?.answers || emptyAnswers(), draft.questionCounts, draft.scanResult?.answers?.reviewItems || [], exam?.answerKey)}</div></details><p class="helper" style="margin-top:10px">${esc(exam?.name || '')} · Mã ${esc(exam?.code || '')} · ảnh phiếu lưu cục bộ trên thiết bị.</p></form>`;
  const canSave = draft.scanResult && (!draft.cameraUsed || draft.cameraStable || draft.cameraAccepted), buttons = `<button class="button secondary" type="button" data-action="close-dialog">Hủy</button>${!draft.scanResult ? '<button class="button quiet" type="button" data-action="manual-entry">Nhập tay</button>' : ''}<button class="button" type="submit" form="capture-form" ${canSave ? '' : 'disabled'}>Lưu bài chấm</button>`;
  if (state.modal) { state.modal.body = body; state.modal.buttons = buttons; updateDialog(body); const foot = root.querySelector('.dialog-foot'); if (foot) foot.innerHTML = buttons; }
  else showDialog('Quét phiếu', body, 'capture-form', buttons);
}

function captureResultMarkup(draft) {
  if (!draft.scanResult) return '';
  const score = draft.score || {}, review = [...(draft.scanResult.answers.reviewItems || [])], ready = draft.cameraStable || draft.cameraAccepted || !draft.cameraUsed;
  if (draft.cameraAccepted && !draft.cameraStable) review.push('Chỉ nhận dạng được một khung hình; kiểm tra kỹ');
  return `<div class="score-strip">${[['Phần I', score.multipleChoiceEarned, score.multipleChoicePossible, false], ['Phần II', score.trueFalseEarned, score.trueFalsePossible, false], ['Phần III', score.numericEarned, score.numericPossible, false], ['Tổng', score.totalEarned, score.totalPossible, true]].map(([name, earned, total, isTotal]) => `<div class="score-chip ${isTotal ? 'total' : ''}"><span>${name}</span><strong>${fmt(earned)} <small>/ ${fmt(total)}</small></strong></div>`).join('')}</div><div class="notice ${review.length || !ready ? 'warning' : ''}"><span>${review.length || !ready ? '!' : '✓'}</span><div><strong>${!ready ? 'Điểm tạm tính · đang xác nhận' : review.length ? `${review.length} mục cần nhìn lại` : 'Phiếu đã nhận dạng'}</strong><p>${ready ? 'Kiểm tra ô được đánh dấu trước khi lưu. Bạn có thể sửa đáp án.' : 'Giữ phiếu yên để app xác nhận rồi chốt điểm.'}</p>${review.length ? `<ul class="warning-list">${review.slice(0, 8).map(x => `<li>${esc(x)}</li>`).join('')}${review.length > 8 ? `<li>… còn ${review.length - 8} mục</li>` : ''}</ul>` : ''}</div></div>`;
}

function captureSlot(number, blob) { return `<label class="capture-slot"><strong>Phiếu trả lời · đáp án và SBD</strong><input type="file" data-photo="1" accept="image/*" capture="environment"><small class="helper">Chụp trọn trang, đặt bốn ô đen ở bốn góc trong khung hình.</small>${blob ? `<img alt="Ảnh phiếu" src="${photoURL(blob)}">` : ''}</label>`; }

async function imageBlob(file) {
  if (file.size > 50 * 1024 * 1024) throw new Error('Ảnh tối đa 50 MB.');
  const source = await imageSource(file), bitmap = source.bitmap;
  const maxSide = 2700, ratio = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas'); canvas.width = Math.round(bitmap.width * ratio); canvas.height = Math.round(bitmap.height * ratio);
  const context = canvas.getContext('2d', { alpha: false }); context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); source.close();
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Không giữ được ảnh trên thiết bị.')), 'image/jpeg', 0.9));
}

async function imageSource(file) {
  try { if (typeof createImageBitmap !== 'function') throw new Error(); const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }); return { bitmap, close: () => bitmap.close() }; }
  catch { const image = new Image(), url = URL.createObjectURL(file); try { await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('Định dạng ảnh này không được trình duyệt hỗ trợ. Hãy chọn JPG hoặc PNG.')); image.src = url; }); return { bitmap: image, close: () => URL.revokeObjectURL(url) }; } catch (error) { URL.revokeObjectURL(url); throw error; } }
}

async function rasterize(bitmap, rotation, scale = FORM.scale) {
  const width = FORM.pageWidth * scale, height = FORM.pageHeight * scale, canvas = document.createElement('canvas'), landscape = rotation % 2 === 1;
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true }); context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
  const drawWidth = landscape ? height : width, drawHeight = landscape ? width : height;
  context.translate(width / 2, height / 2); context.rotate(rotation * Math.PI / 2); context.drawImage(bitmap, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
  const rgba = context.getImageData(0, 0, width, height).data, gray = new Uint8Array(width * height);
  for (let i = 0, j = 0; i < gray.length; i++, j += 4)gray[i] = Math.round(.299 * rgba[j] + .587 * rgba[j + 1] + .114 * rgba[j + 2]);
  return { gray, width, height };
}

async function scanPhoto(blob, scale = FORM.scale, counts = state.captureDraft?.questionCounts) {
  const source = await imageSource(blob), bitmap = source.bitmap;
  let result = null;
  try {
    for (let rotation = 0; rotation < 4; rotation++) {
      const raster = await rasterize(bitmap, rotation, scale), candidate = scanForm(raster.gray, raster.width, raster.height, scale);
      if (!candidate.answers.reviewItems.includes('Không nhận diện được phiếu hoặc mốc căn chỉnh') && !candidate.answers.reviewItems.includes('Tỷ lệ ảnh khác mẫu QM 2025')) {
        candidate.rotation = rotation;
        result = candidate;
        break;
      }
    }
  } finally { source.close(); }
  if (!result) result = scanForm(new Uint8Array(), 0, 0, scale);
  filterUnusedWarnings(result.answers, counts);
  return result;
}

function cameraFrame(video) {
  if (!video.videoWidth || !video.videoHeight) return Promise.resolve(null);
  const ratio = FORM.pageWidth / FORM.pageHeight, sourceRatio = video.videoWidth / video.videoHeight;
  const width = Math.round(sourceRatio > ratio ? video.videoHeight * ratio : video.videoWidth), height = Math.round(sourceRatio > ratio ? video.videoHeight : video.videoWidth / ratio), x = Math.round((video.videoWidth - width) / 2), y = Math.round((video.videoHeight - height) / 2), canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height; canvas.getContext('2d', { alpha: false }).drawImage(video, x, y, width, height, 0, 0, width, height);
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
}

async function scanCameraFrame(video, stable = { signature: '', count: 0 }, session = cameraSession) {
  if (!cameraStream || session !== cameraSession) return;
  if (cameraBusy || video.readyState < 2) { cameraTimer = setTimeout(() => scanCameraFrame(video, stable, session), 350); return; }
  cameraBusy = true;
  try {
    const photo = await cameraFrame(video); if (!photo) throw new Error('Đang mở camera.');
    const bitmap = await createImageBitmap(photo);
    let scan = null, mismatchCode = '';
    try {
      for (const rotation of [0, 2, 1, 3]) {
        const quick = await rasterize(bitmap, rotation, 1);
        if (!hasFormMarkers(quick.gray, quick.width, quick.height, 1)) continue;
        const full = await rasterize(bitmap, rotation);
        const candidate = scanForm(full.gray, full.width, full.height); filterUnusedWarnings(candidate.answers, state.captureDraft?.questionCounts);
        const identityDigits = (candidate.seatNumber + candidate.examCode).replace(/\?/g, '').length, markedAnswers = candidate.answers.multipleChoice.filter(Boolean).length + candidate.answers.trueFalse.filter(value => value !== null).length + candidate.answers.numeric.filter(Boolean).length;
        if (identityDigits || markedAnswers) { scan = candidate; if (/^\d{4}$/.test(candidate.examCode) && candidate.examCode !== state.captureDraft?.expectedExamCode) mismatchCode = candidate.examCode; break; }
      }
    } finally { bitmap.close(); }
    if (session !== cameraSession) return;
    if (scan) {
      const signature = scanSignature(scan); stable.count = signature === stable.signature ? stable.count + 1 : 1; stable.signature = signature;
      const draft = state.captureDraft; if (!draft) return;
      draft.firstPage = photo; draft.scanPage = photo; draft.scanResult = scan; draft.score = gradeSubmission(draft.examKey || {}, scan.answers, draft.policy || {}); draft.seatNumber = scan.seatNumber; draft.examCode = scan.examCode; draft.cameraUsed = true; draft.cameraStable = stable.count >= 2;
      const form = root.querySelector('#capture-form');
      if (form) {
        form.elements.seatNumber.value = scan.seatNumber;
        form.elements.examCode.value = scan.examCode;
        for (let i = 0; i < 40; i++) if (form.elements[`mc-${i}`]) form.elements[`mc-${i}`].value = scan.answers.multipleChoice[i] || '';
        for (let i = 0; i < 32; i++) if (form.elements[`tf-${i}`]) form.elements[`tf-${i}`].value = scan.answers.trueFalse[i] == null ? '' : String(scan.answers.trueFalse[i]);
        for (let i = 0; i < 6; i++) if (form.elements[`num-${i}`]) form.elements[`num-${i}`].value = scan.answers.numeric[i] || '';
        syncPickerButtons(form);
      }
      const result = root.querySelector('#capture-result'); if (result) result.innerHTML = captureResultMarkup(draft);
      const saveBtn = root.querySelector('button[type="submit"][form="capture-form"]'); if (saveBtn) saveBtn.disabled = stable.count < 2;
      setCameraStatus(stable.count > 1 ? (mismatchCode ? 'Đã đọc phiếu. Mã đề khác đề đã chọn; kiểm tra trước khi lưu.' : 'Đã nhận phiếu ổn định. Kiểm tra các ô cảnh báo trước khi lưu.') : 'Đã đọc phiếu. Điểm tạm hiện; giữ phiếu yên.');
      if (stable.count >= 2) {
        draft.manual = false;
        const data = await localState(), exam = data.exams.find(x => x.code === scan.examCode) || data.exams.find(x => x.id === draft.examId);
        draft.seatNumber = scan.seatNumber; draft.examCode = scan.examCode;
        syncCaptureExam(draft, data.exams, exam);
        stopCamera(); captureDialogContent(draft, data); notify('Đã tự quét phiếu. Điểm tạm tính đã hiện.'); return;
      }
    } else {
      stable.signature = ''; stable.count = 0;
      const draft = state.captureDraft; draft.cameraStable = false; draft.cameraUsed = true; draft.scanResult = null; draft.score = null;
      const result = root.querySelector('#capture-result'); if (result) result.innerHTML = '';
      const saveBtn = root.querySelector('button[type="submit"][form="capture-form"]'); if (saveBtn) saveBtn.disabled = true;
      setCameraStatus(mismatchCode ? `Mã phiếu ${mismatchCode} khác mã đề đã chọn (${draft.expectedExamCode}).` : 'Đưa đủ bốn mốc đen vào khung, rồi giữ phiếu yên.');
    }
  } catch (error) { setCameraStatus(error.message || 'Không đọc được khung hình. Căn lại phiếu.'); }
  finally { if (session === cameraSession) cameraBusy = false; }
  if (cameraStream && session === cameraSession) cameraTimer = setTimeout(() => scanCameraFrame(video, stable, session), 350);
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Trình duyệt không hỗ trợ camera trực tiếp. Dùng nút chọn ảnh bên dưới.');
  const start = root.querySelector('[data-action="start-camera"]'); if (start) start.disabled = true;
  const session = ++cameraSession; let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 2560 } }, audio: false });
    if (session !== cameraSession) { stream.getTracks().forEach(track => track.stop()); return; }
    cameraStream = stream;
    const draft = state.captureDraft; if (!draft) { stopCamera(); return; }
    draft.cameraUsed = true; draft.cameraStable = false; draft.cameraAccepted = false;
    disableCaptureFields(true);
    const live = root.querySelector('#live-camera'), startBtn = root.querySelector('[data-action="start-camera"]'), stop = root.querySelector('[data-action="stop-camera"]'), status = root.querySelector('#camera-status');
    if (live) live.hidden = false; if (startBtn) startBtn.hidden = true; if (stop) stop.hidden = false; if (status) status.hidden = false;
    const result = root.querySelector('#capture-result'); if (result) result.innerHTML = captureResultMarkup(draft);
    const saveBtn = root.querySelector('button[type="submit"][form="capture-form"]'); if (saveBtn) saveBtn.disabled = true;
    setCameraStatus('Đang tìm phiếu. Đưa đủ bốn mốc vào khung.');
    const video = root.querySelector('#scan-camera'); if (!video) throw new Error('Không mở được khung camera.');
    video.srcObject = stream; await video.play(); if (session !== cameraSession) return;
    scanCameraFrame(video, { signature: '', count: 0 }, session);
  } catch (error) {
    if (session === cameraSession) stopCamera();
    const message = error.name === 'NotAllowedError' ? 'Trình duyệt chưa được cấp quyền camera. Bật quyền Camera rồi thử lại.' : error.name === 'NotFoundError' ? 'Không tìm thấy camera trên thiết bị.' : 'Không mở được camera. Dùng HTTPS hoặc chọn ảnh bên dưới.';
    setCameraStatus(message);
    throw new Error(message);
  }
}

function answersFromForm(form) {
  const fields = new FormData(form), answers = emptyAnswers();
  for (let i = 0; i < 40; i++) answers.multipleChoice[i] = fields.get(`mc-${i}`) || null;
  for (let i = 0; i < 32; i++) { const value = fields.get(`tf-${i}`); answers.trueFalse[i] = value == null || value === '' ? null : value === 'true'; }
  for (let i = 0; i < 6; i++) answers.numeric[i] = fields.get(`num-${i}`)?.trim() || null;
  return answers;
}

function keyFromForm(form) {
  const f = new FormData(form);
  const multipleChoice = Array.from({ length: 40 }, (_, i) => f.get(`key-mc-${i}`) || '');
  const trueFalse = Array.from({ length: 32 }, (_, i) => { const v = f.get(`key-tf-${i}`); return v == null || v === '' ? null : v === 'true'; });
  const numeric = Array.from({ length: 6 }, (_, i) => f.get(`key-num-${i}`)?.trim() || '');
  return { multipleChoice, trueFalse, numeric };
}

function fillKeyForm(form, key) {
  for (let i = 0; i < 40; i++) { const field = form.elements[`key-mc-${i}`]; if (field) field.value = key.multipleChoice?.[i] || ''; }
  for (let i = 0; i < 32; i++) { const field = form.elements[`key-tf-${i}`]; if (field) field.value = key.trueFalse?.[i] == null ? '' : String(key.trueFalse[i]); }
  for (let i = 0; i < 6; i++) { const field = form.elements[`key-num-${i}`]; if (field) field.value = key.numeric?.[i] || ''; }
  syncPickerButtons(form);
}

function keyCounts(key) { return [key.multipleChoice.filter(Boolean).length, key.trueFalse.filter(value => value !== null).length, key.numeric.filter(Boolean).length]; }
function parseWeights(value, count, label) {
  if (!value.trim()) return [];
  const parts = value.split(/[;\s]+/).filter(Boolean), numbers = parts.map(x => Number(x.replace(',', '.')));
  if (parts.length !== count || numbers.some(x => !Number.isFinite(x) || x < 0)) throw new Error(`${label}: nhập ${count} số không âm, ngăn cách bằng dấu chấm phẩy.`);
  return numbers;
}
function parseTotal(value, label) { const text = String(value).trim().replace(',', '.'); if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error(`${label}: nhập số điểm không âm, tối đa 2 chữ số thập phân.`); return Number(text); }
function filterUnusedWarnings(answers, counts = { multipleChoice: 40, trueFalse: 8, numeric: 6 }) { answers.reviewItems = answers.reviewItems.filter(message => { const match = message.match(/^(I|II|III)-(\d+)/); if (!match) return true; const limit = match[1] === 'I' ? counts.multipleChoice : match[1] === 'II' ? counts.trueFalse : counts.numeric; return Number(match[2]) <= limit; }); }
function addBlankWarnings(answers, key) {
  const warnings = new Set(answers.reviewItems);
  answers.multipleChoice.forEach((value, i) => { if (key?.multipleChoice?.[i] && !value) warnings.add(`I-${i + 1}: bỏ trống`); });
  answers.trueFalse.forEach((value, i) => { if (key?.trueFalse?.[i] != null && value == null) warnings.add(`II-${Math.floor(i / 4) + 1}${'abcd'[i % 4]}: bỏ trống`); });
  answers.numeric.forEach((value, i) => { if (key?.numeric?.[i] && !String(value ?? '').trim()) warnings.add(`III-${i + 1}: bỏ trống`); else if (String(value ?? '').trim() && !/^-?\d+(?:[.,]\d+)?$/.test(String(value).trim())) throw new Error(`Phần III, câu ${i + 1}: nhập số hợp lệ.`); });
  answers.reviewItems = [...warnings];
}
function hasRecognizedMarks(scan) { const answers = scan?.answers; return !!answers && (answers.multipleChoice.some(Boolean) || answers.trueFalse.some(value => value !== null) || answers.numeric.some(Boolean)); }

function applyViewerTransform() {
  const stage = root.querySelector('#viewer-stage');
  const label = root.querySelector('#viewer-zoom-label');
  if (stage) stage.style.transform = `translate(${state.viewer.panX}px, ${state.viewer.panY}px) scale(${state.viewer.zoom}) rotate(${state.viewer.rotate}deg)`;
  if (label) label.textContent = `${Math.round(state.viewer.zoom * 100)}%`;
}

async function handleSubmit(event) {
  const form = event.target; if (!(form instanceof HTMLFormElement)) return;
  if (!['batch-form', 'exam-form', 'capture-form', 'review-form', 'roster-form'].includes(form.id)) return;
  event.preventDefault();
  try {
    const f = new FormData(form);
    if (form.id === 'batch-form') {
      const className = String(f.get('className')).trim(), examId = String(f.get('examId'));
      if (!className || !examId) throw new Error('Nhập lớp và chọn đề thi.');
      const exam = (await all('exams')).find(x => x.id === examId); if (!exam) throw new Error('Đề thi không còn tồn tại.');
      const batch = { id: crypto.randomUUID(), className, examId, examName: exam.name, createdAt: Date.now() };
      await save('batches', batch); closeDialog(); state.batchId = batch.id; state.view = 'batch-detail'; await render();
      if (form.dataset.scanAfterCreate === 'true') captureDialog(batch, await localState()); else notify('Đã tạo đợt chấm.');
    }
    if (form.id === 'exam-form') {
      const key = keyFromForm(form), name = String(f.get('name')).trim(), existingExams = await all('exams'), existing = existingExams.find(x => x.id === form.dataset.id);
      if (!name) throw new Error('Tên đề bắt buộc.');
      const manualCode = String(f.get('examCodeInput') || '').trim();
      const variants = state.examKeyVariants?.length ? state.examKeyVariants.map(variant => ({ ...variant, key: variant.code === state.activeExamCode ? key : variant.key })) : existing ? [{ code: existing.code, key }] : /^\d{4}$/.test(manualCode) ? [{ code: manualCode, key }] : [];
      if (!variants.length) throw new Error('Nhập mã đề (4 số) hoặc chọn tệp đáp án có mã đề để tạo đề.');
      if (variants.some(variant => !/^\d{4}$/.test(variant.code) || variant.key.multipleChoice.some(x => x && !['A', 'B', 'C', 'D'].includes(x)) || variant.key.trueFalse.some(x => x !== null && typeof x !== 'boolean') || variant.key.numeric.some(x => x && !/^-?\d+(?:[.,]\d+)?$/.test(x)))) throw new Error('Kiểm tra mã đề và đáp án A–D, Đúng/Sai, số thập phân trong tệp.');
      const pointsFor = variants[0].questionCounts || existing?.questionCounts || { multipleChoice: 40, trueFalse: 8, numeric: 6 };
      const policy = {
        multipleChoiceTotal: parseTotal(f.get('multipleChoiceTotal'), 'Phần I'),
        trueFalseTotal: parseTotal(f.get('trueFalseTotal'), 'Phần II'),
        numericTotal: parseTotal(f.get('numericTotal'), 'Phần III'),
        sectionTwoRule: f.get('sectionTwoRule'),
        multipleChoiceQuestionPoints: parseWeights(String(f.get('weightsMC') || ''), pointsFor.multipleChoice, 'Phần I'),
        trueFalseQuestionPoints: parseWeights(String(f.get('weightsTF') || ''), pointsFor.trueFalse, 'Phần II'),
        numericQuestionPoints: parseWeights(String(f.get('weightsNumeric') || ''), pointsFor.numeric, 'Phần III')
      };
      const baseName = name.replace(/\s·\s\d{4}$/, ''), now = Date.now(), exams = variants.map(variant => {
        const examName = variants.length > 1 ? `${baseName} · ${variant.code}` : name;
        const previous = existingExams.find(x => x.code === variant.code) || (variants.length === 1 && existing?.code === variant.code ? existing : null);
        const counts = keyCounts(variant.key);
        return { id: previous?.id || crypto.randomUUID(), name: examName, code: variant.code, answerKey: variant.key, questionCounts: variant.questionCounts || previous?.questionCounts || { multipleChoice: counts[0], trueFalse: Math.ceil(counts[1] / 4), numeric: counts[2] }, policy, createdAt: previous?.createdAt || now, updatedAt: now };
      });
      if (exams.some(item => existingExams.some(old => old.id !== item.id && old.code === item.code))) throw new Error('Mã đề đã tồn tại với tên khác. Mở đề đó để cập nhật, tránh tạo bản trùng.');
      await saveMany('exams', exams); closeDialog(); state.view = 'exams'; await render(); notify(`Đã lưu ${exams.length} mã đề và đáp án.`);
    }
    if (form.id === 'capture-form') {
      const draft = state.captureDraft; if ((!draft?.firstPage && !draft?.manual) || !draft.scanResult) throw new Error('Chụp trang trước của phiếu rồi kiểm tra nhận dạng.');
      if (draft.cameraUsed && !draft.cameraStable && !draft.cameraAccepted) throw new Error('Giữ phiếu yên để camera xác nhận, hoặc dừng quét để rà thủ công.');
      const batch = (await all('batches')).find(x => x.id === draft.batchId), exam = (await all('exams')).find(x => x.id === draft.examId);
      if (!batch || !exam) throw new Error('Không còn đợt chấm hoặc đề thi.');
      const count = (await all('submissions')).filter(x => x.batchId === batch.id).length; if (count >= 100) throw new Error('Đợt chấm đã đủ 100 bài.');
      const answers = answersFromForm(form); answers.reviewItems = [...draft.scanResult.answers.reviewItems];
      const seat = String(f.get('seatNumber') || draft.scanResult.seatNumber).trim(), code = String(f.get('examCode') || draft.scanResult.examCode).trim();
      if (!/^\d{8}$/.test(seat) || !/^\d{4}$/.test(code)) throw new Error('SBD phải đủ 8 số, mã đề phải đủ 4 số. Sửa ô được đánh dấu trước khi lưu.');
      addBlankWarnings(answers, exam.answerKey);
      if (draft.manual) answers.reviewItems.push('Nhập tay: chưa lưu ảnh gốc');
      if (seat !== draft.scanResult.seatNumber) answers.reviewItems.push('SBD đã sửa sau khi nhận dạng');
      if (code !== draft.scanResult.examCode) answers.reviewItems.push('Mã đề đã sửa sau khi nhận dạng');
      if (!draft.firstPage) answers.reviewItems.push('Thiếu trang trước · chưa có ảnh gốc');
      const roster = (await all('roster')).filter(x => x.className === batch.className && x.seatNumber === seat);
      if (roster.length > 1) answers.reviewItems.push(`SBD ${seat}: trùng trong danh sách lớp`);
      if (!roster.length) answers.reviewItems.push(`SBD ${seat}: không khớp danh sách lớp`);
      if (code !== exam.code) answers.reviewItems.push(`Mã đề ${code}: khác mã đề đã chọn (${exam.code})`);
      const id = crypto.randomUUID(), submission = { id, batchId: batch.id, examId: exam.id, className: batch.className, seatNumber: seat || '????????', recognizedSeatNumber: draft.scanResult.seatNumber, studentName: roster.length === 1 ? roster[0].fullName : '', examCode: code || '????', recognizedExamCode: draft.scanResult.examCode, recognizedAnswers: draft.scanResult.answers, scanMeta: { profile: draft.scanResult.testProfile || 'qm', observed: draft.scanResult.observed || null, rotation: draft.scanResult.rotation || 0 }, answers, score: scoreFor(exam, answers), firstPageId: draft.firstPage ? `${id}-1` : null, secondPageId: draft.secondPage ? `${id}-2` : null, needsReview: answers.reviewItems.length > 0, reviewed: false, confirmed: false, createdAt: Date.now() };
      await savePaper(submission, draft.firstPage, draft.secondPage); closeDialog(); state.batchId = batch.id; state.view = 'submission'; state.submissionId = submission.id; resetViewer(); await render(); notify('Đã lưu bài và tính điểm tạm.');
    }
    if (form.id === 'review-form') {
      const id = form.dataset.id, submissions = await all('submissions'), submission = submissions.find(x => x.id === id);
      if (!submission) throw new Error('Không tìm thấy bài chấm.');
      const answers = answersFromForm(form), seat = String(f.get('seatNumber') || '').trim(), code = String(f.get('examCode') || '').trim();
      const submitAction = event.submitter?.value || 'finalize-next';

      if (submitAction === 'save') {
        if (!/^\d{8}$/.test(seat) || !/^[0-9]{4}$/.test(code)) throw new Error('SBD phải đủ 8 số, mã đề phải đủ 4 số.');
        const exams = await all('exams'); if (!exams.some(x => x.code === code)) throw new Error(`Không tìm thấy đề mã ${code}. Nạp đáp án mã này trước khi lưu.`);
        const preview = state.reviewPreview?.id === id && state.reviewPreview.seatNumber === seat && state.reviewPreview.examCode === code && JSON.stringify(state.reviewPreview.answers.multipleChoice) === JSON.stringify(answers.multipleChoice) && JSON.stringify(state.reviewPreview.answers.trueFalse) === JSON.stringify(answers.trueFalse) && JSON.stringify(state.reviewPreview.answers.numeric) === JSON.stringify(answers.numeric) ? state.reviewPreview : null;
        const updated = preview ? { ...preview } : { ...submission };
        if (!preview) {
          updated.seatNumber = seat; updated.examCode = code; updated.answers = answers;
          addBlankWarnings(answers, exams.find(x => x.code === code).answerKey);
          const roster = (await all('roster')).filter(x => x.className === submission.className && x.seatNumber === seat);
          updated.studentName = roster.length === 1 ? roster[0].fullName : '';
          answers.reviewItems.push(seat !== submission.recognizedSeatNumber ? 'SBD đã sửa sau khi nhận dạng' : '', code !== submission.recognizedExamCode ? 'Mã đề đã sửa sau khi nhận dạng' : '');
          answers.reviewItems = answers.reviewItems.filter(Boolean);
          updated.answers = answers; updated.needsReview = answers.reviewItems.length > 0;
        }
        updated.scanMeta = state.reviewPreview?.scanMeta || submission.scanMeta || null;
        updated.score = preview ? preview.score : submission.score;
        updated.scorePreview = false; updated.regradePending = !preview;
        updated.reviewed = f.get('reviewed') === 'on';
        updated.confirmed = false;
        updated.needsReview = !updated.reviewed && updated.answers.reviewItems.length > 0;
        await save('submissions', updated); state.reviewPreview = null; state.submissionId = id; await render();
        notify('Đã lưu nháp bài chấm.'); return;
      }

      if (submitAction === 'finalize-next') {
        const exams = await all('exams'), roster = await all('roster');
        const targetExam = exams.find(x => x.code === code);
        if (targetExam) addBlankWarnings(answers, targetExam.answerKey);
        const updated = regradeSubmission(submission, exams, roster, seat, code, answers);
        const reviewed = f.get('reviewed') === 'on';
        if (updated.answers.reviewItems.length > 0 && !reviewed) throw new Error('Vui lòng tích "Đã đối chiếu" các ô bị gắn cờ trước khi chốt điểm.');
        updated.scanMeta = state.reviewPreview?.scanMeta || submission.scanMeta || null;
        updated.reviewed = reviewed;
        updated.confirmed = true;
        updated.needsReview = false;
        updated.regradePending = false;
        updated.scorePreview = false;
        await save('submissions', updated);
        state.reviewPreview = null;
        const batchPapers = sortNewest(submissions.filter(s => s.batchId === updated.batchId && s.id !== id));
        const nextPaper = batchPapers.find(s => !s.confirmed || s.needsReview);
        if (nextPaper) {
          state.submissionId = nextPaper.id;
          resetViewer();
          await render();
          notify('Đã chốt điểm. Đang mở bài tiếp theo.');
        } else {
          state.view = 'batch-detail';
          state.batchId = updated.batchId;
          state.submissionId = null;
          await render();
          notify('Đã chốt điểm. Hoàn tất rà soát các bài trong đợt!');
        }
        return;
      }

      const exams = await all('exams'), roster = await all('roster');
      let targetExam = exams.find(x => x.code === code) || exams.find(x => x.id === submission.examId);
      let answersToGrade = answers, seatToGrade = seat, codeToGrade = code;
      const { first } = await submissionPhotos(submission);
      if (first) {
        notify('Đang OCR lại ảnh phiếu và chấm điểm…');
        const freshScan = await scanPhoto(first, FORM.scale, targetExam?.questionCounts);
        if (freshScan && !freshScan.answers.reviewItems.includes('Không nhận diện được phiếu hoặc mốc căn chỉnh')) {
          submission.recognizedSeatNumber = freshScan.seatNumber;
          submission.recognizedExamCode = freshScan.examCode;
          submission.recognizedAnswers = freshScan.answers;
          submission.scanMeta = { profile: freshScan.testProfile || 'qm', observed: freshScan.observed || null, rotation: freshScan.rotation || 0 };
          answersToGrade = freshScan.answers;
          if (freshScan.seatNumber && !/\?/.test(freshScan.seatNumber)) seatToGrade = freshScan.seatNumber;
          if (freshScan.examCode && !/\?/.test(freshScan.examCode)) codeToGrade = freshScan.examCode;
          targetExam = exams.find(x => x.code === codeToGrade) || targetExam;
        }
      }
      if (targetExam) addBlankWarnings(answersToGrade, targetExam.answerKey);
      const updated = regradeSubmission(submission, exams, roster, seatToGrade, codeToGrade, answersToGrade);
      updated.scanMeta = submission.scanMeta;
      updated.regradePending = false;
      updated.reviewed = false;
      updated.confirmed = false;
      updated.needsReview = updated.answers.reviewItems.length > 0;
      updated.scorePreview = true;
      state.reviewPreview = updated;
      state.submissionId = id;
      await render();
      notify(first ? 'Đã OCR lại từ ảnh gốc và chấm lại điểm. Bấm Lưu nháp để ghi kết quả.' : 'Đã chấm lại bài. Bấm Lưu nháp để ghi kết quả.');
    }
    if (form.id === 'roster-form') {
      const rows = state.importDraft?.rows; if (!rows?.length) throw new Error('Tệp chưa có học sinh hợp lệ.');
      const old = await all('roster'), seen = new Set(old.map(x => `${x.className}\u0000${x.seatNumber}`)), fresh = []; let duplicates = 0;
      for (const item of rows) { const key = `${item.className}\u0000${item.seatNumber}`; if (seen.has(key)) { duplicates++; continue; } seen.add(key); fresh.push(item); }
      for (const item of fresh) await save('roster', item); closeDialog(); state.importDraft = null; state.view = 'roster'; await render(); notify(`Đã thêm ${fresh.length} học sinh${duplicates ? `; bỏ qua ${duplicates} SBD trùng` : ''}.`);
    }
  } catch (error) {
    const message = error.message || 'Không lưu được.', feedback = root.querySelector('#dialog-feedback');
    if (feedback) { feedback.textContent = message; feedback.hidden = false; feedback.scrollIntoView({ block: 'nearest' }); }
    else notify(message);
  }
}

async function handleClick(event) {
  const target = event.target.closest('[data-action]'); if (!target) return;
  const action = target.dataset.action;
  try {
    if (action === 'toggle-theme') { setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark', true); return; }
    if (action === 'home') { event.preventDefault(); state.view = 'batches'; state.batchId = null; await render(); }
    if (action === 'navigate') { state.reviewPreview = null; state.view = target.dataset.view === 'batch' ? 'batch' : target.dataset.view; state.batchId = null; await render(); }
    if (action === 'new-batch') await newBatchDialog();
    if (action === 'scan-entry') {
      const data = await localState();
      if (!data.batches.length) await newBatchDialog(true);
      else if (data.batches.length === 1) { const batch = data.batches[0]; if (data.submissions.filter(x => x.batchId === batch.id).length >= 100) throw new Error('Đợt chấm đã đủ 100 bài.'); state.batchId = batch.id; captureDialog(batch, data); }
      else { state.view = 'batch'; await render(); notify('Chọn lớp cần chấm, rồi chạm “Quét phiếu”.'); }
    }
    if (action === 'edit-exam') { const id = target.dataset.id, exam = id ? (await all('exams')).find(x => x.id === id) : null; if (id && !exam) throw new Error('Không tìm thấy đề thi.'); examDialog(exam); }
    if (action === 'open-batch') { state.reviewPreview = null; state.batchId = target.dataset.id; state.view = 'batch-detail'; state.submissionId = null; await render(); }
    if (action === 'open-submission') { if (state.submissionId !== target.dataset.id) { state.reviewPreview = null; resetViewer(); } state.submissionId = target.dataset.id; state.view = 'submission'; await render(); }
    if (action === 'new-submission') {
      const data = await localState(), batch = data.batches.find(x => x.id === target.dataset.id); if (!batch) throw new Error('Không tìm thấy đợt chấm.');
      const current = data.submissions.filter(x => x.batchId === batch.id).length; if (current >= 100) throw new Error('Đợt chấm đã đủ 100 bài.'); captureDialog(batch, data);
    }
    if (action === 'pick-choice') {
      const inputId = target.dataset.target, value = target.dataset.value;
      const scope = target.closest('form') || root;
      const input = scope.querySelector(`#${CSS.escape(inputId)}`);
      if (!input || target.disabled) return;
      input.value = input.value === value ? '' : value;
      syncPickerButtons(scope);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    if (action === 'apply-thpt-2025') {
      const form = target.closest('#exam-form'); if (!form) return;
      const active = state.examKeyVariants?.find(v => v.code === state.activeExamCode);
      const counts = active?.questionCounts || { multipleChoice: 18, trueFalse: 4, numeric: 6 };
      const mcTotal = counts.multipleChoice <= 18 ? Number((counts.multipleChoice * 0.25).toFixed(2)) : 4.5;
      const tfTotal = counts.trueFalse <= 4 ? Number((counts.trueFalse * 1).toFixed(2)) : 4;
      const numTotal = Number(Math.max(0, 10 - mcTotal - tfTotal).toFixed(2));
      form.elements.multipleChoiceTotal.value = String(mcTotal);
      form.elements.trueFalseTotal.value = String(tfTotal);
      form.elements.numericTotal.value = String(numTotal);
      form.elements.sectionTwoRule.value = 'perStatement';
      if (form.elements.weightsMC) form.elements.weightsMC.value = '';
      if (form.elements.weightsTF) form.elements.weightsTF.value = '';
      if (form.elements.weightsNumeric) form.elements.weightsNumeric.value = '';
      notify('Đã áp dụng thang điểm chuẩn THPT 2025 (tổng 10 điểm).');
      return;
    }
    if (action === 'viewer-zoom-in') { state.viewer.zoom = Math.min(4, Number((state.viewer.zoom + 0.25).toFixed(2))); applyViewerTransform(); return; }
    if (action === 'viewer-zoom-out') { state.viewer.zoom = Math.max(0.5, Number((state.viewer.zoom - 0.25).toFixed(2))); applyViewerTransform(); return; }
    if (action === 'viewer-rotate') { state.viewer.rotate = (state.viewer.rotate + 90) % 360; applyViewerTransform(); return; }
    if (action === 'viewer-fit') { state.viewer.zoom = 1; state.viewer.panX = 0; state.viewer.panY = 0; applyViewerTransform(); return; }
    if (action === 'viewer-page') { state.viewer.page = Number(target.dataset.page) || 1; await render(); return; }
    if (action === 'focus-warning') {
      const t = target.dataset.target; if (!t) return;
      state.viewer.highlightKey = t;
      const el = root.querySelector(`[data-question-target="${CSS.escape(t)}"]`) || root.querySelector(`[name="${CSS.escape(t)}"]`);
      if (el) {
        const details = el.closest('details'); if (details) details.open = true;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.remove('flash-highlight'); void el.offsetWidth; el.classList.add('flash-highlight');
        const focusInput = el.matches('input') ? el : el.querySelector('input:not([type="hidden"]), button');
        focusInput?.focus({ preventScroll: true });
      }
      const overlay = root.querySelector('#omr-overlay');
      if (overlay) {
        const currentSubmission = state.reviewPreview?.id === state.submissionId ? state.reviewPreview : (await all('submissions')).find(s => s.id === state.submissionId);
        if (currentSubmission) overlay.innerHTML = buildOverlayMarks(currentSubmission.answers.reviewItems || [], t, currentSubmission.scanMeta);
      }
      return;
    }
    if (action === 'start-camera') await startCamera();
    if (action === 'stop-camera') {
      const draft = state.captureDraft; stopCamera();
      if (draft?.scanResult) { draft.cameraUsed = false; draft.cameraAccepted = true; draft.cameraStatus = 'Đã dừng quét. Kiểm tra điểm và cảnh báo trước khi lưu.'; captureDialogContent(draft, await localState()); notify('Đã dừng quét. Kiểm tra phiếu trước khi lưu.'); }
    }
    if (action === 'manual-entry') {
      stopCamera();
      const draft = state.captureDraft; if (!draft) throw new Error('Phiếu chưa sẵn sàng.');
      draft.cameraUsed = false; draft.cameraStable = false; draft.cameraStatus = '';
      const answers = emptyAnswers(); answers.reviewItems = ['Nhập tay: chưa lưu ảnh gốc'];
      draft.scanResult = { seatNumber: draft.seatNumber, examCode: draft.examCode, answers }; draft.manual = true;
      const data = await localState(), exam = data.exams.find(x => x.id === draft.examId); draft.score = exam ? scoreFor(exam, answers) : null;
      captureDialogContent(draft, data);
    }
    if (action === 'close-dialog') closeDialog();
    if (action === 'download-roster-template') { download('\uFEFFSBD;Họ tên;Lớp\r\n', 'QM-mau-danh-sach-hoc-sinh.csv', 'text/csv;charset=utf-8'); notify('Đã tải file mẫu CSV.'); }
    if (action === 'download-roster-xlsx') { const { rosterTemplateXlsx } = await import('./imports.mjs'); download(rosterTemplateXlsx(), 'QM-mau-danh-sach-hoc-sinh.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); notify('Đã tải file mẫu Excel.'); }
    if (action === 'import-roster') { openRosterImportDialog(); }
    if (action === 'delete-roster') {
      const row = (await all('roster')).find(x => x.id === target.dataset.id); if (!row) return;
      if (!confirm(`Xóa ${row.fullName}, SBD ${row.seatNumber}, khỏi danh sách?`)) return;
      await remove('roster', row.id); await render(); notify('Đã xóa khỏi danh sách.');
    }
    if (action === 'delete-submission') {
      const item = (await all('submissions')).find(x => x.id === target.dataset.id); if (!item) return;
      if (!confirm(`Xóa bài SBD ${item.seatNumber} và ảnh đã lưu khỏi thiết bị?`)) return;
      await deletePaper(item); state.view = 'batch-detail'; state.batchId = item.batchId; state.submissionId = null; await render(); notify('Đã xóa bài và ảnh.');
    }
    if (action === 'export-csv') {
      const batch = (await all('batches')).find(x => x.id === target.dataset.id), rows = (await all('submissions')).filter(x => x.batchId === target.dataset.id); if (!batch || !rows.length) throw new Error('Chưa có bài để xuất.');
      download(scoreCSV(rows), `QM-${batch.className.replace(/[^\p{L}\p{N}-]+/gu, '-')}-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8'); notify('Đã xuất CSV để mở bằng Excel.');
    }
  } catch (error) { notify(error.message || 'Thao tác chưa hoàn tất.'); }
}

function openRosterImportDialog() {
  const body = `<form id="roster-form"><div class="form-grid"><label class="field"><span>Lớp mặc định nếu tệp thiếu cột lớp</span><input name="defaultClass" maxlength="48" placeholder="Ví dụ: 12A1"></label><label class="field"><span>Danh sách CSV / XLSX</span><input type="file" name="rosterFile" accept=".csv,.tsv,.xlsx" required></label></div><div id="roster-preview" class="notice neutral"><span>i</span><div><strong>Kiểm tra trước khi thêm</strong><p>Cần cột SBD và họ tên. SBD trùng trong cùng lớp được bỏ qua.</p></div></div></form>`;
  state.importDraft = { rows: [] };
  showDialog('Nhập danh sách lớp', body, 'roster-form');
}

async function processRosterFile(file, defaultClass = '') {
  const preview = root.querySelector('#roster-preview');
  if (preview) preview.innerHTML = '<span>…</span><div>Đang đọc danh sách trên thiết bị…</div>';
  try {
    const rows = await importRosterFile(file, defaultClass), old = await all('roster');
    if (rows.some(row => !row.className)) throw new Error('Nhập lớp mặc định trước khi chọn tệp, hoặc thêm cột Lớp vào bảng.');
    const seen = new Set(old.map(x => `${x.className}\u0000${x.seatNumber}`)), counts = new Map();
    for (const row of rows) { const key = `${row.className}\u0000${row.seatNumber}`; counts.set(key, (counts.get(key) || 0) + 1); }
    const duplicates = [...counts.values()].filter(x => x > 1).reduce((a, b) => a + b, 0) + rows.filter(x => seen.has(`${x.className}\u0000${x.seatNumber}`)).length;
    state.importDraft.rows = rows;
    if (preview) {
      preview.classList.toggle('warning', duplicates > 0);
      const classNames = [...new Set(rows.map(x => x.className).filter(Boolean))].join(', ');
      preview.innerHTML = `<span>${duplicates ? '!' : '✓'}</span><div><strong>Đọc được ${rows.length} học sinh${duplicates ? ` · ${duplicates} SBD trùng` : ''}</strong><p>${esc(classNames || 'Chưa có tên lớp.')}</p></div>`;
    }
    const foot = root.querySelector('.dialog-foot');
    if (foot) foot.innerHTML = '<button class="button secondary" type="button" data-action="close-dialog">Hủy</button><button class="button" type="submit" form="roster-form" ' + (rows.length ? '' : 'disabled') + '>Thêm học sinh</button>';
  } catch (error) {
    if (preview) { preview.classList.add('warning'); preview.innerHTML = `<span>!</span><div>${esc(error.message || 'Không đọc được tệp')}</div>`; }
  }
}

function download(text, name, type) {
  const url = URL.createObjectURL(new Blob([text], { type })), link = document.createElement('a');
  link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function handleChange(event) {
  const input = event.target;
  if (input.matches('[data-action="select-capture-exam"]') && state.captureDraft) {
    const data = await localState(), exam = data.exams.find(x => x.id === input.value);
    if (exam) {
      state.captureDraft.examCode = exam.code;
      syncCaptureExam(state.captureDraft, data.exams, exam);
      captureDialogContent(state.captureDraft, data);
    }
    return;
  }
  if (input.matches('[data-action="select-submission-exam"]')) {
    const exam = (await all('exams')).find(x => x.id === input.value);
    if (exam && input.form?.elements.examCode) {
      input.form.elements.examCode.value = exam.code;
      notify(`Đã chọn ${exam.name} (Mã ${exam.code}). Bấm Chấm lại để cập nhật điểm.`);
    }
    return;
  }
  if (input.closest('#capture-form') && /^(mc-|tf-|num-)/.test(input.name || '')) refreshCaptureScore(input.form);
  if (input.matches('[name="keyFile"]') && input.files[0]) {
    const preview = root.querySelector('#key-import-preview'); preview.textContent = 'Đang đọc tệp trên thiết bị…'; state.examKeyVariants = null;
    try {
      const doc = await readDocument(input.files[0]); if (doc.scanned) throw new Error('PDF là ảnh scan; app chưa đọc chữ viết tay. Dùng đáp án PDF có văn bản hoặc nhập đáp án thủ công.');
      const variants = extractAnswerKeyVariants(doc.text, doc.tables); if (!variants.length) throw new Error('Không tìm thấy mã đề trong tệp. Thêm cột “Mã đề thi” hoặc dòng “Mã đề: 1234”.');
      if (variants.some(variant => !Object.values(variant.questionCounts).some(Boolean))) throw new Error('Tệp có mã đề nhưng không đọc được đáp án. Kiểm tra bảng đáp án hoặc nhập tay.');
      state.examKeyVariants = variants; state.activeExamCode = variants[0].code;
      input.form.querySelector('#exam-key-inputs').innerHTML = keyInputs(variants[0].key, variants[0].questionCounts);
      fillKeyForm(input.form, variants[0].key);
      const [mc, tf, numeric] = keyCounts(variants[0].key), counts = variants[0].questionCounts, partial = mc < counts.multipleChoice || tf < counts.trueFalse * 4 || numeric < counts.numeric;
      preview.innerHTML = `<span>Đã đọc ${variants.length} mã đề: ${variants.map(x => esc(x.code)).join(', ')}. Mỗi đề có ${counts.multipleChoice} câu A–D, ${counts.trueFalse} câu Đúng/Sai, ${counts.numeric} câu số${partial ? '; một số đáp án còn thiếu, cần rà lại' : ''}.</span>${variants.length > 1 ? `<label class="field" style="margin-top:10px"><span>Rà đáp án theo mã</span><select data-key-variant>${variants.map((x, index) => `<option value="${esc(x.code)}" ${index === 0 ? 'selected' : ''}>Mã ${esc(x.code)}</option>`).join('')}</select></label>` : ''}`;
    } catch (error) { state.activeExamCode = input.form.dataset.code || ''; preview.textContent = error.message || 'Không đọc được tệp.'; }
  }
  if (input.matches('[data-key-variant]') && state.examKeyVariants) {
    const current = state.examKeyVariants.find(x => x.code === state.activeExamCode), next = state.examKeyVariants.find(x => x.code === input.value);
    if (current) current.key = keyFromForm(input.form);
    if (next) { state.activeExamCode = next.code; input.form.querySelector('#exam-key-inputs').innerHTML = keyInputs(next.key, next.questionCounts); }
  }
  if (input.matches('[name="rosterFile"]') && input.files[0]) {
    await processRosterFile(input.files[0], input.form.elements.defaultClass.value);
  }
  if (input.matches('[data-photo]') && input.files[0]) await handlePhoto(input);
  if (input.matches('[data-pdf]') && input.files[0]) await handlePdf(input);
}

async function handlePhoto(input) {
  stopCamera();
  const draft = state.captureDraft, number = Number(input.dataset.photo); if (!draft) return;
  draft.cameraUsed = false; draft.cameraStable = false; draft.cameraStatus = '';
  const form = input.form, f = new FormData(form), preserveAnswers = number === 2 && !!draft.scanResult, formAnswers = preserveAnswers && !form.elements['mc-0'].disabled ? answersFromForm(form) : null;
  if (!form.elements.seatNumber.disabled) draft.seatNumber = String(f.get('seatNumber') || '');
  if (!form.elements.examCode.disabled) draft.examCode = String(f.get('examCode') || '');
  try {
    draft.uploadName = input.files[0].name; draft.uploadStatus = `Đang đọc ${draft.uploadName}…`; draft.uploadError = false; notify(draft.uploadStatus);
    const original = input.files[0]; if (number === 1) draft.firstPage = original;
    const photo = await imageBlob(original);
    if (number === 1) { draft.scanPage = photo; draft.manual = false; } else draft.secondPage = original;
    if (draft.scanPage) draft.scanResult = await scanPhoto(draft.scanPage);
    if (draft.scanResult && !draft.manual) {
      const data = await localState();
      if (number === 1) { draft.seatNumber = draft.scanResult.seatNumber || draft.seatNumber; draft.examCode = draft.scanResult.examCode || draft.examCode; }
      const exam = data.exams.find(x => x.code === draft.examCode) || data.exams.find(x => x.id === draft.examId);
      if (formAnswers) { draft.scanResult.answers.multipleChoice = formAnswers.multipleChoice; draft.scanResult.answers.trueFalse = formAnswers.trueFalse; draft.scanResult.answers.numeric = formAnswers.numeric; }
      syncCaptureExam(draft, data.exams, exam);
    }
    draft.uploadStatus = `Đã tải ${draft.uploadName}. ${hasRecognizedMarks(draft.scanResult) ? 'Kiểm tra đáp án và cảnh báo bên dưới.' : 'Phiếu chưa nhận dạng được; nhập hoặc sửa SBD, mã đề và đáp án.'}`;
    draft.uploadError = !hasRecognizedMarks(draft.scanResult);
    captureDialogContent(draft, await localState()); notify(draft.uploadStatus);
  } catch (error) {
    draft.uploadStatus = `Không đọc được ${draft.uploadName || 'ảnh'}: ${error.message || 'chọn JPG hoặc PNG.'}`;
    draft.uploadError = true; captureDialogContent(draft, await localState()); notify(draft.uploadStatus);
  }
}

async function handlePdf(input) {
  stopCamera();
  const draft = state.captureDraft; if (!draft) return;
  draft.cameraUsed = false; draft.cameraStable = false; draft.cameraStatus = '';
  try {
    draft.uploadName = input.files[0].name; draft.uploadStatus = `Đang đọc ${draft.uploadName}…`; draft.uploadError = false; notify(draft.uploadStatus);
    const { renderPdfPages } = await import('./imports.mjs'), pages = await renderPdfPages(input.files[0]);
    draft.firstPage = pages[0] || null; draft.scanPage = draft.firstPage; draft.secondPage = null;
    draft.scanResult = draft.scanPage ? await scanPhoto(draft.scanPage) : null;
    const data = await localState();
    if (draft.scanResult) {
      draft.seatNumber = draft.scanResult.seatNumber; draft.examCode = draft.scanResult.examCode;
      const exam = data.exams.find(e => e.code === draft.examCode) || data.exams.find(e => e.id === draft.examId);
      syncCaptureExam(draft, data.exams, exam);
    }
    draft.uploadStatus = `Đã tải ${draft.uploadName}. ${hasRecognizedMarks(draft.scanResult) ? 'Kiểm tra đáp án và cảnh báo bên dưới.' : 'Không thấy đáp án theo mẫu. Thử ảnh rõ mặt trước phiếu hoặc nhập tay.'}`;
    draft.uploadError = !hasRecognizedMarks(draft.scanResult); captureDialogContent(draft, data); notify(draft.uploadStatus);
  } catch (error) {
    draft.uploadStatus = `Không đọc được ${draft.uploadName || 'PDF'}: ${error.message || 'kiểm tra lại tệp.'}`;
    draft.uploadError = true; captureDialogContent(draft, await localState()); notify(draft.uploadStatus);
  }
}

async function handleInput(event) {
  const input = event.target;
  if (input.matches('.numeric-input[data-key]')) {
    const keyVal = input.dataset.key, val = input.value.trim();
    input.classList.remove('is-correct', 'is-wrong');
    if (val) {
      const cVal = canonicalDecimal(val), cKey = canonicalDecimal(keyVal);
      input.classList.add(cVal !== null && cVal === cKey ? 'is-correct' : 'is-wrong');
    }
  }
  if (input.matches('#capture-form input[name="seatNumber"], #capture-form input[name="examCode"]') && state.captureDraft) { state.captureDraft[input.name] = input.value; }
  if (input.closest('#capture-form') && /^(mc-|tf-|num-)/.test(input.name || '')) refreshCaptureScore(input.form);
}

function refreshCaptureScore(form) {
  const draft = state.captureDraft; if (!draft?.scanResult || !form) return;
  const dataScore = answersFromForm(form), lastWarnings = draft.scanResult.answers.reviewItems;
  dataScore.reviewItems = lastWarnings; draft.score = gradeSubmission(draft.examKey || {}, dataScore, draft.policy || {});
  const chips = form.querySelectorAll('.score-chip');
  const values = [draft.score.multipleChoiceEarned, draft.score.trueFalseEarned, draft.score.numericEarned, draft.score.totalEarned], possible = [draft.score.multipleChoicePossible, draft.score.trueFalsePossible, draft.score.numericPossible, draft.score.totalPossible];
  chips.forEach((chip, index) => { const strong = chip.querySelector('strong'); if (strong) strong.innerHTML = `${fmt(values[index])} <small>/ ${fmt(possible[index])}</small>`; });
}

async function handleFocusOut(event) {
  const form = event.target.closest('#capture-form'); if (!form || !state.captureDraft) return;
  const draft = state.captureDraft, fields = new FormData(form); draft.seatNumber = String(fields.get('seatNumber') || ''); draft.examCode = String(fields.get('examCode') || '');
}

function attachViewerInteractions() {
  let drag = null;
  root.addEventListener('pointerdown', event => {
    const viewport = event.target.closest('#viewer-viewport');
    if (!viewport || event.button !== 0) return;
    drag = { id: event.pointerId, startX: event.clientX - state.viewer.panX, startY: event.clientY - state.viewer.panY, viewport };
    viewport.classList.add('is-panning');
    viewport.setPointerCapture?.(event.pointerId);
  });
  root.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    state.viewer.panX = event.clientX - drag.startX;
    state.viewer.panY = event.clientY - drag.startY;
    applyViewerTransform();
  });
  const endDrag = event => {
    if (!drag || event.pointerId !== drag.id) return;
    drag.viewport.classList.remove('is-panning');
    drag = null;
  };
  root.addEventListener('pointerup', endDrag);
  root.addEventListener('pointercancel', endDrag);
  root.addEventListener('wheel', event => {
    const viewport = event.target.closest('#viewer-viewport');
    if (!viewport) return;
    event.preventDefault();
    const delta = event.deltaY < 0 ? 0.15 : -0.15;
    state.viewer.zoom = Math.min(4, Math.max(0.5, Number((state.viewer.zoom + delta).toFixed(2))));
    applyViewerTransform();
  }, { passive: false });
}

function attachDropzoneInteractions() {
  root.addEventListener('dragover', event => {
    const dz = event.target.closest('#roster-dropzone');
    if (!dz) return;
    event.preventDefault();
    dz.classList.add('drag-over');
  });
  root.addEventListener('dragleave', event => {
    const dz = event.target.closest('#roster-dropzone');
    if (!dz) return;
    dz.classList.remove('drag-over');
  });
  root.addEventListener('drop', async event => {
    const dz = event.target.closest('#roster-dropzone');
    if (!dz) return;
    event.preventDefault();
    dz.classList.remove('drag-over');
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    if (!/\.(csv|tsv|xlsx)$/i.test(file.name)) { notify('Chỉ hỗ trợ tệp .csv, .tsv hoặc .xlsx.'); return; }
    openRosterImportDialog();
    await processRosterFile(file, '');
  });
}

async function boot() {
  try { db = await openDatabase(); await render(); navigator.storage?.persist?.().catch(() => {}); }
  catch (error) { root.innerHTML = `<main><div class="notice error"><span>!</span><div><strong>Không mở được kho dữ liệu trên thiết bị</strong><p>${esc(error.message || 'Bật IndexedDB trong cài đặt trình duyệt, rồi mở lại app.')}</p></div></div></main>`; }
  root.addEventListener('click', event => handleClick(event));
  root.addEventListener('submit', event => handleSubmit(event));
  root.addEventListener('change', event => handleChange(event));
  root.addEventListener('input', event => handleInput(event));
  root.addEventListener('focusout', event => handleFocusOut(event));
  attachViewerInteractions();
  attachDropzoneInteractions();
  document.addEventListener('visibilitychange', () => { if (document.hidden && cameraStream) stopCamera(); });
  addEventListener('online', render);
  addEventListener('offline', render);
}
boot();
