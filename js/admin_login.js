/* global Api, Auth */

(function () {
  "use strict";

  const form = document.getElementById("adminLoginForm");
  const pinEl = document.getElementById("adminPin");
  const btn = document.getElementById("btnLogin");
  const msg = document.getElementById("msg");

  function setMsg(text, type) {
    if (!msg) return;
    msg.textContent = text || "";
    msg.className = "msg" + (type ? " " + type : "");
  }

  async function boot() {
    try {
      const session = Auth.getSession();
      if (session && session.role === "مدير") {
        window.location.href = "admin.html";
        return;
      }
    } catch (e) {
      // ignore
    }
    if (pinEl) pinEl.focus();
  }

  async function handleSubmit(ev) {
    ev.preventDefault();
    setMsg("", "");

    const pinRaw = (pinEl && pinEl.value ? pinEl.value : "").trim();
    if (!pinRaw) {
      setMsg("PIN مطلوب", "error");
      return;
    }

    btn.disabled = true;
    btn.classList.add("loading");

    try {
      const deviceId = Auth.getDeviceId();
      const deviceInfo = Auth.getDeviceInfo();

      const res = await Api.call("loginAdmin", {
        pin: pinRaw,
        deviceId,
        deviceInfo
      });

      if (!res || !res.session || !res.session.token) {
        throw new Error("رد غير متوقع من السيرفر");
      }

      Auth.setSession(res.session);
      window.location.href = "admin.html";
    } catch (e) {
      setMsg(e && e.message ? e.message : "فشل الدخول", "error");
    } finally {
      btn.disabled = false;
      btn.classList.remove("loading");
    }
  }

  if (form) form.addEventListener("submit", handleSubmit);
  boot();
})();
