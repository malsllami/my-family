(async function(){
  const { q, escapeHtml } = Util;

  function assocCard(a){
    const status = a["حالة الجمعية"];
    let badge = "gray";
    let statusText = "مغلقة";
    if(status === "نشطة"){ badge="green"; statusText="نشطة"; }
    if(status === "جديدة"){ badge="pink"; statusText="جديدة"; }
    const canOpen = status !== "جديدة";
    const hint = status === "جديدة" ? "<div class='muted small'>بادر بالتسجيل</div>" : "";
    return `
      <div class="card mini" style="cursor:${canOpen?"pointer":"default"}" data-open="${canOpen?1:0}" data-id="${escapeHtml(a["معرف الجمعية"])}">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
          <h3 style="margin:0">${escapeHtml(a["اسم الجمعية"])}</h3>
          <span class="badge ${badge}">${escapeHtml(statusText)}</span>
        </div>
        <div class="muted small" style="margin-top:10px">
          <div>البداية: ${escapeHtml(a["تاريخ بداية الجمعية"])}</div>
          <div>النهاية: ${escapeHtml(a["تاريخ نهاية الجمعية"])}</div>
          <div>المشتركين: ${escapeHtml(a["عدد المشتركين"])}</div>
          <div>الأسهم: ${escapeHtml(a["اجمالي عدد الاسهم"])}</div>
          <div>الإجمالي: ${escapeHtml(a["اجمالي قيمة الجمعية"])}</div>
        </div>
        ${hint}
      </div>
    `;
  }

  async function load(){
    const box = q("associations");
    const empty = q("emptyAssociations");
    box.innerHTML = "";
    empty.classList.add("hidden");
    try{
      const r = await Api.post("listAssociationsPublic", {});
      const rows = r.rows || [];
      if(!rows.length){ empty.classList.remove("hidden"); return; }
      box.innerHTML = rows.map(assocCard).join("");
      [...box.querySelectorAll("[data-open='1']")].forEach(el=>{
        el.addEventListener("click", ()=>{
          location.href = "subscriber.html";
        });
      });
    }catch(e){
      empty.classList.remove("hidden");
      empty.textContent = e.message;
    }
  }

  q("btnLoad").addEventListener("click", load);
  load();
})();