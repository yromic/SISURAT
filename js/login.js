(function initLoginPage(global) {
  "use strict";

  const { SisuratApi, SisuratAuth } = global;

  if (!SisuratApi || !SisuratAuth) {
    console.error("Module API/Auth belum dimuat.");
    return;
  }

  async function login() {
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;
    const msgDiv = document.getElementById("msg");
    const msgSpan = msgDiv.querySelector("span");

    if (!username || !password) {
      msgDiv.classList.remove("hidden");
      msgDiv.style.display = "flex";
      msgSpan.innerText = "Username dan password harus diisi!";
      return;
    }

    // Cari tombol login secara andal menggunakan ID
    const loginBtn = document.getElementById("login-btn");

    const originalText = loginBtn.innerHTML;
    loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Memproses...';
    loginBtn.disabled = true;

    try {
      const result = await SisuratApi.login(username, password);

      if (result.status === "success") {
        SisuratAuth.setStoredUser(result.user);
        window.location.href = "dashboard.html";
      } else {
        msgDiv.classList.remove("hidden");
        msgDiv.style.display = "flex";
        msgSpan.innerText =
          result.message || "Login gagal. Periksa kembali username/password.";
      }
    } catch (error) {
      console.error("Detail Error:", error);
      msgDiv.classList.remove("hidden");
      msgDiv.style.display = "flex";
      msgSpan.innerText = "Terjadi kesalahan jaringan.";
    } finally {
      loginBtn.innerHTML = originalText;
      loginBtn.disabled = false;
    }
  }

  function hideMessage() {
    const msgDiv = document.getElementById("msg");
    msgDiv.classList.add("hidden");
    msgDiv.style.display = "";
  }

  function init() {
    const existingUser = SisuratAuth.getStoredUser();
    if (existingUser) {
      window.location.href = "dashboard.html";
      return;
    }

    document.getElementById("username").addEventListener("input", hideMessage);
    document.getElementById("password").addEventListener("input", hideMessage);
  }

  global.login = login;
  global.addEventListener("load", init);
})(window);
