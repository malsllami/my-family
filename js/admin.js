/* لوحة المدير, بطاقات وتنقل
   يعتمد على:
   - Auth (الجلسة)
   - API.post(action, payload)
   - UI helpers
*/

(function () {
  "use strict";

  const VIEWS = {
    home: "viewHome",
    subscribers: "viewSubscribers",
    associations: "viewAssociations",
    assocDetail: "viewAssocDetail",
    collection: "viewCollection",
    devices: "viewDevices"
  };

  window.currentAssocId = "";
  let currentCollectionMonthNo = 1;

  function $(id) { return document.getElementById(id); }
  function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

  function toast(msg) {
    const el = $("toast");
    el.textContent = msg || "";
    el.classList.remove("hidden");
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.add("hidden"), 2500);
  }

  function ensureAdmin() {
    const s = Auth.getSession();
    if (!s || s.role !== "مدير") {
      window.location.href = "index.html";
      return null;
    }
    return s;
  }

  function hideAllViews() {
    Object.values(VIEWS).forEach(id => $(id).classList.add("hidden"));
  }

  async function nav(view, params = {}) {
    hideAllViews();
    $(VIEWS[view]).classList.remove("hidden");

    if (view === "subscribers") await loadSubscribers();
    if (view === "associations") await loadAssociations();
    if (view === "devices") await loadDeviceRequests();
    if (view === "assocDetail") await loadAssociationDetails(params.assocId);
    if (view === "collection") await loadCollection(params.assocId, params.monthNo, params.mode || "collection");
  }

  function statusBadge(status) {
    const s = String(status || "");
    const cls = (s === "نشطة") ? "badge badge-green" : (s === "جديدة") ? "badge badge-pink" : "badge badge-gray";
    return `<span class="${cls}">${escapeHtml(s || "")}</span>`;
  }

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[m]));
  }

  function fmtMobile(v) {
    return String(v || "").replace(/\D+/g, "");
  }

  function fmtDate(v) {
    const s = String(v || "");
    // قص أي وقت أو ISO مثل 2026-01-31T21:00:00.000Z
    const m = s.match(/(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : s;
  }

  // تنسيق مبلغ للعرض فقط, لا يعتمد عليه بالحساب
  function fmtMoney(v) {
    const s0 = String(v ?? "");
    const s = s0.replace(/[^0-9.\-]+/g, "");
    const n = Number(s);
    if (!isFinite(n)) return "0";
    try {
      return new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 2 }).format(n);
    } catch (e) {
      // fallback بسيط
      const rounded = Math.round(n * 100) / 100;
      return String(rounded);
    }
  }

  function lockBtn(btn, locked) {
    if (!btn) return;
    btn.disabled = !!locked;
    btn.classList.toggle("is-loading", !!locked);
  }

  async function loadSubscribers() {
    const sess = ensureAdmin();
    if (!sess) return;

    const box = $("subsList");
    box.innerHTML = `<div class="card"><div class="card-title">جاري التحميل</div></div>`;

    const res = await API.post("adminListSubscribers", { token: sess.token });
    if (!res.ok) { box.innerHTML = ""; toast(res.message || "خطأ"); return; }

    const rows = res.rows || [];
    if (!rows.length) {
      box.innerHTML = `<div class="card"><div class="card-title">لا يوجد مشتركين</div></div>`;
      return;
    }

    rows.sort((a, b) => String(a["اسم المشترك"] || "").localeCompare(String(b["اسم المشترك"] || ""), "ar"));

    box.innerHTML = "";
    rows.forEach(r => {
      const subId = String(r["معرف المشترك"] || "");
      const name = String(r["اسم المشترك"] || "");
      const mobile = fmtMobile(r["رقم الجوال"]);
      const pin = String(r["PIN المشترك"] || "").replace(/\D+/g, "");
      const code = String(r["رمز العرض"] || "");

      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <div class="row-between">
          <div>
            <div class="card-title">${escapeHtml(name)}</div>
            <div class="muted">المعرف: ${escapeHtml(subId)}</div>
          </div>
          <div class="row">
            <button class="btn btn-ghost" data-copy-pin="${escapeHtml(pin)}">نسخ PIN</button>
          </div>
        </div>

        <div class="form-grid">
          <label class="field">
            <span>الجوال</span>
            <input class="input" type="text" inputmode="numeric" value="${escapeHtml(mobile)}" data-mobile />
          </label>
          <label class="field">
            <span>رمز العرض</span>
            <input class="input" type="text" value="${escapeHtml(code)}" data-code />
          </label>
          <label class="field">
            <span>PIN المشترك</span>
            <input class="input" type="text" inputmode="numeric" value="${escapeHtml(pin)}" data-pin />
          </label>
        </div>

        <div class="actions">
          <button class="btn" data-save="${escapeHtml(subId)}">حفظ</button>
          <div class="msg" data-msg></div>
        </div>
      `;

      // copy
      card.querySelector('[data-copy-pin]').addEventListener("click", async (e) => {
        const p = e.currentTarget.getAttribute("data-copy-pin") || "";
        await navigator.clipboard.writeText(p);
        toast("تم النسخ");
      });

      // save
      card.querySelector('[data-save]').addEventListener("click", async (e) => {
        const btn = e.currentTarget;
        const msg = card.querySelector("[data-msg]");
        msg.textContent = "";
        lockBtn(btn, true);

        const newMobile = card.querySelector("[data-mobile]").value.trim();
        const newCode = card.querySelector("[data-code]").value.trim();
        const newPin = card.querySelector("[data-pin]").value.trim();

        const r2 = await API.post("adminUpdateSubscriber", {
          token: sess.token,
          subId,
          mobile: newMobile,
          displayCode: newCode,
          pin: newPin
        });

        lockBtn(btn, false);

        if (!r2.ok) { msg.textContent = r2.message || "فشل"; toast(r2.message || "فشل"); return; }
        msg.textContent = "تم التحديث";
        toast("تم التحديث");
      });

      box.appendChild(card);
    });
  }

  async function loadAssociations() {
    const sess = ensureAdmin();
    if (!sess) return;

    const list = $("assocList");
    list.innerHTML = `<div class="card"><div class="card-title">جاري التحميل</div></div>`;

    const res = await API.post("adminListAssociations", { token: sess.token });
    if (!res.ok) { list.innerHTML = ""; toast(res.message || "خطأ"); return; }

    const rows = res.rows || [];
    list.innerHTML = "";

    if (!rows.length) {
      list.innerHTML = `<div class="card"><div class="card-title">لا يوجد جمعيات</div></div>`;
      return;
    }

    rows.forEach(r => {
      const assocId = String(r["معرف الجمعية"] || "");
      const name = String(r["اسم الجمعية"] || "");
      const status = String(r["حالة الجمعية"] || "");
      const start = fmtDate(r["تاريخ بداية الجمعية"]);
      const end = fmtDate(r["تاريخ نهاية الجمعية"]);
      const subs = String(r["عدد المشتركين"] || "0");
      const shares = String(r["اجمالي عدد الاسهم"] || "0");

      const card = document.createElement("button");
      card.className = "card card-btn";
      card.innerHTML = `
        <div class="row-between">
          <div>
            <div class="card-title">${escapeHtml(name)}</div>
            <div class="muted">${escapeHtml(start)} , ${escapeHtml(end)}</div>
          </div>
          <div>${statusBadge(status)}</div>
        </div>
        <div class="row-between" style="margin-top:10px">
          <div class="muted">المشتركين: ${escapeHtml(subs)}</div>
          <div class="muted">الأسهم: ${escapeHtml(shares)}</div>
        </div>
      `;
      card.addEventListener("click", () => nav("assocDetail", { assocId }));
      list.appendChild(card);
    });
  }

  async function loadAssociationDetails(assocId) {
    const sess = ensureAdmin();
    if (!sess) return;

    currentAssocId = String(assocId || "").trim();
    if (!currentAssocId) { toast("معرف الجمعية غير صالح"); return; }

    $("assocDetailCard").innerHTML = `<div class="card-title">جاري التحميل</div>`;
    $("assocMembers").innerHTML = "";
    $("assocMembersSummary").textContent = "";

    const res = await API.post("adminGetAssociationDetails", { token: sess.token, assocId: currentAssocId });
    if (!res.ok) { toast(res.message || "خطأ"); return; }

    const a = res.association || {};
    const shareValue = Number(res.shareValue || 0);

    $("assocDetailCard").innerHTML = `
      <div class="row-between">
        <div>
          <div class="card-title">${escapeHtml(a["اسم الجمعية"] || "")}</div>
          <div class="muted">المعرف: ${escapeHtml(a["معرف الجمعية"] || "")}</div>
        </div>
        <div>${statusBadge(a["حالة الجمعية"] || "")}</div>
      </div>

      <div class="grid" style="margin-top:12px">
        <div class="mini">
          <div class="mini-k">تاريخ البداية</div>
          <div class="mini-v">${escapeHtml(fmtDate(a["تاريخ بداية الجمعية"]))}</div>
        </div>
        <div class="mini">
          <div class="mini-k">تاريخ النهاية</div>
          <div class="mini-v">${escapeHtml(fmtDate(a["تاريخ نهاية الجمعية"]))}</div>
        </div>
        <div class="mini">
          <div class="mini-k">عدد المشتركين</div>
          <div class="mini-v">${escapeHtml(a["عدد المشتركين"] || 0)}</div>
        </div>
        <div class="mini">
          <div class="mini-k">اجمالي الأسهم</div>
          <div class="mini-v">${escapeHtml(a["اجمالي عدد الاسهم"] || 0)}</div>
        </div>
        <div class="mini">
          <div class="mini-k">قيمة السهم</div>
          <div class="mini-v">${escapeHtml(shareValue)}</div>
        </div>
        <div class="mini">
          <div class="mini-k">التحصيل الشهري</div>
          <div class="mini-v">${escapeHtml(a["التحصيل الشهري"] || 0)}</div>
        </div>
      </div>

      <div class="row" style="gap:10px; margin-top:14px; flex-wrap:wrap">
        <button id="btnOpenCollection" class="btn">التحصيل</button>
        <button id="btnOpenDelivery" class="btn">التسليم</button>
      </div>
    `;

    const btnCol = document.getElementById("btnOpenCollection");
    if (btnCol) btnCol.addEventListener("click", () => {
      currentCollectionMonthNo = 1;
      nav("collection", { assocId: currentAssocId, monthNo: currentCollectionMonthNo });
    });

   const btnDel = document.getElementById("btnOpenDelivery");
   if (btnDel) btnDel.addEventListener("click", () => {
  currentCollectionMonthNo = 1;
  nav("collection", {
    assocId: currentAssocId,
    monthNo: currentCollectionMonthNo,
    mode: "delivery"
  });
});


    const members = res.members || [];
    if (!members.length) {
      $("assocMembers").innerHTML = `<div class="muted">لا يوجد مشتركين في هذه الجمعية</div>`;
      return;
    }

    const rowsHtml = members.map(m => `
      <tr>
        <td>${escapeHtml(m.subName)}</td>
        <td>${escapeHtml(m.shares)}</td>
        <td>${escapeHtml(m.monthly)}</td>
      </tr>
    `).join("");

    $("assocMembers").innerHTML = `
      <table class="table">
        <thead>
          <tr>
            <th>الاسم</th>
            <th>عدد الأسهم</th>
            <th>قيمة الأسهم</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    `;

    const totalShares = members.reduce((s, r) => s + (Number(r.shares) || 0), 0);
    const totalMonthly = members.reduce((s, r) => s + (Number(r.monthly) || 0), 0);

    $("assocMembersSummary").textContent =
      `المجموع, المشتركين ${members.length} , الأسهم ${totalShares} , قيمة التحصيل ${totalMonthly}`;
  }

  async function loadCollection(assocId, monthNo, mode = "collection") {
    const sess = ensureAdmin();
    if (!sess) return;

    currentAssocId = assocId;
    currentCollectionMonthNo = Number(monthNo) || 1;

    // في admin.html صندوق بيانات الجمعية اسمه collectionMeta
    const assocBox = $("collectionMeta");
    const monthsGrid = $("collectionMonthsGrid");
    const tableBox = $("collectionTable");

    if (assocBox) assocBox.innerHTML = `<div class="card"><div class="card-title">جاري التحميل</div></div>`;
    if (tableBox) tableBox.innerHTML = "";

    const action = (mode === "delivery") ? "adminGetDelivery" : "adminGetCollection";

    const res = await API.post(action, {
      token: sess.token,
      assocId,
      monthNo: currentCollectionMonthNo
    });

    if (!res.ok) {
    if (assocBox) assocBox.innerHTML = "";
      toast(res.message || "خطأ");
      return;
    }

    const a = res.association || {};
    const m = res.month || {};
    const rows = res.rows || [];

    // Totals compatibility: backend may return either expectedTotal/collectedTotal/remainingTotal
    // or totals.{expected,collected,remaining}
    const totals = res.totals || {};
    const expectedTotal = Number(res.expectedTotal !== undefined ? res.expectedTotal : (totals.expected !== undefined ? totals.expected : 0));
    const collectedTotal = Number(res.collectedTotal !== undefined ? res.collectedTotal : (totals.collected !== undefined ? totals.collected : 0));
    const remainingTotal = Number(res.remainingTotal !== undefined ? res.remainingTotal : (totals.remaining !== undefined ? totals.remaining : Math.max(0, expectedTotal - collectedTotal)));
    const collectedCount = rows.filter(r => String(r.collected || r["تم التحصيل"] || "").trim() === "نعم" || r.collected === true).length;

    // Months cards (10 cards)
    const months = res.months || [];
    monthsGrid.innerHTML = months.map(mm => {
      const no = Number(mm.monthNo);
      const label = `${mm.gName || ""}`.trim();
      const sub = `${mm.hName || ""}`.trim();
      const status = String(mm.status || "").trim();
      const active = no === currentCollectionMonthNo ? " active" : "";
      const badge = status ? `<span class="badge">${escapeHtml(status)}</span>` : "";
      return `
        <button type="button" class="month-card${active}" data-month="${no}">
          <div class="month-card-top">
            <div class="month-card-title">${escapeHtml(label || ("الشهر " + no))}</div>
            ${badge}
          </div>
          <div class="month-card-sub">${escapeHtml(sub)}</div>
        </button>
      `;
    }).join("");

    monthsGrid.querySelectorAll(".month-card").forEach(btn => {
      btn.addEventListener("click", () => {
        const no = Number(btn.getAttribute("data-month")) || 1;
        if (no === currentCollectionMonthNo) return;
        loadCollection(currentAssocId, no);
      });
    });

    if (assocBox) {
      const collectedCount = rows.filter(r => String(r.collected || "") === "1" || String(r.collected || "").toLowerCase() === "true" || String(r.collected || "") === "نعم").length;
      const totalCount = rows.length;

      assocBox.innerHTML = `
        <div class="card">
          <div class="row-between">
            <div>
              <div class="card-title">${escapeHtml(a.name || "")}</div>
              <div class="muted">${escapeHtml(m.gName || "")} , ${escapeHtml(m.hName || "")}</div>
            </div>
            <div class="pill">التحصيل الشهري: ${fmtMoney(expectedTotal)}</div>
          </div>
          <div class="grid-3" style="margin-top:12px">
            <div class="miniStat"><div class="miniLabel">المطلوب</div><div class="miniValue">${fmtMoney(expectedTotal)}</div></div>
            <div class="miniStat"><div class="miniLabel">تم تحصيله (${collectedCount}/${totalCount})</div><div class="miniValue">${fmtMoney(collectedTotal)}</div></div>
            <div class="miniStat"><div class="miniLabel">المتبقي</div><div class="miniValue">${fmtMoney(remainingTotal)}</div></div>
          </div>
        </div>
      `;
    }

    if (!rows.length) {
    if (tableBox) tableBox.innerHTML = `<div class="muted">لا يوجد مشتركين في هذه الجمعية</div>`;
      return;
    }

    const body = rows.map(r => {
      const checked = mode === "delivery"
  ? (r.delivered ? "checked" : "")
  : (r.collected ? "checked" : "");
      return `
        <tr>
          <td>${escapeHtml(r.subName || "")}</td>
          <td>${escapeHtml(String(r.shares || ""))}</td>
          <td>${mode === "delivery" ? fmtMoney((Number(r.deliveryShares || r.shares || 0)) * 1000) : escapeHtml(String(r.amount || ""))}</td>
          <td style="text-align:center">
            <input
               type="checkbox"
                   class="chk-collection"
                   data-sub="${escapeHtml(r.subId)}"
                ${checked}
            />

          </td>
          <td>${escapeHtml(r.date || "")}</td>
        </tr>
      `;
    }).join("");

    if (tableBox) tableBox.innerHTML = `
      <table class="table">
        <thead>
          <tr>
            <th>الاسم</th>
            <th>عدد الأسهم</th>
            <th>${mode === "delivery" ? "مبلغ التسليم" : "قيمة التحصيل"}</th>
            <th>تم التحصيل</th>
            <th>تاريخ التحصيل</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    `;

    // Bind checkbox events
    Array.from(document.querySelectorAll(".chk-collection")).forEach(chk => {
      chk.addEventListener("change", async (e) => {
        const subId = e.target.getAttribute("data-sub");
        const checked = !!e.target.checked;

const setAction = (mode === "delivery")
  ? "adminSetDelivery"
  : "adminSetCollection";

const payload = {
  token: sess.token,
  assocId,
  monthNo: currentCollectionMonthNo,
  subId
};

if (mode === "delivery") {
  payload.delivered = checked;
} else {
  payload.collected = checked;
}

const r = await API.post(setAction, payload);

        e.target.disabled = false;
        if (!r.ok) {
          e.target.checked = !collected;
          toast(r.message || "خطأ");
          return;
        }
        // refresh lightweight
        await loadCollection(assocId, currentCollectionMonthNo);
      });
    });
  }

  async function loadDeviceRequests() {
    const sess = ensureAdmin();
    if (!sess) return;

    const box = $("devReqList");
    box.innerHTML = `<div class="card"><div class="card-title">جاري التحميل</div></div>`;

    const res = await API.post("adminListDeviceRequests", { token: sess.token });
    if (!res.ok) { box.innerHTML = ""; toast(res.message || "خطأ"); return; }

    const rows = res.rows || [];
    const pending = rows.filter(r => String(r["حالة الطلب"] || "") === "معلق");
    const decided = rows.filter(r => String(r["حالة الطلب"] || "") !== "معلق");

    box.innerHTML = "";

    async function renderRow(r, isPending) {
      const reqId = String(r["معرف الطلب"] || "");
      const name = String(r["اسم المشترك"] || "");
      const devName = String(r["اسم الجهاز"] || "");
      const date = String(r["تاريخ الطلب"] || "");

      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <div class="row-between">
          <div>
            <div class="card-title">${escapeHtml(name)}</div>
            <div class="muted">${escapeHtml(devName)} , ${escapeHtml(date)}</div>
            <div class="muted">الطلب: ${escapeHtml(reqId)}</div>
          </div>
          <div class="row">
            ${isPending ? `
              <button class="btn" data-decide="موافقة">موافقة</button>
              <button class="btn btn-ghost" data-decide="رفض">رفض</button>
            ` : `<span class="badge badge-gray">تم القرار</span>`}
          </div>
        </div>
      `;

      if (isPending) {
        qsa("[data-decide]", card).forEach(btn => {
          btn.addEventListener("click", async (e) => {
            lockBtn(btn, true);
            const decision = e.currentTarget.getAttribute("data-decide");
            const r2 = await API.post("adminDecideDeviceRequest", {
              token: sess.token,
              requestId: reqId,
              decision
            });
            lockBtn(btn, false);
            if (!r2.ok) { toast(r2.message || "فشل"); return; }
            toast("تم");
            await loadDeviceRequests();
          });
        });
      }

      return card;
    }

    if (!pending.length && !decided.length) {
      box.innerHTML = `<div class="card"><div class="card-title">لا يوجد طلبات</div></div>`;
      return;
    }

    if (pending.length) {
      const h = document.createElement("div");
      h.className = "muted";
      h.textContent = "طلبات معلقة";
      box.appendChild(h);
      for (const r of pending) {
      box.appendChild(await renderRow(r, true));
    }
    }

    if (decided.length) {
      const h = document.createElement("div");
      h.className = "muted";
      h.style.marginTop = "6px";
      h.textContent = "طلبات تم اتخاذ قرار";
      box.appendChild(h);
      decided.slice(0, 20).forEach(r => box.appendChild(renderRow(r, false)));
    }
  }

  async function createAssociation() {
    const sess = ensureAdmin();
    if (!sess) return;

    const btn = $("btnCreateAssoc");
    const msg = $("createAssocMsg");
    msg.textContent = "";

    const name = ($("assocName").value || "").trim();
    const startDate = ($("assocStart").value || "").trim();

    lockBtn(btn, true);
    const res = await API.post("adminCreateAssociation", {
      token: sess.token,
      name,
      startDate
    });
    lockBtn(btn, false);

    if (!res.ok) { msg.textContent = res.message || "فشل"; toast(res.message || "فشل"); return; }
    msg.textContent = "تم";
    toast("تم");
    $("assocName").value = "";
    // لا نمسح التاريخ
    await loadAssociations();
  }

  function wireNavButtons() {
    qsa("[data-nav]").forEach(el => {
      el.addEventListener("click", () => {
        const v = el.getAttribute("data-nav");
        if (v === "home") return nav("home");
        if (v === "subscribers") return nav("subscribers");
        if (v === "associations") return nav("associations");
        if (v === "devices") return nav("devices");
      });
    });
  }

  function wireActions() {
    $("btnLogout").addEventListener("click", () => {
      Auth.clearSession();
      window.location.href = "index.html";
    });

    $("btnRefreshSubs").addEventListener("click", loadSubscribers);
    $("btnRefreshAssoc").addEventListener("click", loadAssociations);
    $("btnRefreshDev").addEventListener("click", loadDeviceRequests);
    $("btnRefreshAssocDetail").addEventListener("click", () => loadAssociationDetails(currentAssocId));
    $("btnBackFromCollection").addEventListener("click", () => nav("assocDetail", { assocId: currentAssocId }));
    $("btnRefreshCollection").addEventListener("click", () => loadCollection(currentAssocId, currentCollectionMonthNo));
    $("btnCreateAssoc").addEventListener("click", createAssociation);

    qsa(".card-btn[data-nav]").forEach(btn => {
      btn.addEventListener("click", () => nav(btn.getAttribute("data-nav")));
    });
  }

  function init() {
    const sess = ensureAdmin();
    if (!sess) return;

    wireNavButtons();
    wireActions();
    nav("home");
  }

  window.addEventListener("DOMContentLoaded", init);
})();

/* انتهاء الكود  */