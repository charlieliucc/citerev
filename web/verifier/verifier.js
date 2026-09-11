const isMacOSHost = document.documentElement.dataset.platform === 'macos' ||
  new URLSearchParams(window.location.search).get('platform') === 'macos';
if (new URLSearchParams(window.location.search).get('embed') === '1') {
  document.documentElement.classList.add('embed-mode');
}

const sample = `Bader, M., Burner, T., Hoem Iversen, S., & Varga, Z. (2019). Student perspectives on formative feedback as part of writing portfolios. Assessment & Evaluation in Higher Education, 44(7), 1017–1028. https://doi.org/10.1080/02602938.2018.1564812
[1] A. K. Jain, M. N. Murty, and P. J. Flynn, "Data clustering: a review," ACM Comput. Surv., vol. 31, no. 3, pp. 264-323, 1999, doi: 10.1145/331499.331504.
1. Tsien JZ. The memory engine of the brain. Nature. 2013;495(7441):295-297.
Bader, Michael, et al. "Student perspectives on formative feedback as part of writing portfolios." Assessment & Evaluation in Higher Education, vol. 44, no. 7, 2019, pp. 1017-1028.`;

const {normalizeBreaks,splitReferences,splitDocumentSections,groupReferenceLines,isReferenceEndHeading}=window.CitationReferenceSplitter;

// 归一化前先剥掉来源数据可能带的 HTML 标签（如 <i>斜体</i>）与实体（如 &amp;），再统一转小写、去标点
function stripMarkup(v){return String(v).replace(/<[^>]*>/g,"").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&lt;/gi,"<").replace(/&gt;/gi,">").replace(/&quot;/gi,'"').replace(/&#39;/gi,"'");}
function norm(v=""){return stripMarkup(v).toLowerCase().normalize("NFKD").replace(/[’'“”\"–—:;,.!?()[\]{}&/\\-]/g," ").replace(/\s+/g," ").trim()}
function sim(a="",b=""){const A=new Set(norm(a).split(" ").filter(Boolean)),B=new Set(norm(b).split(" ").filter(Boolean));if(!A.size||!B.size)return 0;let n=0;A.forEach(w=>B.has(w)&&n++);return 2*n/(A.size+B.size)}
function authorScore(parsed,record){
  if(!parsed.length||!record.length)return 0;
  const recall=parsed.reduce((s,a)=>s+Math.max(...record.map(b=>sim(a,b)),0),0)/parsed.length;
  const prec=record.reduce((s,b)=>s+Math.max(...parsed.map(a=>sim(a,b)),0),0)/record.length;
  return (recall+prec)/2;
}
function pagesScore(parsed,record){
  if(!parsed||!record)return 0;
  const ps=parsed.match(/\d+/),rs=record.match(/\d+/);
  if(!ps||!rs)return 0;
  return ps[0]===rs[0]?1:0;
}
function apaAuthor(given="",family=""){
  family=(family||"").trim();given=(given||"").trim();
  if(!family&&!given)return "";
  if(!family)return given;
  if(!given)return family;
  let inits=given.replace(/([A-Za-z])(?=[A-Z])/g,"$1. ").replace(/\./g,"").replace(/\s+/g," ").trim();
  inits=inits.split(/[\s.]+/).filter(Boolean).map(w=>w[0].toUpperCase()+".").join(" ");
  return `${family}, ${inits}`;
}
function nameToApa(n){
  n=(n||"").trim();if(!n)return "";
  if(n.includes(",")){const[fam,giv]=n.split(",");return apaAuthor((giv||"").replace(/\./g," ").trim(),fam.trim());}
  const parts=n.split(/[\s.]+/).filter(Boolean);
  const isInits=t=>/^[A-Z]{1,3}\.?$|^[A-Z](\.[A-Z]){1,2}\.?$/.test(t);
  if(parts.length>=2&&isInits(parts[parts.length-1])){ // 姓 + 末尾名首字母（Vancouver）
    const giv=parts[parts.length-1];const fam=parts.slice(0,-1).join(" ");
    return apaAuthor(giv.replace(/\./g," ").trim(),fam);
  }
  if(parts.length>=2&&isInits(parts[0])){ // 名首字母 + 姓（IEEE）
    const giv=parts[0];const fam=parts.slice(1).join(" ");
    return apaAuthor(giv.replace(/\./g," ").trim(),fam);
  }
  const fam=parts.pop();const giv=parts.join(" ");
  return apaAuthor(giv,fam);
}
// 仅从来源作者名中拆出「姓」用于比对；展示名保持来源原样，不转 APA（不同引文风格名缩写不同）
function splitFamily(n){
  n=(n||"").trim();if(!n)return "";
  if(n.includes(",")){const[fam]=n.split(",");return fam.trim();} // “姓, 名” 形态
  const parts=n.split(/[\s.]+/).filter(Boolean);
  if(parts.length<2)return n;
  const isInits=t=>/^[A-Z]{1,3}\.?$|^[A-Z](\.[A-Z]){1,2}\.?$/.test(t);
  if(isInits(parts[parts.length-1]))return parts.slice(0,-1).join(" "); // 名首字母在末尾
  if(isInits(parts[0]))return parts.slice(1).join(" "); // 名首字母在开头
  return parts[parts.length-1]; // 默认末段为姓（“名 姓”）
}
// 多样式识别：参照 referenceverify 第 4 步思路——先识别引用格式，再按格式抽字段
function detectStyle(text){
  const t=text.trim();
  if(/[㐀-鿿]/.test(t)) return "GB/T 7714（中文）";
  const parenYear=/\(\s*(?:19|20)\d{2}/.test(t);
  const quoted=/"[^"]{6,}"/.test(t)||/“[^”]{6,}”/.test(t);
  const volNo=/\bvol\.|\bno\.|\bpp\.|issue\s*\d/i.test(t);
  const hasSemi=/\;\s*\d/.test(t);
  const amp=/&(?:\s*amp;)?\s/.test(t);
  const bracket=/^\s*\[\d+\]/.test(t);
  const plainNum=/^\s*\d+\.\s/.test(t);
  const initialsFirst=/^(\s*\[?\d+\]?\.?\s*)?([A-Z]\.\s*)+[A-Z][a-z]+/.test(t);
  const famInit=/^\s*(?:\[\d+\]|\d+\.?\s*)?[A-Z][a-z]+\s+[A-Z]{1,3}\./.test(t);
  if(parenYear&&(amp||/,\s*(?:19|20)\d{2}\s*\)/.test(t))) return "APA";
  if(bracket&&quoted) return "IEEE";
  if(quoted&&volNo) return "MLA";
  if(initialsFirst) return "IEEE";
  if(bracket) return "IEEE";
  if((plainNum||bracket)&&(hasSemi||famInit)) return "Vancouver";
  if(plainNum&&famInit) return "Vancouver";
  if(parenYear) return "APA";
  if(hasSemi&&volNo) return "Vancouver";
  if(quoted) return "MLA / IEEE";
  if(volNo) return "Chicago / MLA";
  if(plainNum||bracket) return "IEEE / Vancouver";
  return "通用 / 未识别";
}
// DOI 抽取（第 4 步·分流依据）：命中则走精确查询，否则走标题模糊检索
function extractDOI(text){
  // 同时兼容 https://doi.org/10...、doi: 10... 和直接出现的 10...。
  const m=text.match(/(?:doi\.org\/|doi:\s*)?(10\.\d{4,9}\/[-._;()/:a-z0-9]+)/i);
  if(!m)return "";
  return m[1].replace(/[.,;)]$/,"");
}
// —— 整篇论文：定位 References / Bibliography 小节（参照 referenceverify 的 sliceArticle，去除土耳其文）——
// 优先按分节标题切开；无标题时按“关键词+编号”或“从末尾向上扫”兜底；都找不到则整段当作参考文献
function sliceArticle(e){
  const shared=splitDocumentSections(e);
  if(shared.found)return{found:true,body:shared.body,references:shared.references};
  // 1) 首选：标题正则（英文，容忍编号与 #* 等符号），命中即从标题后切开
  let t,a=/(^|\n)[ \t#*0-9.)\-–—]*\b(references?|reference list|works cited|bibliography)\b[ \t.:·•0-9\-–—]*(?=\n|$)/gi,i=-1,r=-1;
  for(;null!==(t=a.exec(e));){i=t.index+t[1].length;r=a.lastIndex;}
  if(r>=0)return{found:true,body:e.slice(0,i).trim(),references:e.slice(r).trim()};
  // 2) 兜底 1：没干净标题时，找“关键词后接 [1] 或 1./1)”编号，且位置在全文 35% 之后
  let n=/\b(references?|reference list|works cited|bibliography)\b[ \t.:·•]*(?=\s+(?:\[\d+\]|\d+[.)]\s))/gi;
  for(;null!==(t=n.exec(e));)if(t.index>.35*e.length){i=t.index;r=n.lastIndex;}
  if(r>=0)return{found:true,body:e.slice(0,i).trim(),references:e.slice(r).trim()};
  // 3) 兜底 2：从末尾向上扫，找到 ≥4 个“带年份且像文献”的行，从那里切开
  const bottom=scanFromBottom(e);
  if(bottom)return{found:true,body:bottom.body,references:bottom.references};
  // 4) 都找不到 → 整段文本当作参考文献
  return{found:false,body:e.trim(),references:""};
}
function scanFromBottom(e){
  const lines=e.split(/\n/);
  const likeRef=line=>{
    const t=line.trim();
    if(t.length<15)return false;
    if(!/\b(19|20)\d{2}\b/.test(t))return false;
    return /^(\[\d+\]|\d+[.)]\s)/.test(t)
      || /^\p{Lu}[\p{L}'’-]+,\s*\p{Lu}/u.test(t)
      || /^\p{Lu}[\p{L}'’-]+\s+\p{Lu}\.?,/u.test(t)
      || /^\p{Lu}[\p{L}'’-]+,\s*(?:ve|&|and)\b/u.test(t);
  };
  let i=lines.length-1;
  while(i>=0&&!lines[i].trim())i--;
  let r=i,n=0,gap=0,s=-1;
  for(;i>=0;i--){
    const line=lines[i].trim();
    if(!line){if(++gap>2)break;continue;}
    if(likeRef(line)){n++;s=i;gap=0;}
    else if(++gap>2)break;
  }
  return (n>=4&&s>=0&&s>.2*lines.length)?{body:lines.slice(0,s).join("\n").trim(),references:lines.slice(s,r+1).join("\n").trim()}:null;
}
// —— 段落级合并参考文献（对齐 index.html 的 getReferenceBlocks 思路）——
// 输入：refsParagraphs（每个元素是一个 <w:p> 段落，已含 .text）。
// 输出：合并后的条目数组。规则：
//   · 显式编号行（[n] / n. / n)）一定开启新条目；
//   · 否则，若当前段落看起来是上一条的“悬挂缩进续行”（开头非大写姓、且上一行未以句末标点结尾），则并入上一条；
//   · 其余情况（独立大写姓开头的新条目）开启新条目。
// 这样一条跨多段落的长文献不会被错误劈成两条（如 “Strijbos, J.-W., &” 被单独切出）。
function groupRefParagraphs(paras){
  return groupReferenceLines(paras,p=>p&&p.text).map(group=>group.map(p=>p.text).join(" "));
}
// —— 导入 Word（.docx）文件：纯前端解析，无需外部库 ——
// 利用浏览器内置 DecompressionStream 解压 ZIP 容器，再用 DOMParser 抽取正文（含 namespace 兜底）
// 把 <w:p> 段落内的文本抽出来，并把软换行 <w:br>/<w:cr> 转成换行、<w:tab> 转成制表符
// —— 工具：解码 XML 实体 ——
function decodeXmlEntities(s){
  return (s||"")
    .replace(/&lt;/g,"<").replace(/&gt;/g,">")
    .replace(/&quot;/g,'"').replace(/&apos;/g,"'")
    .replace(/&#x([0-9a-fA-F]+);/g,(m,h)=>{try{return String.fromCodePoint(parseInt(h,16));}catch(e){return m;}})
    .replace(/&#(\d+);/g,(m,d)=>{try{return String.fromCodePoint(parseInt(d,10));}catch(e){return m;}})
    .replace(/&amp;/g,"&");
}
// —— 工具：判断某个 run 是否斜体（用于后续扩展保留格式，当前导入参考文献不影响切分）——
function isDocxItalic(runInner){
  const tags=runInner.match(/<w:i\b(?![Cs])([^>]*?)\/?>/gi);
  if(!tags)return false;
  for(const tag of tags){
    const v=tag.match(/w:val="([^"]*)"/i);
    if(v){const val=v[1].toLowerCase();if(val==="0"||val==="false"||val==="none")return false;return true;}
    return true;
  }
  return false;
}
// —— 工具：检测 Word 分页符位置 ——
function pageBreakIndices(s){
  const idxs=[];let i;
  i=-1;while((i=s.indexOf('<w:lastRenderedPageBreak',i+1))!==-1)idxs.push(i);
  i=-1;while((i=s.indexOf('w:type="page"',i+1))!==-1)idxs.push(i);
  i=-1;while((i=s.indexOf("w:type='page'",i+1))!==-1)idxs.push(i);
  return idxs;
}
// —— 段落级解析：保留 <w:p> 段落边界 + 斜体 run（对齐 index.html 的 docxXmlToText，拆分为段落数组）——
function docxXmlToText(xml){
  const rawParas=xml.split(/<\/w:p>/gi);
  const pageOf=new Array(rawParas.length).fill(1);
  let cur=1;
  for(let k=0;k<rawParas.length;k++){
    const rp=rawParas[k];
    const idxs=pageBreakIndices(rp);
    const tIdx=rp.indexOf('<w:t');
    const beforeIdx=tIdx<0?rp.length:tIdx;
    let before=0,after=0;
    for(const ix of idxs){if(ix<beforeIdx)before++;else after++;}
    cur+=before;pageOf[k]=cur;cur+=after;
  }
  const norm=xml
    .replace(/<w:br\s*\/?>/gi,"\n")
    .replace(/<w:tab\s*\/?>/gi," ")
    .replace(/<w:cr\s*\/?>/gi,"\n");
  const paras=norm.split(/<\/w:p>/gi);
  const out=[];
  const runRe=/<w:r\b[^>]*>([\s\S]*?)<\/w:r>/gi;
  const tRe=/<w:t[^>]*>([\s\S]*?)<\/w:t>/gi;
  for(let pi=0;pi<paras.length;pi++){
    const p=paras[pi];
    const segments=[];let rm,hadRun=false;
    runRe.lastIndex=0;
    while((rm=runRe.exec(p))!==null){
      hadRun=true;const runInner=rm[1];const italic=isDocxItalic(runInner);
      tRe.lastIndex=0;let tm;
      while((tm=tRe.exec(runInner))!==null){const txt=decodeXmlEntities(tm[1]);if(txt)segments.push({text:txt,italic});}
    }
    if(!hadRun){
      tRe.lastIndex=0;let tm;
      while((tm=tRe.exec(p))!==null){const txt=decodeXmlEntities(tm[1]);if(txt)segments.push({text:txt,italic:false});}
    }
    const text=segments.map(s=>s.text).join("").replace(/\s+/g," ").trim();
    if(text.length>0)out.push({text,segments,page:pageOf[pi]});
  }
  return out.filter(x=>x.text.length>0);
}
// —— 段落级切分正文/参考文献（对齐 index.html 的 splitBodyAndReferences）——
// 按“参考文献标题”段定位（容忍「1. References」「2) References」等编号；标题长度限制防止误命中正文里的词）；
// 命中后取标题之后所有段为参考文献，并过滤文档尾部统计信息（Word count 等）。
const REF_HEADING_RE=/^\s*(?:\d+[\.\)]\s*)?(references?|bibliograph(?:y|ies)|works\s+cited|works\s+consulted|literature\s+cited|reference\s+list|sources?)\b/i;
const TRAILING_META_RE=/^\s*(word\s*count|words\s*:|page\s*count|pages\s*:|character\s*count|characters\s*:)/i;
function splitBodyAndReferences(paragraphs){
  let headingIdx=-1;
  for(let i=0;i<paragraphs.length;i++){
    const line=(paragraphs[i].text||"").trim();
    if(!line)continue;
    if(line.length<=60&&REF_HEADING_RE.test(line)){headingIdx=i;break;}
  }
  if(headingIdx<0)return{found:false,refsParagraphs:[],headingText:""};
  let endIdx=paragraphs.length;
  for(let i=headingIdx+1;i<paragraphs.length;i++){
    if(isReferenceEndHeading(paragraphs[i].text||"")){endIdx=i;break;}
  }
  let refParas=paragraphs.slice(headingIdx+1,endIdx);
  const filtered=refParas.filter(p=>!TRAILING_META_RE.test(p.text||""));
  return{found:true,refsParagraphs:filtered,headingText:paragraphs[headingIdx].text};
}
async function extractDocxText(arrayBuffer){
  const bytes=new Uint8Array(arrayBuffer);
  const view=new DataView(arrayBuffer);
  // 定位 ZIP 中央目录结尾记录（EOCD）
  let eocd=-1;
  for(let i=bytes.length-22;i>=0;i--){
    if(bytes[i]===0x50&&bytes[i+1]===0x4b&&bytes[i+2]===0x05&&bytes[i+3]===0x06){eocd=i;break;}
  }
  if(eocd<0)throw new Error("不是有效的 .docx 文件（找不到 ZIP 目录）");
  const cdOffset=view.getUint32(eocd+16,true);
  const cdCount=view.getUint16(eocd+10,true);
  let p=cdOffset,targetOff=-1,targetMethod=-1,targetSize=-1;
  for(let n=0;n<cdCount;n++){
    if(!(bytes[p]===0x50&&bytes[p+1]===0x4b&&bytes[p+2]===0x01&&bytes[p+3]===0x02))break;
    const method=view.getUint16(p+10,true);
    const compSize=view.getUint32(p+20,true);
    const nameLen=view.getUint16(p+28,true);
    const extraLen=view.getUint16(p+30,true);
    const commentLen=view.getUint16(p+32,true);
    let fname="";for(let k=0;k<nameLen;k++)fname+=String.fromCharCode(bytes[p+46+k]);
    const localOff=view.getUint32(p+42,true);
    if(fname==="word/document.xml"){targetOff=localOff;targetMethod=method;targetSize=compSize;}
    p+=46+nameLen+extraLen+commentLen;
  }
  if(targetOff<0)throw new Error("未在 .docx 中找到 word/document.xml");
  const lNameLen=view.getUint16(targetOff+26,true);
  const lExtraLen=view.getUint16(targetOff+28,true);
  const dataStart=targetOff+30+lNameLen+lExtraLen;
  const compData=bytes.subarray(dataStart,dataStart+targetSize);
  let xmlBytes;
  if(targetMethod===0){xmlBytes=compData;}
  else if(targetMethod===8){
    if(typeof DecompressionStream==="undefined")throw new Error("当前浏览器不支持解压，请改用 .txt 或更新浏览器");
    const ds=new DecompressionStream("deflate-raw");
    const stream=new Response(compData).body.pipeThrough(ds);
    const buf=await new Response(stream).arrayBuffer();
    xmlBytes=new Uint8Array(buf);
  }else{throw new Error("不支持的压缩方式（method="+targetMethod+"）");}
  const xml=new TextDecoder("utf-8").decode(xmlBytes);
  const hasPageInfo=/<w:lastRenderedPageBreak|<w:br[^>]*\bw:type=["']page["']/i.test(xml);
  let paragraphs=docxXmlToText(xml);
  if(!hasPageInfo)paragraphs=paragraphs.map(p=>({...p,page:null}));
  return{paragraphs,hasPageInfo};
}
// 作者名归一（风格感知）：IEEE 用“名首字母+姓、逗号分隔、and 连最后”；APA/MLA 用“姓, 名”配对；Vancouver 用“姓 名首字母”
function normalizeAuthors(raw,style){
  if(!raw)return[];
  let s=raw.replace(/\bet\s+al\.?/i,"").replace(/\s*&\s*/g,", ").replace(/,\s*$/,"").trim();
  if(!s)return[];
  if((style&&style.startsWith("IEEE"))||(/^([A-Z]\.\s*)+[A-Z][a-z]+/.test(s)&&s.includes(","))){
    const parts=s.split(/,\s*and\s*|\s+and\s+|\s*,\s*/).map(x=>x.trim()).filter(Boolean);
    return parts.map(p=>{
      const toks=p.split(/\s+/).filter(Boolean);
      const fam=toks.pop();
      const giv=toks.join(" ");
      return apaAuthor(giv.replace(/\./g," ").trim(),fam);
    }).filter(Boolean);
  }
  const cs=s.split(/\s*,\s*/).map(x=>x.trim()).filter(Boolean);
  if(cs.length>=2&&/^[A-Z][a-z]{1,}$/.test(cs[0])){
    if(cs.length%2===0){
      const out=[];
      for(let i=0;i+1<cs.length;i+=2)out.push(apaAuthor(cs[i+1].replace(/\./g," ").trim(),cs[i]));
      return out;
    }
    if(cs.length===2)return[apaAuthor(cs[1].replace(/\./g," ").trim(),cs[0])];
  }
  if(cs.length>1&&!/^[A-Z][a-z]{1,}$/.test(cs[0]))return cs.map(x=>nameToApa(x));
  return[nameToApa(s)];
}
// 从“标题之后”的剩余文本中抽取 卷/期/页码/年份/期刊：兼容 Vancouver(x(y):z)、IEEE/MLA/Chicago(vol. x, no. y, pp. z)
function extractTail(tail){
  let t=tail;
  let volume="",issue="",pages="",year="";
  const m=t.match(/(\d{1,4})\s*\((\d{1,4})\)/);
  if(m){volume=m[1];issue=m[2];}
  const vol=t.match(/\bvol\.?\s*(\d{1,4})/i);if(vol&&!volume)volume=vol[1];
  const iss=t.match(/\b(?:no|nr|issue)\.?\s*(\d{1,4})/i);if(iss&&!issue)issue=iss[1];
  const pp=t.match(/\bpp?\.?\s*(\d+)\s*[-–—]\s*(\d+)/i);
  if(pp)pages=`${pp[1]}-${pp[2]}`;
  else{const ym=t.match(/:\s*(\d+)\s*[-–—]\s*(\d+)/);if(ym)pages=`${ym[1]}-${ym[2]}`;else{const art=t.match(/,\s*(\d{1,4})\s*,\s*(\d{2,6})(?=\s|\.|,|;|$)/);if(art){if(!volume)volume=art[1];pages=art[2];}}}
  if(!pages){const pr=t.match(/\b(\d{1,4})\s*[-–—]\s*(\d{1,4})\b/);if(pr)pages=`${pr[1]}-${pr[2]}`;}
  const y2=t.match(/(?:^|[^0-9])((?:19|20)\d{2})(?:[^0-9]|$)/);if(y2)year=y2[1];
  let v=t
    .replace(/\d{1,4}\s*\((\d{1,4})\)/g,"")
    .replace(/\bvol\.?\s*\d{1,4}\b/gi,"")
    .replace(/\b(?:no|nr|issue)\.?\s*\d{1,4}\b/gi,"")
    .replace(/\bpp?\.?\s*\d+\s*[-–—]\s*\d+/gi,"")
    .replace(/:\s*\d+\s*[-–—]\s*\d+/g,"")
    .replace(/;\s*(?:19|20)\d{2}/g,"")
    .replace(/,\s*\d{1,4}\s*[-–—]\s*\d{1,4}/g,"")
    .replace(/,\s*Advance online publication.*$/i,"")
    .replace(/\b(?:19|20)\d{2}\b\s*/g,"");
  v=v.split(",")
    .map(s=>s.replace(/;+/g,"").trim())
    .filter(s=>s&&!/^[.\s;:,\-–—]+$/.test(s))
    .join(", ")
    .replace(/\.\s*\.$/,".")
    .replace(/\s{2,}/g," ").trim();
  if(/^\d+$/.test(v))v="";
  return{venue:v,volume,issue,pages,year};
}
// APA / Chicago / MLA：作者. 标题. 期刊… 三类“散文式”格式共用一套解析
function parseProseStyle(work,style){
  let year="",authorsRaw="",title="",tail="";
  const q=work.match(/"([^"]{4,})"|“([^”]{4,})”/);
  const py=work.match(/\((\d{4}[a-z]?)\)/);
  if(q&&(!py||q.index<py.index)){
    title=q[1]||q[2];
    authorsRaw=work.slice(0,q.index).replace(/\bet\s+al\.?\s*/i,"").replace(/,\s*$/,"").trim();
    tail=work.slice(q.index+q[0].length).trim();
  }else if(py){
    year=py[1];
    authorsRaw=work.slice(0,py.index).replace(/[\s.]+$/,"").trim();
    const after=work.slice(py.index+py[0].length).replace(/^\.\s*/,"").trim();
    const dot=after.indexOf(". ");
    if(dot>0){title=after.slice(0,dot).replace(/\.$/,"").trim();tail=after.slice(dot+1).trim();}
    else{title=after.replace(/\.$/,"").trim();tail="";}
  }else{
    const segs=work.split(/\.\s+/).map(s=>s.trim()).filter(Boolean);
    authorsRaw=segs[0]||"";title=segs[1]||"";tail=segs.slice(2).join(". ");
  }
  const authors=normalizeAuthors(authorsRaw,style);
  const ex=extractTail(tail);
  if(!year)year=ex.year;
  return{year,title:title.trim(),authors,venue:ex.venue,volume:ex.volume,issue:ex.issue,pages:ex.pages};
}
// IEEE：[n] A. K. Jain, M. N. Murty, and P. J. Flynn, "Title," Venue, vol. x, no. y, pp. a-b, Year, doi:
function parseIEEE(work){
  let s=work.replace(/^\s*\[?\d+\]?\.?\s*/,"").trim();
  const q=s.match(/"([^"]{4,})"/);
  let title="",authorsRaw="",tail="";
  if(q){title=q[1].replace(/,$/,"").trim();authorsRaw=s.slice(0,q.index).replace(/,\s*$/,"").trim();tail=s.slice(q.index+q[0].length).replace(/^,?\s*/,"").trim();}
  else{const segs=s.split(/,\s+/);authorsRaw=segs[0];tail=segs.slice(1).join(", ");}
  const authors=normalizeAuthors(authorsRaw,"IEEE");
  const ex=extractTail(tail);
  return{year:ex.year,title,authors,venue:ex.venue,volume:ex.volume,issue:ex.issue,pages:ex.pages};
}
// Vancouver：n. Author AB, Author CD. Title. Venue. Year;vol(issue):pages.
function parseVancouver(work){
  let s=work.replace(/^\s*\d+\.?\s*/,"").trim();
  const segs=s.split(/\.\s+/).map(x=>x.trim()).filter(Boolean);
  let authorsRaw="",title="",tail="";
  if(segs.length>=3){authorsRaw=segs[0];title=segs[1];tail=segs.slice(2).join(". ");}
  else{title=s;}
  const authors=normalizeAuthors(authorsRaw.replace(/,\s*$/,""),"Vancouver");
  const ex=extractTail(tail);
  return{year:ex.year,title,authors,venue:ex.venue,volume:ex.volume,issue:ex.issue,pages:ex.pages};
}
// GB/T 7714（中文）：作者. 标题[J]. 期刊, 年, 卷(期): 页码.
function parseGB(work){
  let s=work;
  const firstDot=s.indexOf(". ");
  let authorsRaw="",rest="";
  if(firstDot>0){authorsRaw=s.slice(0,firstDot).trim();rest=s.slice(firstDot+1).trim();}
  else rest=s;
  const tj=rest.match(/^(.+?)\[[A-Z]\]\.?\s*(.*)$/);
  let title="",tail="";
  if(tj){title=tj[1].trim();tail=tj[2].trim();}
  else{const d=rest.indexOf(". ");if(d>0){title=rest.slice(0,d).trim();tail=rest.slice(d+1).trim();}else title=rest;}
  const authors=[authorsRaw].filter(Boolean);
  const ex=extractTail(tail);
  return{year:ex.year,title,authors,venue:ex.venue,volume:ex.volume,issue:ex.issue,pages:ex.pages};
}
function parseRef(text){
  const doi=extractDOI(text);
  const style=detectStyle(text);
  // 第 4 步（参照 referenceverify）：先抽 DOI；有 DOI 走精确查询，无 DOI 走标题模糊检索
  const cleaned=text.replace(/https?:\/\/\S+/gi," ").replace(/doi:?\s*\S+/gi," ").replace(/\s+/g," ").trim();
  let r;
  if(style.startsWith("IEEE"))r=parseIEEE(cleaned);
  else if(style.startsWith("Vancouver"))r=parseVancouver(cleaned);
  else if(style.startsWith("GB"))r=parseGB(cleaned);
  else r=parseProseStyle(cleaned,style);
  return{doi,year:r.year,title:r.title,authors:r.authors,volume:r.volume,issue:r.issue,pages:r.pages,venue:r.venue,style};
}
function cross(x){
  return{
    title:stripMarkup(x.title?.[0]||""),
    authors:(x.author||[]).map((a)=>({family:stripMarkup(a.family||"").trim(),display:stripMarkup([(a.family||"").trim(),(a.given||"").trim()].filter(Boolean).join(", "))})).filter(a=>a.family),
    year:String(x["published-print"]?.["date-parts"]?.[0]?.[0]||x.issued?.["date-parts"]?.[0]?.[0]||x.published?.["date-parts"]?.[0]?.[0]||""),
    venue:stripMarkup(x["container-title"]?.[0]||x.publisher||""),
    volume:x.volume||"",
    issue:x.issue||"",
    pages:x.page||"",
    doi:x.DOI,url:x.URL,source:"Crossref"
  };
}
function open(x){
  return{
    title:stripMarkup(x.title||""),
    authors:(x.authorships||[]).map((a)=>({family:splitFamily(stripMarkup(a.author?.display_name)),display:stripMarkup(a.author?.display_name||"")})).filter(a=>a.family),
    year:String(x.publication_year||""),
    venue:stripMarkup(x.primary_location?.source?.display_name||""),
    volume:x.biblio?.volume||"",
    issue:x.biblio?.issue||"",
    pages:(x.biblio?.first_page&&x.biblio?.last_page)?`${x.biblio.first_page}-${x.biblio.last_page}`:(x.biblio?.pages||""),
    doi:x.doi?.replace(/^https:\/\/doi\.org\//i,""),
    url:x.doi||x.id,source:"OpenAlex"
  };
}
function sourceText(r){
  return [r.authors?.map(a=>a.display).join(", "),r.title,r.venue,r.year,r.volume&&`卷 ${r.volume}`,r.issue&&`期 ${r.issue}`,r.pages&&`页码 ${r.pages}`,r.doi&&`DOI ${r.doi}`].filter(Boolean).join(". ");
}
// 提取原文中「独立」的 4 位年份 token，并剔除 DOI/URL 片段——避免 DOI 里的数字串（如 doi:10.1080/13562517.2026.xxx）被误当成年份。
function hayYears(original){
  const t=String(original)
    .replace(/(?:doi\.org\/|doi:\s*)?10\.\d{4,9}\/[-._;()/:a-z0-9]+/gi," ")
    .replace(/https?:\/\/\S+/gi," ");
  return new Set((t.match(/\b(?:19|20)\d{2}\b/g)||[]).map(Number));
}
// 年份比对：不采用子串包含，只把来源年份与「独立年份 token」做精确匹配。
function yearAppears(original,year,found){
  if(!year)return null;
  if(!found)found=hayYears(original);
  if(found.has(Number(year)))return "match";
  return found.size?"mismatch":"review";
}
function appearsInOriginal(original,value){
  if(!value)return null;
  const hay=norm(original),needle=norm(value);
  if(!needle)return null;
  if(hay.includes(needle))return true;
  // 仅当标题/长文本高度重合（>=90%）但未逐字匹配时，标记为需复核，而非判为完全一致
  const words=needle.split(" ").filter(Boolean);
  if(words.length>=4&&words.filter(w=>hay.includes(w)).length/words.length>=.9)return "review";
  return false;
}
// 期刊/出版者比对：容忍 “&” 与 “and” 互写、冠词 the 差异，以及近 90% 词重叠
function venueAppearsInOriginal(original,venue){
  if(!venue)return null;
  const clean=v=>norm(String(v||"").replace(/&amp;/gi," and ").replace(/&/g," and "));
  const hay=clean(original),needle=clean(venue);
  if(!needle)return null;
  if(hay.includes(needle))return true;
  const dropThe=n=>{const p=n.split(" ");if(p[0]==="the")p.shift();return p.join(" ");};
  if(hay.includes(dropThe(needle)))return true;
  const H=hay.split(" ").filter(Boolean),N=needle.split(" ").filter(Boolean);
  if(!N.length)return null;
  const hs=new Set(H);
  if(N.filter(w=>hs.has(w)).length/N.length>=.9)return true;
  return false;
}
// 仅比对「姓」：不同引文风格的名缩写方式不同，转 APA 会误判；只要来源作者的姓在原文中出现即视为命中
function authorAppearsInOriginal(original,family){
  if(!family)return null;
  const haySet=new Set(norm(original).split(" ").filter(Boolean));
  if(!haySet.size)return null;
  const famTokens=norm(family).split(" ").filter(Boolean);
  if(!famTokens.length)return null;
  // 姓的每个词都必须在原文中作为独立词出现，否则不是同一作者
  return famTokens.every(t=>haySet.has(t));
}
function textPresenceScore(original,value){
  const hay=norm(original),needle=norm(value);
  if(!hay||!needle)return 0;
  if(hay.includes(needle))return 1;
  const words=needle.split(" ").filter(Boolean);
  return words.length?words.filter(w=>hay.includes(w)).length/words.length:0;
}
function escapeRegExp(value){return String(value).replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}
function volumeAppears(original,volume,issue){
  if(!volume)return null;
  const v=escapeRegExp(volume),i=issue?escapeRegExp(issue):"\\d+";
  return new RegExp(`(?:\\bvol(?:ume)?\\.?|卷)\\s*${v}\\b|(?:^|[;,\\s])${v}\\s*(?:\\(\\s*${i}\\s*\\)|,\\s*(?:no|nr|issue)\\.?\\s*${i}\\b|:\\s*[A-Za-z]?\\d+)`,"i").test(original);
}
function rawNumberAppears(original,value){
  if(!value)return false;
  return new RegExp(`(?:^|[^0-9])${escapeRegExp(value)}(?=$|[^0-9])`).test(original);
}
function volumeCheck(original,volume,issue){
  if(!volume)return null;
  if(volumeAppears(original,volume,issue))return{status:"match"};
  const explicit=/\bvol(?:ume)?\.?\s*\d+|卷\s*\d+/i.test(original);
  if(explicit)return{status:"mismatch"};
  const found=rawNumberAppears(original,volume);
  return{status:"review",reason:found
    ?`原文包含 ${volume}，但当前格式无法确认它是否为卷号；自动抓取可能有误`
    :`原文未找到 ${volume}，且当前格式无法可靠解析卷号；自动抓取可能有误`};
}
function issueAppears(original,issue,volume){
  if(!issue)return null;
  const i=escapeRegExp(issue),v=volume?escapeRegExp(volume):"\\d+";
  return new RegExp(`(?:\\b(?:no|nr|issue)\\.?|期)\\s*${i}\\b|\\b${v}\\s*\\(\\s*${i}\\s*\\)`,"i").test(original);
}
function pagesAppear(original,pages){
  if(!pages)return null;
  const parts=String(pages).trim().split(/\s*[-–—]\s*/).map(escapeRegExp);
  const value=parts.length>1?`${parts[0]}\\s*[-–—]\\s*${parts[1]}`:parts[0];
  return new RegExp(`(?:^|[^0-9A-Za-z])${value}(?=$|[^0-9A-Za-z])`,"i").test(original);
}
function assess(original,r,sources,sensitivity){
  const titleScore=textPresenceScore(original,r.title);
  const titlePresence=appearsInOriginal(original,r.title);
  const titleOk=titlePresence===true;
  const yearSet=hayYears(original);
  const yearRes=yearAppears(original,r.year,yearSet);
  const yearOk=yearRes==="match";
  const origHasDOI=!!extractDOI(original);
  const doiOk=(r.doi&&origHasDOI)?appearsInOriginal(original,r.doi)===true:null;
  const authorChecks=(r.authors||[]).map(a=>({name:a.display,ok:authorAppearsInOriginal(original,a.family)}));
  const authorOk=!authorChecks.length||authorChecks.some(x=>x.ok===true);
  const venueOk=r.venue?venueAppearsInOriginal(original,r.venue)===true:null;
  const volumeResult=volumeCheck(original,r.volume,r.issue);
  const volumeOk=volumeResult?.status==="match";
  const issueOk=issueAppears(original,r.issue,r.volume);
  const pagesOk=pagesAppear(original,r.pages);
  // 中敏感度：仅核验 DOI 是否存在、标题、年份是否正确；高敏感度：核验全字段
  const isHigh=sensitivity==="high";
  const allFields=[
    {label:"作者",value:r.authors?.map(a=>a.display).join(", "),status:authorOk?"match":"mismatch",score:authorOk?1:0,core:false},
    {label:"题名",value:r.title,status:titlePresence===true?"match":titlePresence==="review"?"review":"mismatch",score:titleScore,similarity:Math.round(titleScore*100),core:true},
    {label:"期刊或出版者",value:r.venue,status:venueOk?"match":"mismatch",score:venueOk?1:0,core:false},
    {label:"年份",value:r.year,status:yearRes==="match"?"match":yearRes==="review"?"review":"mismatch",score:yearRes==="match"?1:(yearRes==="review"?0.5:0),core:true},
    {label:"卷",value:r.volume,status:volumeResult?.status||"mismatch",note:volumeResult?.reason,score:volumeResult?.status==="match"?1:(volumeResult?.status==="review"?0.5:0),core:false},
    {label:"期",value:r.issue,status:issueOk?"match":"mismatch",score:issueOk?1:0,core:false},
    {label:"页码或文章号",value:r.pages,status:pagesOk?"match":"mismatch",score:pagesOk?1:0,core:false},
    {label:"DOI",value:r.doi,status:doiOk===null?"na":doiOk?"match":"mismatch",score:doiOk===null?1:doiOk?1:0,core:true}
  ];
  // 中敏感度：全字段仍展示，但非核心字段标记为“未核验”（不参与评分、不计入待复核）
  const fieldChecks=allFields.filter(x=>x.value).map(x=>{
    if(!isHigh&&!x.core&&x.status!=="na")return{...x,status:"na",score:0};
    return x;
  });
  const issues=[];
  if(!titleOk)issues.push(titlePresence==="review"?`来源题名与用户引用高度相似但存在差异（相似度 ${Math.round(titleScore*100)}%），请核对：${r.title||"来源记录未提供题名"}`:`来源题名未完整出现在用户引用中：${r.title||"来源记录未提供题名"}`);
  if(r.year&&!yearOk)issues.push(yearRes==="review"?`来源年份 ${r.year} 未在用户引用中找到独立年份（可能未写明出版年份，或写法不标准），请核对`:`来源年份与用户引用不一致：来源 ${r.year}，引用中出现的年份为 ${[...yearSet].join("、")}`);
  if(r.doi&&!doiOk)issues.push(`来源 DOI 未在用户引用中找到：${r.doi}`);
  if(isHigh){
    if(!authorOk)issues.push(`来源作者未在用户引用中找到：${r.authors?.slice(0,3).map(a=>a.display).join("、")}`);
    if(r.venue&&!venueOk)issues.push(`来源期刊或出版者未在用户引用中找到：${r.venue}`);
    if(r.volume&&volumeResult?.status==="mismatch")issues.push(`来源卷号与用户引用不一致：${r.volume}`);
    if(r.volume&&volumeResult?.status==="review")issues.push(volumeResult.reason);
    if(r.issue&&!issueOk)issues.push(`来源期号未在用户引用中找到：${r.issue}`);
    if(r.pages&&!pagesOk)issues.push(`来源页码或文章号未在用户引用中找到：${r.pages}`);
  }
  const scored=fieldChecks.filter(x=>x.status!=="na");
  const score=scored.length?Math.round(scored.reduce((sum,x)=>sum+x.score,0)/scored.length*100):0;
  return{original,parsed:parseRef(original),record:r,fieldChecks,score,status:issues.length?"review":"matched",issues,sources,sensitivity};
}
async function check(original){
  const p=parseRef(original),sources=[];
  let crossCands=[],openCands=[],crossrefOK=false,openalexOK=false;
  try{
    const u=p.doi?`https://api.crossref.org/works/${encodeURIComponent(p.doi)}`:`https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(original)}&rows=3`;
    const z=await fetch(u);
    if(z.ok){crossrefOK=true;const j=await z.json();const xs=Array.isArray(j.message?.items)?j.message.items:[j.message];crossCands=xs.filter(Boolean).map(cross);if(crossCands.length)sources.push("Crossref");}
    else if(z.status===404)crossrefOK=true;
  }catch(e){}
  try{
    const q=p.doi?`filter=doi:${encodeURIComponent(p.doi)}`:`search=${encodeURIComponent(original)}`;
    const z=await fetch(`https://api.openalex.org/works?${q}&per-page=3`);
    if(z.ok){openalexOK=true;const j=await z.json();openCands=(j.results||[]).map(open);if(openCands.length)sources.push("OpenAlex");}
    else if(z.status===404)openalexOK=true;
  }catch(e){}
  const pool=crossCands.length?crossCands:openCands;
  pool.sort((a,b)=>sim(original,sourceText(b))-sim(original,sourceText(a)));
  const sensitivity=(document.getElementById("sensitivity")||{}).value||"high";
  if(pool[0])return assess(original,pool[0],sources,sensitivity);
  if(!crossrefOK&&!openalexOK)return{original,parsed:p,score:0,status:"request-error",issues:["核验请求失败，请检查网络或稍后重试"],sources:["Crossref","OpenAlex"],sensitivity};
  return{original,parsed:p,score:0,status:"unmatched",issues:["未在当前公开索引中找到可信记录；这不等于文献不存在"],sources:[crossrefOK&&"Crossref",openalexOK&&"OpenAlex"].filter(Boolean),sensitivity};
}
function esc(s){
  s=(s||"").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;/g,"'");
  return s.replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
}
function fieldRow(label,written,found,opts={}){
  const same=opts.same!==undefined?opts.same:(written&&found?sim(written,found)>.82:false);
  return `<div class="field-row"><span>${label}</span><p>${esc(written)||"—"}</p><p class="${same?"same":"diff"}">${esc(found)||"—"}</p></div>`;
}
function renderSourceRecord(result){
  if(!result.record)return `<div class="notice">${result.status==="checking"?"正在查询来源记录…":esc(result.issues?.[0]||"未找到可比对的来源记录")}</div>`;
  const rows=(result.fieldChecks||[]).slice().sort((a,b)=>(a.status==="na")-(b.status==="na")).map(field=>{const text=field.status==="match"?"✓":field.status==="na"?"未核验":field.status==="review"?"需复核":"不一致";return `<tr><td>${esc(field.label)}</td><td>${esc(field.value)}</td><td><span class="field-status ${field.status}">${text}</span>${field.note?`<small class="field-note">${esc(field.note)}</small>`:""}</td></tr>`}).join("");
  return `<div class="source-record-wrap">
    <button class="toggle-record" aria-expanded="false"><span class="toggle-label">来源记录</span><span class="arrow">▸</span></button>
    <div class="source-record-body" hidden>
      <table class="source-record"><thead><tr><th>字段</th><th>来源原信息</th><th>核验结论</th></tr></thead><tbody>${rows}</tbody></table>
    </div>
  </div>`;
}
// —— 核验结论映射到中文结果体系 ——
const VERDICTS={
  checking:{label:"正在核验",sub:"查询中"},
  authentic:{label:"已验证",sub:"来源已找到"},
  notice:{label:"已找到来源",sub:"存在差异"},
  unsure:{label:"暂不确定",sub:"需要复核"},
  requesterror:{label:"请求失败",sub:"请检查网络"},
  notfound:{label:"未找到来源",sub:"需要进一步核验"}
};
function verdictOf(r){
  if(r.status==="checking")return"checking";
  if(r.status==="request-error")return"requesterror";
  if(!r.record)return"notfound";
  if(r.status==="matched"||(r.score||0)===100)return"authentic";
  // 来源存在、置信度高 → 已找到来源但有差异；置信度偏低 → 暂不确定。
  return (r.score||0)>=70?"notice":"unsure";
}
function chipHtml(field){
  const cls={match:"ok",mismatch:"bad",review:"warn",na:"muted"}[field.status]||"muted";
  const mark=field.status==="match"?"✓":field.status==="na"?"–":"!";
  return `<span class="chip ${cls}"><i>${mark}</i>${esc(field.label)}</span>`;
}
function explanationOf(r,v){
  if(r.record){
    const differences=(r.fieldChecks||[]).filter(field=>field.status==="mismatch"||field.status==="review");
    return{title:differences.length?"需复核字段":"",text:"",bullets:differences.map(field=>`${field.label}：来源原信息为 ${field.value||"—"}${field.note?`（${field.note}）`:""}`)};
  }
  if(v==="requesterror")return{title:"联网核验未完成",text:(r.issues&&r.issues[0])||"核验请求失败，请检查网络或稍后重试。",bullets:[]};
  if(v==="notfound")return{title:"需要进一步核验",text:(r.issues&&r.issues[0])||"在学术数据库中未找到匹配的来源记录。",bullets:[]};
  return{title:"",text:"正在检索并核对来源字段…",bullets:[]};
}
function cardHtml(r,index){
  const v=verdictOf(r),V=VERDICTS[v],score=r.score||0;
  const rec=r.record||{};
  // 字段 chips 与下方“来源记录”表格使用同一组字段，保持一一对应
  const chips=(r.fieldChecks||[]).slice().sort((a,b)=>(a.status==="na")-(b.status==="na")).map(chipHtml).join("");
  const exp=explanationOf(r,v);
  const bullets=exp.bullets.length?`<ul class="exp-list">${exp.bullets.map(b=>`<li>${esc(b)}</li>`).join("")}</ul>`:"";
  const srcUrl=rec.url?esc(rec.url):"";
  const srcLink=srcUrl?`<a class="source-link" href="${srcUrl}" target="_blank" rel="noreferrer">查看来源记录 ↗</a>`:"";
  const detail=r.record?renderSourceRecord(r):"";
  return `<article class="result v-${v}">
    <div class="card-head">
      <div class="verdict-main"><span class="ref-no">[${index}]</span><span class="status-pill ${v}">${V.label}</span><span class="status-sub">${V.sub}</span></div>
      <div class="score-ring ${v}" data-p="${score}"><span class="pct">${score}%</span></div>
    </div>
    <p class="citation-text">${r.originalHtml||esc(r.original)}</p>
    ${chips?`<div class="field-chips">${chips}</div>`:""}
    ${(exp.title||exp.text||bullets)?`<div class="explanation ${v}">
      ${exp.title?`<p class="exp-title">${esc(exp.title)}</p>`:""}
      ${exp.text?`<p class="exp-text">${esc(exp.text)}</p>`:""}
      ${bullets}
    </div>`:""}
    ${detail}
    <div class="card-actions">
      ${srcLink}
    </div>
  </article>`;
}
function render(results){
  const report=document.getElementById("report");
  const all=results.length;
  const isAuthentic=r=>verdictOf(r)==="authentic";
  const authenticN=results.filter(isAuthentic).length;
  const reviewN=all-authenticN;
  // 当某分类为空时，自动切回“所有记录”
  if(activeTab==="matched"&&authenticN===0)activeTab="all";
  if(activeTab==="review"&&reviewN===0)activeTab="all";
  const sensLabel=state[0]&&state[0].sensitivity==="high"?"高（全字段）":"中（仅 DOI、标题、年份）";
  let html=`<div class="report-head"><div>
    <span class="section-no">01 / 核验报告</span>
    <h2>核验结果</h2>
    <p>共处理 ${all} 条，当前敏感度：<b>${sensLabel}</b>。来源核心信息存在于用户引用中则通过核验；未找到或存在缺项时请结合原文与图书馆目录复核。</p>
  </div></div>
  <p class="disclaimer">引用审查工具基于规则辅助核验，需人工核对最终结果。</p>
  <div class="tabs">
    <button class="tab ${activeTab==="review"?"active":""}" data-tab="review">需要复核<span class="count">${reviewN}</span></button>
    <button class="tab ${activeTab==="matched"?"active":""}" data-tab="matched">已验证<span class="count">${authenticN}</span></button>
    <button class="tab ${activeTab==="all"?"active":""}" data-tab="all">所有记录<span class="count">${all}</span></button>
  </div>`;
  if(fullTextDetected)html+=`<div class="notice">已从整篇论文中自动定位 References / Bibliography 小节，并提取 ${all} 条参考文献进行核验。</div>`;
  if(reviewN===0){
    html+=`<div class="notice">✓ 全部引用均包含所匹配来源的核心信息。</div>`;
  }
  html+=`<div class="results">`;
  results.forEach((r,i)=>{
    if(activeTab==="review"&&isAuthentic(r))return;
    if(activeTab==="matched"&&!isAuthentic(r))return;
    html+=cardHtml(r,i+1);
  });
  html+=`</div>`;
  report.innerHTML=html;
  report.style.display="block";
  // 环形进度通过 CSS 变量驱动（JS 设置，符合 CSP 的 style-src 'self'）
  report.querySelectorAll(".score-ring").forEach(el=>el.style.setProperty("--p",(el.dataset.p||0)+"%"));
  report.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>{activeTab=b.dataset.tab;render(state);}));
  report.querySelectorAll(".toggle-record").forEach(btn=>btn.addEventListener("click",()=>{
    const body=btn.parentElement.querySelector(".source-record-body");
    const open=body.hasAttribute("hidden");
    if(open)body.removeAttribute("hidden");else body.setAttribute("hidden","");
    btn.setAttribute("aria-expanded",String(open));
    const arrow=btn.querySelector(".arrow");if(arrow)arrow.textContent=open?"▾":"▸";
  }));
}

let state=[],activeTab="review",fullTextDetected=false;
let paused=false,running=false;
const refsEl=document.getElementById("refs");
const countEl=document.getElementById("count");
const runBtn=document.getElementById("run");
const pauseBtn=document.getElementById("pause");
const progressEl=document.getElementById("progress");
const progressFill=document.getElementById("progressFill");
const progressText=document.getElementById("progressText");
const progressPct=document.getElementById("progressPct");
function escapeEditorHtml(text=""){return String(text).replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));}
function sanitizeRefsHtml(html=""){
  const parsed=new DOMParser().parseFromString(String(html),"text/html"),out=document.createElement("div");
  const tags={p:"div",div:"div",br:"br",em:"em",i:"em",strong:"strong",b:"strong",u:"u"};
  const copy=(node,parent)=>{if(node.nodeType===Node.TEXT_NODE){parent.appendChild(document.createTextNode(node.nodeValue||""));return;}if(node.nodeType!==Node.ELEMENT_NODE)return;const tag=tags[node.tagName.toLowerCase()],next=tag?document.createElement(tag):parent;if(tag)parent.appendChild(next);[...node.childNodes].forEach(child=>copy(child,next));};
  [...parsed.body.childNodes].forEach(node=>copy(node,out));return out.innerHTML;
}
function refsText(){return (refsEl.innerText||refsEl.textContent||"").replace(/\u00a0/g," ").trim();}
function setRefsText(text=""){refsEl.innerHTML=String(text).split(/\r?\n/).map(line=>`<div>${escapeEditorHtml(line)||"<br>"}</div>`).join("");refsEl.dispatchEvent(new Event("input",{bubbles:true}));}
function setRefsHtml(html=""){refsEl.innerHTML=sanitizeRefsHtml(html);refsEl.dispatchEvent(new Event("input",{bubbles:true}));}
function richReferenceBlocks(){
  return [...refsEl.children].map(el=>({
    text:(el.innerText||el.textContent||"").replace(/\u00a0/g," ").trim(),
    html:sanitizeRefsHtml(el.innerHTML)
  })).filter(x=>x.text.length>15);
}
function originalHtmlFor(text,blocks){
  const key=normalizeBreaks(text).replace(/\s+/g," ").trim();
  const found=blocks.find(block=>normalizeBreaks(block.text).replace(/\s+/g," ").trim()===key);
  return found?found.html:"";
}
window.CitationVerifierEditor=Object.freeze({setHtml:setRefsHtml,setText:setRefsText,getText:refsText});
function updateCount(){
  const text=refsText(),sliced=sliceArticle(text);
  const n=splitReferences(sliced.found?sliced.references:text).filter(x=>x.trim().length>15).length;
  countEl.textContent=`${n} 条待检`;
}
// 预填：优先使用从引用审查页传入的内容（localStorage 同源跨标签页共享），否则用示例
let incomingRefs="";
try{ incomingRefs=(localStorage.getItem("citationReviewerRefs")||"").trim(); }catch(e){ incomingRefs=""; }
let incomingRefsHtml="";
try{incomingRefsHtml=(localStorage.getItem("citationReviewerRefsHtml")||"").trim();}catch(e){incomingRefsHtml="";}
if(incomingRefs){ if(incomingRefsHtml)setRefsHtml(incomingRefsHtml);else setRefsText(incomingRefs); try{ localStorage.removeItem("citationReviewerRefs");localStorage.removeItem("citationReviewerRefsHtml"); }catch(e){} 
  // 从引用审查页跳转而来：自动开始核验并定位到结果区
  if(!isMacOSHost)requestAnimationFrame(()=>{ runBtn.click(); });
}
else{ refsEl.innerHTML=""; }
updateCount();
refsEl.addEventListener("input",updateCount);
refsEl.addEventListener("paste",e=>{const html=e.clipboardData&&e.clipboardData.getData("text/html");if(!html)return;e.preventDefault();document.execCommand("insertHTML",false,sanitizeRefsHtml(html));});
refsEl.addEventListener("drop",e=>{const html=e.dataTransfer&&e.dataTransfer.getData("text/html");if(!html)return;e.preventDefault();refsEl.focus();document.execCommand("insertHTML",false,sanitizeRefsHtml(html));});
const sensitivityEl=document.getElementById("sensitivity");
const sensHintEl=document.getElementById("sensHint");
const sensHints={
  medium:"中等敏感度：仅检查来源记录中的 DOI 是否存在、题名与年份是否正确，适合快速排查明显错误。",
  high:"高等敏感度：核查作者、题名、期刊、年份、卷、期、页码与 DOI 全部字段是否一致，适合正式投稿前的精细复核。"
};
sensitivityEl.addEventListener("change",()=>{sensHintEl.textContent=sensHints[sensitivityEl.value]||"";});
document.getElementById("btnExample").addEventListener("click",()=>{setRefsText(sample);refsEl.focus();});
document.getElementById("clearRefs").addEventListener("click",()=>{refsEl.innerHTML="";updateCount();refsEl.focus();});
// 导入 Word：读取 .docx → 纯前端解析为正文 → 仅抽取参考文献列表填入文本框（sliceArticle 定位 References 小节）
const wordFileEl=document.getElementById("wordFile");
const importMsg=document.getElementById("importMsg");
document.getElementById("importWord").addEventListener("click",()=>wordFileEl.click());
wordFileEl.addEventListener("change",async()=>{
  const file=wordFileEl.files&&wordFileEl.files[0];
  if(!file)return;
  importMsg.textContent="正在读取 "+file.name+" …";
  try{
    const buf=await file.arrayBuffer();
    const {paragraphs}=await extractDocxText(buf);
    if(!paragraphs||!paragraphs.length){importMsg.textContent="文件已读取，但未提取到参考文献（可能是图片型或加密文档）";return;}
    let importText, foundNote="", count=0;
    // 优先用段落级切分（对齐 index.html）：按 References / Bibliography 等标题定位，取其之后段落
    const split=splitBodyAndReferences(paragraphs);
    if(split.found){
      // 段落级合并：把悬挂缩进的续行段落并入上一条，避免一条文献被劈成两条（如 “Strijbos, J.-W., &” 被单独切出）
      const items=groupRefParagraphs(split.refsParagraphs);
      importText=items.join("\n\n").trim();
      count=items.length;
      foundNote=`已从「${split.headingText}」之后抽取 ${count} 条参考文献`;
    }else{
      // 兜底：段落级没找到标题，则把全文 join 成纯文本，用 sliceArticle 再试一次（容忍无编号标题 / 从末尾扫）
      const flat=paragraphs.map(p=>p.text).join("\n");
      const sliced=sliceArticle(flat);
      const refText=sliced.found?sliced.references.trim():flat.trim();
      const items=splitReferences(refText);
      importText=items.join("\n\n").trim();
      count=items.length;
      if(!sliced.found)foundNote="未找到 References / Bibliography 等标题，已导入整篇文本，请确认参考文献部分是否正确";
    }
    const importedGroups=split.found?groupReferenceLines(split.refsParagraphs,p=>p&&p.text):[];
    if(importedGroups.length){
      const html=importedGroups.map(group=>`<div>${group.map(p=>(p.segments||[]).map(s=>s.italic?`<em>${escapeEditorHtml(s.text)}</em>`:escapeEditorHtml(s.text)).join("")).join(" ")}</div>`).join("");
      setRefsHtml(html);
    }else setRefsText(importText);
    importMsg.textContent=`已导入 ${file.name} 的参考文献列表（${count} 条）`+(foundNote?`；${foundNote}`:"");
    try{localStorage.setItem("cr_current_file",file.name);}catch(_){}
  }catch(e){importMsg.textContent="导入失败："+e.message;try{localStorage.removeItem("cr_current_file");}catch(_){}}
  wordFileEl.value="";
});
const scrollToResult=()=>{ requestAnimationFrame(()=>{ const a=document.getElementById("verifyResult"); if(a)a.scrollIntoView({behavior:"smooth",block:"start"}); }); };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
pauseBtn.addEventListener("click",()=>{
  if(!running)return;
  paused=!paused;
  pauseBtn.textContent=paused?"继续":"暂停";
  if(paused)progressText.innerHTML=`已暂停 · 第 ${progressText.querySelector("b")?.textContent||""} 条 — 点击「继续」恢复`;
});
runBtn.addEventListener("click",async()=>{
  if(running){ return; }
  const inputText=refsText(),sliced=sliceArticle(inputText);
  fullTextDetected=sliced.found;
  const refs=splitReferences(sliced.found?sliced.references:inputText).map(x=>x.trim()).filter(x=>x.length>15);
  const richBlocks=richReferenceBlocks();
  if(!refs.length)return;
  paused=false;running=true;
  runBtn.disabled=true;runBtn.firstChild.textContent="正在查找来源…";
  pauseBtn.hidden=false;pauseBtn.textContent="暂停";
  activeTab="review";
  state=refs.map(original=>({original,originalHtml:originalHtmlFor(original,richBlocks),parsed:parseRef(original),score:0,status:"checking",issues:[],sources:[]}));
  render(state);
  scrollToResult();
  // 逐条发送，避免并发过多被服务器拒绝；每条之间留间隔做限速
  progressEl.classList.add("show");
  const total=refs.length;
  for(let i=0;i<total;i++){
    while(paused){
      progressText.innerHTML=`已暂停 · 第 <b>${i+1}</b> / ${total} 条 — 点击「继续」恢复`;
      await sleep(250);
    }
    const done=i;
    progressFill.style.width=`${Math.round(done/total*100)}%`;
    progressText.innerHTML=`正在核验第 <b>${i+1}</b> / ${total} 条…`;
    progressPct.textContent=`${Math.round(done/total*100)}%`;
    try{ state[i]=await check(refs[i]); }catch(e){ state[i]={original:refs[i],parsed:parseRef(refs[i]),score:0,status:"request-error",issues:["核验请求失败，请检查网络或稍后重试"],sources:["Crossref","OpenAlex"],sensitivity:sensitivityEl.value||"high"}; }
    state[i].originalHtml=originalHtmlFor(refs[i],richBlocks);
    render(state);
    if(i<total-1)await sleep(500+Math.random()*600); // 随机限速 0.5s 起，降低被限流/拒绝的概率
  }
  progressFill.style.width="100%";
  progressText.innerHTML=`已完成 <b>${total}</b> / ${total} 条核验`;
  progressPct.textContent="100%";
  render(state);
  runBtn.disabled=false;runBtn.firstChild.textContent="开始核验";
  pauseBtn.hidden=true;
  running=false;paused=false;
  setTimeout(()=>progressEl.classList.remove("show"),1500);
});
document.documentElement.dataset.citationVerifierReady="true";
