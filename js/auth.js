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
    if (!user) {
      window.location.href = redirectTo;
      return null;
    }

    const userNameEl = document.querySelector(userNameSelector);
    if (userNameEl) {
      userNameEl.innerText = user.username || "User";
    }

    return user;
  }

  function isSuperAdmin() {
    const user = getStoredUser();
    return user !== null && user.role === "super_admin";
  }

  function logoutToHome() {
    clearStoredUser();
    window.location.href = "index.html";
  }

  global.SisuratAuth = {
    getStoredUser,
    setStoredUser,
    clearStoredUser,
    requireAuth,
    isSuperAdmin,
    logoutToHome,
  };
})(window);
