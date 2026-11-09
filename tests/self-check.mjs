import assert from 'node:assert/strict';
import { FORM, canonicalDecimal, emptyAnswers, gradeSubmission, parseCSV, rosterRows, scanForm, scoreCSV } from '../core.mjs';

assert.equal(canonicalDecimal('-001,2500'), '-1.25');
assert.equal(canonicalDecimal('-0.000'), '0');
assert.equal(canonicalDecimal('1e4'), null);

const key={multipleChoice:Array(40).fill('A'),trueFalse:Array(32).fill(true),numeric:Array(6).fill('-1,25')};
const answers=emptyAnswers();answers.multipleChoice.fill('A');answers.trueFalse.fill(true);answers.numeric.fill('-1.250');
const policy={multipleChoiceTotal:40,trueFalseTotal:32,numericTotal:6,sectionTwoRule:'perStatement',multipleChoiceQuestionPoints:[],trueFalseQuestionPoints:[],numericQuestionPoints:[]};
assert.equal(gradeSubmission(key,answers,policy).totalEarned,78);
answers.multipleChoice[0]='B';answers.trueFalse[0]=false;answers.numeric[0]='-1.24';
assert.equal(gradeSubmission(key,answers,policy).totalEarned,75);
policy.sectionTwoRule='allOrNothing';
assert.equal(gradeSubmission(key,answers,policy).trueFalseEarned,28);

const rows=parseCSV('\uFEFFSBD;Họ tên;Lớp\r\n00000123;"Nguyễn, An";12A1\r\n00000124;"Bình ""B""";12A1');
assert.deepEqual(rows[1],['00000123','Nguyễn, An','12A1']);
assert.equal(rosterRows(rows)[1].fullName,'Bình "B"');
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

const uncertain=new Uint8Array(gray);const q=0,xy=skew([FORM.mcColumns[0][1],FORM.mcRows[0]]);for(let y=Math.floor(xy[1]-10);y<=xy[1]+10;y++)for(let x=Math.floor(xy[0]-10);x<=xy[0]+10;x++)if(x>=0&&y>=0&&x<width&&y<height)uncertain[y*width+x]=185;
const flagged=scanForm(uncertain,width,height,1);
assert.equal(flagged.answers.multipleChoice[q],null);
assert.ok(flagged.answers.reviewItems.some(item=>item.includes('I-1')));
assert.ok(flagged.answers.reviewItems.some(item=>item.includes('đủ 2 trang')));
console.log('QMGrader self-check passed: scoring, CSV, roster, 78 OMR marks, skew, uncertainty, missing page.');
