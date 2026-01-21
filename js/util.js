(function(){
  function q(id){return document.getElementById(id)}
  function escapeHtml(s){
    return String(s ?? "").replace(/[&<>"']/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  }
  function onlyDigits(s){return String(s||"").replace(/\D+/g,"")}
  function isValidMobile(m){return /^05\d{8}$/.test(m)}
  function isValidPin(p){return /^\d{6}$/.test(p)}
  function todayIso(){
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth()+1).padStart(2,"0");
    const dd = String(d.getDate()).padStart(2,"0");
    return `${yyyy}-${mm}-${dd}`;
  }
  function setNotice(el, kind, msg){
    el.classList.remove("hidden","info","ok","warn","danger");
    el.classList.add(kind);
    el.textContent = msg;
  }
  function hideNotice(el){
    el.classList.add("hidden");
    el.textContent = "";
    el.classList.remove("info","ok","warn","danger");
  }
  window.Util = { q, escapeHtml, onlyDigits, isValidMobile, isValidPin, todayIso, setNotice, hideNotice };
})();