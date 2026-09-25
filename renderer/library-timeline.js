window.libraryTimeline=(()=>{
 const day=ms=>{const d=new Date(ms);return Number.isFinite(d.getTime())?[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-'):'未知日期';};
 function setup(root,{unit,onChange}){
  let items=[],selected='',order='newest';
  function draw(){
   const counts=new Map();items.forEach(item=>{const key=day(item.createtime);counts.set(key,(counts.get(key)||0)+1);});if(selected&&!counts.has(selected))selected='';
   const filtered=items.filter(item=>!selected||day(item.createtime)===selected).sort((a,b)=>(order==='newest'?-1:1)*((a.createtime||0)-(b.createtime||0))||a.block_id.localeCompare(b.block_id));
   root.innerHTML=`<div class="library-days" role="group" aria-label="按创建日期筛选"><button data-library-day="" aria-pressed="${!selected}"><i></i><strong>全部</strong><small>${items.length} ${unit}</small></button>${[...counts].sort(([a],[b])=>a.localeCompare(b)).map(([date,count])=>`<button data-library-day="${date}" aria-pressed="${selected===date}"><i></i><strong>${date==='未知日期'?date:date.slice(5).replace('-','月')+'日'}</strong><small>${date==='未知日期'?'':date.slice(0,4)+' · '}${count} ${unit}</small></button>`).join('')}</div><div class="library-order"><span>时间排序</span><button data-library-order="oldest" aria-pressed="${order==='oldest'}">最早优先</button><button data-library-order="newest" aria-pressed="${order==='newest'}">最新优先</button><small role="status">${selected||'全部日期'} · ${filtered.length} ${unit} · 按创建时间</small></div>`;
   root.querySelectorAll('[data-library-day]').forEach(b=>b.onclick=()=>{selected=b.dataset.libraryDay;draw();});root.querySelectorAll('[data-library-order]').forEach(b=>b.onclick=()=>{order=b.dataset.libraryOrder;draw();});onChange(filtered);
  }
  return{update(value){items=value;draw();}};
 }
 return{setup};
})();
