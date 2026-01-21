/**
 * مشروع جمعية عائلية, مرحلة 1
 * ربط مجاني 100% عبر Google Apps Script + GitHub Pages
 *
 * ملاحظة أمنية مهمة (مباشرة):
 * تخزين PIN المدير داخل تبويب "اعدادات" يعني أن أي خلل في صلاحيات API قد يعرضه للقراءة.
 * سنغلق هذا عملياً بأن أي API لا يرجع قيمة PIN أبداً, والتحقق يتم في السيرفر فقط.
 */

const TAB = {
  settings: "اعدادات",
  subscribers: "المشتركين",
  associations: "الجمعيات",
  memberships: "عضويات الجمعيات",
  months: "اشهر الجمعيات",
  preferences: "الرغبات",
  devices: "الاجهزة",
  deviceRequests: "طلبات الاجهزة",
  ops: "العمليات"
};

const SETTINGS_KEYS = {
  shareValue: "قيمة السهم",
  months: "مدة الجمعية بالاشهر",
  adminPin: "PIN المدير",
  deviceLock: "قفل الجهاز مفعل",
  lastEdit: "تاريخ اخر تعديل",
  notes: "ملاحظات"
};

function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, message: "Family API" }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const raw = e && e.postData && e.postData.contents ? e.postData.contents : "";
    const req = raw ? JSON.parse(raw) : {};
    const action = String(req.action || "");
    const payload = req.payload || {};

    if (!action) return jsonFail_("طلب غير صالح");

    const handlers = {
      initSystem,
      registerSubscriber,
      loginSubscriber,
      loginAdmin,
      getSession,
      subscriberDashboard,
      updateSubscriberMobile,
      listAssociationsPublic,
      adminListDeviceRequests,
      adminDecideDeviceRequest,
      adminListSubscribers,
      adminListAssociations,
      adminCreateAssociation,
      subscriberGetNewAssociation,
      subscriberJoinAssociation,
      subscriberWithdrawAssociation,
      subscriberGetPreferences,
      subscriberSavePreferences
    };

    if (!handlers[action]) return jsonFail_("اكشن غير معروف");

    const result = handlers[action](payload);
    return jsonOk_(result);

  } catch (err) {
    return jsonFail_(safeMsg_(err));
  }
}

/* =========================
   جلسات (بدون تبويب إضافي)
   ========================= */
function sessionCreate_(role, subjectId) {
  const token = Utilities.getUuid().replace(/-/g, "");
  const session = { token, role, subjectId, created: new Date().toISOString() };
  CacheService.getScriptCache().put("sess_" + token, JSON.stringify(session), 6 * 60 * 60);
  return session;
}

function sessionGet_(token) {
  if (!token) return null;
  const raw = CacheService.getScriptCache().get("sess_" + token);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

function requireRole_(token, role) {
  const s = sessionGet_(token);
  if (!s) throw new Error("انتهت الجلسة, سجل دخول من جديد");
  if (s.role !== role) throw new Error("غير مصرح");
  return s;
}

/* =========================
   تهيئة التبويبات والأعمدة
   ========================= */
function initSystem(payload) {
  // مهم: هذه الدالة تُستدعى بطريقتين:
  // 1) من الموقع عبر Web App, هنا يأتي payload.token ونطبق التحقق.
  // 2) من داخل محرر Apps Script بالضغط على Run, هنا payload يكون undefined.
  //    تشغيلها يدويا من المحرر مسموح لأنه أصلا لا يستطيع تشغيلها إلا من لديه صلاحية تحرير السكربت.
  if (payload && payload.token) {
    requireRole_(payload.token, "مدير");
  }

  const ss = SpreadsheetApp.getActive();
  ensureSheet_(ss, TAB.settings, [
    "المفتاح", "القيمة"
  ]);
  ensureSheet_(ss, TAB.subscribers, [
    "معرف المشترك",
    "اسم المشترك",
    "رقم الجوال",
    "PIN المشترك",
    "رمز العرض",
    "حالة المشترك",
    "تاريخ التسجيل",
    "تاريخ اخر تعديل"
  ]);
  ensureSheet_(ss, TAB.associations, [
    "معرف الجمعية",
    "اسم الجمعية",
    "حالة الجمعية",
    "تاريخ بداية الجمعية",
    "تاريخ نهاية الجمعية",
    "تاريخ انشاء الجمعية",
    "اجمالي عدد الاسهم",
    "عدد المشتركين",
    "التحصيل الشهري",
    "اجمالي قيمة الجمعية",
    "ملاحظات"
  ]);
  ensureSheet_(ss, TAB.memberships, [
    "معرف العضوية",
    "معرف الجمعية",
    "اسم الجمعية",
    "معرف المشترك",
    "اسم المشترك",
    "عدد الاسهم",
    "حالة العضوية",
    "تاريخ الانضمام",
    "تاريخ الانسحاب",
    "تاريخ اخر تعديل"
  ]);

  ensureSheet_(ss, TAB.months, [
    "معرف الجمعية",
    "اسم الجمعية",
    "رقم الشهر داخل الجمعية",
    "تاريخ الشهر ميلادي",
    "اسم الشهر ميلادي",
    "اسم الشهر هجري",
    "التحصيل الشهري",
    "فائض سابق",
    "الموجود لهذا الشهر",
    "اجمالي اسهم الرغبات لهذا الشهر",
    "مبلغ التسليم المخطط",
    "فائض نهاية الشهر",
    "حالة الشهر"
  ]);
  ensureSheet_(ss, TAB.preferences, [
    "معرف الجمعية",
    "اسم الجمعية",
    "معرف المشترك",
    "اسم المشترك",
    "رقم الشهر داخل الجمعية",
    "تاريخ الشهر ميلادي",
    "اسم الشهر ميلادي",
    "اسم الشهر هجري",
    "عدد اسهم التسليم لهذا الشهر",
    "نوع الرغبة",
    "تاريخ الادخال",
    "تاريخ اخر تعديل"
  ]);
  ensureSheet_(ss, TAB.devices, [
    "معرف المشترك",
    "اسم المشترك",
    "معرف الجهاز",
    "اسم الجهاز",
    "تاريخ الربط",
    "اخر استخدام",
    "حالة الجهاز"
  ]);
  ensureSheet_(ss, TAB.deviceRequests, [
    "معرف الطلب",
    "معرف المشترك",
    "اسم المشترك",
    "معرف الجهاز",
    "اسم الجهاز",
    "تاريخ الطلب",
    "حالة الطلب",
    "قرار المدير",
    "تاريخ القرار"
  ]);
  ensureSheet_(ss, TAB.ops, [
    "تاريخ العملية",
    "نوع العملية",
    "معرف الجمعية",
    "اسم الجمعية",
    "معرف المشترك",
    "اسم المشترك",
    "تفاصيل قبل",
    "تفاصيل بعد",
    "بواسطة"
  ]);


  // تثبيت تنسيق نصي للأعمدة الحساسة لمنع إسقاط الصفر الأول (05) أو أصفار PIN
  const shSubs = ss.getSheetByName(TAB.subscribers);
  if (shSubs) setTextFormatColumns_(shSubs, [
    "معرف المشترك","اسم المشترك","رقم الجوال","PIN المشترك","رمز العرض","حالة المشترك","تاريخ التسجيل","تاريخ اخر تعديل"
  ], ["رقم الجوال","PIN المشترك","رمز العرض","معرف المشترك"]);

  const shAssc = ss.getSheetByName(TAB.associations);
  if (shAssc) setTextFormatColumns_(shAssc, [
    "معرف الجمعية","اسم الجمعية","حالة الجمعية","تاريخ بداية الجمعية","تاريخ نهاية الجمعية","تاريخ انشاء الجمعية","اجمالي عدد الاسهم","عدد المشتركين","التحصيل الشهري","اجمالي قيمة الجمعية","ملاحظات"
  ], ["معرف الجمعية"]);

  const shMem = ss.getSheetByName(TAB.memberships);
  if (shMem) setTextFormatColumns_(shMem, [
    "معرف العضوية","معرف الجمعية","اسم الجمعية","معرف المشترك","اسم المشترك","عدد الاسهم","حالة العضوية","تاريخ الانضمام","تاريخ الانسحاب","تاريخ اخر تعديل"
  ], ["معرف العضوية","معرف الجمعية","معرف المشترك"]);


  // إعدادات افتراضية إذا غير موجودة
  setSettingIfMissing_(ss, SETTINGS_KEYS.shareValue, "100");
  setSettingIfMissing_(ss, SETTINGS_KEYS.months, "10");
  setSettingIfMissing_(ss, SETTINGS_KEYS.deviceLock, "نعم");
  setSettingIfMissing_(ss, SETTINGS_KEYS.lastEdit, dateOnly_(new Date()));
  setSettingIfMissing_(ss, SETTINGS_KEYS.notes, "");

  // لا نسجل "PIN المدير" افتراضيا, لأنك ستضعه بنفسك.
  logOp_(ss, "تهيئة النظام", "", "", "", "", "", "", "نظام");

  return { message: "تمت التهيئة" };
}

function initSystemManual() {
  // اختصار للتشغيل اليدوي من محرر Apps Script
  return initSystem(null);
}

function ensureSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  const firstRow = sh.getRange(1, 1, 1, sh.getMaxColumns()).getValues()[0];
  const hasAny = firstRow.some(v => String(v || "").trim() !== "");
  if (!hasAny) {
    sh.clear();
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
    sh.autoResizeColumns(1, headers.length);
  }
  return sh;
}


function setTextFormatColumns_(sh, headers, names) {
  // names: array of header names to force text format
  try{
    const idx = {};
    headers.forEach((h,i)=>idx[String(h).trim()] = i+1);
    names.forEach(n=>{
      const col = idx[n];
      if(col){
        sh.getRange(2, col, Math.max(1, sh.getMaxRows()-1), 1).setNumberFormat("@");
        sh.getRange(1, col, 1, 1).setNumberFormat("@");
      }
    });
  }catch(e){}
}



/* =========================
   إعدادات
   ========================= */
function getSettingsMap_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(TAB.settings);
  if (!sh) throw new Error("تبويب اعدادات غير موجود, شغل تهيئة النظام");
  const values = sh.getDataRange().getValues();
  const map = {};
  for (let i = 2; i <= values.length; i++) {
    const k = String(values[i - 1][0] || "").trim();
    const v = String(values[i - 1][1] || "").trim();
    if (k) map[k] = v;
  }
  return map;
}

function setSettingIfMissing_(ss, key, value) {
  const sh = ss.getSheetByName(TAB.settings);
  const values = sh.getDataRange().getValues();
  for (let i = 2; i <= values.length; i++) {
    const k = String(values[i - 1][0] || "").trim();
    if (k === key) return;
  }
  sh.appendRow([key, value]);
}

function getAdminPin_() {
  const map = getSettingsMap_();
  const p = String(map[SETTINGS_KEYS.adminPin] || "").trim();
  if (!p) throw new Error("PIN المدير غير مضبوط في تبويب اعدادات");
  return p;
}

function isDeviceLockEnabled_() {
  const map = getSettingsMap_();
  return String(map[SETTINGS_KEYS.deviceLock] || "").trim() === "نعم";
}

/* =========================
   أدوات التحقق, رقم, تواريخ
   ========================= */
function dateOnly_(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

function normalizeDateCell_(v) {
  // يعيد yyyy-MM-dd لأي تاريخ, أو النص كما هو
  if (v instanceof Date) return dateOnly_(v);
  const s = String(v || "").trim();
  // محاولة التقاط نمط ISO
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return s;
}



function requireMobile_(m) {
  const s = String(m || "").replace(/\D+/g, "");
  if (!/^05\d{8}$/.test(s)) throw new Error("رقم الجوال يجب أن يكون بصيغة 05xxxxxxxx");
  return s;
}

function requirePin6_(p) {
  const s = String(p || "").replace(/\D+/g, "");
  if (!/^\d{6}$/.test(s)) throw new Error("PIN يجب أن يكون 6 أرقام");
  return s;
}

function deviceNameFromInfo_(deviceInfo) {
  const ua = String(deviceInfo && deviceInfo.ua ? deviceInfo.ua : "");
  const platform = String(deviceInfo && deviceInfo.platform ? deviceInfo.platform : "");
  // تلقائي, مختصر قدر الإمكان
  let name = platform;
  if (!name) name = "جهاز";
  // إضافة متصفح مبسطة
  if (/Chrome/i.test(ua)) name += " Chrome";
  else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) name += " Safari";
  else if (/Firefox/i.test(ua)) name += " Firefox";
  else if (/Edg/i.test(ua)) name += " Edge";
  return name.trim();
}

/* =========================
   توليد معرفات
   ========================= */
function nextId_(prefix, width) {
  const props = PropertiesService.getScriptProperties();
  const key = "seq_" + prefix;
  const cur = Number(props.getProperty(key) || "0") + 1;
  props.setProperty(key, String(cur));
  const num = String(cur).padStart(width, "0");
  return prefix + num;
}

/* =========================
   سجلات العمليات
   ========================= */
function logOp_(ss, type, assocId, assocName, subId, subName, before, after, by) {
  const sh = ss.getSheetByName(TAB.ops);
  if (!sh) return;
  sh.appendRow([
    new Date().toISOString(),
    type,
    assocId || "",
    assocName || "",
    subId || "",
    subName || "",
    before || "",
    after || "",
    by || ""
  ]);
}

/* =========================
   المشتركين
   ========================= */
function registerSubscriber(payload) {
  const ss = SpreadsheetApp.getActive();
  const name = String(payload.name || "").trim();
  if (!name) throw new Error("الاسم مطلوب");
  const mobile = requireMobile_(payload.mobile);

  const deviceId = String(payload.deviceId || "").trim();
  if (!deviceId) throw new Error("معرف الجهاز غير موجود");
  const deviceName = deviceNameFromInfo_(payload.deviceInfo);

  const sh = ss.getSheetByName(TAB.subscribers);
  if (!sh) throw new Error("شغل تهيئة النظام أولا");

  // منع تكرار الجوال
  const rows = readTable_(sh);
  for (const r of rows) {
    if (String(r["رقم الجوال"] || "").trim() === mobile) {
      throw new Error("رقم الجوال مسجل مسبقا");
    }
  }

  const subId = nextId_("م", 6);
  const pin = generateUniquePin_(rows);

  const displayCode = (firstArabicLetter_(name) || "م") + pin;

  const today = dateOnly_(new Date());
  sh.appendRow([String(subId), name, "'" + mobile, "'" + pin, displayCode, "نشط", today, today]);

  // ربط الجهاز الأول تلقائيا
  if (isDeviceLockEnabled_()) {
    bindDevice_(ss, subId, name, deviceId, deviceName, "مفعل");
  }

  logOp_(ss, "تسجيل مشترك", "", "", subId, name, "", JSON.stringify({ mobile }), "نظام");

  const session = sessionCreate_("مشترك", subId);
  return { pin, session };
}

function generateUniquePin_(rows) {
  const used = new Set(rows.map(r => String(r["PIN المشترك"] || "").trim()).filter(Boolean));
  for (let i = 0; i < 2000; i++) {
    const pin = String(Math.floor(Math.random() * 1000000)).padStart(6, "0");
    if (!used.has(pin)) return pin;
  }
  throw new Error("تعذر توليد PIN");
}

function firstArabicLetter_(name) {
  const s = String(name || "").trim();
  if (!s) return "";
  return s[0];
}

function loginSubscriber(payload) {
  const ss = SpreadsheetApp.getActive();
  const pin = requirePin6_(payload.pin);

  const deviceId = String(payload.deviceId || "").trim();
  if (!deviceId) throw new Error("معرف الجهاز غير موجود");
  const deviceName = deviceNameFromInfo_(payload.deviceInfo);

  const sh = ss.getSheetByName(TAB.subscribers);
  if (!sh) throw new Error("شغل تهيئة النظام أولا");

  const rows = readTable_(sh);
  const me = rows.find(r => String(r["PIN المشترك"] || "").trim() === pin);
  if (!me) throw new Error("PIN غير صحيح");

  const subId = String(me["معرف المشترك"]);
  const subName = String(me["اسم المشترك"]);

  // قفل الجهاز
  if (isDeviceLockEnabled_()) {
    ensureDeviceAllowed_(ss, subId, subName, deviceId, deviceName);
  }

  // تحديث اخر تعديل كاستخدام
  touchDevice_(ss, subId, deviceId);

  const session = sessionCreate_("مشترك", subId);
  return { session };
}


function subscriberGetNewAssociation(payload) {
  const s = requireRole_(payload.token, "مشترك");
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(TAB.associations);
  if (!sh) return { association: null };

  const rows = readTable_(sh).filter(r => String(r["حالة الجمعية"]||"").trim() === "جديدة");
  if (!rows.length) return { association: null };

  // نأخذ أحدث جمعية جديدة حسب تاريخ الانشاء إن وجد, وإلا آخر صف
  rows.sort((a,b)=>{
    const da = String(a["تاريخ انشاء الجمعية"]||"");
    const db = String(b["تاريخ انشاء الجمعية"]||"");
    return da.localeCompare(db);
  });
  const a = rows[rows.length - 1];

  const assoc = {
    "معرف الجمعية": String(a["معرف الجمعية"]||""),
    "اسم الجمعية": String(a["اسم الجمعية"]||""),
    "حالة الجمعية": "جديدة",
    "تاريخ بداية الجمعية": normalizeDateCell_(a["تاريخ بداية الجمعية"]),
    "تاريخ نهاية الجمعية": normalizeDateCell_(a["تاريخ نهاية الجمعية"]),
    "عدد المشتركين": String(a["عدد المشتركين"]||"0"),
    "اجمالي عدد الاسهم": String(a["اجمالي عدد الاسهم"]||"0"),
    "التحصيل الشهري": String(a["التحصيل الشهري"]||"0"),
    "اجمالي قيمة الجمعية": String(a["اجمالي قيمة الجمعية"]||"0")
  };

  // هل المشترك مشترك فيها؟
  const memSh = ss.getSheetByName(TAB.memberships);
  let membership = null;
  if (memSh) {
    const memRows = readTable_(memSh);
    const found = memRows.find(r =>
      String(r["معرف المشترك"]) === String(s.subjectId) &&
      String(r["معرف الجمعية"]) === String(assoc["معرف الجمعية"]) &&
      String(r["حالة العضوية"]) !== "منسحب"
    );
    if (found) {
      membership = {
        "معرف العضوية": String(found["معرف العضوية"]||""),
        "عدد الاسهم": String(found["عدد الاسهم"]||"0"),
        "حالة العضوية": String(found["حالة العضوية"]||"")
      };
    }
  }

  return { association: assoc, membership };
}

function subscriberJoinAssociation(payload) {
  const s = requireRole_(payload.token, "مشترك");
  const ss = SpreadsheetApp.getActive();

  const assocId = String(payload.assocId || "").trim();
  if (!assocId) throw new Error("معرف الجمعية مطلوب");

  const sharesRaw = String(payload.shares || "").trim();
  const shares = Number(sharesRaw);
  if (!isFinite(shares) || shares <= 0) throw new Error("عدد الأسهم غير صحيح");
  // مضاعفات 0.5
  if (Math.round(shares * 2) !== shares * 2) throw new Error("عدد الأسهم يجب أن يكون مضاعفات 0.5");
  if (shares < 0.5) throw new Error("أقل سهم للاشتراك 0.5");

  const assocSh = ss.getSheetByName(TAB.associations);
  const memSh = ss.getSheetByName(TAB.memberships);
  const subSh = ss.getSheetByName(TAB.subscribers);
  if (!assocSh || !memSh || !subSh) throw new Error("شغل تهيئة النظام أولا");

  const assocRows = assocSh.getDataRange().getValues();
  const aHeaders = assocRows[0].map(String);
  const aIdx = {}; aHeaders.forEach((h,i)=>aIdx[h]=i);

  let aRow = -1;
  for (let i=1;i<assocRows.length;i++){
    if (String(assocRows[i][aIdx["معرف الجمعية"]]) === assocId){ aRow = i; break; }
  }
  if (aRow === -1) throw new Error("الجمعية غير موجودة");
  const status = String(assocRows[aRow][aIdx["حالة الجمعية"]]||"").trim();
  if (status !== "جديدة") throw new Error("التسجيل متاح فقط في جمعية جديدة");

  const assocName = String(assocRows[aRow][aIdx["اسم الجمعية"]]||"").trim();

  // اسم المشترك من تبويب المشتركين
  const subs = readTable_(subSh);
  const me = subs.find(r => String(r["معرف المشترك"]) === String(s.subjectId));
  if (!me) throw new Error("المشترك غير موجود");
  const subName = String(me["اسم المشترك"]||"");

  // ابحث عن عضوية سابقة
  const memValues = memSh.getDataRange().getValues();
  const mHeaders = memValues[0].map(String);
  const mIdx = {}; mHeaders.forEach((h,i)=>mIdx[h]=i);

  let existingRow = -1;
  for (let i=1;i<memValues.length;i++){
    if (String(memValues[i][mIdx["معرف المشترك"]]) === String(s.subjectId) &&
        String(memValues[i][mIdx["معرف الجمعية"]]) === assocId){
      existingRow = i; break;
    }
  }

  const today = dateOnly_(new Date());

  if (existingRow !== -1) {
    const curStatus = String(memValues[existingRow][mIdx["حالة العضوية"]]||"").trim();
    if (curStatus !== "منسحب") {
      throw new Error("أنت مسجل مسبقا في هذه الجمعية");
    }
    // إعادة تفعيل
    memSh.getRange(existingRow+1, mIdx["حالة العضوية"]+1).setValue("مسجل");
    memSh.getRange(existingRow+1, mIdx["تاريخ الانسحاب"]+1).setValue("");
    memSh.getRange(existingRow+1, mIdx["عدد الاسهم"]+1).setValue(shares);
    memSh.getRange(existingRow+1, mIdx["تاريخ اخر تعديل"]+1).setValue(today);
  } else {
    const memId = nextId_("ع", 6);
    memSh.appendRow([
      memId,
      assocId,
      assocName,
      String(s.subjectId),
      subName,
      shares,
      "مسجل",
      today,
      "",
      today
    ]);
  }

  // تحديث أرقام الجمعية (إجمالي الأسهم, عدد المشتركين, التحصيل الشهري, إجمالي قيمة الجمعية)
  recalcAssociationTotals_(ss, assocId);

  logOp_(ss, "اشتراك في جمعية", assocId, assocName, String(s.subjectId), subName, "", JSON.stringify({ shares }), "مشترك:" + s.subjectId);
  return { message: "تم" };
}

function subscriberWithdrawAssociation(payload) {
  const s = requireRole_(payload.token, "مشترك");
  const ss = SpreadsheetApp.getActive();

  const assocId = String(payload.assocId || "").trim();
  if (!assocId) throw new Error("معرف الجمعية مطلوب");

  const assocSh = ss.getSheetByName(TAB.associations);
  const memSh = ss.getSheetByName(TAB.memberships);
  if (!assocSh || !memSh) throw new Error("شغل تهيئة النظام أولا");

  const assocRows = readTable_(assocSh);
  const assoc = assocRows.find(r => String(r["معرف الجمعية"]) === assocId);
  if (!assoc) throw new Error("الجمعية غير موجودة");
  const status = String(assoc["حالة الجمعية"]||"").trim();
  if (status !== "جديدة") throw new Error("الانسحاب متاح فقط في جمعية جديدة");
  const assocName = String(assoc["اسم الجمعية"]||"");

  const values = memSh.getDataRange().getValues();
  const headers = values[0].map(String);
  const idx = {}; headers.forEach((h,i)=>idx[h]=i);

  for (let i=1;i<values.length;i++){
    if (String(values[i][idx["معرف المشترك"]]) === String(s.subjectId) &&
        String(values[i][idx["معرف الجمعية"]]) === assocId){
      const curStatus = String(values[i][idx["حالة العضوية"]]||"").trim();
      if (curStatus === "منسحب") throw new Error("أنت منسحب مسبقا");
      memSh.getRange(i+1, idx["حالة العضوية"]+1).setValue("منسحب");
      memSh.getRange(i+1, idx["تاريخ الانسحاب"]+1).setValue(dateOnly_(new Date()));
      memSh.getRange(i+1, idx["تاريخ اخر تعديل"]+1).setValue(dateOnly_(new Date()));
      recalcAssociationTotals_(ss, assocId);
      logOp_(ss, "انسحاب من جمعية", assocId, assocName, String(s.subjectId), "", "", "", "مشترك:" + s.subjectId);
      return { message: "تم" };
    }
  }
  throw new Error("لا توجد عضوية لهذه الجمعية");
}

function recalcAssociationTotals_(ss, assocId) {
  const settings = getSettingsMap_();
  const shareValue = Number(String(settings[SETTINGS_KEYS.shareValue] || "100").trim());
  const months = Number(String(settings[SETTINGS_KEYS.months] || "10").trim());

  const memSh = ss.getSheetByName(TAB.memberships);
  const assocSh = ss.getSheetByName(TAB.associations);
  if (!memSh || !assocSh) return;

  const memRows = readTable_(memSh)
    .filter(r => String(r["معرف الجمعية"]) === String(assocId) && String(r["حالة العضوية"]) !== "منسحب");

  let totalShares = 0;
  const seenSubs = new Set();
  memRows.forEach(r=>{
    const s = Number(r["عدد الاسهم"] || 0);
    if (isFinite(s)) totalShares += s;
    seenSubs.add(String(r["معرف المشترك"]||""));
  });
  const subsCount = seenSubs.size;

  const monthly = totalShares * shareValue;
  const totalValue = monthly * months;

  // تحديث صف الجمعية
  const values = assocSh.getDataRange().getValues();
  const headers = values[0].map(String);
  const idx = {}; headers.forEach((h,i)=>idx[h]=i);

  for (let i=1;i<values.length;i++){
    if (String(values[i][idx["معرف الجمعية"]]) === String(assocId)){
      assocSh.getRange(i+1, idx["اجمالي عدد الاسهم"]+1).setValue(totalShares);
      assocSh.getRange(i+1, idx["عدد المشتركين"]+1).setValue(subsCount);
      assocSh.getRange(i+1, idx["التحصيل الشهري"]+1).setValue(monthly);
      assocSh.getRange(i+1, idx["اجمالي قيمة الجمعية"]+1).setValue(totalValue);

      // تحديث تبويب "اشهر الجمعيات" إن وجد, لأن "التحصيل الشهري" يعتمد على إجمالي الأسهم
      try {
        ensureAssociationMonths_(ss, assocId, String(values[i][idx["اسم الجمعية"]]||""), String(values[i][idx["تاريخ بداية الجمعية"]]||""), months, monthly);
        updateMonthsFromPreferences_(ss, assocId, months, monthly);
      } catch (e) {
        // نتجاهل هنا, لأن التبويبات قد لا تكون مهيأة بعد
      }
      return;
    }
  }
}


function subscriberDashboard(payload) {
  const s = requireRole_(payload.token, "مشترك");
  const ss = SpreadsheetApp.getActive();

  const sh = ss.getSheetByName(TAB.subscribers);
  const rows = readTable_(sh);
  const me = rows.find(r => String(r["معرف المشترك"]) === String(s.subjectId));
  if (!me) throw new Error("المشترك غير موجود");

  // في المرحلة 1: عرض عضويات الجمعيات (إن وجدت)
  const memSh = ss.getSheetByName(TAB.memberships);
  let memberships = [];
  if (memSh) {
    const memRows = readTable_(memSh);
    memberships = memRows
      .filter(r => String(r["معرف المشترك"]) === String(s.subjectId) && String(r["حالة العضوية"]) !== "منسحب")
      .map(r => ({
        "معرف الجمعية": r["معرف الجمعية"],
        "اسم الجمعية": r["اسم الجمعية"],
        "حالة الجمعية": guessAssocStatus_(ss, r["معرف الجمعية"]),
        "تاريخ بداية الجمعية": getAssocField_(ss, r["معرف الجمعية"], "تاريخ بداية الجمعية"),
        "تاريخ نهاية الجمعية": getAssocField_(ss, r["معرف الجمعية"], "تاريخ نهاية الجمعية"),
        "عدد الاسهم": r["عدد الاسهم"]
      }));
  }

  return { me, associations: memberships };
}

function subscriberUpdateMobile(payload){
  return updateSubscriberMobile(payload);
}

function updateSubscriberMobile(payload) {
  const s = requireRole_(payload.token, "مشترك");
  const ss = SpreadsheetApp.getActive();
  const mobile = requireMobile_(payload.mobile);

  const sh = ss.getSheetByName(TAB.subscribers);
  const values = sh.getDataRange().getValues();
  const headers = values[0].map(String);

  const idxId = headers.indexOf("معرف المشترك");
  const idxMobile = headers.indexOf("رقم الجوال");
  const idxLast = headers.indexOf("تاريخ اخر تعديل");

  // منع تكرار الجوال
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][idxMobile] || "").trim() === mobile && String(values[i][idxId]) !== String(s.subjectId)) {
      throw new Error("رقم الجوال مسجل مسبقا");
    }
  }

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][idxId]) === String(s.subjectId)) {
      const before = JSON.stringify({ mobile: values[i][idxMobile] });
      sh.getRange(i + 1, idxMobile + 1).setValue("'" + mobile);
      sh.getRange(i + 1, idxLast + 1).setValue(dateOnly_(new Date()));
      logOp_(ss, "تعديل جوال", "", "", String(s.subjectId), String(values[i][headers.indexOf("اسم المشترك")]), before, JSON.stringify({ mobile }), "مشترك:" + s.subjectId);
      return { message: "تم التحديث" };
    }
  }
  throw new Error("المشترك غير موجود");
}

/* =========================
   المدير
   ========================= */
function loginAdmin(payload) {
  const pin = String(payload.pin || "").trim();
  if (!pin) throw new Error("PIN مطلوب");
  const adminPin = getAdminPin_();
  if (pin !== adminPin) throw new Error("PIN المدير غير صحيح");

  const ss = SpreadsheetApp.getActive();
  const deviceId = String(payload.deviceId || "").trim();
  if (!deviceId) throw new Error("معرف الجهاز غير موجود");
  const deviceName = deviceNameFromInfo_(payload.deviceInfo);

  // قرار نهائي:
  // المدير يدخل من أي جهاز مباشرة بدون طلب موافقة.
  // نقوم فقط بتسجيل الجهاز (Bind) وتحديث آخر استخدام.
  if (isDeviceLockEnabled_()) {
    bindDevice_(ss, "ADMIN", "المدير", deviceId, deviceName, "مفعل");
  }
  touchDevice_(ss, "ADMIN", deviceId);

  const session = sessionCreate_("مدير", "ADMIN");
  return { session };
}

function adminListDeviceRequests(payload) {
  requireRole_(payload.token, "مدير");
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(TAB.deviceRequests);
  const rows = sh ? readTable_(sh) : [];
  // نعرض المعلق أولاً
  rows.sort((a, b) => String(a["حالة الطلب"]||"").localeCompare(String(b["حالة الطلب"]||"")));
  rows.forEach(r => {
    r["تاريخ بداية الجمعية"] = normalizeDateCell_(r["تاريخ بداية الجمعية"]); 
    r["تاريخ نهاية الجمعية"] = normalizeDateCell_(r["تاريخ نهاية الجمعية"]); 
    r["تاريخ انشاء الجمعية"] = normalizeDateCell_(r["تاريخ انشاء الجمعية"]); 
  });
  return { rows };
}

function adminDecideDeviceRequest(payload) {
  requireRole_(payload.token, "مدير");
  const requestId = String(payload.requestId || "").trim();
  const decision = String(payload.decision || "").trim(); // "موافقة" أو "رفض"
  if (!requestId) throw new Error("معرف الطلب مطلوب");
  if (decision !== "موافقة" && decision !== "رفض") throw new Error("قرار غير صحيح");

  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(TAB.deviceRequests);
  if (!sh) throw new Error("تبويب طلبات الاجهزة غير موجود");

  const values = sh.getDataRange().getValues();
  const headers = values[0].map(String);

  const idxReq = headers.indexOf("معرف الطلب");
  const idxStatus = headers.indexOf("حالة الطلب");
  const idxDecision = headers.indexOf("قرار المدير");
  const idxDecisionDate = headers.indexOf("تاريخ القرار");

  const idxSubId = headers.indexOf("معرف المشترك");
  const idxSubName = headers.indexOf("اسم المشترك");
  const idxDevId = headers.indexOf("معرف الجهاز");
  const idxDevName = headers.indexOf("اسم الجهاز");

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][idxReq]) === requestId) {
      const status = String(values[i][idxStatus] || "").trim();
      if (status !== "معلق") throw new Error("تم اتخاذ قرار سابقا");

      const subId = String(values[i][idxSubId] || "").trim();
      const subName = String(values[i][idxSubName] || "").trim();
      const devId = String(values[i][idxDevId] || "").trim();
      const devName = String(values[i][idxDevName] || "").trim();

      sh.getRange(i + 1, idxStatus + 1).setValue("تم القرار");
      sh.getRange(i + 1, idxDecision + 1).setValue(decision);
      sh.getRange(i + 1, idxDecisionDate + 1).setValue(dateOnly_(new Date()));

      if (decision === "موافقة") {
        bindDevice_(ss, subId, subName, devId, devName, "مفعل");
      } else {
        // لا شيء
      }

      logOp_(ss, "قرار جهاز", "", "", subId, subName, "", JSON.stringify({ requestId, decision, devId }), "مدير:ADMIN");
      return { message: "تم" };
    }
  }
  throw new Error("طلب غير موجود");
}


function adminListAssociations(payload) {
  requireRole_(payload.token, "مدير");
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(TAB.associations);
  const rows = sh ? readTable_(sh) : [];
  // ترتيب: نشطة ثم جديدة ثم منتهية
  const rank = { "نشطة": 1, "جديدة": 2, "منتهية": 3 };
  rows.sort((a, b) => (rank[String(a["حالة الجمعية"]||"")] || 9) - (rank[String(b["حالة الجمعية"]||"")] || 9));
  return { rows };
}

function adminCreateAssociation(payload) {
  requireRole_(payload.token, "مدير");
  const ss = SpreadsheetApp.getActive();

  const name = String(payload.name || "").trim();
  const startDateStr = String(payload.startDate || "").trim(); // yyyy-MM-dd
  if (!name) throw new Error("اسم الجمعية مطلوب");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDateStr)) throw new Error("تاريخ البداية غير صحيح");

  const settings = getSettingsMap_();
  const shareValue = Number(String(settings[SETTINGS_KEYS.shareValue] || "100").trim());
  const months = Number(String(settings[SETTINGS_KEYS.months] || "10").trim());
  if (!shareValue || shareValue <= 0) throw new Error("قيمة السهم غير صحيحة في الاعدادات");
  if (!months || months <= 0) throw new Error("مدة الجمعية غير صحيحة في الاعدادات");

  const sh = ss.getSheetByName(TAB.associations);
  if (!sh) throw new Error("تبويب الجمعيات غير موجود, شغل تهيئة النظام");

  // منع تكرار (اسم الجمعية + تاريخ البداية)
  const rows = readTable_(sh);
  for (const r of rows) {
    if (String(r["اسم الجمعية"]||"").trim() === name && String(r["تاريخ بداية الجمعية"]||"").trim() === startDateStr) {
      throw new Error("لا يمكن تكرار اسم الجمعية مع نفس تاريخ البداية");
    }
  }

  const assocId = nextId_("ج", 6);

  const start = new Date(startDateStr + "T00:00:00Z");
  const end = endOfNthMonth_(start, months); // آخر يوم من الشهر العاشر
  const endStr = dateOnly_(end);

  const today = dateOnly_(new Date());

  const totalShares = 0;
  const subsCount = 0;
  const monthly = totalShares * shareValue;
  const totalValue = monthly * months;

  sh.appendRow([
    assocId,
    name,
    "جديدة",
    startDateStr,
    endStr,
    today,
    totalShares,
    subsCount,
    monthly,
    totalValue,
    ""
  ]);

  // توليد أشهر الجمعية مباشرة (حتى لو كانت الأرقام 0 في البداية)
  // يتم تحديث قيم التحصيل/الفائض لاحقا تلقائيا عند الاشتراكات وحفظ الرغبات.
  try {
    ensureAssociationMonths_(ss, assocId, name, startDateStr, months, monthly);
  } catch (e) {
    // إذا فشل الإنشاء لأي سبب لا نمنع إنشاء الجمعية, لكن الخطأ سيظهر لاحقا عند فتح الرغبات.
  }

  // توليد شهور الجمعية في تبويب اشهر الجمعيات
  ensureAssociationMonths_(ss, assocId, name, startDateStr, months, monthly);

  logOp_(ss, "إنشاء جمعية", assocId, name, "", "", "", JSON.stringify({ startDate: startDateStr, endDate: endStr }), "مدير:ADMIN");
  return { message: "تم" };
}

function endOfNthMonth_(startDate, months) {
  // months=10 يعني الشهر العاشر من شهر البداية
  const d = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1));
  d.setUTCMonth(d.getUTCMonth() + (months - 1)); // أول يوم من الشهر العاشر
  // آخر يوم من نفس الشهر: اليوم 0 من الشهر التالي
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  return end;
}


function adminListSubscribers(payload) {
  requireRole_(payload.token, "مدير");
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(TAB.subscribers);
  const rows = sh ? readTable_(sh) : [];
  // لا نعرض أي إعدادات حساسة أخرى
  return { rows };
}

/* =========================
   الجمعيات, للعرض العام فقط
   ========================= */
function listAssociationsPublic() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(TAB.associations);
  if (!sh) return { rows: [] };
  const rows = readTable_(sh);
  // للواجهة: نعرض حقول محسوبة جاهزة
  const out = rows.map(r => ({
    "معرف الجمعية": r["معرف الجمعية"],
    "اسم الجمعية": r["اسم الجمعية"],
    "حالة الجمعية": r["حالة الجمعية"],
    "تاريخ بداية الجمعية": normalizeDateCell_(r["تاريخ بداية الجمعية"]),
    "تاريخ نهاية الجمعية": normalizeDateCell_(r["تاريخ نهاية الجمعية"]),
    "عدد المشتركين": r["عدد المشتركين"],
    "اجمالي عدد الاسهم": r["اجمالي عدد الاسهم"],
    "اجمالي قيمة الجمعية": r["اجمالي قيمة الجمعية"]
  }));
  // ترتيب: نشطة ثم جديدة ثم منتهية
  const rank = { "نشطة": 1, "جديدة": 2, "منتهية": 3 };
  out.sort((a, b) => (rank[a["حالة الجمعية"]] || 9) - (rank[b["حالة الجمعية"]] || 9));
  return { rows: out };
}

function getAssocField_(ss, assocId, field) {
  const sh = ss.getSheetByName(TAB.associations);
  if (!sh) return "";
  const rows = readTable_(sh);
  const a = rows.find(r => String(r["معرف الجمعية"]) === String(assocId));
  if (!a) return "";
  return normalizeDateCell_(a[field]);
}

function guessAssocStatus_(ss, assocId) {
  const sh = ss.getSheetByName(TAB.associations);
  if (!sh) return "";
  const rows = readTable_(sh);
  const a = rows.find(r => String(r["معرف الجمعية"]) === String(assocId));
  return a ? String(a["حالة الجمعية"] || "") : "";
}

/* =========================
   قفل الجهاز
   ========================= */
function ensureDeviceAllowed_(ss, subjectId, subjectName, deviceId, deviceName) {
  const devicesSh = ss.getSheetByName(TAB.devices);
  const reqSh = ss.getSheetByName(TAB.deviceRequests);
  if (!devicesSh || !reqSh) throw new Error("تبويبات الاجهزة غير موجودة, شغل تهيئة النظام");

  // هل الجهاز مربوط ومفعل؟
  const devices = readTable_(devicesSh);
  const found = devices.find(r =>
    String(r["معرف المشترك"]) === String(subjectId) &&
    String(r["معرف الجهاز"]) === String(deviceId) &&
    String(r["حالة الجهاز"]) === "مفعل"
  );
  if (found) return true;

  // هل هناك طلب معلق؟
  const reqs = readTable_(reqSh);
  const pending = reqs.find(r =>
    String(r["معرف المشترك"]) === String(subjectId) &&
    String(r["معرف الجهاز"]) === String(deviceId) &&
    String(r["حالة الطلب"]) === "معلق"
  );
  if (pending) {
    throw new Error("هذا الجهاز بانتظار موافقة المدير");
  }

  // إنشاء طلب جديد
  const reqId = nextId_("ط", 6);
  reqSh.appendRow([
    reqId,
    subjectId,
    subjectName,
    deviceId,
    deviceName,
    dateOnly_(new Date()),
    "معلق",
    "",
    ""
  ]);

  logOp_(ss, "طلب جهاز", "", "", subjectId, subjectName, "", JSON.stringify({ deviceId, deviceName }), "نظام");
  throw new Error("تم إرسال طلب جهاز جديد, بانتظار موافقة المدير");
}

function bindDevice_(ss, subjectId, subjectName, deviceId, deviceName, status) {
  const sh = ss.getSheetByName(TAB.devices);
  const rows = readTable_(sh);

  // منع تكرار نفس الجهاز
  const exists = rows.find(r =>
    String(r["معرف المشترك"]) === String(subjectId) &&
    String(r["معرف الجهاز"]) === String(deviceId)
  );
  if (exists) {
    // تحديث حالة فقط
    updateRowByKeys_(sh, { "معرف المشترك": subjectId, "معرف الجهاز": deviceId }, {
      "اسم المشترك": subjectName,
      "اسم الجهاز": deviceName,
      "اخر استخدام": dateOnly_(new Date()),
      "حالة الجهاز": status
    });
    return;
  }

  sh.appendRow([
    subjectId,
    subjectName,
    deviceId,
    deviceName,
    dateOnly_(new Date()),
    dateOnly_(new Date()),
    status
  ]);
}

function touchDevice_(ss, subjectId, deviceId) {
  const sh = ss.getSheetByName(TAB.devices);
  if (!sh) return;
  updateRowByKeys_(sh, { "معرف المشترك": subjectId, "معرف الجهاز": deviceId }, {
    "اخر استخدام": dateOnly_(new Date())
  });
}

/* =========================
   قراءة/تحديث جداول
   ========================= */
function readTable_(sh) {
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(h => String(h).trim());
  const out = [];
  for (let i = 1; i < values.length; i++) {
    const row = {};
    for (let c = 0; c < headers.length; c++) {
      row[headers[c]] = values[i][c];
    }
    out.push(row);
  }
  return out;
}

function updateRowByKeys_(sh, keysMap, updatesMap) {
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return false;
  const headers = values[0].map(String);
  const idx = {};
  headers.forEach((h, i) => idx[h] = i);

  const keyCols = Object.keys(keysMap);
  for (let r = 1; r < values.length; r++) {
    let ok = true;
    for (const k of keyCols) {
      if (String(values[r][idx[k]] || "") !== String(keysMap[k])) { ok = false; break; }
    }
    if (!ok) continue;

    Object.keys(updatesMap).forEach(k => {
      if (idx[k] !== undefined) values[r][idx[k]] = updatesMap[k];
    });
    sh.getRange(r + 1, 1, 1, headers.length).setValues([values[r]]);
    return true;
  }
  return false;
}

/* =========================
   مساعدة ردود JSON
   ========================= */
function jsonOk_(data) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, ...data }))
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonFail_(message) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: false, message: String(message || "خطأ") }))
    .setMimeType(ContentService.MimeType.JSON);
}

function safeMsg_(err) {
  try { return String(err && err.message ? err.message : err); } catch (e) { return "خطأ غير معروف"; }
}

function getSession(payload) {
  const token = String(payload.token || "").trim();
  const s = sessionGet_(token);
  if (!s) throw new Error("الجلسة غير صالحة");
  return { session: s };
}


function monthFirstDayUtc_(startDateStr, offsetMonths){
  const d = new Date(startDateStr + "T00:00:00Z");
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offsetMonths, 1));
}

function arabicMonthName_(dateObj){
  try{
    return new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { month:"long", year:"numeric" }).format(dateObj);
  }catch(e){
    return dateOnly_(dateObj);
  }
}

function hijriMonthName_(dateObj){
  try{
    return new Intl.DateTimeFormat("ar-SA-u-ca-islamic", { month:"long", year:"numeric" }).format(dateObj);
  }catch(e){
    return "";
  }
}

function ensureAssociationMonths_(ss, assocId, assocName, startDateStr, months, monthlyCollection){
  const sh = ss.getSheetByName(TAB.months);
  if (!sh) throw new Error("تبويب اشهر الجمعيات غير موجود, شغل تهيئة النظام");

  const rows = readTable_(sh);
  if (rows.some(r => String(r["معرف الجمعية"]) === String(assocId))) return;

  for (let i=1;i<=months;i++){
    const d = monthFirstDayUtc_(startDateStr, i-1);
    const gDate = dateOnly_(d);
    const gName = arabicMonthName_(d);
    const hName = hijriMonthName_(d);

    sh.appendRow([
      assocId,
      assocName,
      i,
      gDate,
      gName,
      hName,
      monthlyCollection,
      (i===1)?0:"",
      (i===1)?monthlyCollection:"",
      0,
      0,
      "",
      "مفتوح"
    ]);
  }
}

function subscriberGetPreferences(payload){
  const s = requireRole_(payload.token, "مشترك");
  const ss = SpreadsheetApp.getActive();

  const assocId = String(payload.assocId||"").trim();
  if (!assocId) throw new Error("معرف الجمعية مطلوب");

  const assocSh = ss.getSheetByName(TAB.associations);
  const assocRow = assocSh ? readTable_(assocSh).find(r=>String(r["معرف الجمعية"])===assocId) : null;
  if (!assocRow) throw new Error("الجمعية غير موجودة");
  if (String(assocRow["حالة الجمعية"]||"").trim()!=="جديدة") throw new Error("صفحة الرغبات متاحة فقط للجمعية الجديدة");

  const memSh = ss.getSheetByName(TAB.memberships);
  const mem = memSh ? readTable_(memSh).find(r =>
    String(r["معرف الجمعية"])===assocId &&
    String(r["معرف المشترك"])===String(s.subjectId) &&
    String(r["حالة العضوية"])!=="منسحب"
  ) : null;
  if (!mem) throw new Error("أنت غير مسجل في هذه الجمعية");
  const sharesTotal = Number(mem["عدد الاسهم"]||0);

  const settings = getSettingsMap_();
  const shareValue = Number(String(settings[SETTINGS_KEYS.shareValue]||"100"));
  const months = Number(String(settings[SETTINGS_KEYS.months]||"10"));

  const totalSharesAssoc = Number(assocRow["اجمالي عدد الاسهم"]||0);
  const monthlyCollection = totalSharesAssoc * shareValue;

  const monthsSh = ss.getSheetByName(TAB.months);
  if (!monthsSh) throw new Error("تبويب اشهر الجمعيات غير موجود, شغل تهيئة النظام");
  let monthRows = readTable_(monthsSh).filter(r=>String(r["معرف الجمعية"])===assocId);
  if (!monthRows.length){
    ensureAssociationMonths_(ss, assocId, String(assocRow["اسم الجمعية"]||""), String(assocRow["تاريخ بداية الجمعية"]), months, monthlyCollection);
    monthRows = readTable_(monthsSh).filter(r=>String(r["معرف الجمعية"])===assocId);
  }
  monthRows.sort((a,b)=>Number(a["رقم الشهر داخل الجمعية"]||0)-Number(b["رقم الشهر داخل الجمعية"]||0));

  const prefSh = ss.getSheetByName(TAB.preferences);
  const myPrefs = prefSh ? readTable_(prefSh).filter(r=>String(r["معرف الجمعية"])===assocId && String(r["معرف المشترك"])===String(s.subjectId)) : [];
  const byMonth = {};
  myPrefs.forEach(r=>{
    byMonth[String(r["رقم الشهر داخل الجمعية"])] = {
      shares: Number(r["عدد اسهم التسليم لهذا الشهر"]||0),
      type: String(r["نوع الرغبة"]||"ممكن التعديل")
    };
  });

  const outMonths = monthRows.map(r=>{
    const no = Number(r["رقم الشهر داخل الجمعية"]||0);
    const existing = byMonth[String(no)] || { shares:0, type:"ممكن التعديل" };
    return {
      monthNo: no,
      gDate: normalizeDateCell_(r["تاريخ الشهر ميلادي"]),
      gName: String(r["اسم الشهر ميلادي"]||""),
      hName: String(r["اسم الشهر هجري"]||""),
      status: String(r["حالة الشهر"]||"مفتوح"),
      prefShares: existing.shares,
      prefType: existing.type
    };
  });

  return {
    association: {
      "معرف الجمعية": assocId,
      "اسم الجمعية": String(assocRow["اسم الجمعية"]||""),
      "تاريخ بداية الجمعية": normalizeDateCell_(assocRow["تاريخ بداية الجمعية"]),
      "تاريخ نهاية الجمعية": normalizeDateCell_(assocRow["تاريخ نهاية الجمعية"])
    },
    sharesTotal,
    shareValue,
    monthlyCollection,
    months: outMonths
  };
}

function subscriberSavePreferences(payload){
  const s = requireRole_(payload.token, "مشترك");
  const ss = SpreadsheetApp.getActive();

  const assocId = String(payload.assocId||"").trim();
  if (!assocId) throw new Error("معرف الجمعية مطلوب");
  const rowsIn = payload.rows;
  if (!Array.isArray(rowsIn) || !rowsIn.length) throw new Error("بيانات الرغبات مطلوبة");

  const assocSh = ss.getSheetByName(TAB.associations);
  const assocRow = assocSh ? readTable_(assocSh).find(r=>String(r["معرف الجمعية"])===assocId) : null;
  if (!assocRow) throw new Error("الجمعية غير موجودة");
  if (String(assocRow["حالة الجمعية"]||"").trim()!=="جديدة") throw new Error("الحفظ متاح فقط للجمعية الجديدة");

  const memSh = ss.getSheetByName(TAB.memberships);
  const mem = memSh ? readTable_(memSh).find(r =>
    String(r["معرف الجمعية"])===assocId &&
    String(r["معرف المشترك"])===String(s.subjectId) &&
    String(r["حالة العضوية"])!=="منسحب"
  ) : null;
  if (!mem) throw new Error("أنت غير مسجل في هذه الجمعية");
  const sharesTotal = Math.round(Number(mem["عدد الاسهم"]||0)*2)/2;

  const settings = getSettingsMap_();
  const shareValue = Number(String(settings[SETTINGS_KEYS.shareValue]||"100"));
  const months = Number(String(settings[SETTINGS_KEYS.months]||"10"));

  const totalSharesAssoc = Number(assocRow["اجمالي عدد الاسهم"]||0);
  const monthlyCollection = totalSharesAssoc * shareValue;

  // بناء مدخلات المشترك
  const byMonth = {};
  rowsIn.forEach(r=>{
    const no = Number(r.monthNo);
    const shares = Number(r.shares);
    const type = String(r.type||"").trim();
    if (!no || no<1 || no>months) return;
    if (!isFinite(shares) || shares < 0) throw new Error("عدد الأسهم غير صحيح");
    if (Math.round(shares*2) !== shares*2) throw new Error("الأسهم يجب أن تكون مضاعفات 0.5");
    if (type !== "ضروري" && type !== "ممكن التعديل") throw new Error("نوع الرغبة غير صحيح");
    byMonth[String(no)] = { shares, type };
  });

  // شرط الحفظ: مجموع = أسهم المشترك
  let sum = 0;
  for (let i=1;i<=months;i++){
    const v = byMonth[String(i)] ? Number(byMonth[String(i)].shares||0) : 0;
    sum += v;
  }
  sum = Math.round(sum*2)/2;
  if (sum !== sharesTotal) throw new Error("لا يمكن حفظ التعديلات, مجموع الاسهم لا يطابق عدد اسهم المشترك");

  const prefSh = ss.getSheetByName(TAB.preferences);
  if (!prefSh) throw new Error("تبويب الرغبات غير موجود, شغل تهيئة النظام");

  // إجمالي رغبات الآخرين (بعد حذف رغباتي الحالية)
  const allPrefs = readTable_(prefSh).filter(r=>String(r["معرف الجمعية"])===assocId && String(r["معرف المشترك"])!==String(s.subjectId));
  const totals = {};
  allPrefs.forEach(r=>{
    const no = Number(r["رقم الشهر داخل الجمعية"]||0);
    if (!no) return;
    totals[no] = (totals[no]||0) + Number(r["عدد اسهم التسليم لهذا الشهر"]||0);
  });
  for (let i=1;i<=months;i++){
    const mine = byMonth[String(i)] ? Number(byMonth[String(i)].shares||0) : 0;
    totals[i] = Math.round(((totals[i]||0) + mine)*2)/2;
  }

  // تحقق القدرة المتاحة تسلسليا
  let surplusPrev = 0;
  for (let i=1;i<=months;i++){
    const available = monthlyCollection + surplusPrev;
    const plannedAmount = (totals[i]||0) * 1000;
    if (plannedAmount > available + 0.0001) {
      throw new Error("لا يمكن حفظ التعديلات, تم تجاوز القدرة المتاحة للتسليم في الشهر رقم " + i);
    }
    surplusPrev = available - plannedAmount;
  }

  // حذف رغباتي القديمة إن وجدت (يسمح بالتعديل طالما الجمعية جديدة)
  deletePreferencesForSubscriber_(prefSh, assocId, String(s.subjectId));

  // اسم المشترك
  const subSh = ss.getSheetByName(TAB.subscribers);
  const me = subSh ? readTable_(subSh).find(r=>String(r["معرف المشترك"])===String(s.subjectId)) : null;
  const subName = me ? String(me["اسم المشترك"]||"") : "";
  const assocName = String(assocRow["اسم الجمعية"]||"");
  const now = dateOnly_(new Date());

  // معلومات الشهر
  const monthsSh = ss.getSheetByName(TAB.months);
  let monthRows = monthsSh ? readTable_(monthsSh).filter(r=>String(r["معرف الجمعية"])===assocId) : [];
  monthRows.sort((a,b)=>Number(a["رقم الشهر داخل الجمعية"]||0)-Number(b["رقم الشهر داخل الجمعية"]||0));
  if (!monthRows.length){
    ensureAssociationMonths_(ss, assocId, assocName, String(assocRow["تاريخ بداية الجمعية"]), months, monthlyCollection);
    monthRows = readTable_(monthsSh).filter(r=>String(r["معرف الجمعية"])===assocId);
    monthRows.sort((a,b)=>Number(a["رقم الشهر داخل الجمعية"]||0)-Number(b["رقم الشهر داخل الجمعية"]||0));
  }
  const mapM = {};
  monthRows.forEach(r=>{
    mapM[Number(r["رقم الشهر داخل الجمعية"]||0)] = {
      gDate: normalizeDateCell_(r["تاريخ الشهر ميلادي"]),
      gName: String(r["اسم الشهر ميلادي"]||""),
      hName: String(r["اسم الشهر هجري"]||""),
      status: String(r["حالة الشهر"]||"مفتوح")
    };
  });

  // لا نسمح بالتعديل على شهر "تم التسليم" حتى لو كانت جديدة (حماية مبكرة)
  for (let i=1;i<=months;i++){
    const st = (mapM[i] && mapM[i].status) ? mapM[i].status : "مفتوح";
    if (st === "تم التسليم") {
      const mine = byMonth[String(i)] ? Number(byMonth[String(i)].shares||0) : 0;
      if (mine !== 0) throw new Error("لا يمكن اختيار شهر تم فيه التسليم");
    }
  }

  for (let i=1;i<=months;i++){
    const rec = byMonth[String(i)] || { shares:0, type:"ممكن التعديل" };
    const m = mapM[i] || { gDate:"", gName:"", hName:"" };
    prefSh.appendRow([
      assocId,
      assocName,
      String(s.subjectId),
      subName,
      i,
      m.gDate,
      m.gName,
      m.hName,
      rec.shares,
      rec.type,
      now,
      now
    ]);
  }

  updateMonthsFromPreferences_(ss, assocId, months, monthlyCollection);
  logOp_(ss, "حفظ او تعديل رغبات", assocId, assocName, String(s.subjectId), subName, "", JSON.stringify(byMonth), "مشترك:" + s.subjectId);
  return { message: "تم حفظ التعديلات بنجاح" };
}

function deletePreferencesForSubscriber_(prefSh, assocId, subId){
  const values = prefSh.getDataRange().getValues();
  if (values.length < 2) return;
  const headers = values[0].map(String);
  const idxAssoc = headers.indexOf("معرف الجمعية");
  const idxSub = headers.indexOf("معرف المشترك");
  const keep = [values[0]];
  for (let i=1;i<values.length;i++){
    if (String(values[i][idxAssoc])===String(assocId) && String(values[i][idxSub])===String(subId)) continue;
    keep.push(values[i]);
  }
  prefSh.clearContents();
  prefSh.getRange(1,1,1,headers.length).setValues([headers]);
  if (keep.length>1){
    prefSh.getRange(2,1,keep.length-1,headers.length).setValues(keep.slice(1));
  }
  prefSh.setFrozenRows(1);
}

function updateMonthsFromPreferences_(ss, assocId, months, monthlyCollection){
  const monthsSh = ss.getSheetByName(TAB.months);
  const prefSh = ss.getSheetByName(TAB.preferences);
  if (!monthsSh || !prefSh) return;

  const monthValues = monthsSh.getDataRange().getValues();
  if (monthValues.length < 2) return;
  const headers = monthValues[0].map(String);
  const idx = {}; headers.forEach((h,i)=>idx[h]=i);

  const prefs = readTable_(prefSh).filter(r=>String(r["معرف الجمعية"])===String(assocId));
  const totals = {};
  prefs.forEach(r=>{
    const no = Number(r["رقم الشهر داخل الجمعية"]||0);
    if (!no) return;
    totals[no] = (totals[no]||0) + Number(r["عدد اسهم التسليم لهذا الشهر"]||0);
  });
  for (let i=1;i<=months;i++){
    totals[i] = Math.round((totals[i]||0)*2)/2;
  }

  let surplusPrev = 0;
  for (let i=1;i<=months;i++){
    const available = monthlyCollection + surplusPrev;
    const plannedShares = totals[i]||0;
    const plannedAmount = plannedShares * 1000;
    const surplusEnd = available - plannedAmount;

    // لا نغير "تم التسليم" إن كانت موجودة
    let currentStatus = "مفتوح";
    for (let r=1;r<monthValues.length;r++){
      if (String(monthValues[r][idx["معرف الجمعية"]])===String(assocId) && Number(monthValues[r][idx["رقم الشهر داخل الجمعية"]])===i){
        currentStatus = String(monthValues[r][idx["حالة الشهر"]]||"مفتوح");
        break;
      }
    }
    let status = currentStatus;
    if (currentStatus !== "تم التسليم") {
      status = (plannedAmount >= available - 0.0001) ? "مكتمل الحد" : "مفتوح";
    }

    for (let r=1;r<monthValues.length;r++){
      if (String(monthValues[r][idx["معرف الجمعية"]])===String(assocId) && Number(monthValues[r][idx["رقم الشهر داخل الجمعية"]])===i){
        monthValues[r][idx["التحصيل الشهري"]] = monthlyCollection;
        monthValues[r][idx["فائض سابق"]] = (i===1)?0:surplusPrev;
        monthValues[r][idx["الموجود لهذا الشهر"]] = available;
        monthValues[r][idx["اجمالي اسهم الرغبات لهذا الشهر"]] = plannedShares;
        monthValues[r][idx["مبلغ التسليم المخطط"]] = plannedAmount;
        monthValues[r][idx["فائض نهاية الشهر"]] = surplusEnd;
        monthValues[r][idx["حالة الشهر"]] = status;
        break;
      }
    }
    surplusPrev = surplusEnd;
  }

  // كتابة كل صفوف الجمعية كما هي (من الصف 2 حتى آخر صف)
  monthsSh.getRange(2, 1, monthValues.length - 1, headers.length).setValues(monthValues.slice(1));
}

