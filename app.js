(function(){
 'use strict';
 const C=Reconcile,$=id=>document.getElementById(id),sides={A:{version:0,table:null},B:{version:0,table:null}};
 let result=null,page=0;const PAGE_SIZE=100;
 const sampleA='交易编号,金额,备注\r\nT001,1000.00,服务收入\r\nT002,-120.50,采购\r\nT003,-99.00,订阅\r\nT004,30.00,退款\r\n';
 const sampleB='交易编号,金额,备注\r\nT001,1000.00,服务收入\r\nT002,-125.50,采购\r\nT004,30.00,退款\r\nT005,-60.00,手续费\r\n';
 function el(tag,text,className){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;}
 function invalidate(message='输入已改变，请重新开始对账。'){result=null;page=0;$('results').hidden=true;$('validation').hidden=true;$('rows').replaceChildren();$('status').textContent=message;updateReady();}
 function updateReady(){$('run').disabled=!['A','B'].every(k=>sides[k].table&&$('header'+k).checked);}
 function clearSide(k){const s=sides[k];s.version++;s.table=null;$('mapping'+k).hidden=true;$('error'+k).hidden=true;$('error'+k).textContent='';$('header'+k).checked=false;$('id'+k).replaceChildren();$('amount'+k).replaceChildren();$('preview'+k).replaceChildren();}
 function showError(k,message){$('error'+k).textContent=message;$('error'+k).hidden=false;$('meta'+k).textContent='未成功读取；请修正格式或重新选择。';updateReady();}
 function useTable(k,table,name){const s=sides[k];s.table=table;$('meta'+k).textContent=`${name} · ${table.rows.length.toLocaleString('zh-CN')} 条记录`;
   for(const field of ['id','amount']){const select=$(field+k);select.replaceChildren();table.headers.forEach((h,i)=>{const o=el('option',h);o.value=String(i);select.append(o);});}
   // Offer a useful initial selection; the user can inspect and change both.
   const id=table.headers.findIndex(h=>/编号|流水号|交易号|^id$/i.test(h));const amt=table.headers.findIndex(h=>/金额|^amount$/i.test(h));
   $('id'+k).value=String(id<0?0:id);$('amount'+k).value=String(amt<0?(id===1?0:1):amt);
   const t=el('table'),head=el('thead'),tr=el('tr');tr.append(el('th','原始行号'));table.headers.forEach(h=>tr.append(el('th',h)));head.append(tr);t.append(head);const body=el('tbody');table.rows.slice(0,3).forEach(row=>{const r=el('tr');r.append(el('td',String(row.line)));row.cells.forEach(x=>r.append(el('td',x)));body.append(r);});t.append(body);$('preview'+k).replaceChildren(t);$('mapping'+k).hidden=false;updateReady();
 }
 async function loadFile(k){clearSide(k);invalidate('正在读取文件…');const file=$('file'+k).files[0],version=sides[k].version;if(!file){$('meta'+k).textContent='尚未选择文件';$('status').textContent='选择两份文件并确认标题后，即可开始。';return;}
   $('meta'+k).textContent=`正在读取 ${file.name}…`;
   try{if(file.size>C.MAX_BYTES)throw new Error('文件超过 10 MiB，请拆分后重新选择。');const bytes=await file.arrayBuffer();if(version!==sides[k].version)return;let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw new Error('文件不是有效 UTF-8，请在本地另存为 UTF-8 CSV。');}const table=C.parseCSV(text);if(version!==sides[k].version)return;useTable(k,table,file.name);$('status').textContent='请检查列映射和前 3 条记录，确认第一行是标题。';}
   catch(e){if(version!==sides[k].version)return;showError(k,e.message);$('status').textContent='文件读取失败，请查看红色提示。';}
 }
 function run(){invalidate('正在核对…');const issues=[];let a,b;
   try{if(!$('headerA').checked||!$('headerB').checked||!sides.A.table||!sides.B.table)throw new Error('请先选择两份文件并确认标题。');
     for(const k of ['A','B']){let v;try{v=C.validate(sides[k].table,Number($('id'+k).value),Number($('amount'+k).value));}catch(e){throw new Error(`账单 ${k}：${e.message}`);}v.errors.forEach(e=>issues.push(`${k} 第 ${e.line} 行：${e.message}`));if(k==='A')a=v;else b=v;}
     if(issues.length)throw new Error(`${issues.length} 处数据错误。`);
     result=C.compare(a,b);page=0;$('filter').value='diff';$('search').value='';renderResult();$('status').textContent='对账完成；您可以筛选、复核行号或导出。';
   }catch(e){$('validation').hidden=false;$('errorCount').textContent=issues.length?`共 ${issues.length} 处错误，显示前 ${Math.min(100,issues.length)} 处。`:e.message;$('errorList').replaceChildren(...issues.slice(0,100).map(x=>el('li',x)));$('status').textContent='对账未完成。请修正错误后重试。';}
 }
 function renderResult(){const r=result,diff=r.rows.length-r.counts.same;$('resultTitle').textContent=diff?`发现 ${diff} 笔差异`:'全部一致 · '+r.counts.same+' 笔';$('counts').replaceChildren(...['different','onlyA','onlyB','same'].map(k=>{const d=el('div',undefined,'count');d.append(el('span',C.labels[k]),el('strong',String(r.counts[k])));return d;}));$('totalA').textContent=C.money(r.totalA)+' 元';$('totalB').textContent=C.money(r.totalB)+' 元';$('totalDiff').textContent=C.money(r.totalA-r.totalB,true)+' 元';$('results').hidden=false;renderRows();}
 function filtered(){const mode=$('filter').value,q=$('search').value.trim();return result.rows.filter(r=>(mode==='all'||mode==='diff'&&r.status!=='same'||r.status===mode)&&r.id.includes(q));}
 function renderRows(){if(!result)return;const list=filtered(),pages=Math.max(1,Math.ceil(list.length/PAGE_SIZE));page=Math.min(page,pages-1);const body=$('rows');body.replaceChildren();for(const r of list.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE)){const tr=el('tr'),state=el('td');state.append(el('span',C.labels[r.status],'pill '+r.status));tr.append(state,el('td',r.id),el('td',r.a?String(r.a.line):'—'),el('td',r.b?String(r.b.line):'—'),el('td',r.a?C.money(r.a.cents):'—','num'),el('td',r.b?C.money(r.b.cents):'—','num'),el('td',C.money(r.diff,true),'num'));body.append(tr);}if(!list.length){const tr=el('tr'),td=el('td','当前条件下没有记录。');td.colSpan=7;tr.append(td);body.append(tr);}$('visibleCount').textContent=`符合条件 ${list.length} 笔 · 每页最多 100 笔`;$('pageInfo').textContent=`第 ${page+1} / ${pages} 页`;$('prev').disabled=page===0;$('next').disabled=page===pages-1;}
 function download(onlyDiff){if(!result)return;const blob=new Blob([C.exportCSV(result,onlyDiff)],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download=onlyDiff?'分毫-差异.csv':'分毫-全部结果.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);$('status').textContent='已生成下载文件，请在浏览器下载列表查看。';}
 for(const k of ['A','B']){$('file'+k).addEventListener('change',()=>loadFile(k));for(const field of ['id','amount','header'])$(field+k).addEventListener('change',()=>invalidate());}
 $('run').addEventListener('click',run);$('sample').addEventListener('click',()=>{for(const k of ['A','B']){clearSide(k);$('file'+k).value='';}invalidate();useTable('A',C.parseCSV(sampleA),'合成样例 A.csv');useTable('B',C.parseCSV(sampleB),'合成样例 B.csv');$('headerA').checked=$('headerB').checked=true;updateReady();run();});
 $('reset').addEventListener('click',()=>{for(const k of ['A','B']){clearSide(k);$('file'+k).value='';$('meta'+k).textContent='尚未选择文件';}invalidate('已清空。选择两份文件，或载入合成样例。');$('filter').value='diff';$('search').value='';});
 $('filter').addEventListener('change',()=>{page=0;renderRows();});$('search').addEventListener('input',()=>{page=0;renderRows();});$('prev').addEventListener('click',()=>{page--;renderRows();});$('next').addEventListener('click',()=>{page++;renderRows();});$('download').addEventListener('click',()=>download(true));$('downloadAll').addEventListener('click',()=>download(false));
})();
