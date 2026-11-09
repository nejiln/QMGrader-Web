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
    return {text, tables: []};
  }
  throw new Error('Định dạng chưa hỗ trợ. Dùng CSV, XLSX, DOCX hoặc PDF.');
}

export async function renderPdfPages(file) {
  if (!file || file.size > MAX_FILE) throw new Error('PDF tối đa 50 MB.');
  const pdf = await pdfjs.getDocument({data: await file.arrayBuffer(), isEvalSupported: false}).promise;
  if (!pdf.numPages || pdf.numPages > 50) throw new Error('PDF phải có từ 1 đến 50 trang.');
  const pages=[];
  for(let number=1;number<=Math.min(2,pdf.numPages);number++){
    const page=await pdf.getPage(number),viewport=page.getViewport({scale:1}),scale=Math.min(3*595/viewport.width,3*842/viewport.height,3);
    const rendered=page.getViewport({scale}),canvas=document.createElement('canvas');canvas.width=Math.ceil(rendered.width);canvas.height=Math.ceil(rendered.height);
    const context=canvas.getContext('2d',{alpha:false});context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);
    await page.render({canvasContext:context,viewport:rendered,background:'rgb(255,255,255)'}).promise;
    pages.push(await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Không dựng được trang PDF.')),'image/jpeg',0.92)));
  }
  pages.totalPages=pdf.numPages;
  return pages;
}

export function extractAnswerKey(text) {
  const lines = String(text).split(/\r?\n/), sections = {1: [], 2: [], 3: []};
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
  const multipleChoice = choiceByNumber.size===40 ? Array.from({length:40},(_,i)=>choiceByNumber.get(i+1)).join('') : '';
  const tfText = plain(sections[2].join(' '));
  const tfValues = Array.from(tfText.matchAll(/\b(dung|sai|true|false)\b/gi), match => /^dung$|^true$/i.test(match[1])?'Đ':'S');
  const trueFalse = tfValues.length===32?tfValues.join(''):'';
  const numbers = new Map();
  for (const line of sections[3]) for (const match of plain(line).matchAll(/(?:cau\s*)?(\d{1,2})\s*[).:\-\s]+(-?\d+(?:[.,]\d+)?)(?=\s|$)/gi)) {
    const n=Number(match[1]); if(n>=1&&n<=6)numbers.set(n,match[2]);
  }
  const numeric = numbers.size===6 ? Array.from({length:6},(_,i)=>numbers.get(i+1)).join('; ') : '';
  return {multipleChoice,trueFalse,numeric};
}

export async function importRosterFile(file, defaultClass='') {
  const doc=await readDocument(file), rows=doc.tables[0] || parseCSV(doc.text);
  return rosterRows(rows,defaultClass);
}
