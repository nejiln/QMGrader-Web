import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { FORM, canonicalDecimal, emptyAnswers, gradeSubmission, hasFormMarkers, parseCSV, rosterRows, scanForm, scanSignature, scoreCSV } from '../core.mjs';
import { extractAnswerKey, extractAnswerKeyVariants } from '../imports.mjs';

assert.equal(extractAnswerKey('MÃ ĐỀ: 1234').code,'1234');
assert.equal(extractAnswerKey('Mã đề thi số | 0042').code,'0042');
assert.equal(extractAnswerKey('Mã đề | 42').code,'0042');
assert.equal(extractAnswerKey('Đáp án câu 1234').code,'');
const testCodes=['9001','9002','9003','9004','9005','9006'];
const answerTable=[['Câu hỏi','Mã đề thi'],[null,...testCodes],...Array.from({length:12},(_,i)=>[i+1,...testCodes.map((_,j)=>'ABCD'[(i+j)%4])]),...[0,1,2].map((n)=>[13+n,...testCodes.map((_,i)=>n===0?'ĐĐSĐ':i%2?'SĐĐĐ':'ĐSĐS')]),[16,...testCodes.map((_,i)=>String(i-2))],[17,...testCodes.map((_,i)=>i===0?'-1,25':`${i},5`)],[18,...testCodes.map((_,i)=>String(i+1))],[19,...testCodes.map((_,i)=>`${i},25`)]];
const answerVariants=extractAnswerKeyVariants('',[answerTable]);
assert.deepEqual(answerVariants.map(({code})=>code),testCodes);
assert.deepEqual(answerVariants[0].questionCounts,{multipleChoice:12,trueFalse:3,numeric:4});
assert.equal(answerVariants[0].key.multipleChoice[11],'D');
assert.deepEqual(answerVariants[0].key.trueFalse.slice(0,4),[true,true,false,true]);
assert.equal(answerVariants[0].key.numeric[1],'-1,25');
assert.equal(answerVariants[2].key.multipleChoice[0],'C');
assert.equal(answerVariants[2].key.numeric[0],'0');
const wordVariants=extractAnswerKeyVariants('Phần I từ câu 1 đến câu 2. Phần II từ câu 1 đến câu 1. Phần III từ câu 1 đến câu 2.',[
  [['Câu',1,2],[9001,'A','D']],
  [['Câu','Lệnh hỏi','Mã đề thi 9001'],[1,'a','Đúng'],[null,'b','Sai'],[null,'c','Đúng'],[null,'d','Sai']],
  [['Câu','Mã đề thi 9001'],[1,'-2,5'],[2,'0.75']]
]);
assert.deepEqual(wordVariants.map(({code})=>code),['9001']);
assert.equal(wordVariants[0].key.multipleChoice[1],'D');
assert.deepEqual(wordVariants[0].key.trueFalse.slice(0,4),[true,false,true,false]);
assert.deepEqual(wordVariants[0].key.numeric.slice(0,2),['-2,5','0.75']);
assert.deepEqual(wordVariants[0].questionCounts,{multipleChoice:2,trueFalse:1,numeric:2});

assert.equal(canonicalDecimal('-001,2500'), '-1.25');
assert.equal(canonicalDecimal('-0.000'), '0');
assert.equal(canonicalDecimal('1e4'), null);

const key={multipleChoice:Array(40).fill('A'),trueFalse:Array(32).fill(true),numeric:Array(6).fill('-1,25')};
const answers=emptyAnswers();answers.multipleChoice.fill('A');answers.trueFalse.fill(true);answers.numeric.fill('-1.250');
const policy={multipleChoiceTotal:40,trueFalseTotal:32,numericTotal:6,sectionTwoRule:'perStatement',multipleChoiceQuestionPoints:[],trueFalseQuestionPoints:[],numericQuestionPoints:[]};
assert.equal(gradeSubmission(key,answers,policy).totalEarned,78);
const partialAnswers=emptyAnswers();partialAnswers.multipleChoice=answerVariants[0].key.multipleChoice;partialAnswers.trueFalse=answerVariants[0].key.trueFalse;partialAnswers.numeric=answerVariants[0].key.numeric;
assert.equal(gradeSubmission(answerVariants[0].key,partialAnswers,{...policy,multipleChoiceTotal:12,trueFalseTotal:12,numericTotal:4}).totalEarned,28);
const weighted=gradeSubmission(answerVariants[0].key,partialAnswers,{...policy,questionCounts:answerVariants[0].questionCounts,multipleChoiceQuestionPoints:Array(12).fill(1),trueFalseQuestionPoints:Array(3).fill(2),numericQuestionPoints:Array(4).fill(3)});
assert.equal(weighted.totalEarned,30);
assert.equal(weighted.totalPossible,30);
answers.multipleChoice[0]='B';answers.trueFalse[0]=false;answers.numeric[0]='-1.24';
assert.equal(gradeSubmission(key,answers,policy).totalEarned,75);
policy.sectionTwoRule='allOrNothing';
assert.equal(gradeSubmission(key,answers,policy).trueFalseEarned,28);

const rows=parseCSV('\uFEFFSBD;Họ tên;Lớp\r\n00000123;"Nguyễn, An";12A1\r\n00000124;"Bình ""B""";12A1');
assert.deepEqual(rows[1],['00000123','Nguyễn, An','12A1']);
assert.equal(rosterRows(rows)[1].fullName,'Bình "B"');
assert.deepEqual(rosterRows(parseCSV('\uFEFFSBD;Họ tên;Lớp\r\n')),[]);
assert.throws(()=>rosterRows(parseCSV('\uFEFFSBD;Lớp\r\n123;12A1')),/SBD và họ tên/);
assert.match(scoreCSV([{seatNumber:'=2+2',studentName:'An',className:'12A1',examCode:'2025',score:gradeSubmission(key,{...answers},policy),needsReview:true}]),/"'=2\+2"/);

const width=595*FORM.scale,height=842*FORM.scale,gray=new Uint8Array(width*height).fill(255),skew=p=>[1+FORM.scale*(p[0]+0.02*p[1]),2+FORM.scale*(p[1]+0.01*p[0])];
function fillSquare(point,side,color=0){const [cx,cy]=skew(point),r=side*FORM.scale/2;for(let y=Math.floor(cy-r);y<=cy+r;y++)for(let x=Math.floor(cx-r);x<=cx+r;x++)if(x>=0&&y>=0&&x<width&&y<height)gray[y*width+x]=color;}
function fillBubble(point,color=0){const [cx,cy]=skew(point),r=3.5*FORM.scale;for(let y=Math.floor(cy-r);y<=cy+r;y++)for(let x=Math.floor(cx-r);x<=cx+r;x++)if((x-cx)**2+(y-cy)**2<=r*r&&x>=0&&y>=0&&x<width&&y<height)gray[y*width+x]=color;}
for(const point of [FORM.markers[0],FORM.markers[1],FORM.markers[2],FORM.markers[3]])fillSquare(point,12);
for(const point of FORM.orientation)fillSquare(point,8);
const seat='12345678',code='2025';
for(let c=0;c<8;c++)fillBubble([FORM.seatColumns[c],FORM.identityRows[Number(seat[c])]]);
for(let c=0;c<4;c++)fillBubble([FORM.codeColumns[c],FORM.identityRows[Number(code[c])]]);
for(let i=0;i<40;i++){const columns=FORM.mcColumns[Math.floor(i/10)],row=FORM.mcRows[i%10];fillBubble([columns[i%4],row]);}
for(let i=0;i<32;i++)fillBubble([FORM.tfColumns[Math.floor(i/4)][i%4===0?0:1],FORM.tfRows[i%4]]);
for(const columns of FORM.numericColumns){fillBubble([columns[0],FORM.signRow]);fillBubble([columns[1],FORM.decimalRow]);for(const [place,digit] of [[1,1],[2,2],[3,5]])fillBubble([columns[place],FORM.digitRows[digit]]);}
const scan=scanForm(gray,width,height,2);
assert.equal(scan.seatNumber,seat);
assert.equal(scan.examCode,code);
assert.equal(scan.answers.multipleChoice.length,40);
assert.ok(scan.answers.multipleChoice.every((value,index)=>value==='ABCD'[index%4]));
assert.ok(scan.answers.trueFalse.every((value,index)=>value===(index%4===0)));
assert.ok(scan.answers.numeric.every(value=>value==='-1.25'));
assert.equal(scan.answers.reviewItems.length,0);
const liveScale=2,liveWidth=FORM.pageWidth*liveScale,liveHeight=FORM.pageHeight*liveScale,liveGray=new Uint8Array(liveWidth*liveHeight);
for(let y=0;y<liveHeight;y++)for(let x=0;x<liveWidth;x++)liveGray[y*liveWidth+x]=gray[Math.floor(y*FORM.scale/liveScale)*width+Math.floor(x*FORM.scale/liveScale)];
assert.equal(hasFormMarkers(liveGray,liveWidth,liveHeight,liveScale),true);
const liveScan=scanForm(liveGray,liveWidth,liveHeight,2,liveScale);
assert.equal(liveScan.seatNumber,seat);
assert.equal(liveScan.examCode,code);
assert.equal(scanSignature(liveScan),scanSignature(scan));
const changedScan={...liveScan,answers:{...liveScan.answers,multipleChoice:liveScan.answers.multipleChoice.slice()}};changedScan.answers.multipleChoice[0]='B';
assert.notEqual(scanSignature(changedScan),scanSignature(liveScan));

const uncertain=new Uint8Array(gray);const q=0,xy=skew([FORM.mcColumns[0][1],FORM.mcRows[0]]);for(let y=Math.floor(xy[1]-10);y<=xy[1]+10;y++)for(let x=Math.floor(xy[0]-10);x<=xy[0]+10;x++)if(x>=0&&y>=0&&x<width&&y<height)uncertain[y*width+x]=185;
const flagged=scanForm(uncertain,width,height,1);
assert.equal(flagged.answers.multipleChoice[q],null);
assert.ok(flagged.answers.reviewItems.some(item=>item.includes('I-1')));
assert.ok(flagged.answers.reviewItems.some(item=>item.includes('đủ 2 trang')));

const serviceWorkerEvents={},deletedCaches=[],cacheNames=['another-app','qm-cham-v1','qm-cham-qmgrader-web-v2','qm-cham-qmgrader-web-v3','qm-cham-qmgrader-web-v4','qm-cham-qmgrader-web-v5','qm-cham-qmgrader-web-v6','qm-cham-qmgrader-web-v7','qm-cham-qmgrader-web-v8','qm-cham-qmgrader-web-v9','qm-cham-qmgrader-web-v10','qm-cham-qmgrader-web-v11','qm-cham-qmgrader-web-v12'];
vm.runInNewContext(await readFile(new URL('../sw.js',import.meta.url),'utf8'),{self:{addEventListener:(name,handler)=>serviceWorkerEvents[name]=handler,clients:{claim:async()=>{}}},caches:{keys:async()=>cacheNames,delete:async name=>deletedCaches.push(name)}});
let activation;serviceWorkerEvents.activate({waitUntil:promise=>activation=promise});await activation;
assert.deepEqual(deletedCaches.sort(),['qm-cham-v1','qm-cham-qmgrader-web-v2','qm-cham-qmgrader-web-v3','qm-cham-qmgrader-web-v4','qm-cham-qmgrader-web-v5','qm-cham-qmgrader-web-v6','qm-cham-qmgrader-web-v7','qm-cham-qmgrader-web-v8','qm-cham-qmgrader-web-v9','qm-cham-qmgrader-web-v10','qm-cham-qmgrader-web-v11'].sort());

for(const [system,saved,expected] of [['dark',null,'dark'],['light',null,'light'],['dark','light','light']]){
  const document={documentElement:{dataset:{}},querySelector:()=>({setAttribute(name,value){this[name]=value;}})};
  vm.runInNewContext(await readFile(new URL('../theme-init.js',import.meta.url),'utf8'),{document,matchMedia:()=>({matches:system==='dark'}),localStorage:{getItem:()=>saved}});
  assert.equal(document.documentElement.dataset.theme,expected);
}
console.log('QMGrader self-check passed: scoring, CSV, roster, 78 OMR marks, skew, uncertainty, missing page.');
