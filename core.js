/* Local reconciliation core. No I/O, no network, no floating-point money. */
(function (root) {
  'use strict';
  const MAX_ROWS = 10000, MAX_BYTES = 10 * 1024 * 1024;
  function parseCSV(input) {
    const text = input.replace(/^\uFEFF/, '');
    if (!text.length) throw new Error('文件为空。请选择带标题和数据的 CSV。');
    const records = []; let cells = [], value = '', state = 'start', line = 1, start = 1;
    function cell() { cells.push(value); value = ''; state = 'start'; }
    function record() {
      cell(); records.push({cells, line:start}); cells = [];
      if (records.length > MAX_ROWS + 1) throw new Error('超过 10,000 条数据记录，请拆分 CSV。');
    }
    for (let i=0; i<text.length; i++) {
      const ch=text[i], newline=ch==='\r'||ch==='\n';
      if (state==='quoted') {
        if (ch==='"') { if(text[i+1]==='"') {value+='"';i++;} else state='closed'; }
        else { value+=ch; if(newline) { if(ch==='\r'&&text[i+1]==='\n') {value+='\n';i++;} line++; } }
        continue;
      }
      if (ch===',') { cell(); continue; }
      if (newline) { record(); if(ch==='\r'&&text[i+1]==='\n')i++; line++; start=line; continue; }
      if (state==='closed') throw new Error(`第 ${line} 行：闭合引号后只能是逗号或换行。`);
      if (ch==='"') { if(state!=='start') throw new Error(`第 ${line} 行：未加引号字段中出现引号。`); state='quoted'; }
      else {value+=ch;state='plain';}
    }
    if(state==='quoted') throw new Error(`第 ${start} 行：引号未闭合。`);
    if (cells.length || value.length || state!=='start') record();
    const head=records.shift();
    if(!head || head.cells.length<2) throw new Error('标题至少需要两列：交易编号和金额。');
    const headers=head.cells.map(x=>x.trim());
    if(headers.some(x=>!x) || new Set(headers).size!==headers.length) throw new Error('标题不可为空或重复。请在副本中修正第一行。');
    if(!records.length) throw new Error('只有标题，没有数据记录。');
    for(const row of records) if(row.cells.length!==headers.length) throw new Error(`第 ${row.line} 行：有 ${row.cells.length} 列，标题有 ${headers.length} 列。请检查逗号和引号。`);
    return {headers, rows:records};
  }
  function amount(input) {
    const s=String(input).trim();
    if(!/^[+-]?\d+(?:\.\d{1,2})?$/.test(s)) throw new Error('金额应为数字，可带正负号，最多两位小数；不支持千分位或币种符号。');
    const negative=s[0]==='-', parts=s.replace(/^[+-]/,'').split('.');
    // Limit significant digits before constructing BigInt from untrusted input.
    const whole=parts[0].replace(/^0+/,'')||'0';
    if(whole.length>16) throw new Error('金额超过单笔上限 9999999999999999.99 元。');
    const cents=BigInt(whole)*100n+BigInt((parts[1]||'').padEnd(2,'0'));
    return negative ? -cents : cents;
  }
  function money(cents, signed=false) {
    const abs=cents<0n?-cents:cents;
    return (cents<0n?'-':signed&&cents>0n?'+':'')+(abs/100n).toString()+'.'+(abs%100n).toString().padStart(2,'0');
  }
  function validate(table,idIndex,amountIndex) {
    if(!Number.isInteger(idIndex)||!Number.isInteger(amountIndex)||idIndex<0||amountIndex<0||idIndex>=table.headers.length||amountIndex>=table.headers.length||idIndex===amountIndex) throw new Error('请选择不同的交易编号列与金额列。');
    const errors=[],entries=[],seen=new Map();let total=0n;
    for(const row of table.rows) {
      const id=row.cells[idIndex].trim();let cents,valid=true;
      if(!id) {errors.push({line:row.line,message:'交易编号为空。请补全编号。'});valid=false;}
      else if(seen.has(id)) {errors.push({line:row.line,message:`重复编号「${id}」，首次在第 ${seen.get(id)} 行。请人工确认，工具不会合并。`});valid=false;}
      else seen.set(id,row.line);
      try {cents=amount(row.cells[amountIndex]);}catch(e){errors.push({line:row.line,message:e.message});valid=false;}
      if(valid){entries.push({id,cents,line:row.line,cells:row.cells.slice()});total+=cents;}
    }
    return {entries,total,errors};
  }
  function compare(a,b) {
    if(a.errors.length||b.errors.length)throw new Error('数据存在错误，请修正后重新选择文件。');
    const mapB=new Map(b.entries.map(x=>[x.id,x])), matched=new Set(), rows=[],counts={same:0,different:0,onlyA:0,onlyB:0};
    for(const x of a.entries){const y=mapB.get(x.id); const status=!y?'onlyA':x.cents===y.cents?'same':'different';counts[status]++;matched.add(x.id);rows.push({id:x.id,status,a:x,b:y||null,diff:x.cents-(y?y.cents:0n)});}
    for(const y of b.entries)if(!matched.has(y.id)){counts.onlyB++;rows.push({id:y.id,status:'onlyB',a:null,b:y,diff:-y.cents});}
    return {rows,counts,totalA:a.total,totalB:b.total};
  }
  const labels={same:'一致',different:'金额不同',onlyA:'仅 A 有',onlyB:'仅 B 有'};
  function safeCell(value,forceText=false) {
    const s=String(value??'');
    // Spreadsheet formula prefixes including leading whitespace and fullwidth variants.
    return forceText || /^[\s\u0000-\u001f]*[=+\-@＝＋－＠]/u.test(s) || /^[\t\r\n]/.test(s) ? "'"+s : s;
  }
  function quote(s){return '"'+String(s).replace(/"/g,'""')+'"';}
  function exportCSV(result,onlyDiff=true) {
    const rows=[['状态','交易编号（文本）','A 原始行号','B 原始行号','A 金额（元）','B 金额（元）','A-B 差额（元）']];
    for(const r of result.rows)if(!onlyDiff||r.status!=='same')rows.push([labels[r.status],safeCell(r.id,true),r.a?.line??'',r.b?.line??'',r.a?money(r.a.cents):'',r.b?money(r.b.cents):'',money(r.diff,true)].map((v,i)=>i===1?v:safeCell(v)));
    return '\uFEFF'+rows.map(row=>row.map(quote).join(',')).join('\r\n')+'\r\n';
  }
  const api={MAX_ROWS,MAX_BYTES,parseCSV,amount,money,validate,compare,exportCSV,safeCell,labels};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.Reconcile=api;
})(typeof globalThis!=='undefined'?globalThis:this);
