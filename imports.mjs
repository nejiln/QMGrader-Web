import { unzipSync, strFromU8 } from './vendor/fflate.js';
import * as pdfjs from './vendor/pdf.mjs';
import { normalizeHeader, parseCSV, rosterRows } from './core.mjs';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.min.mjs', import.meta.url).href;
const MAX_FILE = 50 * 1024 * 1024;
const plain = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d');

function xml(data) {
  const document = new DOMParser().parseFromString(strFromU8(data), 'application/xml');
  if (document.querySelector('parsererror')) throw new Error('Tệp Office hỏng hoặc không đúng định dạng.');
  return document;
}

function readZip(bytes, accept) {
  let total = 0, count = 0;
  return unzipSync(bytes, {filter: file => {
    if (++count > 3000 || file.originalSize > 20 * 1024 * 1024 || (total += file.originalSize) > 50 * 1024 * 1024) throw new Error('Tệp nén vượt giới hạn xử lý 50 MB.');
    return accept(file.name);
  }});
}

function xlsxTables(archive) {
  const shared = archive['xl/sharedStrings.xml'] ? Array.from(xml(archive['xl/sharedStrings.xml']).getElementsByTagNameNS('*','si'), item => item.textContent || '') : [];
  const paths = Object.keys(archive).filter(path => /^xl\/worksheets\/sheet\d+\.xml$/.test(path)).sort((a,b) => Number(a.match(/sheet(\d+)/)[1])-Number(b.match(/sheet(\d+)/)[1]));
  if (!paths.length || paths.length > 20) throw new Error('Không tìm thấy trang tính Excel hợp lệ.');
  return paths.map(path => {
    const rows = [];
    for (const row of xml(archive[path]).getElementsByTagNameNS('*','row')) {
      const cells = [];
      for (const cell of row.getElementsByTagNameNS('*','c')) {
        const column = String(cell.getAttribute('r') || '').match(/^[A-Z]+/i)?.[0] || 'A';
        let index = 0;
        for (const char of column.toUpperCase()) index = index * 26 + char.charCodeAt(0) - 64;
        index--;
        const value = cell.getElementsByTagNameNS('*','v')[0]?.textContent ?? cell.getElementsByTagNameNS('*','is')[0]?.textContent ?? '';
        cells[index] = cell.getAttribute('t') === 's' ? shared[Number(value)] ?? '' : value;
      }
      rows.push(Array.from({length: cells.length}, (_,i) => cells[i] ?? ''));
    }
    return rows;
  });
}

function docxTables(document,ns) {
  return Array.from(document.getElementsByTagNameNS(ns,'tbl'),table=>Array.from(table.getElementsByTagNameNS(ns,'tr'),row=>Array.from(row.getElementsByTagNameNS(ns,'tc'),cell=>Array.from(cell.getElementsByTagNameNS(ns,'p'),paragraph=>Array.from(paragraph.getElementsByTagNameNS(ns,'t'),node=>node.textContent).join('')).join(' '))));
}

async function readPdf(file) {
  const task = pdfjs.getDocument({data: await file.arrayBuffer(), isEvalSupported: false});
  const pdf = await task.promise;
  if (!pdf.numPages || pdf.numPages > 50) throw new Error('PDF phải có từ 1 đến 50 trang.');
  // shortcut: image-only PDFs require manual entry, add bundled on-device OCR when scanned-key import is required.
  const text = [];
  for (let i=1; i<=pdf.numPages; i++) {
    const page = await pdf.getPage(i), content = await page.getTextContent();
    text.push(content.items.map(item => `${item.str || ''}${item.hasEOL?'\n':' '}`).join(''));
  }
  return {text: text.join('\n'), tables: [], pages: pdf.numPages, scanned: text.join('').trim().length < 20};
}

export async function readDocument(file) {
  if (!file || file.size > MAX_FILE) throw new Error('Tệp tối đa 50 MB.');
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'csv' || ext === 'tsv') {
    const tables = [parseCSV(await file.text())];
    return {text: tables[0].map(row => row.join(' | ')).join('\n'), tables};
  }
  if (ext === 'pdf') return readPdf(file);
  if (ext === 'xlsx') {
    const archive = readZip(new Uint8Array(await file.arrayBuffer()), path => path === 'xl/sharedStrings.xml' || /^xl\/worksheets\/sheet\d+\.xml$/.test(path));
    const tables = xlsxTables(archive);
    return {text: tables.map(table => table.map(row => row.join(' | ')).join('\n')).join('\n\n'), tables};
  }
  if (ext === 'docx') {
    const archive = readZip(new Uint8Array(await file.arrayBuffer()), path => path === 'word/document.xml');
    const data = archive['word/document.xml'];
    if (!data) throw new Error('Không tìm thấy nội dung DOCX.');
    const document = xml(data);
    const ns='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const text=Array.from(document.getElementsByTagNameNS(ns,'p'),paragraph=>Array.from(paragraph.getElementsByTagNameNS(ns,'t'),node=>node.textContent).join('')).join('\n');
    return {text, tables: docxTables(document,ns)};
  }
  throw new Error('Định dạng chưa hỗ trợ. Dùng CSV, XLSX, DOCX hoặc PDF.');
}

export async function renderPdfPages(file) {
  if (!file || file.size > MAX_FILE) throw new Error('PDF tối đa 50 MB.');
  const pdf = await pdfjs.getDocument({data: await file.arrayBuffer(), isEvalSupported: false}).promise;
  if (!pdf.numPages) throw new Error('PDF không có trang hợp lệ.');
  const page=await pdf.getPage(1),viewport=page.getViewport({scale:1}),scale=Math.min(3*595/viewport.width,3*842/viewport.height,3);
  const rendered=page.getViewport({scale}),canvas=document.createElement('canvas');canvas.width=Math.ceil(rendered.width);canvas.height=Math.ceil(rendered.height);
  const context=canvas.getContext('2d',{alpha:false});context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);
  await page.render({canvasContext:context,viewport:rendered,background:'rgb(255,255,255)'}).promise;
  return [await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Không dựng được trang PDF.')),'image/jpeg',0.92))];
}

export function extractAnswerKey(text) {
  const lines = String(text).split(/\r?\n/), sections = {1: [], 2: [], 3: []};
  const code = plain(text).match(/\bma\s*de(?:\s*thi)?(?:\s*so)?\s*[\s:#=|–—-]*(\d{1,4})\b/i)?.[1].padStart(4,'0') || '';
  const multipleChoice=Array(40).fill(''),trueFalse=Array(32).fill(null),numeric=Array(6).fill('');
  let section = 0;
  for (const line of lines) {
    const normalized = normalizeHeader(line).replace(/\s/g, '');
    if (normalized.includes('phaniv')) { section = 0; continue; }
    if (normalized.includes('phaniii')) { section = 3; continue; }
    if (normalized.includes('phanii')) { section = 2; continue; }
    if (normalized.includes('phani')) { section = 1; continue; }
    if (section) sections[section].push(line);
  }
  const choiceByNumber = new Map();
  for (const line of sections[1]) for (const match of plain(line).matchAll(/(?:cau\s*)?(\d{1,2})\s*[).:\-\s]+([ABCD])\b/gi)) {
    const n=Number(match[1]); if(n>=1&&n<=40)choiceByNumber.set(n,match[2].toUpperCase());
  }
  for(const [question,value] of choiceByNumber)multipleChoice[question-1]=value;
  const tfText = plain(sections[2].join(' '));
  const tfValues = Array.from(tfText.matchAll(/\b(dung|sai|true|false)\b/gi), match => /^dung$|^true$/i.test(match[1]));
  tfValues.slice(0,32).forEach((value,index)=>trueFalse[index]=value);
  const numbers = new Map();
  for (const line of sections[3]) for (const match of plain(line).matchAll(/(?:cau\s*)?(\d{1,2})\s*[).:\-\s]+(-?\d+(?:[.,]\d+)?)(?=\s|$)/gi)) {
    const n=Number(match[1]); if(n>=1&&n<=6)numbers.set(n,match[2]);
  }
  for(const [question,value] of numbers)numeric[question-1]=value;
  return {code,multipleChoice,trueFalse,numeric};
}

export function extractAnswerKeyVariants(text,tables=[]) {
  const variants=[];
  for(const table of tables){
    const header=table.findIndex(row=>row.some(cell=>normalizeHeader(cell)==='cauhoi')&&row.some(cell=>normalizeHeader(cell).includes('made')));
    if(header<0)continue;
    const codeRow=table[header+1]||[],columns=codeRow.map((value,index)=>({index,code:String(value??'').trim()})).filter(({index,code})=>index>0&&/^\d{1,4}$/.test(code));
    if(!columns.length)continue;
    if(columns.length>100)throw new Error('Tệp có hơn 100 mã đề. Chia tệp trước khi nhập.');
    const rows=table.slice(header+2).map(row=>{
      const question=Number(String(row[0]??'').trim()),values=columns.map(({index})=>String(row[index]??'').trim().toUpperCase());
      if(!Number.isInteger(question)||question<1)return null;
      if(values.some(value=>/^[ABCD]$/.test(value)))return {type:'multipleChoice',question,values};
      if(values.some(value=>/^[ĐDS]{4}$/.test(value)))return {type:'trueFalse',question,values};
      if(values.some(value=>/^-?\d+(?:[.,]\d+)?$/.test(value)))return {type:'numeric',question,values};
      return null;
    });
    const questionCounts={multipleChoice:Math.max(0,...rows.filter(row=>row?.type==='multipleChoice').map(row=>row.question)),trueFalse:rows.filter(row=>row?.type==='trueFalse').length,numeric:rows.filter(row=>row?.type==='numeric').length};
    for(let column=0;column<columns.length;column++){
      const {index,code}=columns[column];
      const normalizedCode=code.padStart(4,'0');
      if(variants.some(variant=>variant.code===normalizedCode))throw new Error(`Mã đề ${normalizedCode} bị lặp trong tệp.`);
      const key={multipleChoice:Array(40).fill(''),trueFalse:Array(32).fill(null),numeric:Array(6).fill('')};
      let trueFalseQuestion=0,numericQuestion=0;
      for(const row of rows){
        if(!row)continue;
        const value=row.values[column];
        if(row.type==='multipleChoice'&&/^[ABCD]$/.test(value)&&row.question<=40)key.multipleChoice[row.question-1]=value;
        else if(row.type==='trueFalse'){if(/^[ĐDS]{4}$/.test(value)&&trueFalseQuestion<8)for(let i=0;i<4;i++)key.trueFalse[trueFalseQuestion*4+i]=value[i]==='S'?false:true;trueFalseQuestion++;}
        else if(row.type==='numeric'){if(/^-?\d+(?:[.,]\d+)?$/.test(value)&&numericQuestion<6)key.numeric[numericQuestion]=value;numericQuestion++;}
      }
      variants.push({code:normalizedCode,key,questionCounts});
    }
  }
  if(variants.length)return variants;
  const wordVariants=new Map(),codeForHeader=value=>normalizeHeader(value).match(/^made(?:thi)?(\d{1,4})$/)?.[1];
  const getWordVariant=code=>{
    const normalized=String(code||'').padStart(4,'0');
    if(!/^\d{4}$/.test(normalized))return null;
    if(!wordVariants.has(normalized)){
      if(wordVariants.size>=100)throw new Error('Tệp có hơn 100 mã đề. Chia tệp trước khi nhập.');
      wordVariants.set(normalized,{code:normalized,key:{multipleChoice:Array(40).fill(''),trueFalse:Array(32).fill(null),numeric:Array(6).fill('')},questionCounts:{multipleChoice:0,trueFalse:0,numeric:0}});
    }
    return wordVariants.get(normalized);
  };
  for(const table of tables){
    const choiceHeader=table.findIndex(row=>normalizeHeader(row[0])==='cau'&&row.length>1&&row.slice(1).every((value,index)=>Number(value)===index+1));
    if(choiceHeader>=0){
      for(const row of table.slice(choiceHeader+1)){
        if(!/^\d{1,4}$/.test(String(row[0]??'').trim()))continue;
        const variant=getWordVariant(row[0]);if(!variant)continue;
        for(let column=1;column<row.length&&column<=40;column++)if(/^[ABCD]$/i.test(String(row[column]??'').trim())){variant.key.multipleChoice[column-1]=String(row[column]).trim().toUpperCase();variant.questionCounts.multipleChoice=Math.max(variant.questionCounts.multipleChoice,column);}
      }
      continue;
    }
    const statementColumn=table.findIndex(row=>row.some(cell=>normalizeHeader(cell)==='lenhhoi')&&row.some(codeForHeader));
    if(statementColumn>=0){
      const headers=table[statementColumn],questionPart=headers.findIndex(cell=>normalizeHeader(cell)==='lenhhoi'),codes=headers.map((value,index)=>({index,code:codeForHeader(value)})).filter(item=>item.code);let question=0;
      for(const row of table.slice(statementColumn+1)){
        const number=Number(String(row[0]??'').trim());if(Number.isInteger(number)&&number>0&&number<=8)question=number;
        const letter=normalizeHeader(row[questionPart]).match(/^([abcd])(?:[.)])?$/)?.[1];if(!question||!letter)continue;
        const answerIndex=(question-1)*4+'abcd'.indexOf(letter);
        for(const {index,code} of codes){
          const value=normalizeHeader(row[index]),answer=value==='d'||value==='dung'?true:value==='s'||value==='sai'?false:null;
          if(answer!==null){const variant=getWordVariant(code);variant.key.trueFalse[answerIndex]=answer;variant.questionCounts.trueFalse=Math.max(variant.questionCounts.trueFalse,question);}
        }
      }
      continue;
    }
    const numericHeader=table.findIndex(row=>normalizeHeader(row[0])==='cau'&&row.some(codeForHeader));
    if(numericHeader>=0){
      const headers=table[numericHeader],codes=headers.map((value,index)=>({index,code:codeForHeader(value)})).filter(item=>item.code);
      for(const row of table.slice(numericHeader+1)){
        const question=Number(String(row[0]??'').trim());if(!Number.isInteger(question)||question<1||question>6)continue;
        for(const {index,code} of codes){const value=String(row[index]??'').trim();if(/^-?\d+(?:[.,]\d+)?$/.test(value)){const variant=getWordVariant(code);variant.key.numeric[question-1]=value;variant.questionCounts.numeric=Math.max(variant.questionCounts.numeric,question);}}
      }
    }
  }
  if(wordVariants.size){
    const source=plain(text),expected=roman=>{const start=source.indexOf(`phan ${roman}`);if(start<0)return 0;const next=source.indexOf('phan ',start+5),section=source.slice(start,next<0?undefined:next),match=section.match(/tu\s*cau\s*1\s*den\s*cau\s*(\d+)/);return Number(match?.[1])||0;};
    for(const variant of wordVariants.values()){
      variant.questionCounts.multipleChoice=Math.max(variant.questionCounts.multipleChoice,Math.min(40,expected('i')));
      variant.questionCounts.trueFalse=Math.max(variant.questionCounts.trueFalse,Math.min(8,expected('ii')));
      variant.questionCounts.numeric=Math.max(variant.questionCounts.numeric,Math.min(6,expected('iii')));
    }
    return [...wordVariants.values()];
  }
  const key=extractAnswerKey(text);
  const answerKey={multipleChoice:key.multipleChoice,trueFalse:key.trueFalse,numeric:key.numeric},counts={multipleChoice:answerKey.multipleChoice.findLastIndex(Boolean)+1,trueFalse:Math.ceil((answerKey.trueFalse.findLastIndex(value=>value!==null)+1)/4),numeric:answerKey.numeric.findLastIndex(Boolean)+1};
  return key.code?[{code:key.code,key:answerKey,questionCounts:counts}]:[];
}

export async function importRosterFile(file, defaultClass='') {
  const doc=await readDocument(file), rows=doc.tables[0] || parseCSV(doc.text);
  return rosterRows(rows,defaultClass);
}
