(function(){
  "use strict";

  function q(id){ return document.getElementById(id); }

  const state = {
    assocId: "",
    assocName: "",
    assocStart: "",
    assocEnd: "",
    sharesTotal: 0,
    shareValue: 0,
    monthlyCollection: 0,
    months: [],
    edited: {}
  };

  function normalizeSharesText(v){
    let s = String(v ?? "").trim();
    // allow comma or Arabic comma or Arabic decimal separator
    s = s.replace(/[,،٫]/g, ".");
    s = s.replace(/[^0-9.]/g, "");    // keep digits and dot only
    const parts = s.split(".");
    if (parts.length > 2) s = parts[0] + "." + parts.slice(1).join("");
    const p = s.split(".");
    if (p.length === 2) s = p[0] + "." + p[1].slice(0, 1); // 1 decimal digit is enough (0.5)
    if (s.startsWith(".")) s = "0" + s;
    return s;
  }

  function parseShares(s){
    const t = normalizeSharesText(s);
    if (t === "" || t === ".") return 0;
    const n = Number(t);
    if (!isFinite(n) || n < 0) return 0;
    return Math.round(n * 2) / 2; // enforce 0.5 step
  }

  function setNotice(type, msg){
    const el = q("prefNotice");
    if (!el) return;
    el.className = "notice " + (type || "");
    el.textContent = msg || "";
    el.style.display = msg ? "block" : "none";
  }

  function renderHeader(){
    const header = q("prefHeader");
    if (header){
      header.innerHTML = `
        <div class="small muted">اسم الجمعية: ${escapeHtml_(state.assocName)} , البداية: ${escapeHtml_(state.assocStart)} , النهاية: ${escapeHtml_(state.assocEnd)}</div>
      `;
    }
    const summary = q("prefSummary");
    if (summary){
      const monthsCount = state.months.length || 0;
      const payoutPerShare = (Number(state.shareValue||0) * monthsCount) || 0;
      const totalAllocated = calcTotalAllocated_();
      const remaining = Math.round((Number(state.sharesTotal||0) - totalAllocated) * 2) / 2;
      summary.textContent =
        "عدد أسهمك: " + state.sharesTotal +
        " , قيمة السهم: " + state.shareValue +
        " , مبلغ الاستلام لكل سهم: " + payoutPerShare +
        " , التحصيل الشهري للجمعية: " + state.monthlyCollection +
        " , المتبقي لك: " + (remaining < 0 ? 0 : remaining);
    }
  }

  function getMonthRec_(monthNo){
    const m = state.months.find(x=>Number(x.monthNo)===Number(monthNo));
    const prefShares = m ? Number(m.prefShares||0) : 0;
    const prefType = m ? String(m.prefType||"ممكن التعديل") : "ممكن التعديل";
    const edited = state.edited[Number(monthNo)];
    if (edited) return { shares: Number(edited.shares||0), type: String(edited.type||prefType) };
    return { shares: prefShares, type: prefType };
  }

  function calcTotalAllocated_(){
    let sum = 0;
    state.months.forEach(m=>{ sum += Number(getMonthRec_(m.monthNo).shares||0); });
    return Math.round(sum*2)/2;
  }

  function payoutPerShare_(){
    const monthsCount = state.months.length || 0;
    const shareValue = Number(state.shareValue||0);
    const v = shareValue * monthsCount;
    return isFinite(v) ? v : 0;
  }

  function updateDerivedUI_(){
    // تحديث: قيمة الاستلام, المتبقي, والملخص
    const tbody = q("prefTbody");
    if (!tbody) return;
    const payoutPerShare = payoutPerShare_();
    let running = 0;
    [...tbody.querySelectorAll('tr')].forEach(tr=>{
      const monthNo = Number(tr.dataset.monthNo||0);
      const rec = getMonthRec_(monthNo);
      running = Math.round((running + Number(rec.shares||0)) * 2) / 2;
      const remaining = Math.round((Number(state.sharesTotal||0) - running) * 2) / 2;
      const amount = (Number(rec.shares||0) * payoutPerShare);

      const tdAmount = tr.querySelector('[data-col="amount"]');
      const tdRemain = tr.querySelector('[data-col="remain"]');
      if (tdAmount) tdAmount.textContent = isFinite(amount) ? String(Math.round(amount)) : "0";
      if (tdRemain) tdRemain.textContent = String(remaining < 0 ? 0 : remaining);
    });
    renderHeader();
  }

  function escapeHtml_(s){
    return String(s ?? "").replace(/[&<>"']/g, (c)=>({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[c]));
  }

  function buildTable(){
    const tbody = q("prefTbody");
    tbody.innerHTML = "";

    state.months.forEach(m=>{
      const tr = document.createElement("tr");
      tr.dataset.monthNo = String(m.monthNo);

      tr.innerHTML = `
        <td>${m.monthNo}</td>
        <td>${escapeHtml_(m.gName)}</td>
        <td>${escapeHtml_(m.hName)}</td>
        <td data-col="shares"></td>
        <td data-col="type"></td>
        <td data-col="remain"></td>
        <td data-col="amount"></td>
        <td data-col="status">${escapeHtml_(m.status || "مفتوح")}</td>
      `;

      const inpCell = tr.children[3];
      const inp = document.createElement("input");
      inp.type = "text";
      inp.inputMode = "decimal";
      inp.autocomplete = "off";
      inp.spellcheck = false;
      inp.className = "sharesInput";
      inp.dataset.month = String(m.monthNo);
      inp.value = (m.prefShares ?? 0);

      inp.addEventListener("input", (e)=>{
        const t = normalizeSharesText(e.target.value);
        e.target.value = t;
        const monthNo = Number(e.target.dataset.month);
        const shares = parseShares(t);
        const cur = state.edited[monthNo] || { shares: Number(m.prefShares||0), type: String(m.prefType||"ممكن التعديل") };
        state.edited[monthNo] = { shares, type: cur.type };
        updateDerivedUI_();
      });

      inp.addEventListener("blur", (e)=>{
        const monthNo = Number(e.target.dataset.month);
        const shares = parseShares(e.target.value);
        e.target.value = shares ? shares : 0;
        const cur = state.edited[monthNo] || { shares: Number(m.prefShares||0), type: String(m.prefType||"ممكن التعديل") };
        state.edited[monthNo] = { shares, type: cur.type };
        updateDerivedUI_();
      });

      inpCell.appendChild(inp);

      const selCell = tr.children[4];
      const sel = document.createElement("select");
      sel.className = "typeSelect";
      sel.dataset.month = String(m.monthNo);
      sel.innerHTML = `
        <option value="ممكن التعديل">ممكن التعديل</option>
        <option value="ضروري">ضروري</option>
      `;
      sel.value = m.prefType || "ممكن التعديل";
      sel.addEventListener("change", (e)=>{
        const monthNo = Number(e.target.dataset.month);
        const cur = state.edited[monthNo] || { shares: Number(m.prefShares||0), type: String(m.prefType||"ممكن التعديل") };
        state.edited[monthNo] = { shares: cur.shares, type: e.target.value };
        updateDerivedUI_();
      });
      selCell.appendChild(sel);

      tbody.appendChild(tr);
    });

    updateDerivedUI_();
  }

  async function load(){
    // رجوع ثابت للوحة المشترك لتجنب الرجوع لصفحات وسيطة مثل صفحة التواصل
    const backBtn = document.getElementById('btnBack');
    if (backBtn && !backBtn.dataset.bound){
      backBtn.dataset.bound = "1";
      backBtn.addEventListener('click', ()=>{ location.href = 'subscriber.html'; });
    }

    const sess = Auth.getSession();
    if (!sess || sess.role !== "مشترك"){
      Auth.clearSession();
      location.href = "index.html";
      return;
    }

    const params = new URLSearchParams(location.search);
    const assocId = params.get("assocId");
    if (!assocId){
      setNotice("danger", "معرف الجمعية غير موجود");
      return;
    }
    state.assocId = assocId;

    setNotice("info", "جاري التحميل...");
    try{
      const res = await API.post("subscriberGetPreferences", { token: sess.token, assocId });
      state.assocName = res.association["اسم الجمعية"];
      state.assocStart = res.association["تاريخ بداية الجمعية"];
      state.assocEnd = res.association["تاريخ نهاية الجمعية"];
      state.sharesTotal = res.sharesTotal;
      state.shareValue = res.shareValue;
      state.monthlyCollection = res.monthlyCollection;
      state.months = res.months.map(x=>({
        monthNo: x.monthNo,
        gDate: x.gDate,
        gName: x.gName,
        hName: x.hName,
        status: x.status,
        prefShares: x.prefShares,
        prefType: x.prefType
      }));

      state.edited = {};
      state.months.forEach(m=>{
        state.edited[m.monthNo] = { shares: Number(m.prefShares||0), type: String(m.prefType||"ممكن التعديل") };
      });

      renderHeader();
      buildTable();
      setNotice("", "");
    }catch(e){
      setNotice("danger", e.message || "تعذر التحميل");
    }
  }

  async function save(){
    const sess = Auth.getSession();
    if (!sess){ location.href="index.html"; return; }

    const rows = state.months.map(m=>{
      const rec = state.edited[m.monthNo] || { shares: 0, type: "ممكن التعديل" };
      return { monthNo: m.monthNo, shares: rec.shares, type: rec.type };
    });

    setNotice("info", "جاري الحفظ...");
    try{
      const res = await API.post("subscriberSavePreferences", { token: sess.token, assocId: state.assocId, rows });
      setNotice("success", res.message || "تم الحفظ");
      // رجوع مباشر للوحة المشترك, بدون الرجوع المتدرج أو صفحة التواصل
      setTimeout(()=>{ location.href = "subscriber.html"; }, 600);
    }catch(e){
      setNotice("danger", e.message || "لم يتم الحفظ");
    }
  }

  document.addEventListener("DOMContentLoaded", ()=>{
    // الأزرار في هذه الصفحة
    const btnSave = q("btnSavePrefs");
    if (btnSave) btnSave.addEventListener("click", save);

    // منع Enter من عمل submit أو تغيير فوكس
    document.addEventListener("keydown", (e)=>{
      if (e.key === "Enter" && e.target && (e.target.tagName === "INPUT" || e.target.tagName === "SELECT")){
        e.preventDefault();
      }
    });

    load();
  });
})();