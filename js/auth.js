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
      userNameEl.innerText = user.nama || user.username || "User";
    }

    return user;
  }

  function isSuperAdmin() {
    const user = getStoredUser();
    if (!user) return false;

    // Method 1: Cek via ShieldStore (jika tersedia) menggunakan role_ids
    if (
      typeof ShieldStore !== "undefined" &&
      Array.isArray(user.role_ids) &&
      user.role_ids.length > 0
    ) {
      const roles = ShieldStore.getRolesByIds(user.role_ids);
      if (roles.some((r) => r.is_super_admin)) return true;
    }

    // Method 2: Fallback ke role string (backward compat)
    if (!user.role) return false;
    const role = user.role.toLowerCase().replace(/[\s_-]+/g, "");
    return role === "superadmin";
  }

  function logoutToHome() {
    clearStoredUser();
    window.location.href = "index.html";
  }

  /**
   * [SECURITY] Verifikasi role user aktif terhadap backend (Known Limitation 1 mitigation).
   * Panggil ini di halaman sensitif (shield.html, user-management.html).
   * Jika role dari server berbeda dengan localStorage, localStorage diperbarui.
   *
   * @param {string} apiUrl - URL Google Apps Script endpoint
   * @returns {Promise<{valid: boolean, mismatch: boolean, msg: string}>}
   */
  async function verifyRoleFromServer(apiUrl) {
    const user = getStoredUser();
    if (!user || !apiUrl) {
      return { valid: false, mismatch: false, msg: "User atau API URL tidak tersedia." };
    }
    try {
      const url = `${apiUrl}?action=verify_session&username=${encodeURIComponent(user.username || "")}`;
      const resp = await fetch(url, { method: "GET", cache: "no-store" });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();

      if (data.status !== "success") {
        return { valid: false, mismatch: false, msg: data.message || "Gagal verifikasi session." };
      }

      // Bandingkan role dari server dengan localStorage
      const serverRole = data.role || null;
      const localRole  = user.role  || null;
      const mismatch = serverRole && localRole && serverRole !== localRole;

      if (mismatch) {
        console.warn(
          "[SisuratAuth] ⚠️ Role mismatch! Server:", serverRole, "| Local:", localRole,
          "\nLocalStorage diperbarui ke data server."
        );
        // Paksa sinkronisasi dengan data dari server
        setStoredUser({
          ...user,
          role:     serverRole,
          role_ids: data.role_ids || user.role_ids || [],
        });
      }

      return {
        valid: true,
        mismatch: !!mismatch,
        msg: mismatch
          ? `Role diperbarui: ${localRole} → ${serverRole} (dari server)`
          : "Session valid dan sinkron.",
      };
    } catch (e) {
      console.warn("[SisuratAuth] Verifikasi server gagal (offline?):", e.message);
      return { valid: false, mismatch: false, msg: `Tidak dapat menghubungi server: ${e.message}` };
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

