(function(){
  // ملاحظة مهمة:
  // Google Apps Script Web App لا يرسل ترويسات CORS بشكل صريح.
  // إذا أرسلنا Content-Type: application/json سيعمل المتصفح Preflight (OPTIONS) وقد يفشل ويظهر Failed to fetch.
  // الحل المجاني والعملي: إرسال JSON كنص عادي text/plain لتجنب الـ Preflight.
  async function post(action, payload){
    if(!window.APP_CONFIG.apiBase) throw new Error("لم يتم ضبط رابط السكربت في config.js");
    const body = { action, payload: payload || {} };

    const res = await fetch(window.APP_CONFIG.apiBase, {
      method: "POST",
      // لا تضع application/json هنا حتى لا يحدث preflight
      headers: { "Content-Type":"text/plain;charset=utf-8" },
      body: JSON.stringify(body)
    });

    // بعض حالات الأخطاء قد ترجع HTML, نحمي التحويل
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch(e) {
      throw new Error("رد غير متوقع من السيرفر");
    }

    if(!data || data.ok !== true){
      const msg = data && data.message ? data.message : "فشل الطلب";
      const err = new Error(msg);
      err.data = data;
      throw err;
    }
    return data;
  }
  // expose with both names: Api and API
  // توافق خلفي: بعض الصفحات تستعمل Api.call بدل Api.post
  function call(action, payload){
    return post(action, payload);
  }
  const apiObj = { post, call };
  window.Api = apiObj;
  window.API = apiObj;
})();