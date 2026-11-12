export const FORM = Object.freeze({
  pageWidth: 595, pageHeight: 842, scale: 3,
  markers: [[33.9,49.8],[560.3,49.8],[33.9,792.1],[560.3,792.1]],
  orientation: [[395.1,97.5],[505.2,97.5]],
  identityRows: [115.9,130.8,145.6,160.5,175.4,190.3,205.2,220,234.9,249.8],
  seatColumns: [410.9,421.4,431.9,442.5,452.9,463.5,473.9,484.5],
  codeColumns: [520.2,530.8,541.2,551.8],
  mcColumns: [[64.9,92.4,119.9,147.4],[196.6,224,251.5,278.9],[328.2,355.6,383,410.5],[459.7,487.2,514.7,542.2]],
  mcRows: [317.8,330.6,343.5,356.3,369,381.9,394.7,407.6,420.4,433.2],
  tfColumns: [[64.9,92.4],[119.9,147.4],[196.6,224],[251.5,278.9],[328.2,355.6],[383,410.5],[459.7,487.2],[514.7,542.2]],
  tfRows: [509.4,522.3,535.1,548],
  numericColumns: [[64.9,77.8,90.6,103.4],[152.8,165.5,178.3,191.2],[240.5,253.3,266,278.9],[328.2,341,353.8,366.6],[415.9,428.8,441.6,454.3],[503.6,516.5,529.3,542.2]],
  signRow: 625.7, decimalRow: 638.6,
  digitRows: [651.3,664.1,676.9,689.7,702.6,715.4,728.3,741,753.9,766.7]
});
export const PHOTO_FORM = Object.freeze({
  ...FORM,
  markers:[[38.3,48],[542.5,48],[33,798],[546,797]],orientation:[[379,47.5]],
  identityRows:[101.8,117.6,133.3,148.9,164.9,180.8,196.6,212.5,228.4,244.3],
  seatColumns:[390.5,401.6,412.8,424.5,434.6,445.5,456.6,467.5],codeColumns:[495.5,506.4,516.9,527.8],
  mcColumns:[[80.5,104.5,129.3,152.5],[200.5,224.5,248.2,271.5],[318.5,342.5,365.9,389.5],[437.4,461.3,485.2,508.5]],
  mcRows:[323,335,347.2,359.2,371.7,384.5,396.9,408.7,420.9,433.2],
  tfColumns:[[79.5,103.8],[129,152.5],[200.5,224.5],[248.5,271.5],[318.5,342.5],[366.8,390.5],[438,462],[486,510.2]],tfRows:[500.5,512.6,524.7,536.8],
  numericColumns:[[74.8,91.5,107.9,124.5],[151.8,168.2,184.8,201.2],[228.4,244.8,261.4,278.2],[304.7,322.1,338.7,355.5],[382.4,399.1,416,432.5],[459.4,476.2,492.7,509.5]],
  signRow:610.2,decimalRow:622.7,digitRows:[636.4,649,662,675.1,687.7,700.2,713.4,725.8,739.2,752.4]
});

export const emptyAnswers = () => ({
  multipleChoice: Array(40).fill(null), trueFalse: Array(32).fill(null), numeric: Array(6).fill(null), reviewItems: []
});

export function canonicalDecimal(value) {
  const text = String(value ?? '').trim().replace(',', '.');
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) return null;
  let [whole, fraction = ''] = text.replace(/^-/, '').split('.');
  whole = whole.replace(/^0+(?=\d)/, '');
  fraction = fraction.replace(/0+$/, '');
  const zero = /^0+$/.test(whole) && !fraction;
  return `${text.startsWith('-') && !zero ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
}

const questionPoints = (weights, total, index, count, active=count) => Array.isArray(weights) && (weights.length === count || weights.length === active) ? Number(weights[index]) || 0 : (Number(total) || 0) / Math.max(active,1);

export function gradeSubmission(key, answers, policy) {
  const mcCount=policy.questionCounts?.multipleChoice??((key.multipleChoice?.findLastIndex(Boolean)??-1)+1),tfQuestions=Array.from({length:8},(_,q)=>key.trueFalse?.slice(q*4,q*4+4).some(value=>value!==null)),tfCount=policy.questionCounts?.trueFalse??(tfQuestions.findLastIndex(Boolean)+1),numericCount=policy.questionCounts?.numeric??((key.numeric?.findLastIndex(value=>canonicalDecimal(value)!==null)??-1)+1);
  const score = {
    multipleChoiceEarned: 0, multipleChoicePossible: 0,
    trueFalseEarned: 0, trueFalsePossible: 0,
    numericEarned: 0, numericPossible: 0
  };
  score.multipleChoicePossible = mcCount ? Array.isArray(policy.multipleChoiceQuestionPoints) && [40,mcCount].includes(policy.multipleChoiceQuestionPoints.length) ? policy.multipleChoiceQuestionPoints.slice(0,mcCount).reduce((sum,value)=>sum+Number(value||0),0) : Number(policy.multipleChoiceTotal)||0 : 0;
  score.trueFalsePossible = tfCount ? Array.isArray(policy.trueFalseQuestionPoints) && [8,tfCount].includes(policy.trueFalseQuestionPoints.length) ? policy.trueFalseQuestionPoints.slice(0,tfCount).reduce((sum,value)=>sum+Number(value||0),0) : Number(policy.trueFalseTotal)||0 : 0;
  score.numericPossible = numericCount ? Array.isArray(policy.numericQuestionPoints) && [6,numericCount].includes(policy.numericQuestionPoints.length) ? policy.numericQuestionPoints.slice(0,numericCount).reduce((sum,value)=>sum+Number(value||0),0) : Number(policy.numericTotal)||0 : 0;
  for (let i = 0; i < 40; i++) if (key.multipleChoice?.[i] && key.multipleChoice[i] === answers.multipleChoice?.[i]) score.multipleChoiceEarned += questionPoints(policy.multipleChoiceQuestionPoints, policy.multipleChoiceTotal, i, 40, mcCount);
  for (let q = 0; q < 8; q++) {
    const matches = Array.from({length:4}, (_, j) => key.trueFalse?.[q * 4 + j] != null && answers.trueFalse?.[q * 4 + j] != null && key.trueFalse[q * 4 + j] === answers.trueFalse[q * 4 + j]);
    const points = questionPoints(policy.trueFalseQuestionPoints, policy.trueFalseTotal, q, 8, tfCount);
    if (policy.sectionTwoRule === 'allOrNothing') {
      if (matches.every(Boolean)) score.trueFalseEarned += points;
    } else score.trueFalseEarned += matches.filter(Boolean).length * points / 4;
  }
  for (let i = 0; i < 6; i++) {
    const expected = canonicalDecimal(key.numeric?.[i]);
    if (expected !== null && expected === canonicalDecimal(answers.numeric?.[i])) score.numericEarned += questionPoints(policy.numericQuestionPoints, policy.numericTotal, i, 6, numericCount);
  }
  score.totalEarned = score.multipleChoiceEarned + score.trueFalseEarned + score.numericEarned;
  score.totalPossible = score.multipleChoicePossible + score.trueFalsePossible + score.numericPossible;
  return score;
}

export function regradeSubmission(submission, exams, roster, seatNumber, examCode, answers) {
  if(!/^\d{8}$/.test(seatNumber)||!/^\d{4}$/.test(examCode))throw new Error('SBD phải đủ 8 số, mã đề phải đủ 4 số.');
  const exam=exams.find(item=>item.code===examCode);
  if(!exam)throw new Error(`Không tìm thấy đề mã ${examCode}. Nạp đáp án mã này trước khi chấm lại.`);
  answers.reviewItems=(Array.isArray(answers.reviewItems)?answers.reviewItems:(submission.answers?.reviewItems||[])).filter(message=>!message.startsWith('SBD đã sửa')&&!message.startsWith('Mã đề đã sửa')&&!(message.startsWith('SBD ')&&message.includes('danh sách lớp'))&&!(message.startsWith('Mã đề ')&&message.includes('khác mã đề đã chọn')));
  if(seatNumber!==submission.recognizedSeatNumber)answers.reviewItems.push('SBD đã sửa sau khi nhận dạng');
  if(examCode!==submission.recognizedExamCode)answers.reviewItems.push('Mã đề đã sửa sau khi nhận dạng');
  const matches=roster.filter(item=>item.className===submission.className&&item.seatNumber===seatNumber);
  if(matches.length>1)answers.reviewItems.push(`SBD ${seatNumber}: trùng trong danh sách lớp`);
  if(!matches.length)answers.reviewItems.push(`SBD ${seatNumber}: không khớp danh sách lớp`);
  return {...submission,examId:exam.id,seatNumber,examCode,studentName:matches.length===1?matches[0].fullName:'',answers,score:gradeSubmission(exam.answerKey,answers,{...exam.policy,questionCounts:exam.questionCounts}),needsReview:answers.reviewItems.length>0,reviewed:false,confirmed:false};
}

export function parseCSV(text) {
  const source = String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const sample = source.split('\n', 2)[0] || '';
  const delimiter = [',',';','\t'].sort((a,b) => sample.split(b).length - sample.split(a).length)[0];
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i=0; i<source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (c === '"' && source[i+1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === delimiter) { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); if (row.some(cell => cell.trim())) rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field || row.length) { row.push(field); if (row.some(cell => cell.trim())) rows.push(row); }
  return rows;
}

export const normalizeHeader = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]/g, '');

export function rosterRows(rows, defaultClass = '') {
  const header = rows[0]?.map(normalizeHeader) || [];
  const seat = header.findIndex(x => ['sbd','sobodanh','masothisinh'].includes(x));
  const name = header.findIndex(x => ['hoten','hovaten','tenhocsinh','fullname','name'].includes(x));
  const classIndex = header.findIndex(x => ['lop','lophoc','class','classname'].includes(x));
  if (seat < 0 || name < 0) throw new Error('Không tìm thấy cột SBD và họ tên trong dòng tiêu đề.');
  return rows.slice(1).flatMap(row => {
    const id = String(row[seat] ?? '').trim(), fullName = [row[name],header[name]==='hovaten'&&!header[name+1]?row[name+1]:''].map(value=>String(value??'').trim()).filter(Boolean).join(' ');
    if (!id || !fullName) return [];
    const normalizedId = /^\d+$/.test(id) && id.length < 8 ? id.padStart(8, '0') : id;
    return [{id: crypto.randomUUID(), seatNumber: normalizedId, fullName, className: String(row[classIndex] ?? '').trim() || defaultClass.trim()}];
  });
}

const homographies=new WeakMap();
function markerMap(point, observed, scale=FORM.scale, markers=FORM.markers) {
  let h=homographies.get(observed);
  if(!h){
    const rows=[];
    for(let i=0;i<4;i++){
      const u=markers[i][0]/FORM.pageWidth,v=markers[i][1]/FORM.pageHeight,x=observed[i][0],y=observed[i][1];
      rows.push([[u,v,1,0,0,0,-u*x,-v*x],x],[[0,0,0,u,v,1,-u*y,-v*y],y]);
    }
    for(let col=0;col<8;col++){
      let pivot=col;for(let row=col+1;row<8;row++)if(Math.abs(rows[row][0][col])>Math.abs(rows[pivot][0][col]))pivot=row;
      [rows[col],rows[pivot]]=[rows[pivot],rows[col]];const divisor=rows[col][0][col];
      if(Math.abs(divisor)<1e-10)return [point[0]*scale,point[1]*scale];
      for(let j=col;j<8;j++)rows[col][0][j]/=divisor;rows[col][1]/=divisor;
      for(let row=0;row<8;row++)if(row!==col){const factor=rows[row][0][col];for(let j=col;j<8;j++)rows[row][0][j]-=factor*rows[col][0][j];rows[row][1]-=factor*rows[col][1];}
    }
    h=rows.map(row=>row[1]);homographies.set(observed,h);
  }
  const u=point[0]/FORM.pageWidth,v=point[1]/FORM.pageHeight,denominator=h[6]*u+h[7]*v+1;
  return [(h[0]*u+h[1]*v+h[2])/denominator*scale,(h[3]*u+h[4]*v+h[5])/denominator*scale];
}
export function mapProfilePoint(point, observed, profile=FORM) {
  return observed?.length===4 ? markerMap(point, observed, 1, profile.markers) : point;
}

function findMarker(pixels,width,height,center,minSize=10,scale=FORM.scale) {
  const s=scale, expectedX=center[0]*s, expectedY=center[1]*s, radius=70*s;
  const left=Math.max(0,Math.floor(expectedX-radius)),right=Math.min(width-1,Math.floor(expectedX+radius));
  const top=Math.max(0,Math.floor(expectedY-radius)),bottom=Math.min(height-1,Math.floor(expectedY+radius));
  const rw=right-left+1,rh=bottom-top+1;
  if (rw<=0||rh<=0) return null;
  const min=Math.floor(minSize*s), max=20*s;
  for (const darkThreshold of [75, 115]) {
    const seen=new Uint8Array(rw*rh);
    let best=null,bestDistance=Infinity;
    for (let start=0;start<seen.length;start++) {
      if (seen[start]) continue;
      const sx=left+start%rw,sy=top+Math.floor(start/rw); seen[start]=1;
      if (pixels[sy*width+sx]>=darkThreshold) continue;
      const queue=[start];let cursor=0,minX=sx,maxX=sx,minY=sy,maxY=sy,sumX=0,sumY=0;
      while(cursor<queue.length){
        const k=queue[cursor++],x=left+k%rw,y=top+Math.floor(k/rw);sumX+=x;sumY+=y;
        minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
        for(let ny=Math.max(top,y-1);ny<=Math.min(bottom,y+1);ny++) for(let nx=Math.max(left,x-1);nx<=Math.min(right,x+1);nx++){
          const n=(ny-top)*rw+nx-left;if(seen[n])continue;seen[n]=1;if(pixels[ny*width+nx]<darkThreshold)queue.push(n);
        }
      }
      const bw=maxX-minX+1,bh=maxY-minY+1;
      if(bw<min||bh<min||bw>max||bh>max||Math.abs(bw-bh)>Math.max(bw,bh)*0.3||queue.length<min*min/2)continue;
      const point=[sumX/queue.length/s,sumY/queue.length/s],dx=point[0]-center[0],dy=point[1]-center[1],distance=dx*dx+dy*dy;
      if(distance<bestDistance){best=point;bestDistance=distance;}
    }
    if (best) return best;
  }
  return null;
}
function bubbleMark(pixels,width,height,observed,point,scale=FORM.scale,profile=FORM,inkThreshold=150,fillFraction=0.24) {
  const [cx,cy]=markerMap(point,observed,scale,profile.markers),r=1.1*scale,ix=Math.floor(cx),iy=Math.floor(cy);
  let dark=0,visible=0,count=0,centerTotal=0;
  for(let y=Math.floor(cy-r);y<=Math.ceil(cy+r);y++)for(let x=Math.floor(cx-r);x<=Math.ceil(cx+r);x++){
    if((x-ix)**2+(y-iy)**2>r*r||x<0||y<0||x>=width||y>=height)continue;
    const gray=pixels[y*width+x];count++;centerTotal+=gray;if(gray<inkThreshold)dark++;if(gray<235)visible++;
  }
  if(!count)return 'uncertain';
  if(dark/count>=fillFraction)return 'filled';
  if(profile===FORM)return visible/count>=0.08?'uncertain':'blank';
  let backgroundTotal=0,backgroundCount=0;
  for(let y=Math.floor(cy-r*2.8);y<=Math.ceil(cy+r*2.8);y++)for(let x=Math.floor(cx-r*2.8);x<=Math.ceil(cx+r*2.8);x++){
    const d=(x-ix)**2+(y-iy)**2;if(d<r*r*2.25||d>r*r*7.84||x<0||y<0||x>=width||y>=height)continue;
    backgroundTotal+=pixels[y*width+x];backgroundCount++;
  }
  if(visible/count>=0.08&&backgroundCount&&backgroundTotal/backgroundCount-centerTotal/count>18)return 'uncertain';
  return 'blank';
}

function bubbleMean(pixels,width,height,observed,point,scale,profile) {
  const [cx,cy]=markerMap(point,observed,scale,profile.markers),r=1.1*scale,ix=Math.floor(cx),iy=Math.floor(cy);
  let total=0,count=0;
  for(let y=Math.floor(cy-r);y<=Math.ceil(cy+r);y++)for(let x=Math.floor(cx-r);x<=Math.ceil(cx+r);x++)if((x-ix)**2+(y-iy)**2<=r*r&&x>=0&&y>=0&&x<width&&y<height){total+=pixels[y*width+x];count++;}
  return count?total/count:255;
}

function selectOne(pixels,width,height,observed,points,label,warnings,blank=true,scale=FORM.scale,profile=FORM,inkThreshold=150,fillFraction=0.24,preferStrongest=false) {
  const marks=points.map(p=>bubbleMark(pixels,width,height,observed,p,scale,profile,inkThreshold,fillFraction));
  const selected=marks.flatMap((m,i)=>m==='filled'?[i]:[]);
  if(selected.length===1&&!marks.includes('uncertain'))return selected[0];
  if(preferStrongest&&selected.length>1){
    const strengths=selected.map(index=>({index,mean:bubbleMean(pixels,width,height,observed,points[index],scale,profile)})).sort((a,b)=>a.mean-b.mean);
    if(strengths[1].mean-strengths[0].mean>=30){warnings.push(`${label}: nhiều ô, dùng ô đậm nhất; kiểm tra`);return strengths[0].index;}
  }
  if(selected.length>1||marks.includes('uncertain'))warnings.push(`${label}: tô mờ hoặc nhiều ô`);
  else if(blank)warnings.push(`${label}: bỏ trống`);
  return null;
}

function scanProfile(pixels,width,height,scale,profile) {
  const answers=emptyAnswers(), warnings=answers.reviewItems;
  let seatNumber='',examCode='';
  if(Math.abs(width/height-profile.pageWidth/profile.pageHeight)>=0.15){warnings.push('Tỷ lệ ảnh khác mẫu phiếu');return {seatNumber,examCode,answers};}
  const observed=profile.markers.map(p=>findMarker(pixels,width,height,p,10,scale));
  if(observed.some(x=>!x)||!profile.orientation.some(p=>findMarker(pixels,width,height,p,5,scale))||observed[1][0]<=observed[0][0]||observed[2][1]<=observed[0][1]){
    warnings.push('Không nhận diện được phiếu hoặc mốc căn chỉnh');return {seatNumber,examCode,answers};
  }
  const digits=(columns,label)=>columns.map((x,col)=>{
    const selected=selectOne(pixels,width,height,observed,profile.identityRows.map(y=>[x,y]),`${label} cột ${col+1}`,warnings,true,scale,profile,200,0.14,true);
    return selected==null?'?':String(selected);
  }).join('');
  seatNumber=digits(profile.seatColumns,'SBD');examCode=digits(profile.codeColumns,'Mã đề');
  for(let block=0;block<4;block++)for(let row=0;row<10;row++){
    const index=block*10+row,xs=profile.mcColumns[block],y=profile.mcRows[row];
    const selected=selectOne(pixels,width,height,observed,xs.map(x=>[x,y]),`I-${index+1}`,warnings,true,scale,profile);
    if(selected!=null)answers.multipleChoice[index]='ABCD'[selected];
  }
  for(let q=0;q<8;q++)for(let j=0;j<4;j++){
    const selected=selectOne(pixels,width,height,observed,profile.tfColumns[q].map(x=>[x,profile.tfRows[j]]),`II-${q+1}${'abcd'[j]}`,warnings,true,scale,profile);
    if(selected!=null)answers.trueFalse[q*4+j]=selected===0;
  }
  for(let q=0;q<6;q++){
    const cols=profile.numericColumns[q],sign=bubbleMark(pixels,width,height,observed,[cols[0],profile.signRow],scale,profile);
    const decimals=[cols[1],cols[2]].map(x=>bubbleMark(pixels,width,height,observed,[x,profile.decimalRow],scale,profile));
    const selected=cols.map((x,place)=>selectOne(pixels,width,height,observed,profile.digitRows.map(y=>[x,y]),`III-${q+1}-${place+1}`,warnings,false,scale,profile));
    const states=cols.map(x=>profile.digitRows.map(y=>bubbleMark(pixels,width,height,observed,[x,y],scale,profile)));
    let invalid=states.some(m=>m.filter(x=>x==='filled').length>1||m.includes('uncertain'))||sign==='uncertain'||decimals.includes('uncertain');
    const decimalPosition=decimals.flatMap((m,i)=>m==='filled'?[i+1]:[]);
    if(decimalPosition.length>1)invalid=true;
    if(invalid){warnings.push(`III-${q+1}: dấu hoặc vị trí số chưa rõ`);continue;}
    if(selected.every(x=>x==null)){warnings.push(`III-${q+1}: bỏ trống`);continue;}
    const first=selected.findIndex(x=>x!=null);
    const last=selected.findLastIndex(x=>x!=null);
    if(selected.slice(first,last+1).some(x=>x==null)){warnings.push(`III-${q+1}: thiếu chữ số`);continue;}
    let number=selected.slice(first,last+1).join('');
    if(decimalPosition.length&&decimalPosition[0]<number.length)number=`${number.slice(0,decimalPosition[0])}.${number.slice(decimalPosition[0])}`;
    answers.numeric[q]=`${sign==='filled'?'-':''}${number}`;
  }
  return {seatNumber,examCode,answers,observed};
}

export function scanForm(pixels,width,height,scale=FORM.scale) {
  const scans=[FORM,PHOTO_FORM].map(profile=>{
    const scan=scanProfile(pixels,width,height,scale,profile),markers=profile.markers.map(point=>findMarker(pixels,width,height,point,10,scale));
    const fit=markers.some(point=>!point)||scan.answers.reviewItems.includes('Không nhận diện được phiếu hoặc mốc căn chỉnh')?Infinity:markers.reduce((sum,point,index)=>sum+(point[0]-profile.markers[index][0])**2+(point[1]-profile.markers[index][1])**2,0);
    return {scan,fit,name:profile===FORM?'qm':'photo'};
  });
  const chosen=scans.sort((a,b)=>a.fit-b.fit||a.scan.answers.reviewItems.length-b.scan.answers.reviewItems.length)[0];chosen.scan.testProfile=chosen.name;return chosen.scan;
}

export function hasFormMarkers(pixels,width,height,scale=FORM.scale) {
  if(!width||!height||pixels.length<width*height||Math.abs(width/height-FORM.pageWidth/FORM.pageHeight)>=0.15)return false;
  return [FORM,PHOTO_FORM].some(profile=>{
    const observed=profile.markers.map(p=>findMarker(pixels,width,height,p,10,scale));
    return !observed.some(x=>!x)&&profile.orientation.some(p=>findMarker(pixels,width,height,p,5,scale))&&observed[1][0]>observed[0][0]&&observed[2][1]>observed[0][1];
  });
}
export const scanSignature=({seatNumber,examCode,answers})=>JSON.stringify([seatNumber,examCode,answers.multipleChoice,answers.trueFalse,answers.numeric]);

export function csvEscape(value) {
  let text=String(value??'');
  if(/^\s*[=+\-@]/.test(text))text=`'${text}`;
  return `"${text.replace(/"/g,'""')}"`;
}

export function scoreCSV(submissions) {
  const header=['SBD','Họ tên','Lớp','Mã đề','Phần I','Phần II','Phần III','Tổng điểm','Trạng thái'];
  const number=n=>Number(n||0).toFixed(4).replace(/0+$/,'').replace(/\.$/,'');
  const rows=submissions.map(s=>[s.seatNumber,s.studentName,s.className,s.examCode,number(s.score.multipleChoiceEarned),number(s.score.trueFalseEarned),number(s.score.numericEarned),number(s.score.totalEarned),s.needsReview?'Cần rà soát':s.confirmed?'Đã xác nhận':'Tạm tính']);
  return '\uFEFF'+[header,...rows].map(row=>row.map(csvEscape).join(',')).join('\r\n')+'\r\n';
}
