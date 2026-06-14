(function initSisuratAuth(global) {
  "use strict";

  const USER_STORAGE_KEY = "user";

  function getStoredUser() {
    try {
      const rawValue = localStorage.getItem(USER_STORAGE_KEY);
      return rawValue ? JSON.parse(rawValue) : null;
    } catch (error) {
      console.error("Data user di localStorage tidak valid:", error);
      return null;
    }
  }

  function setStoredUser(user) {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  }

  function clearStoredUser() {
    localStorage.removeItem(USER_STORAGE_KEY);
  }

  function requireAuth(options = {}) {
    const { redirectTo = "index.html", userNameSelector = "#user-name" } =
      options;

    const user = getStoredUser();
    if (!user || !user.session_token) {
      window.location.href = redirectTo;
      return null;
    }

    const userNameEl = document.querySelector(userNameSelector);
    if (userNameEl) {
      userNameEl.innerText = user.nama || user.username || "User";
    }

    return user;
  }

  function isSuperAdmin() {
    const user = getStoredUser();
    if (!user || !user.role) return false;
    const role = user.role.toLowerCase().replace(/[\s-]+/g, "_");
    return role === "super_admin";
  }

  async function logoutToHome() {
    try {
      if (global.SisuratApi && typeof global.SisuratApi.logout === "function") {
        await global.SisuratApi.logout();
      }
    } catch (error) {
      console.warn("[SisuratAuth] Logout server gagal:", error);
    } finally {
      clearStoredUser();
      window.location.href = "index.html";
    }
  }

  async function verifyRoleFromServer() {
    const user = getStoredUser();
    if (!user || !user.session_token || !global.SisuratApi) {
      return { valid: false, mismatch: false, msg: "ERR_401_SESSION" };
    }

    try {
      const data = await global.SisuratApi.verifySession();
      if (!data || data.status !== "success") {
        return {
          valid: false,
          mismatch: false,
          msg: (data && (data.code || data.message)) || "ERR_401_SESSION",
        };
      }

      const serverUser = data.user || {};
      const serverRole = serverUser.role || null;
      const localRole = user.role || null;
      const mismatch = !!(serverRole && localRole && serverRole !== localRole);
      setStoredUser({ ...user, ...serverUser, session_token: user.session_token });

      return {
        valid: true,
        mismatch,
        msg: mismatch
          ? `Role diperbarui: ${localRole} -> ${serverRole} (dari server)`
          : "Session valid dan sinkron.",
      };
    } catch (error) {
      console.warn("[SisuratAuth] Verifikasi server gagal:", error);
      return { valid: false, mismatch: false, msg: "ERR_401_SESSION" };
    }
  }

  global.SisuratAuth = {
    getStoredUser,
    setStoredUser,
    clearStoredUser,
    requireAuth,
    isSuperAdmin,
    logoutToHome,
    verifyRoleFromServer,
  };
})(window);
