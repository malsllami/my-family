(function(){
  const LS = {
    session: "family_session",
    device: "family_device"
  };

  function getDeviceId(){
    let d = localStorage.getItem(LS.device);
    if(!d){
      d = (crypto && crypto.randomUUID) ? crypto.randomUUID() : ("dev_" + Math.random().toString(16).slice(2) + Date.now());
      localStorage.setItem(LS.device, d);
    }
    return d;
  }

  function getDeviceInfo(){
    const ua = navigator.userAgent || "";
    const platform = navigator.platform || "";
    return { ua, platform };
  }

  function setSession(sess){ localStorage.setItem(LS.session, JSON.stringify(sess)); }
  function getSession(){
    const raw = localStorage.getItem(LS.session);
    if(!raw) return null;
    try{return JSON.parse(raw)}catch(e){ return null }
  }
  function clearSession(){ localStorage.removeItem(LS.session); }

  async function ensureSession(){
    const sess = getSession();
    if(!sess || !sess.token) return null;
    try{
      const r = await Api.post("getSession", { token: sess.token });
      return r.session;
    }catch(e){
      // لا نمسح الجلسة إلا إذا كان السبب "جلسة غير صالحة" أو "انتهت الجلسة"
      const msg = String(e && e.message ? e.message : e || "");
      if(msg.includes("الجلسة غير صالحة") || msg.includes("انتهت الجلسة") || msg.includes("سجل دخول")){
        clearSession();
        return null;
      }
      // مشاكل شبكة أو CORS مؤقتة: لا نخرج المستخدم
      return sess;
    }
  }


  // توافق خلفي: بعض الصفحات كانت تستخدم Auth.saveSession
  function saveSession(sess){ setSession(sess); }

  window.Auth = { getDeviceId, getDeviceInfo, setSession, saveSession, getSession, clearSession, ensureSession };
})();