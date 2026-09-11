(function(global){
  "use strict";

  const MIN_REFERENCE_LENGTH=8;

  function normalizeBreaks(text=""){
    return String(text)
      .replace(/\r\n?/g,"\n")
      .replace(/([\p{L}\p{N}])-\n([\p{L}\p{N}])/gu,"$1-$2");
  }

  function isLikelyReferenceStart(line=""){
    const text=String(line).trim();
    if(!text)return false;
    if(/^(?:\[\d+\]|\d{1,3}[.)])\s+/.test(text))return true;
    const hasYear=/(?:^|[\s(,.;])(?:19|20)\d{2}[a-z]?(?:[\s),.;:]|$)/i.test(text);
    if(!hasYear)return false;
    return /^(?:[A-Z\p{Lu}][\p{L}'’.-]+(?:\s+[A-Z\p{Lu}][\p{L}'’.-]+){0,5}\s*,|[A-Z\p{Lu}][\p{L}'’.-]+\s+(?:[A-Z]\.?\s*){1,4}(?:,|\s)|[^.!?\n]{2,120}\.\s*\((?:19|20)\d{2}|[\p{Script=Han}]{2,}(?:[，,、]|\s))/u.test(text);
  }

  function isReferenceEndHeading(line=""){
    const text=String(line).replace(/\s+/g," ").trim();
    if(!text||text.length>90)return false;
    if(/^(?:\d+[.)]\s*)?(?:appendix|appendices)(?:\s+[A-Z0-9IVX]+)?(?:\s*[:.\-–—]\s*[^.!?]{1,60})?$/i.test(text))return true;
    return /^(?:\d+[.)]\s*)?附录(?:\s*[A-Z0-9IVX一二三四五六七八九十]+)?(?:\s*[:：.\-–—]\s*[^。！？]{1,60})?$/.test(text);
  }

  function referenceEndOffset(text=""){
    const source=String(text),lines=source.split("\n");
    let offset=0;
    for(const line of lines){
      if(isReferenceEndHeading(line))return offset;
      offset+=line.length+1;
    }
    return source.length;
  }

  function splitReferences(text=""){
    const source=normalizeBreaks(text);
    const bracketed=source.match(/(?:^|\n|\s)\[\d+\]\s+/g);
    if(bracketed&&bracketed.length>=2){
      return source.split(/(?:^|\n|\s)\[\d+\]\s+/).map(x=>x.trim()).filter(x=>x.length>=MIN_REFERENCE_LENGTH);
    }
    const numbered=source.match(/(?:^|\n)\s*\d{1,3}[.)]\s+/g);
    if(numbered&&numbered.length>=2){
      return source.split(/(?:^|\n)\s*\d{1,3}[.)]\s+/).map(x=>x.trim()).filter(x=>x.length>=MIN_REFERENCE_LENGTH);
    }
    if(/\n\s*\n/.test(source)){
      return source.split(/\n\s*\n/).map(x=>x.trim()).filter(x=>x.length>=MIN_REFERENCE_LENGTH);
    }

    const out=[];
    let current=null;
    for(const rawLine of source.split("\n")){
      const line=rawLine.trim();
      if(!line)continue;
      if(/^(?:\[\d+\]|\d{1,3}[.)]?)\s*$/.test(line)){
        if(current!==null){out.push(current);current=null;}
        continue;
      }
      if(current===null){current=line;continue;}
      const indented=/^\s/.test(rawLine);
      if(!indented&&isLikelyReferenceStart(line)){out.push(current);current=line;}
      else current+=" "+line;
    }
    if(current!==null)out.push(current);

    let result=out.filter(x=>x.length>=MIN_REFERENCE_LENGTH);
    if(result.length<=1&&source.length>250){
      const cuts=[];
      const startRe=/([\s>\]})"']|^)((?:\d{1,3}[.)]\s|\[\d+\]\s)?[A-Z][a-z'’.-]+(?:-[A-Z][a-z]+)?,\s+(?:[A-Z]|\())/g;
      let match;
      while((match=startRe.exec(source))){
        const position=match.index+match[1].length;
        if(position>0)cuts.push(position);
      }
      if(cuts.length){
        const parts=[];
        let start=0;
        for(const cut of cuts){parts.push(source.slice(start,cut).trim());start=cut;}
        parts.push(source.slice(start).trim());
        const candidates=parts.filter(x=>x.length>=MIN_REFERENCE_LENGTH);
        if(candidates.length>1)result=candidates;
      }
    }
    return result;
  }

  function splitDocumentSections(text=""){
    const source=normalizeBreaks(text);
    const heading=/(^|\n)[ \t#*0-9.)\-–—]*(?:references?|reference\s+list|works\s+cited|bibliograph(?:y|ies)|literature\s+cited|参考文献|参考资料)[ \t.:：·•0-9\-–—]*(?=\n|$)/gi;
    let match,last=null;
    while((match=heading.exec(source)))last={start:match.index+match[1].length,end:heading.lastIndex,label:match[0].trim()};
    if(!last)return{found:false,body:"",references:source.trim(),heading:""};
    const referenceSource=source.slice(last.end);
    const endOffset=referenceEndOffset(referenceSource);
    return{
      found:true,
      body:source.slice(0,last.start).trim(),
      references:referenceSource.slice(0,endOffset).trim(),
      heading:last.label
    };
  }

  // 富文本编辑器使用：返回原对象组成的条目组，从而保留斜体、粗体和页码。
  function groupReferenceLines(items=[],getText=item=>item&&item.text||""){
    const prepared=items.map(item=>({item,text:String(getText(item)||"").replace(/\s+/g," ").trim()}));
    const nonEmpty=prepared.filter(x=>x.text);
    if(!nonEmpty.length)return[];
    const bracketMode=nonEmpty.filter(x=>/^\[\d+\]\s+/.test(x.text)).length>=2;
    const numberMode=!bracketMode&&nonEmpty.filter(x=>/^\d{1,3}[.)]\s+/.test(x.text)).length>=2;
    const blankMode=!bracketMode&&!numberMode&&prepared.some(x=>!x.text);
    const groups=[];
    let current=[];
    const flush=()=>{
      if(current.length&&current.map(x=>x.text).join(" ").length>=MIN_REFERENCE_LENGTH)groups.push(current.map(x=>x.item));
      current=[];
    };
    for(const entry of prepared){
      if(!entry.text){if(blankMode)flush();continue;}
      if(/^(?:\[\d+\]|\d{1,3}[.)]?)\s*$/.test(entry.text)){flush();continue;}
      let starts=false;
      if(bracketMode)starts=/^\[\d+\]\s+/.test(entry.text);
      else if(numberMode)starts=/^\d{1,3}[.)]\s+/.test(entry.text);
      else if(!blankMode)starts=isLikelyReferenceStart(entry.text);
      const previous=current.length?current[current.length-1].text:"";
      const authorListContinues=/(?:[,&]|\band)\s*$/i.test(previous);
      if(current.length&&starts&&!authorListContinues)flush();
      current.push(entry);
    }
    flush();
    return groups;
  }

  global.CitationReferenceSplitter=Object.freeze({
    MIN_REFERENCE_LENGTH,
    normalizeBreaks,
    isLikelyReferenceStart,
    isReferenceEndHeading,
    splitReferences,
    splitDocumentSections,
    groupReferenceLines
  });
})(window);
