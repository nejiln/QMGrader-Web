import { FORM, gradeSubmission, emptyAnswers, scoreCSV, scanForm, hasFormMarkers, scanSignature } from './core.mjs';
import { extractAnswerKey, importRosterFile, readDocument } from './imports.mjs';

const root=document.querySelector('#app'),toastBox=document.querySelector('#toast');
let db,toastTimer,objectURLs=[],cameraStream,cameraTimer,cameraBusy=false,cameraSession=0;
const state={view:'batches',batchId:null,modal:null,captureDraft:null,reviewDraft:null,importDraft:null};
const pageLabels={batches:'Đợt chấm',batch:'Danh sách đợt','batch-detail':'Bài chấm',submission:'Phiếu chấm',exams:'Đề thi',roster:'Danh sách lớp'};
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon=(name)=>({
  mark:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/><path d="m15.5 17 1.5 1.5 3-4"/></svg>',
  scan:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M8 8h8v8H8zM2 12h4M18 12h4"/></svg>',
  exam:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h8l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M15 3v5h5M9 13h6M9 17h6M9 9h2"/></svg>',
  people:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2ZM17 5.5a3 3 0 0 1 0 5.8M18 14a5 5 0 0 1 3 4.5V20"/></svg>',
  file:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 14h8M8 18h8M8 10h2"/></svg>',
  plus:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  arrow:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  download:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M5 19h14"/></svg>',
  print:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 8V4h10v4M6 17H4V9h16v8h-2M7 14h10v6H7z"/><path d="M17 11h1"/></svg>',
  moon:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 15.2A8.5 8.5 0 0 1 8.8 3.5 8.5 8.5 0 1 0 20.5 15.2Z"/></svg>',
  sun:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg>'
})[name]||'';

function setTheme(theme,persist=false){
  const dark=theme==='dark';document.documentElement.dataset.theme=dark?'dark':'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',dark?'#101612':'#f6f4ef');
  if(persist)try{localStorage.setItem('qm-cham-theme',dark?'dark':'light');}catch{}
  const button=root.querySelector('.theme-toggle');
  if(button){const label=dark?'Chuyển sang giao diện sáng':'Chuyển sang giao diện tối';button.innerHTML=icon(dark?'sun':'moon');button.setAttribute('aria-label',label);button.setAttribute('aria-pressed',String(dark));button.title=label;}
}
const systemTheme=matchMedia('(prefers-color-scheme: dark)');let savedTheme;try{savedTheme=localStorage.getItem('qm-cham-theme');}catch{}
setTheme(savedTheme==='dark'||savedTheme==='light'?savedTheme:systemTheme.matches?'dark':'light');
systemTheme.addEventListener('change',event=>{try{if(localStorage.getItem('qm-cham-theme'))return;}catch{}setTheme(event.matches?'dark':'light');});

function openDatabase(){return new Promise((resolve,reject)=>{
  const request=indexedDB.open('qm-cham-local',1);
  request.onupgradeneeded=()=>{
    const store=request.result;
    for(const name of ['exams','batches','roster','submissions','photos'])if(!store.objectStoreNames.contains(name))store.createObjectStore(name,{keyPath:'id'});
  };
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
});}
function request(store,method,value){return new Promise((resolve,reject)=>{
  const transaction=db.transaction(store,method==='getAll'||method==='get'?'readonly':'readwrite');
  const req=value===undefined?transaction.objectStore(store)[method]():transaction.objectStore(store)[method](value);
  let result;req.onsuccess=()=>{result=req.result;};req.onerror=()=>reject(req.error);
  transaction.oncomplete=()=>resolve(result);
  transaction.onerror=()=>reject(transaction.error||new Error('Không lưu được dữ liệu trên thiết bị.'));
  transaction.onabort=()=>reject(transaction.error||new Error('Không lưu được dữ liệu trên thiết bị.'));
});}
const all=store=>request(store,'getAll');
async function save(store,value){await request(store,'put',value);}
async function remove(store,id){await request(store,'delete',id);}
function savePaper(submission,first,second){return new Promise((resolve,reject)=>{
  const transaction=db.transaction(['submissions','photos'],'readwrite'),photos=transaction.objectStore('photos');
  if(first)photos.put({id:submission.firstPageId,blob:first});
  if(second)photos.put({id:submission.secondPageId,blob:second});
  transaction.objectStore('submissions').put(submission);
  transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(transaction.error||new Error('Không lưu được ảnh bài trên thiết bị.'));transaction.onabort=()=>reject(transaction.error||new Error('Không lưu được ảnh bài trên thiết bị.'));
});}
function deletePaper(submission){return new Promise((resolve,reject)=>{
  const transaction=db.transaction(['submissions','photos'],'readwrite'),papers=transaction.objectStore('submissions'),photos=transaction.objectStore('photos');
  papers.delete(submission.id);if(submission.firstPageId)photos.delete(submission.firstPageId);if(submission.secondPageId)photos.delete(submission.secondPageId);
  transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(transaction.error||new Error('Không xóa được bài.'));transaction.onabort=()=>reject(transaction.error||new Error('Không xóa được bài.'));
});}
const localState=async()=>({exams:await all('exams'),batches:await all('batches'),roster:await all('roster'),submissions:await all('submissions')});
function notify(message){toastBox.textContent=message;toastBox.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toastBox.classList.remove('show'),2900);}
function releaseURLs(){for(const url of objectURLs)URL.revokeObjectURL(url);objectURLs=[];}
function photoURL(blob){if(!blob)return '';const url=URL.createObjectURL(blob);objectURLs.push(url);return url;}
function bytes(size){return size>=1048576?`${(size/1048576).toFixed(1)} MB`:`${Math.round(size/1024)} KB`;}
function fmt(value){return (Number(value)||0).toLocaleString('vi-VN',{maximumFractionDigits:3});}
function sortNewest(rows){return rows.sort((a,b)=>b.createdAt-a.createdAt);}
function policyFor(exam){return exam.policy||{multipleChoiceTotal:0,trueFalseTotal:0,numericTotal:0,sectionTwoRule:'perStatement',multipleChoiceQuestionPoints:[],trueFalseQuestionPoints:[],numericQuestionPoints:[]};}
function scoreFor(exam,answers){return gradeSubmission(exam.answerKey,answers,policyFor(exam));}
function statusPill(submission){return submission.needsReview?'<span class="pill warn">Cần rà soát</span>':submission.confirmed?'<span class="pill">Đã xác nhận</span>':'<span class="pill">Tạm tính</span>';}

async function render(){
  releaseURLs();
  const data=await localState();
  const photos=state.view==='submission'?await submissionPhotos(data.submissions.find(item=>item.id===state.submissionId)):{};
  const label=pageLabels[state.view]||'Dữ liệu',storageMessage=navigator.onLine?`${label} lưu trên iPhone`:`${label} vẫn ở trên máy`;
  root.innerHTML=`<header class="topbar"><a class="brand" href="#" data-action="home"><span class="brand-mark">QM</span><span class="brand-copy"><strong>QM Chấm</strong><small>Phiếu QM 2025</small></span></a><span class="storage-status" aria-label="Dữ liệu lưu trên thiết bị"><i class="status-dot ${navigator.onLine?'':'offline'}"></i>${storageMessage}</span></header>${installHint()}<main id="main">${await page(data,photos)}</main>${tabs()}`;
  const status=root.querySelector('.storage-status'),tools=document.createElement('div'),button=document.createElement('button'),dark=document.documentElement.dataset.theme==='dark',buttonLabel=dark?'Chuyển sang giao diện sáng':'Chuyển sang giao diện tối';
  tools.className='topbar-tools';button.className='theme-toggle';button.type='button';button.dataset.action='toggle-theme';button.innerHTML=icon(dark?'sun':'moon');button.setAttribute('aria-label',buttonLabel);button.setAttribute('aria-pressed',String(dark));button.title=buttonLabel;
  status.before(tools);tools.append(status,button);
  attachOffline();
}
function tabs(){const activeView=['batch','batch-detail','submission'].includes(state.view)?'batches':state.view;return `<nav class="tabbar" aria-label="Điều hướng chính">${[['batches','scan','Chấm bài'],['exams','exam','Đề thi'],['roster','people','Danh sách']].map(([view,symbol,label])=>`<button class="tab" data-action="navigate" data-view="${view}" aria-current="${activeView===view?'page':'false'}">${icon(symbol)}<span>${label}</span></button>`).join('')}</nav>`;}
function attachOffline(){if(!('serviceWorker'in navigator))return;navigator.serviceWorker.register('./sw.js').catch(()=>notify('Chưa bật lưu ngoại tuyến. Mở lại khi có mạng.'));}
function installHint(){const ios=/iPhone|iPad|iPod/.test(navigator.userAgent),installed=navigator.standalone||matchMedia('(display-mode: standalone)').matches;return ios&&!installed?'<aside class="notice install-hint"><span aria-hidden="true">i</span><div><strong>Cài app lên màn hình chính</strong><p>Mở bằng Safari, chạm Chia sẻ → Thêm vào Màn hình chính. Trang đã mở sẽ chạy được khi ngoại tuyến.</p></div></aside>':'';}

async function page(data,photos={}){
  if(state.view==='batch')return batchPage(data);
  if(state.view==='exams')return examsPage(data);
  if(state.view==='roster')return rosterPage(data);
  if(state.view==='batch-detail')return batchDetailPage(data);
  if(state.view==='submission')return submissionPage(data,photos);
  return batchListPage(data);
}
function batchListPage({batches,exams,submissions}){
  const recent=sortNewest(batches.slice()).slice(0,4);
  const open=batch=>`<button class="card batch-card" data-action="open-batch" data-id="${esc(batch.id)}"><span class="card-icon">${icon('people')}</span><span class="card-copy"><strong>${esc(batch.className)}</strong><p>${esc(exams.find(e=>e.id===batch.examId)?.name||'Đề đã xóa')} · ${new Date(batch.createdAt).toLocaleDateString('vi-VN')}</p></span><span class="card-end"><strong>${submissions.filter(s=>s.batchId===batch.id).length} / 100</strong>bài đã chấm</span></button>`;
  return `<section class="hero"><div class="hero-copy"><p class="eyebrow">Chấm trắc nghiệm · QM 2025</p><h1>Từ phiếu giấy đến bảng điểm.</h1><p class="lede">Quét, rà đáp án và xuất kết quả. Ảnh cùng danh sách học sinh lưu trực tiếp trên iPhone này.</p><div class="actions"><button class="button" data-action="new-batch">${icon('plus')}Tạo đợt chấm</button><button class="button secondary" data-action="navigate" data-view="exams">${icon('exam')}Thiết lập đề</button></div></div><div class="hero-art" aria-hidden="true"><div class="sheet-illustration"><div class="sheet-row"><i></i><i class="active"></i><i></i><i></i></div><div class="sheet-row"><i class="active"></i><i></i><i></i><i></i></div><div class="sheet-row"><i></i><i></i><i class="active"></i><i></i></div><div class="sheet-rule"></div><div class="sheet-row"><i></i><i class="active"></i><i></i><i></i></div><div class="sheet-row"><i class="active"></i><i></i><i></i><i></i></div><div class="sheet-row"><i></i><i></i><i class="active"></i><i></i></div></div></div></section>
  <section class="stats"><article class="stat"><span>Đề thi</span><strong>${exams.length}</strong><span>Đáp án lưu trên máy</span></article><article class="stat"><span>Đợt chấm</span><strong>${batches.length}</strong><span>Theo từng lớp học</span></article><article class="stat"><span>Bài cần rà soát</span><strong>${submissions.filter(s=>s.needsReview).length}</strong><span>Ô mờ, bỏ trống hoặc lệch mã</span></article></section>
  <div class="section-heading"><div><p class="eyebrow">Tiếp tục công việc</p><h2>Đợt chấm gần đây</h2></div>${recent.length?`<button class="button quiet" data-action="navigate" data-view="batch">Xem danh sách ${icon('arrow')}</button>`:''}</div>
  ${recent.length?`<div class="stack">${recent.map(open).join('')}</div>`:`<div class="empty"><p>${exams.length?'Tạo đợt chấm đầu tiên rồi quét hai trang phiếu.':'Bắt đầu bằng đề thi và thang điểm. Đáp án có thể nhập tay hoặc đọc từ tệp.'}</p><button class="button" data-action="${exams.length?'new-batch':'navigate'}" ${exams.length?'':'data-view="exams"'}>${icon(exams.length?'plus':'exam')}${exams.length?'Tạo đợt chấm':'Tạo đề thi'}</button></div>`}
  <p class="helper" style="margin-top:20px">Chỉ hỗ trợ mẫu QM 2025. Kiểm tra đáp án gắn cờ trước khi chốt điểm.</p>`;
}
function examsPage({exams}){
  const rows=exams.map(exam=>`<button class="card batch-card" data-action="edit-exam" data-id="${esc(exam.id)}"><span class="card-icon">${icon('exam')}</span><span class="card-copy"><strong>${esc(exam.name)}</strong><p>Mã ${esc(exam.code)} · ${examComplete(exam.answerKey)?'Đủ 78 mục đáp án':'Thiếu đáp án'}</p></span><span class="card-end">${icon('arrow')}</span></button>`).join('');
  return `<p class="eyebrow">Thiết lập đáp án và điểm</p><div class="toolbar"><div><h1>Đề thi</h1><p class="lede">Tạo khóa đáp án một lần. Đợt chấm chọn đề phù hợp theo mã đề.</p></div><button class="button" data-action="edit-exam">${icon('plus')}Tạo đề</button></div>${rows?`<div class="stack">${rows}</div>`:`<div class="empty"><p>Chưa có đề thi. Tạo đáp án và nhập điểm từng phần để bắt đầu.</p><button class="button" data-action="edit-exam">${icon('plus')}Tạo đề đầu tiên</button></div>`}`;
}
function examComplete(key){return !!key&&key.multipleChoice?.length===40&&key.multipleChoice.every(x=>'ABCD'.includes(x))&&key.trueFalse?.length===32&&key.trueFalse.every(x=>typeof x==='boolean')&&key.numeric?.length===6&&key.numeric.every(x=>/^-?\d+(?:[.,]\d+)?$/.test(String(x)));}
function rosterPage({roster}){
  const classes=[...new Set(roster.map(row=>row.className).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'vi'));
  const groups=classes.map(name=>{const rows=roster.filter(row=>row.className===name);return `<details class="card answer-card"><summary>${esc(name)} <span class="pill">${rows.length} học sinh</span></summary><div class="stack" style="margin-top:12px">${rows.map(row=>`<div class="submission-row"><span class="avatar-number">${esc(row.seatNumber.slice(-3))}</span><span class="card-copy"><strong>${esc(row.fullName)}</strong><p>SBD ${esc(row.seatNumber)}</p></span><button class="button quiet" data-action="delete-roster" data-id="${esc(row.id)}" aria-label="Xóa ${esc(row.fullName)}">Xóa</button></div>`).join('')}</div></details>`;}).join('');
  return `<p class="eyebrow">Ghép tên theo số báo danh</p><div class="toolbar"><div><h1>Danh sách lớp</h1><p class="lede">Tên học sinh được ghép tự động khi SBD khớp. Tệp vẫn ở trên điện thoại.</p></div><button class="button" data-action="import-roster">${icon('plus')}Nhập CSV / XLSX</button></div><div class="notice"><span aria-hidden="true">i</span><div><strong>Kiểm tra SBD trùng trước khi dùng</strong><p>Nếu cùng lớp có SBD lặp, app đánh dấu cảnh báo và không tự chọn tên.</p></div></div>${groups||`<div class="empty"><p>Chưa có danh sách. Nhập bảng có cột SBD, họ tên và lớp.</p><button class="button" data-action="import-roster">${icon('file')}Chọn CSV / XLSX</button></div>`}`;
}
function batchPage({batches}){
  const rows=sortNewest(batches.slice()).map(batch=>`<button class="card batch-card" data-action="open-batch" data-id="${esc(batch.id)}"><span class="card-icon">${icon('people')}</span><span class="card-copy"><strong>${esc(batch.className)}</strong><p>${new Date(batch.createdAt).toLocaleDateString('vi-VN')} · ${esc(batch.examName)}</p></span><span class="card-end">Mở ${icon('arrow')}</span></button>`).join('');
  return `<p class="eyebrow">Lớp học và kết quả</p><div class="toolbar"><div><h1>Đợt chấm</h1><p class="lede">Mỗi đợt tối đa 100 bài, gắn với một lớp và một đề thi.</p></div><button class="button" data-action="new-batch">${icon('plus')}Tạo đợt</button></div>${rows?`<div class="stack">${rows}</div>`:`<div class="empty"><p>Tạo đề thi trước, sau đó mở đợt chấm theo lớp.</p><button class="button" data-action="new-batch">${icon('plus')}Tạo đợt chấm</button></div>`}`;
}
function batchDetailPage({batches,exams,submissions,roster}){
  const batch=batches.find(item=>item.id===state.batchId);if(!batch){state.view='batches';return batchListPage({batches,exams,submissions});}
  const exam=exams.find(item=>item.id===batch.examId),papers=sortNewest(submissions.filter(item=>item.batchId===batch.id).slice());
  const rosterClass=roster.filter(item=>item.className===batch.className);
  const rows=papers.map(s=>`<button class="card submission-row" data-action="open-submission" data-id="${esc(s.id)}"><span class="avatar-number">${esc(s.seatNumber==='????????'?'?':s.seatNumber.slice(-3))}</span><span class="card-copy"><strong>${esc(s.studentName||'Chưa ghép tên')} · SBD ${esc(s.seatNumber)}</strong><p>${statusPill(s)} ${s.examCode===exam?.code?'':`<span class="pill red">Mã ${esc(s.examCode)} ≠ ${esc(exam?.code)}</span>`}</p></span><span class="card-end"><strong>${fmt(s.score.totalEarned)} / ${fmt(s.score.totalPossible)}</strong>${new Date(s.createdAt).toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})}</span></button>`).join('');
  return `<div class="breadcrumb"><button data-action="navigate" data-view="batches">Đợt chấm</button><span>/</span><span>${esc(batch.className)}</span></div><p class="eyebrow">${esc(exam?.name||'Đề đã xóa')} · Mã ${esc(exam?.code||'')}</p><div class="toolbar"><div><h1>Lớp ${esc(batch.className)}</h1><p class="lede">${papers.length} / 100 bài đã lưu${rosterClass.length?` · ${rosterClass.length} học sinh trong danh sách`:''}</p></div><div class="actions" style="margin:0"><button class="button secondary" data-action="export-csv" data-id="${esc(batch.id)}" ${papers.length?'':'disabled'}>${icon('download')}Xuất CSV</button><button class="button" data-action="new-submission" data-id="${esc(batch.id)}" ${papers.length>=100?'disabled':''}>${icon('scan')}Chụp phiếu</button></div></div>${!examComplete(exam?.answerKey)?`<div class="notice warning"><span aria-hidden="true">!</span><div><strong>Đề chưa đủ đáp án</strong><p>Sửa đề trước khi chấm để điểm tổng không thiếu câu.</p><button class="button quiet" data-action="edit-exam" data-id="${esc(exam?.id)}">Mở đáp án</button></div></div>`:''}${rows?`<div class="stack">${rows}</div>`:`<div class="empty"><p>Chụp trang trước và sau của phiếu. Điểm nháp hiện ngay; kiểm tra từng ô bị đánh dấu.</p><button class="button" data-action="new-submission" data-id="${esc(batch.id)}">${icon('scan')}Chụp bài đầu tiên</button></div>`}`;
}
async function submissionPhotos(item){
  if(!item)return {};
  const [first,second]=await Promise.all([item.firstPageId?request('photos','get',item.firstPageId):null,item.secondPageId?request('photos','get',item.secondPageId):null]);
  return {first:first?.blob,second:second?.blob};
}
function submissionPage({submissions,batches},{first,second}){
  const item=submissions.find(s=>s.id===state.submissionId);if(!item){state.view='batch-detail';return batchDetailPage({submissions,batches,exams:[],roster:[]});}
  const score=item.score,reviewItems=item.answers.reviewItems||[];
  return `<div class="breadcrumb"><button data-action="open-batch" data-id="${esc(item.batchId)}">Lớp ${esc(item.className)}</button><span>/</span><span>SBD ${esc(item.seatNumber)}</span></div><p class="eyebrow">Kết quả tạm tính</p><div class="toolbar"><div><h1>${esc(item.studentName||'Chưa ghép tên')}</h1><p class="lede">Lớp ${esc(item.className)} · SBD ${esc(item.seatNumber)} · Mã đề ${esc(item.examCode)}</p></div><span class="pill ${item.needsReview?'warn':''}">${item.needsReview?'Cần rà soát':item.confirmed?'Đã xác nhận':'Tạm tính'}</span></div><div class="score-strip">${[['Phần I',score.multipleChoiceEarned,score.multipleChoicePossible],['Phần II',score.trueFalseEarned,score.trueFalsePossible],['Phần III',score.numericEarned,score.numericPossible],['Tổng điểm',score.totalEarned,score.totalPossible]].map(([label,earned,total])=>`<div class="score-chip"><span>${label}</span><strong>${fmt(earned)} <small>/ ${fmt(total)}</small></strong></div>`).join('')}</div>${reviewItems.length?`<section class="notice warning"><span aria-hidden="true">!</span><div><strong>${reviewItems.length} mục cần đối chiếu</strong><ul class="warning-list">${reviewItems.slice(0,16).map(x=>`<li>${esc(x)}</li>`).join('')}${reviewItems.length>16?`<li>… còn ${reviewItems.length-16} mục</li>`:''}</ul></div></section>`:''}<div class="details-images">${first?`<img alt="Ảnh phiếu trang trước" src="${photoURL(first)}">`:''}${second?`<img alt="Ảnh phiếu trang sau" src="${photoURL(second)}">`:''}</div><div class="section-heading"><div><p class="eyebrow">Rà câu trả lời</p><h2>Đáp án nhận dạng</h2></div></div><form id="review-form" data-id="${esc(item.id)}">${answerEditor(item.answers)}<div class="notice"><span aria-hidden="true">i</span><div><strong>Chỉ xác nhận sau khi nhìn lại ảnh</strong><p>Ô tô nhạt, thiếu hoặc tô hai ô có cảnh báo. Sửa SBD, mã đề và đáp án nếu cần.</p></div></div><label class="field" style="margin-top:13px"><span class="field-label">SBD</span><input name="seatNumber" inputmode="numeric" maxlength="8" value="${esc(item.seatNumber)}"></label><label class="field" style="margin-top:12px"><span class="field-label">Mã đề</span><input name="examCode" inputmode="numeric" maxlength="4" value="${esc(item.examCode)}"></label><label class="notice" style="cursor:pointer"><input type="checkbox" name="reviewed" ${item.reviewed?'checked':''}><span><strong>Đã đối chiếu các ô bị gắn cờ</strong><p>Chọn sau khi nhìn ảnh gốc. Cảnh báo vẫn lưu cùng bài.</p></span></label><label class="notice" style="cursor:pointer"><input type="checkbox" name="confirmed" ${item.confirmed?'checked':''}><span><strong>Chốt điểm bài này</strong><p>Có thể bỏ chọn và sửa lại sau.</p></span></label><div class="form-actions"><button class="button danger" type="button" data-action="delete-submission" data-id="${esc(item.id)}">Xóa bài</button><button class="button" type="submit">${icon('file')}Lưu và tính lại</button></div></form>`;
}
function answerEditor(answers){
  const select=(name,index,choices,value,label)=>`<div class="answer-cell"><label for="${name}-${index}">${label}</label><select id="${name}-${index}" name="${name}-${index}"><option value="">—</option>${choices.map(([v,t])=>`<option value="${v}" ${String(value)===String(v)?'selected':''}>${t}</option>`).join('')}</select></div>`;
  const mc=Array.from({length:40},(_,i)=>select('mc',i,['A','B','C','D'].map(x=>[x,x]),answers.multipleChoice?.[i],`Câu ${i+1}`)).join('');
  const tf=Array.from({length:32},(_,i)=>select('tf',i,[[true,'Đúng'],[false,'Sai']],answers.trueFalse?.[i],`${Math.floor(i/4)+1}${'abcd'[i%4]}`)).join('');
  const numeric=Array.from({length:6},(_,i)=>`<div class="answer-cell"><label for="num-${i}">Câu ${i+1}</label><input id="num-${i}" name="num-${i}" inputmode="decimal" autocomplete="off" value="${esc(answers.numeric?.[i]||'')}"></div>`).join('');
  return `<details class="card answer-card" open><summary>Phần I · 40 câu A–D</summary><div class="answer-grid">${mc}</div></details><details class="card answer-card"><summary>Phần II · 8 câu, 32 ý</summary><div class="answer-grid tf">${tf}</div></details><details class="card answer-card"><summary>Phần III · 6 câu số</summary><div class="answer-grid numeric">${numeric}</div></details>`;
}

function defaultKey(){return {multipleChoice:Array(40).fill(''),trueFalse:Array(32).fill(null),numeric:Array(6).fill('')};}
function keyInputs(key){
  const choices=Array.from({length:40},(_,i)=>`<div class="answer-cell"><label for="key-mc-${i}">Câu ${i+1}</label><select id="key-mc-${i}" name="key-mc-${i}"><option value="">—</option>${['A','B','C','D'].map(x=>`<option ${key.multipleChoice?.[i]===x?'selected':''}>${x}</option>`).join('')}</select></div>`).join('');
  const tf=Array.from({length:32},(_,i)=>`<div class="answer-cell"><label for="key-tf-${i}">${Math.floor(i/4)+1}${'abcd'[i%4]}</label><select id="key-tf-${i}" name="key-tf-${i}"><option value="">—</option><option value="true" ${key.trueFalse?.[i]===true?'selected':''}>Đúng</option><option value="false" ${key.trueFalse?.[i]===false?'selected':''}>Sai</option></select></div>`).join('');
  const numeric=Array.from({length:6},(_,i)=>`<label class="field"><span>Câu ${i+1}</span><input name="key-num-${i}" inputmode="decimal" value="${esc(key.numeric?.[i]??'')}" placeholder="Ví dụ: -1,25"></label>`).join('');
  return `<details class="card answer-card" open><summary>Phần I · 40 câu A–D</summary><div class="answer-grid">${choices}</div></details><details class="card answer-card"><summary>Phần II · Đúng / Sai theo a, b, c, d</summary><div class="answer-grid tf">${tf}</div></details><details class="card answer-card"><summary>Phần III · Số, gồm dấu và phần thập phân</summary><div class="answer-grid numeric">${numeric}</div></details>`;
}

function dialogShell(title,body,buttons,formId){
  const submit=`<button class="button" type="submit" ${formId?`form="${esc(formId)}"`:''}>Lưu</button>`;
  const actions=buttons||`<button class="button secondary" type="button" data-action="close-dialog">Hủy</button>${submit}`;
  return `<dialog id="dialog"><div class="dialog-head"><div><p class="eyebrow">QM Chấm · Lưu trên thiết bị</p><h2>${esc(title)}</h2></div><button class="icon-button" type="button" data-action="close-dialog" aria-label="Đóng">×</button></div><div class="dialog-body">${body}</div><div class="dialog-foot">${actions}</div></dialog>`;
}
function showDialog(title,body,formId,buttons){
  state.modal={title,body,formId,buttons};
  root.insertAdjacentHTML('beforeend',dialogShell(title,body,buttons,formId));
  const dialog=root.querySelector('#dialog');dialog.addEventListener('click',event=>{if(event.target===dialog)closeDialog();});dialog.addEventListener('close',()=>{if(root.querySelector('#dialog')===dialog){stopCamera();state.modal=null;state.captureDraft=null;state.importDraft=null;dialog.remove();}});dialog.showModal();
}
function updateDialog(body){
  const dialog=root.querySelector('#dialog');if(!dialog)return;
  const open=dialog.open;dialog.querySelector('.dialog-body').innerHTML=body;
  if(open&&!dialog.open)dialog.showModal();
}
function closeDialog(){stopCamera();state.modal=null;state.captureDraft=null;state.importDraft=null;root.querySelector('#dialog')?.close();root.querySelector('#dialog')?.remove();}
function setCameraStatus(message){if(state.captureDraft)state.captureDraft.cameraStatus=message;const status=root.querySelector('#camera-status');if(status){status.textContent=message;status.hidden=false;}}
function stopCamera(){cameraSession++;clearTimeout(cameraTimer);cameraTimer=null;cameraStream?.getTracks().forEach(track=>track.stop());cameraStream=null;cameraBusy=false;disableCaptureFields(false);const video=root.querySelector('#scan-camera');if(video){video.pause();video.srcObject=null;}const live=root.querySelector('#live-camera');if(live)live.hidden=true;const start=root.querySelector('[data-action="start-camera"]'),stop=root.querySelector('[data-action="stop-camera"]');if(start){start.hidden=false;start.disabled=false;}if(stop)stop.hidden=true;setCameraStatus(state.captureDraft?.cameraStable?'Đã quét ổn định. Điểm tạm tính đã hiện.':'Đã dừng camera. Quét lại để xác nhận.');}
function disableCaptureFields(disabled){root.querySelectorAll('#capture-form input:not([type="file"]),#capture-form select,#capture-form textarea').forEach(field=>field.disabled=disabled);}

async function newBatchDialog(){
  const {exams}=await localState();
  if(!exams.length){state.view='exams';await render();notify('Tạo đề thi trước khi mở đợt chấm.');return;}
  const body=`<form id="batch-form"><div class="form-grid"><label class="field"><span>Tên lớp</span><input name="className" maxlength="48" required placeholder="Ví dụ: 12A1"></label><label class="field"><span>Đề thi</span><select name="examId" required>${exams.map(e=>`<option value="${esc(e.id)}">${esc(e.name)} · Mã ${esc(e.code)}</option>`).join('')}</select></label></div><p class="helper">Mỗi lớp nhận tối đa 100 bài trong đợt này.</p></form>`;
  showDialog('Đợt chấm mới',body,'batch-form');
}
function examDialog(exam){
  const key=exam?.answerKey||defaultKey(),policy=exam?.policy||{multipleChoiceTotal:'',trueFalseTotal:'',numericTotal:'',sectionTwoRule:'perStatement',multipleChoiceQuestionPoints:[],trueFalseQuestionPoints:[],numericQuestionPoints:[]};
  const body=`<form id="exam-form" data-id="${esc(exam?.id||'')}"><div class="form-grid"><label class="field"><span>Tên đề</span><input name="name" required maxlength="80" value="${esc(exam?.name||'')}" placeholder="Ví dụ: Kiểm tra cuối kỳ"></label><label class="field"><span>Mã đề · tự đọc từ tệp</span><input name="code" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" required value="${esc(exam?.code||'')}" placeholder="Tự điền khi nhập tệp"></label><label class="field full"><span>Đọc đáp án và mã đề từ tệp</span><input name="keyFile" type="file" accept=".xlsx,.docx,.pdf"><small>Nhập tệp XLSX, DOCX hoặc PDF có dòng “Mã đề: 1234”. Rà lại mã đề và đáp án trước khi lưu.</small></label></div><div id="key-import-preview" class="helper" role="status"></div><label class="field" style="margin-top:14px"><span>Tổng điểm Phần I</span><input name="multipleChoiceTotal" type="text" inputmode="decimal" pattern="[0-9]+([.,][0-9]{1,2})?" required value="${esc(policy.multipleChoiceTotal)}"></label><label class="field" style="margin-top:14px"><span>Tổng điểm Phần II</span><input name="trueFalseTotal" type="text" inputmode="decimal" pattern="[0-9]+([.,][0-9]{1,2})?" required value="${esc(policy.trueFalseTotal)}"></label><label class="field" style="margin-top:14px"><span>Tổng điểm Phần III</span><input name="numericTotal" type="text" inputmode="decimal" pattern="[0-9]+([.,][0-9]{1,2})?" required value="${esc(policy.numericTotal)}"></label><label class="field" style="margin-top:14px"><span>Cách chấm Phần II</span><select name="sectionTwoRule"><option value="perStatement" ${policy.sectionTwoRule==='perStatement'?'selected':''}>Tính điểm từng ý</option><option value="allOrNothing" ${policy.sectionTwoRule==='allOrNothing'?'selected':''}>Đúng đủ 4 ý mới tính điểm câu</option></select></label><label class="field full" style="margin-top:14px"><span>Điểm riêng từng câu (không bắt buộc)</span><input name="weightsMC" value="${esc(policy.multipleChoiceQuestionPoints?.join('; ')||'')}" placeholder="40 số, ngăn cách bằng dấu chấm phẩy"><small>Nhập đủ 40, 8 hoặc 6 giá trị cho từng phần. Bỏ trống dùng tổng điểm chia đều.</small></label><label class="field full"><span>Phần II · điểm riêng từng câu</span><input name="weightsTF" value="${esc(policy.trueFalseQuestionPoints?.join('; ')||'')}" placeholder="8 giá trị"></label><label class="field full"><span>Phần III · điểm riêng từng câu</span><input name="weightsNumeric" value="${esc(policy.numericQuestionPoints?.join('; ')||'')}" placeholder="6 giá trị"></label><div class="section-heading"><div><p class="eyebrow">Rà soát từng câu</p><h2>Khóa đáp án</h2></div></div>${keyInputs(key)}</form>`;
  showDialog(exam?'Sửa đề thi':'Tạo đề thi',body,'exam-form');
}

function captureDialog(batch,data){
  const exam=data.exams.find(e=>e.id===batch.examId);
  const draft={batchId:batch.id,examId:batch.examId,className:batch.className,seatNumber:'',examCode:exam?.code||'',expectedExamCode:exam?.code||'',firstPage:null,secondPage:null,scanResult:null,examKey:exam?.answerKey||{},policy:exam?policyFor(exam):{},photoNames:{},studentName:'',confirmed:false};
  state.captureDraft=draft;
  captureDialogContent(draft,data);
}
function captureDialogContent(draft,data){
  const exam=data.exams.find(e=>e.id===draft.examId),matches=data.roster.filter(x=>x.className===draft.className&&x.seatNumber===draft.seatNumber);
  const warning=matches.length>1?`<div class="notice warning"><span>!</span><div><strong>SBD trùng trong ${esc(draft.className)}</strong><p>Sửa danh sách lớp trước khi ghép tên. Bài vẫn lưu để rà soát.</p></div></div>`:draft.seatNumber&&matches.length===0?`<div class="notice warning"><span>!</span><div><strong>Chưa có SBD này trong lớp</strong><p>Tên sẽ để trống. Có thể ghép sau trong danh sách lớp.</p></div></div>`:draft.examCode&&draft.expectedExamCode&&draft.examCode!==draft.expectedExamCode?`<div class="notice warning"><span>!</span><div><strong>Mã đọc được ${esc(draft.examCode)} khác mã đề đã chọn ${esc(draft.expectedExamCode)}</strong><p>Đối chiếu mã đề trước khi lưu điểm.</p></div></div>`:'';
  const result=captureResultMarkup(draft);
  const scanner=`<div class="camera-actions"><button class="button secondary" type="button" data-action="start-camera" ${cameraStream?'hidden':''}>Quét tự động bằng camera</button><button class="button quiet" type="button" data-action="stop-camera" ${cameraStream?'':'hidden'}>Dừng camera</button></div><div id="live-camera" class="live-camera" ${cameraStream?'':'hidden'}><video id="scan-camera" autoplay muted playsinline aria-label="Khung quét phiếu"></video><span class="camera-frame" aria-hidden="true"></span></div><p id="camera-status" class="helper" role="status" ${cameraStream||draft.cameraStatus?'':'hidden'}>${esc(draft.cameraStatus||'Đưa đủ bốn mốc đen trang 1 vào khung, giữ yên để app tự quét.')}</p>`;
  const body=`<form id="capture-form"><input type="hidden" name="batchId" value="${esc(batch.id)}"><div class="form-grid"><label class="field"><span>Số báo danh · 8 số</span><input name="seatNumber" inputmode="numeric" maxlength="8" value="${esc(draft.seatNumber)}" placeholder="Đọc tự động từ phiếu"></label><label class="field"><span>Mã đề · 4 số</span><input name="examCode" inputmode="numeric" maxlength="4" value="${esc(draft.examCode)}"></label></div>${scanner}${warning}<div id="capture-result">${result}</div><div class="capture-pair">${captureSlot(1,draft.firstPage)}${captureSlot(2,draft.secondPage)}</div><label class="field"><span>Nhập phiếu PDF thay vì chụp</span><input type="file" data-pdf accept="application/pdf,.pdf"><small>Đọc trang 1–2 ngay trên thiết bị. PDF scan vẫn cần ảnh rõ mốc căn chỉnh.</small></label><details class="card answer-card" ${draft.scanResult?'':'open'}><summary>${draft.scanResult?'Sửa đáp án trước khi lưu':'Nhập đáp án thủ công'}</summary>${answerEditor(draft.scanResult?.answers||emptyAnswers())}</details><p class="helper">${esc(exam?.name||'')} · ảnh phiếu lưu trên iPhone này. Trang sau được lưu làm bằng chứng, không OCR phần tự luận.</p></form>`;
  const canSave=draft.scanResult&&(!draft.cameraUsed||draft.cameraStable||draft.cameraAccepted),buttons=`<button class="button secondary" type="button" data-action="close-dialog">Hủy</button>${!draft.scanResult?'<button class="button quiet" type="button" data-action="manual-entry">Nhập tay</button>':''}<button class="button" type="submit" form="capture-form" ${canSave?'':'disabled'}>Lưu bài chấm</button>`;
  if(state.modal){state.modal.body=body;state.modal.buttons=buttons;updateDialog(body);const foot=root.querySelector('.dialog-foot');if(foot)foot.innerHTML=buttons;}
  else showDialog('Quét phiếu',body,'capture-form',buttons);
}
function captureResultMarkup(draft){
  if(!draft.scanResult)return '';
  const score=draft.score||{},review=[...(draft.scanResult.answers.reviewItems||[])],ready=draft.cameraStable||draft.cameraAccepted||!draft.cameraUsed;
  if(draft.cameraAccepted&&!draft.cameraStable)review.push('Chỉ nhận dạng được một khung hình; kiểm tra kỹ');
  if(draft.cameraUsed&&ready&&draft.firstPage&&!draft.secondPage)review.push('Trang 2 chưa được lưu');
  return `<div class="score-strip">${[['Phần I',score.multipleChoiceEarned,score.multipleChoicePossible],['Phần II',score.trueFalseEarned,score.trueFalsePossible],['Phần III',score.numericEarned,score.numericPossible],['Tổng',score.totalEarned,score.totalPossible]].map(([name,earned,total])=>`<div class="score-chip"><span>${name}</span><strong>${fmt(earned)} / ${fmt(total)}</strong></div>`).join('')}</div><div class="notice ${review.length||!ready?'warning':''}"><span>${review.length||!ready?'!':'✓'}</span><div><strong>${!ready?'Điểm tạm tính · đang xác nhận':review.length?`${review.length} mục cần nhìn lại`:'Phiếu đã nhận dạng'}</strong><p>${ready?'Kiểm tra ô được đánh dấu trước khi lưu. Bạn có thể sửa đáp án.':'Giữ phiếu yên để app xác nhận rồi chốt điểm.'}</p>${review.length?`<ul class="warning-list">${review.slice(0,8).map(x=>`<li>${esc(x)}</li>`).join('')}${review.length>8?`<li>… còn ${review.length-8} mục</li>`:''}</ul>`:''}</div></div>`;
}
function captureSlot(number,blob){return `<label class="capture-slot"><strong>Trang ${number}${number===1?' · đáp án và SBD':' · trang sau'}</strong><input type="file" data-photo="${number}" accept="image/*" capture="environment"><small class="helper">Chụp trọn phiếu, đặt bốn ô đen ở bốn góc trong khung hình.</small>${blob?`<img alt="Ảnh phiếu trang ${number}" src="${photoURL(blob)}">`:''}</label>`;}

async function imageBlob(file){
  if(file.size>50*1024*1024)throw new Error('Ảnh tối đa 50 MB.');
  const bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});
  const maxSide=2700,ratio=Math.min(1,maxSide/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*ratio);canvas.height=Math.round(bitmap.height*ratio);
  const context=canvas.getContext('2d',{alpha:false});context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Không giữ được ảnh trên thiết bị.')),'image/jpeg',0.9));
}
async function rasterize(bitmap,rotation,scale=FORM.scale){
  const width=FORM.pageWidth*scale,height=FORM.pageHeight*scale,canvas=document.createElement('canvas'),landscape=rotation%2===1;
  canvas.width=width;canvas.height=height;
  const context=canvas.getContext('2d',{willReadFrequently:true});context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);
  const drawWidth=landscape?height:width,drawHeight=landscape?width:height;
  context.translate(width/2,height/2);context.rotate(rotation*Math.PI/2);context.drawImage(bitmap,-drawWidth/2,-drawHeight/2,drawWidth,drawHeight);
  const rgba=context.getImageData(0,0,width,height).data,gray=new Uint8Array(width*height);
  for(let i=0,j=0;i<gray.length;i++,j+=4)gray[i]=Math.round(.299*rgba[j]+.587*rgba[j+1]+.114*rgba[j+2]);
  return {gray,width,height};
}
async function scanPhoto(blob,pageCount=2,scale=FORM.scale){
  const bitmap=await createImageBitmap(blob,{imageOrientation:'from-image'});
  let result=null;
  try{for(let rotation=0;rotation<4;rotation++){
    const raster=await rasterize(bitmap,rotation,scale),candidate=scanForm(raster.gray,raster.width,raster.height,pageCount,scale);
    if(!candidate.answers.reviewItems.includes('Không nhận diện được phiếu hoặc mốc căn chỉnh')&&!candidate.answers.reviewItems.includes('Tỷ lệ ảnh khác mẫu QM 2025')){result=candidate;break;}
  }}finally{bitmap.close();}
  if(!result)result=scanForm(new Uint8Array(),0,pageCount);
  return result;
}
function cameraFrame(video){
  if(!video.videoWidth||!video.videoHeight)return Promise.resolve(null);
  const ratio=FORM.pageWidth/FORM.pageHeight,sourceRatio=video.videoWidth/video.videoHeight;
  const width=Math.round(sourceRatio>ratio?video.videoHeight*ratio:video.videoWidth),height=Math.round(sourceRatio>ratio?video.videoHeight:video.videoWidth/ratio),x=Math.round((video.videoWidth-width)/2),y=Math.round((video.videoHeight-height)/2),canvas=document.createElement('canvas');
  canvas.width=width;canvas.height=height;canvas.getContext('2d',{alpha:false}).drawImage(video,x,y,width,height,0,0,width,height);
  return new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.9));
}
async function scanCameraFrame(video,stable={signature:'',count:0},session=cameraSession){
  if(!cameraStream||session!==cameraSession)return;
  if(cameraBusy||video.readyState<2){cameraTimer=setTimeout(()=>scanCameraFrame(video,stable,session),350);return;}
  cameraBusy=true;
  try{
    const photo=await cameraFrame(video);if(!photo)throw new Error('Đang mở camera.');
    const bitmap=await createImageBitmap(photo);
    let scan=null,mismatchCode='';
    try{
      for(const rotation of [0,2,1,3]){
        const quick=await rasterize(bitmap,rotation,1);
        if(!hasFormMarkers(quick.gray,quick.width,quick.height,1))continue;
        const full=await rasterize(bitmap,rotation);
        const candidate=scanForm(full.gray,full.width,full.height,1);candidate.answers.reviewItems=candidate.answers.reviewItems.filter(message=>!message.startsWith('Cần quét đủ 2 trang'));
        if(/^\d{8}$/.test(candidate.seatNumber)&&/^\d{4}$/.test(candidate.examCode)){
          if(candidate.examCode===state.captureDraft?.expectedExamCode){scan=candidate;break;}
          mismatchCode=candidate.examCode;
        }
      }
    }finally{bitmap.close();}
    if(session!==cameraSession)return;
    if(scan){
      const signature=scanSignature(scan);stable.count=signature===stable.signature?stable.count+1:1;stable.signature=signature;
      const draft=state.captureDraft;if(!draft)return;
      draft.firstPage=photo;draft.scanPage=photo;draft.scanResult=scan;draft.score=gradeSubmission(draft.examKey||{},scan.answers,draft.policy||{});draft.seatNumber=scan.seatNumber;draft.examCode=scan.examCode;draft.cameraUsed=true;draft.cameraStable=stable.count>=2;
      const form=root.querySelector('#capture-form');
      if(form){form.elements.seatNumber.value=scan.seatNumber;form.elements.examCode.value=scan.examCode;for(let i=0;i<40;i++)form.elements[`mc-${i}`].value=scan.answers.multipleChoice[i]||'';for(let i=0;i<32;i++)form.elements[`tf-${i}`].value=scan.answers.trueFalse[i]==null?'':String(scan.answers.trueFalse[i]);for(let i=0;i<6;i++)form.elements[`num-${i}`].value=scan.answers.numeric[i]||'';}
      const result=root.querySelector('#capture-result');if(result)result.innerHTML=captureResultMarkup(draft);
      const save=root.querySelector('button[type="submit"][form="capture-form"]');if(save)save.disabled=stable.count<2;
      setCameraStatus(stable.count>1?'Đã nhận phiếu ổn định. Điểm đã hiện.':'Đã đọc SBD. Điểm tạm tính đã hiện; giữ phiếu yên.');
      if(stable.count>=2){
        draft.manual=false;
        const data=await localState(),exam=data.exams.find(x=>x.id===draft.examId);draft.examKey=exam?.answerKey||{};draft.policy=exam?policyFor(exam):{};draft.score=exam?scoreFor(exam,scan.answers):null;draft.seatNumber=scan.seatNumber;draft.examCode=scan.examCode;
        stopCamera();captureDialogContent({id:draft.batchId,examId:draft.examId,className:draft.className},data);notify('Đã tự quét phiếu. Điểm tạm tính đã hiện.');return;
      }
    }else{
      stable.signature='';stable.count=0;
      const draft=state.captureDraft;draft.cameraStable=false;draft.cameraUsed=true;draft.scanResult=null;draft.score=null;
      const result=root.querySelector('#capture-result');if(result)result.innerHTML='';const save=root.querySelector('button[type="submit"][form="capture-form"]');if(save)save.disabled=true;
      setCameraStatus(mismatchCode?`Mã phiếu ${mismatchCode} khác mã đề đã chọn (${draft.expectedExamCode}).`:'Đưa đủ bốn mốc đen vào khung, rồi giữ phiếu yên.');
    }
  }catch(error){setCameraStatus(error.message||'Không đọc được khung hình. Căn lại phiếu.');}
  finally{if(session===cameraSession)cameraBusy=false;}
  if(cameraStream&&session===cameraSession)cameraTimer=setTimeout(()=>scanCameraFrame(video,stable,session),350);
}
async function startCamera(){
  if(!navigator.mediaDevices?.getUserMedia)throw new Error('Trình duyệt không hỗ trợ camera trực tiếp. Dùng nút chọn ảnh bên dưới.');
  const start=root.querySelector('[data-action="start-camera"]');if(start)start.disabled=true;
  const session=++cameraSession;let stream;
  try{
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:2560}},audio:false});
    if(session!==cameraSession){stream.getTracks().forEach(track=>track.stop());return;}
    cameraStream=stream;
    const draft=state.captureDraft;if(!draft){stopCamera();return;}
    draft.cameraUsed=true;draft.cameraStable=false;draft.cameraAccepted=false;
    disableCaptureFields(true);
    const live=root.querySelector('#live-camera'),start=root.querySelector('[data-action="start-camera"]'),stop=root.querySelector('[data-action="stop-camera"]'),status=root.querySelector('#camera-status');if(live)live.hidden=false;if(start)start.hidden=true;if(stop)stop.hidden=false;if(status)status.hidden=false;
    const result=root.querySelector('#capture-result');if(result)result.innerHTML=captureResultMarkup(draft);const save=root.querySelector('button[type="submit"][form="capture-form"]');if(save)save.disabled=true;
    setCameraStatus('Đang tìm phiếu. Đưa đủ bốn mốc vào khung.');const video=root.querySelector('#scan-camera');if(!video)throw new Error('Không mở được khung camera.');
    video.srcObject=stream;await video.play();if(session!==cameraSession)return;
    scanCameraFrame(video,{signature:'',count:0},session);
  }catch(error){
    if(session===cameraSession)stopCamera();
    const message=error.name==='NotAllowedError'?'Safari chưa được cấp quyền camera. Bật quyền Camera cho trang web rồi thử lại.':error.name==='NotFoundError'?'Không tìm thấy camera trên thiết bị.':'Không mở được camera. Dùng Safari qua HTTPS hoặc chọn ảnh bên dưới.';setCameraStatus(message);
    throw new Error(message);
  }
}

function answersFromForm(form){
  const fields=new FormData(form),answers=emptyAnswers();
  for(let i=0;i<40;i++)answers.multipleChoice[i]=fields.get(`mc-${i}`)||null;
  for(let i=0;i<32;i++){const value=fields.get(`tf-${i}`);answers.trueFalse[i]=value==null||value===''?null:value==='true';}
  for(let i=0;i<6;i++)answers.numeric[i]=fields.get(`num-${i}`)?.trim()||null;
  return answers;
}
function keyFromForm(form){
  const f=new FormData(form),multipleChoice=Array.from({length:40},(_,i)=>f.get(`key-mc-${i}`)||''),trueFalse=Array.from({length:32},(_,i)=>{const v=f.get(`key-tf-${i}`);return v===''?null:v==='true';}),numeric=Array.from({length:6},(_,i)=>f.get(`key-num-${i}`)?.trim()||'');
  return {multipleChoice,trueFalse,numeric};
}
function parseWeights(value,count,label){
  if(!value.trim())return [];
  const parts=value.split(/[;\s]+/).filter(Boolean),numbers=parts.map(x=>Number(x.replace(',','.')));
  if(parts.length!==count||numbers.some(x=>!Number.isFinite(x)||x<0))throw new Error(`${label}: nhập ${count} số không âm, ngăn cách bằng dấu chấm phẩy.`);
  return numbers;
}
function parseTotal(value,label){const text=String(value).trim().replace(',','.');if(!/^\d+(?:\.\d{1,2})?$/.test(text))throw new Error(`${label}: nhập số điểm không âm, tối đa 2 chữ số thập phân.`);return Number(text);}
function addBlankWarnings(answers){
  const warnings=new Set(answers.reviewItems);
  answers.multipleChoice.forEach((value,i)=>{if(!value)warnings.add(`I-${i+1}: bỏ trống`);});
  answers.trueFalse.forEach((value,i)=>{if(value==null)warnings.add(`II-${Math.floor(i/4)+1}${'abcd'[i%4]}: bỏ trống`);});
  answers.numeric.forEach((value,i)=>{if(!String(value??'').trim())warnings.add(`III-${i+1}: bỏ trống`);else if(!/^-?\d+(?:[.,]\d+)?$/.test(String(value).trim()))throw new Error(`Phần III, câu ${i+1}: nhập số hợp lệ.`);});
  answers.reviewItems=[...warnings];
}

async function handleSubmit(event){
  const form=event.target;if(!(form instanceof HTMLFormElement))return;
  if(!['batch-form','exam-form','capture-form','review-form','roster-form'].includes(form.id))return;
  event.preventDefault();
  try{
    const f=new FormData(form);
    if(form.id==='batch-form'){
      const className=String(f.get('className')).trim(),examId=String(f.get('examId'));
      if(!className||!examId)throw new Error('Nhập lớp và chọn đề thi.');
      const exam=(await all('exams')).find(x=>x.id===examId);if(!exam)throw new Error('Đề thi không còn tồn tại.');
      const batch={id:crypto.randomUUID(),className,examId,examName:exam.name,createdAt:Date.now()};await save('batches',batch);closeDialog();state.batchId=batch.id;state.view='batch-detail';await render();notify('Đã tạo đợt chấm.');
    }
    if(form.id==='exam-form'){
      const key=keyFromForm(form),name=String(f.get('name')).trim(),code=String(f.get('code')).trim();
      if(!name||!/^\d{4}$/.test(code))throw new Error('Tên đề bắt buộc. Mã đề phải đủ 4 chữ số.');
      if(key.multipleChoice.some(x=>x&&!['A','B','C','D'].includes(x))||key.trueFalse.some(x=>x!==null&&typeof x!=='boolean')||key.numeric.some(x=>x&&!/^-?\d+(?:[.,]\d+)?$/.test(x)))throw new Error('Kiểm tra lại đáp án A–D, Đúng/Sai và số thập phân.');
      const policy={multipleChoiceTotal:parseTotal(f.get('multipleChoiceTotal'),'Phần I'),trueFalseTotal:parseTotal(f.get('trueFalseTotal'),'Phần II'),numericTotal:parseTotal(f.get('numericTotal'),'Phần III'),sectionTwoRule:f.get('sectionTwoRule'),multipleChoiceQuestionPoints:parseWeights(String(f.get('weightsMC')),40,'Phần I'),trueFalseQuestionPoints:parseWeights(String(f.get('weightsTF')),8,'Phần II'),numericQuestionPoints:parseWeights(String(f.get('weightsNumeric')),6,'Phần III')};
      const id=String(f.get('id')||form.dataset.id||crypto.randomUUID()),existing=(await all('exams')).find(x=>x.id===id);
      const exam={id,name,code,answerKey:key,policy,createdAt:existing?.createdAt||Date.now(),updatedAt:Date.now()};await save('exams',exam);closeDialog();state.view='exams';await render();notify('Đã lưu đáp án và thang điểm.');
    }
    if(form.id==='capture-form'){
      const draft=state.captureDraft;if((!draft?.firstPage&&!draft?.manual)||!draft.scanResult)throw new Error('Chụp trang trước của phiếu rồi kiểm tra nhận dạng.');
      if(draft.cameraUsed&&!draft.cameraStable&&!draft.cameraAccepted)throw new Error('Giữ phiếu yên để camera xác nhận, hoặc dừng quét để rà thủ công.');
      const batch=(await all('batches')).find(x=>x.id===draft.batchId),exam=(await all('exams')).find(x=>x.id===draft.examId);
      if(!batch||!exam)throw new Error('Không còn đợt chấm hoặc đề thi.');
      const count=(await all('submissions')).filter(x=>x.batchId===batch.id).length;if(count>=100)throw new Error('Đợt chấm đã đủ 100 bài.');
      const answers=answersFromForm(form);answers.reviewItems=[...draft.scanResult.answers.reviewItems];
      const seat=String(f.get('seatNumber')||draft.scanResult.seatNumber).trim(),code=String(f.get('examCode')||draft.scanResult.examCode).trim();
      if(!/^\d{8}$/.test(seat)||!/^\d{4}$/.test(code))throw new Error('SBD phải đủ 8 số, mã đề phải đủ 4 số. Sửa ô được đánh dấu trước khi lưu.');
      addBlankWarnings(answers);
      if(draft.manual)answers.reviewItems.push('Nhập tay: chưa lưu ảnh gốc');
      if(seat!==draft.scanResult.seatNumber)answers.reviewItems.push('SBD đã sửa sau khi nhận dạng');
      if(code!==draft.scanResult.examCode)answers.reviewItems.push('Mã đề đã sửa sau khi nhận dạng');
      if(!draft.firstPage)answers.reviewItems.push('Thiếu trang trước · chưa có ảnh gốc');
      if(!draft.secondPage)answers.reviewItems.push('Thiếu trang sau');
      const roster=(await all('roster')).filter(x=>x.className===batch.className&&x.seatNumber===seat);
      if(roster.length>1)answers.reviewItems.push(`SBD ${seat}: trùng trong danh sách lớp`);
      if(!roster.length)answers.reviewItems.push(`SBD ${seat}: không khớp danh sách lớp`);
      if(code!==exam.code)answers.reviewItems.push(`Mã đề ${code}: khác mã đề đã chọn (${exam.code})`);
      const id=crypto.randomUUID(),submission={id,batchId:batch.id,examId:exam.id,className:batch.className,seatNumber:seat||'????????',recognizedSeatNumber:draft.scanResult.seatNumber,studentName:roster.length===1?roster[0].fullName:'',examCode:code||'????',recognizedExamCode:draft.scanResult.examCode,recognizedAnswers:draft.scanResult.answers,answers,score:scoreFor(exam,answers),firstPageId:draft.firstPage?`${id}-1`:null,secondPageId:draft.secondPage?`${id}-2`:null,needsReview:answers.reviewItems.length>0,reviewed:false,confirmed:false,createdAt:Date.now()};
      await savePaper(submission,draft.firstPage,draft.secondPage);closeDialog();state.batchId=batch.id;state.view='submission';state.submissionId=submission.id;await render();notify('Đã lưu bài và tính điểm tạm.');
    }
    if(form.id==='review-form'){
      const id=form.dataset.id,submission=(await all('submissions')).find(x=>x.id===id),exam=(await all('exams')).find(x=>x.id===submission?.examId);if(!submission||!exam)throw new Error('Không tìm thấy bài chấm hoặc đề thi.');
      const answers=answersFromForm(form),oldWarnings=submission.answers.reviewItems||[];answers.reviewItems=oldWarnings;
      const seat=String(f.get('seatNumber')||'').trim(),code=String(f.get('examCode')||'').trim();
      if(!/^\d{8}$/.test(seat)||!/^\d{4}$/.test(code))throw new Error('SBD phải đủ 8 số, mã đề phải đủ 4 số.');
      addBlankWarnings(answers);
      if(seat!==submission.recognizedSeatNumber&&!oldWarnings.some(x=>x.startsWith('SBD đã sửa')))answers.reviewItems.push('SBD đã sửa sau khi nhận dạng');
      if(code!==submission.recognizedExamCode&&!oldWarnings.some(x=>x.startsWith('Mã đề đã sửa')))answers.reviewItems.push('Mã đề đã sửa sau khi nhận dạng');
      const roster=(await all('roster')).filter(x=>x.className===submission.className&&x.seatNumber===seat);
      submission.seatNumber=seat;submission.examCode=code;submission.studentName=roster.length===1?roster[0].fullName:'';submission.answers=answers;submission.score=scoreFor(exam,answers);submission.reviewed=f.get('reviewed')==='on';submission.confirmed=f.get('confirmed')==='on';if(submission.confirmed&&answers.reviewItems.length&&!submission.reviewed)throw new Error('Đối chiếu các ô bị gắn cờ trước khi chốt điểm.');submission.needsReview=!submission.reviewed&&answers.reviewItems.length>0;
      await save('submissions',submission);state.submissionId=id;await render();notify('Đã lưu chỉnh sửa và tính lại điểm.');
    }
    if(form.id==='roster-form'){
      const rows=state.importDraft?.rows;if(!rows?.length)throw new Error('Tệp chưa có học sinh hợp lệ.');
      const old=await all('roster'),seen=new Set(old.map(x=>`${x.className}\u0000${x.seatNumber}`)),fresh=[];let duplicates=0;
      for(const item of rows){const key=`${item.className}\u0000${item.seatNumber}`;if(seen.has(key)){duplicates++;continue;}seen.add(key);fresh.push(item);}
      for(const item of fresh)await save('roster',item);closeDialog();state.importDraft=null;state.view='roster';await render();notify(`Đã thêm ${fresh.length} học sinh${duplicates?`; bỏ qua ${duplicates} SBD trùng`:''}.`);
    }
  }catch(error){notify(error.message||'Không lưu được.');}
}

async function handleClick(event){
  const target=event.target.closest('[data-action]');if(!target)return;
  const action=target.dataset.action;
  try{
    if(action==='toggle-theme'){setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark',true);return;}
    if(action==='home'){event.preventDefault();state.view='batches';state.batchId=null;await render();}
    if(action==='navigate'){state.view=target.dataset.view==='batch'?'batch':target.dataset.view;state.batchId=null;await render();}
    if(action==='new-batch')await newBatchDialog();
    if(action==='edit-exam'){const id=target.dataset.id,exam=id?(await all('exams')).find(x=>x.id===id):null;if(id&&!exam)throw new Error('Không tìm thấy đề thi.');examDialog(exam);}
    if(action==='open-batch'){state.batchId=target.dataset.id;state.view='batch-detail';state.submissionId=null;await render();}
    if(action==='open-submission'){state.submissionId=target.dataset.id;state.view='submission';await render();}
    if(action==='new-submission'){
      const data=await localState(),batch=data.batches.find(x=>x.id===target.dataset.id);if(!batch)throw new Error('Không tìm thấy đợt chấm.');
      const current=data.submissions.filter(x=>x.batchId===batch.id).length;if(current>=100)throw new Error('Đợt chấm đã đủ 100 bài.');captureDialog(batch,data);
    }
    if(action==='start-camera')await startCamera();
    if(action==='stop-camera'){
      const draft=state.captureDraft;stopCamera();
      if(draft?.scanResult){draft.cameraUsed=false;draft.cameraAccepted=true;draft.cameraStatus='Đã dừng quét. Kiểm tra điểm và cảnh báo trước khi lưu.';captureDialogContent({id:draft.batchId,examId:draft.examId,className:draft.className},await localState());notify('Đã dừng quét. Kiểm tra phiếu trước khi lưu.');}
    }
    if(action==='manual-entry'){
      stopCamera();
      const draft=state.captureDraft;if(!draft)throw new Error('Phiếu chưa sẵn sàng.');
      draft.cameraUsed=false;draft.cameraStable=false;draft.cameraStatus='';
      const answers=emptyAnswers();answers.reviewItems=['Nhập tay: chưa lưu ảnh gốc'];
      draft.scanResult={seatNumber:draft.seatNumber,examCode:draft.examCode,answers};draft.manual=true;
      const data=await localState(),exam=data.exams.find(x=>x.id===draft.examId);draft.score=exam?scoreFor(exam,answers):null;
      captureDialogContent({id:draft.batchId,examId:draft.examId,className:draft.className},data);
    }
    if(action==='close-dialog')closeDialog();
    if(action==='import-roster'){
      const body=`<form id="roster-form"><div class="form-grid"><label class="field"><span>Lớp mặc định nếu tệp thiếu cột lớp</span><input name="defaultClass" maxlength="48" placeholder="Ví dụ: 12A1"></label><label class="field"><span>Danh sách CSV / XLSX</span><input type="file" name="rosterFile" accept=".csv,.tsv,.xlsx" required></label></div><div id="roster-preview" class="notice"><span>i</span><div><strong>Kiểm tra trước khi thêm</strong><p>Cần cột SBD và họ tên. SBD trùng trong cùng lớp được bỏ qua.</p></div></div></form>`;
      state.importDraft={rows:[]};showDialog('Nhập danh sách lớp',body,'roster-form');
    }
    if(action==='delete-roster'){
      const row=(await all('roster')).find(x=>x.id===target.dataset.id);if(!row)return;
      if(!confirm(`Xóa ${row.fullName}, SBD ${row.seatNumber}, khỏi danh sách?`))return;
      await remove('roster',row.id);await render();notify('Đã xóa khỏi danh sách.');
    }
    if(action==='delete-submission'){
      const item=(await all('submissions')).find(x=>x.id===target.dataset.id);if(!item)return;
      if(!confirm(`Xóa bài SBD ${item.seatNumber} và hai ảnh đã chụp khỏi iPhone?`))return;
      await deletePaper(item);state.view='batch-detail';state.batchId=item.batchId;await render();notify('Đã xóa bài và ảnh.');
    }
    if(action==='export-csv'){
      const batch=(await all('batches')).find(x=>x.id===target.dataset.id),rows=(await all('submissions')).filter(x=>x.batchId===target.dataset.id);if(!batch||!rows.length)throw new Error('Chưa có bài để xuất.');
      download(scoreCSV(rows),`QM-${batch.className.replace(/[^\p{L}\p{N}-]+/gu,'-')}-${new Date().toISOString().slice(0,10)}.csv`,'text/csv;charset=utf-8');notify('Đã xuất CSV để mở bằng Excel.');
    }
  }catch(error){notify(error.message||'Thao tác chưa hoàn tất.');}
}
function download(text,name,type){const url=URL.createObjectURL(new Blob([text],{type})),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1500);}

async function handleChange(event){
  const input=event.target;
  if(input.closest('#capture-form')&&/^(mc-|tf-|num-)/.test(input.name||''))refreshCaptureScore(input.form);
  if(input.matches('[name="keyFile"]')&&input.files[0]){
    const preview=root.querySelector('#key-import-preview');preview.textContent='Đang đọc tệp trên iPhone…';
    input.form.elements.code.value='';
    try{const doc=await readDocument(input.files[0]);if(doc.scanned)throw new Error('PDF chỉ có ảnh, trình duyệt không có OCR tiếng Việt. Nhập đáp án tay bên dưới.');const draft=extractAnswerKey(doc.text),form=input.form;if(draft.code)form.elements.code.value=draft.code;for(let i=0;i<40;i++)if(draft.multipleChoice)form.elements[`key-mc-${i}`].value=draft.multipleChoice[i]||'';for(let i=0;i<32;i++)if(draft.trueFalse)form.elements[`key-tf-${i}`].value=draft.trueFalse[i]==='Đ'?'true':'false';for(let i=0;i<6;i++)if(draft.numeric)form.elements[`key-num-${i}`].value=draft.numeric[i]||'';preview.textContent=`Đã đọc ${input.files[0].name}. ${draft.code?`Mã đề ${draft.code}.`:'Không tìm thấy mã đề trong tệp.'} Đã điền: ${[draft.multipleChoice?40:0,draft.trueFalse?32:0,draft.numeric?6:0].filter(Boolean).join(' + ')||'chưa nhận dạng được mục nào'}. Rà lại trước khi lưu.`;}catch(error){preview.innerHTML=`<span class="pill warn">${esc(error.message||'Không đọc được tệp')}</span>`;}
  }
  if(input.matches('[name="rosterFile"]')&&input.files[0]){
    const preview=root.querySelector('#roster-preview');preview.innerHTML='<span>…</span><div>Đang đọc danh sách trên iPhone…</div>';
    try{
      const rows=await importRosterFile(input.files[0],input.form.elements.defaultClass.value),old=await all('roster');
      if(rows.some(row=>!row.className))throw new Error('Nhập lớp mặc định trước khi chọn tệp, hoặc thêm cột Lớp vào bảng.');
      const seen=new Set(old.map(x=>`${x.className}\u0000${x.seatNumber}`)),counts=new Map();
      for(const row of rows){const key=`${row.className}\u0000${row.seatNumber}`;counts.set(key,(counts.get(key)||0)+1);}
      const duplicates=[...counts.values()].filter(x=>x>1).reduce((a,b)=>a+b,0)+rows.filter(x=>seen.has(`${x.className}\u0000${x.seatNumber}`)).length;
      state.importDraft.rows=rows;preview.classList.toggle('warning',duplicates>0);
      const classNames=[...new Set(rows.map(x=>x.className).filter(Boolean))].join(', ');
      preview.innerHTML=`<span>${duplicates?'!':'✓'}</span><div><strong>Đọc được ${rows.length} học sinh${duplicates?` · ${duplicates} SBD trùng`:''}</strong><p>${esc(classNames||'Chưa có tên lớp.')}</p></div>`;
      const foot=root.querySelector('.dialog-foot');if(foot)foot.innerHTML='<button class="button secondary" type="button" data-action="close-dialog">Hủy</button><button class="button" type="submit" form="roster-form" '+(rows.length?'':'disabled')+'>Thêm học sinh</button>';
    }catch(error){preview.classList.add('warning');preview.innerHTML=`<span>!</span><div>${esc(error.message||'Không đọc được tệp')}</div>`;}
  }
  if(input.matches('[data-photo]')&&input.files[0])await handlePhoto(input);
  if(input.matches('[data-pdf]')&&input.files[0])await handlePdf(input);
}
async function handlePhoto(input){
  stopCamera();
  const draft=state.captureDraft,number=Number(input.dataset.photo);if(!draft)return;draft.cameraUsed=false;draft.cameraStable=false;draft.cameraStatus='';
  const form=input.form,f=new FormData(form),preserveAnswers=number===2&&!!draft.scanResult,formAnswers=preserveAnswers&&!form.elements['mc-0'].disabled?answersFromForm(form):null;
  if(!form.elements.seatNumber.disabled)draft.seatNumber=String(f.get('seatNumber')||'');if(!form.elements.examCode.disabled)draft.examCode=String(f.get('examCode')||'');try{
    notify(`Đang đọc trang ${number}…`);
    const original=input.files[0],photo=await imageBlob(original);
    if(number===1){draft.firstPage=original;draft.scanPage=photo;draft.manual=false;}else draft.secondPage=original;
    if(draft.scanPage)draft.scanResult=await scanPhoto(draft.scanPage,draft.secondPage?2:1);
    if(draft.scanResult&&!draft.manual){const data=await localState(),exam=data.exams.find(x=>x.id===draft.examId);draft.examKey=exam?.answerKey||{};draft.policy=exam?policyFor(exam):{};if(formAnswers){draft.scanResult.answers.multipleChoice=formAnswers.multipleChoice;draft.scanResult.answers.trueFalse=formAnswers.trueFalse;draft.scanResult.answers.numeric=formAnswers.numeric;}draft.score=exam?scoreFor(exam,draft.scanResult.answers):null;if(number===1){draft.seatNumber=draft.scanResult.seatNumber||draft.seatNumber;draft.examCode=draft.scanResult.examCode||draft.examCode;}}
    captureDialogContent({id:draft.batchId,examId:draft.examId,className:draft.className},await localState());notify(number===1?'Đã đọc phiếu. Kiểm tra ô được đánh dấu.':'Đã giữ ảnh trang sau trên iPhone.');
  }catch(error){notify(error.message||'Không xử lý được ảnh.');}
}
async function handlePdf(input){
  stopCamera();
  const draft=state.captureDraft;if(!draft)return;draft.cameraUsed=false;draft.cameraStable=false;draft.cameraStatus='';
  try{
    notify('Đang dựng hai trang PDF trên thiết bị…');
    const {renderPdfPages}=await import('./imports.mjs'),pages=await renderPdfPages(input.files[0]);
    draft.firstPage=pages[0]||null;draft.scanPage=draft.firstPage;draft.secondPage=pages[1]||null;
    draft.scanResult=draft.scanPage?await scanPhoto(draft.scanPage,draft.secondPage?2:pages.totalPages):null;
    const data=await localState(),exam=data.exams.find(e=>e.id===draft.examId);
    if(draft.scanResult){draft.seatNumber=draft.scanResult.seatNumber;draft.examCode=draft.scanResult.examCode;draft.examKey=exam?.answerKey||{};draft.policy=exam?policyFor(exam):{};draft.score=exam?scoreFor(exam,draft.scanResult.answers):null;}
    captureDialogContent({id:draft.batchId,examId:draft.examId,className:draft.className},data);notify('Đã đọc trang PDF. Kiểm tra cảnh báo và đáp án.');
  }catch(error){notify(error.message||'Không đọc được PDF.');}
}

async function handleInput(event){
  const input=event.target;
  if(input.matches('#capture-form input[name="seatNumber"],#capture-form input[name="examCode"]')&&state.captureDraft){state.captureDraft[input.name]=input.value;}
  if(input.closest('#capture-form')&&/^(mc-|tf-|num-)/.test(input.name||''))refreshCaptureScore(input.form);
}
function refreshCaptureScore(form){
  const draft=state.captureDraft;if(!draft?.scanResult||!form)return;
  const dataScore=answersFromForm(form),lastWarnings=draft.scanResult.answers.reviewItems;
  dataScore.reviewItems=lastWarnings;draft.score=gradeSubmission(draft.examKey||{},dataScore,draft.policy||{});
  const chips=form.querySelectorAll('.score-chip');
  const values=[draft.score.multipleChoiceEarned,draft.score.trueFalseEarned,draft.score.numericEarned,draft.score.totalEarned],possible=[draft.score.multipleChoicePossible,draft.score.trueFalsePossible,draft.score.numericPossible,draft.score.totalPossible];
  chips.forEach((chip,index)=>{const strong=chip.querySelector('strong');if(strong)strong.textContent=`${fmt(values[index])} / ${fmt(possible[index])}`;});
}
async function handleFocusOut(event){
  const form=event.target.closest('#capture-form');if(!form||!state.captureDraft)return;
  const draft=state.captureDraft,fields=new FormData(form);draft.seatNumber=String(fields.get('seatNumber')||'');draft.examCode=String(fields.get('examCode')||'');
}

async function boot(){
  try{db=await openDatabase();await render();navigator.storage?.persist?.().catch(()=>{});}
  catch(error){root.innerHTML=`<main><div class="notice error"><span>!</span><div><strong>Không mở được kho dữ liệu trên iPhone</strong><p>${esc(error.message||'Bật IndexedDB trong cài đặt Safari, rồi mở lại app.')}</p></div></div></main>`;}
  root.addEventListener('click',event=>handleClick(event));root.addEventListener('submit',event=>handleSubmit(event));root.addEventListener('change',event=>handleChange(event));root.addEventListener('input',event=>handleInput(event));root.addEventListener('focusout',event=>handleFocusOut(event));
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&cameraStream)stopCamera();});
  addEventListener('online',render);addEventListener('offline',render);
}
boot();
