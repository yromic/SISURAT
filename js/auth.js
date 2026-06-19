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
    const sessionToken =
      user && (user.token || user.session_token || user.user?.token || user.user?.session_token);
    if (sessionToken) {
      localStorage.setItem("session_token", sessionToken);
    }
    if (user && user.role) localStorage.setItem("user_role", user.role);
    if (user && user.scope) localStorage.setItem("user_scope", user.scope);
    if (user && user.nama) localStorage.setItem("user_nama", user.nama);
    if (user && user.divisi_id) {
      localStorage.setItem("user_divisi_id", user.divisi_id);
    } else {
      localStorage.removeItem("user_divisi_id");
    }
  }

  function clearStoredUser() {
    localStorage.removeItem(USER_STORAGE_KEY);
    localStorage.removeItem("session_token");
    localStorage.removeItem("user_role");
    localStorage.removeItem("user_scope");
    localStorage.removeItem("user_nama");
    localStorage.removeItem("user_divisi_id");
    localStorage.removeItem("active_divisi");
    if (global.SisuratCache && typeof global.SisuratCache.clear === "function") {
      global.SisuratCache.clear();
    }
  }

  // Helper for Global Division Context
  global.SisuratDivision = {
    getActiveDivisi() {
      const user = getStoredUser();
      if (!user) return "";
      const role = String(user.role || "").toLowerCase().replace(/[\s_-]+/g, "_");
      if (role === "super_admin") {
        return localStorage.getItem("active_divisi") || "";
      } else {
        return localStorage.getItem("user_divisi_id") || user.divisi_id || "";
      }
    },
    setActiveDivisi(kodeDivisi) {
      const user = getStoredUser();
      if (!user) return;
      const role = String(user.role || "").toLowerCase().replace(/[\s_-]+/g, "_");
      if (role === "super_admin") {
        if (kodeDivisi) {
          localStorage.setItem("active_divisi", String(kodeDivisi).toUpperCase());
        } else {
          localStorage.removeItem("active_divisi");
        }
      }
    },
    clearActiveDivisi() {
      localStorage.removeItem("active_divisi");
    },
    requireActiveDivisi() {
      return this.getActiveDivisi() || null;
    },
    isSuperAdmin() {
      const user = getStoredUser();
      if (!user || !user.role) return false;
      const role = user.role.toLowerCase().replace(/[\s_-]+/g, "_");
      return role === "super_admin";
    }
  };

  async function getDivisionsCached() {
    if (global.SisuratApi) {
      try {
        const res = await global.SisuratApi.getData("db_divisi");
        if (res && res.status === "success" && Array.isArray(res.data)) {
          localStorage.setItem("sisurat_divisions", JSON.stringify(res.data));
          return res.data;
        }
      } catch (_) {}
    }
    const cached = localStorage.getItem("sisurat_divisions");
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (_) {}
    }
    return [];
  }

  async function injectSidebarSwitcher() {
    const isSA = global.SisuratDivision.isSuperAdmin();
    const user = getStoredUser();
    const role = user ? String(user.role || "").toLowerCase().replace(/[\s_-]+/g, "_") : "";
    const isAdminDiv = (role === "admin_divisi" || role === "admin");

    if (isSA || isAdminDiv) {
      // Show superadmin section in sidebar if it exists
      const saSection = document.getElementById("sidebar-superadmin-section");
      if (saSection) {
        saSection.classList.remove("hidden");

        // Hide Divisi and Settings links for Division Admins
        if (isAdminDiv) {
          const links = saSection.querySelectorAll("a");
          links.forEach((link) => {
            const href = link.getAttribute("href");
            if (href === "divisi.html" || href === "settings.html") {
              link.classList.add("hidden");
            }
          });
          const header = saSection.querySelector("p");
          if (header) {
            header.textContent = "Manajemen Akun";
          }
        }
      }
    }

    if (!isSA) return;

    const nav = document.querySelector("#sidebar nav");
    if (!nav) return;

    // Avoid duplicate injection
    if (document.getElementById("sidebar-division-switcher-container")) {
      return;
    }

    const wrapper = document.createElement("div");
    wrapper.id = "sidebar-division-switcher-container";
    wrapper.className = "mb-4 px-2";

    const label = document.createElement("label");
    label.className = "block text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-1.5";
    label.innerText = "Divisi Aktif (Super Admin)";
    wrapper.appendChild(label);

    const selectWrap = document.createElement("div");
    selectWrap.className = "sisurat-select-wrap";

    const select = document.createElement("select");
    select.id = "sidebar-division-switcher";
    select.className = "sisurat-select sisurat-select--dark text-xs";

    const defaultOpt = document.createElement("option");
    defaultOpt.value = "";
    defaultOpt.innerText = "-- Pilih Divisi Aktif --";
    defaultOpt.disabled = true;
    defaultOpt.className = "text-[#222831] bg-white";
    select.appendChild(defaultOpt);

    const divisions = await getDivisionsCached();
    divisions.forEach((div) => {
      if (div.status === "active" || div.status === "Aktif") {
        const opt = document.createElement("option");
        opt.value = div.kode_divisi;
        opt.className = "text-[#222831] bg-white";
        opt.innerText = `${div.kode_divisi} - ${div.nama_divisi}`;
        select.appendChild(opt);
      }
    });

    const activeDiv = global.SisuratDivision.getActiveDivisi();
    select.value = activeDiv;
    if (!activeDiv) {
      defaultOpt.selected = true;
    }

    select.onchange = function () {
      global.SisuratDivision.setActiveDivisi(this.value);
      window.location.reload();
    };

    selectWrap.appendChild(select);
    wrapper.appendChild(selectWrap);
    nav.insertBefore(wrapper, nav.firstChild);
  }

  function requireAuth(options = {}) {
    const { redirectTo = "index.html", userNameSelector = "#user-name" } =
      options;

    const user = getStoredUser();
    const sessionToken = localStorage.getItem("session_token") || (user && user.session_token);
    if (!user || !sessionToken) {
      window.location.href = redirectTo;
      return null;
    }
    if (!user.session_token) {
      user.session_token = sessionToken;
      setStoredUser(user);
    }

    const userNameEl = document.querySelector(userNameSelector);
    if (userNameEl) {
      userNameEl.innerText = user.nama || user.username || "User";
    }

    injectSidebarSwitcher();

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
    const sessionToken = localStorage.getItem("session_token") || (user && user.session_token);
    if (!user || !sessionToken || !global.SisuratApi) {
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
      setStoredUser({ ...user, ...serverUser, session_token: sessionToken });

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
