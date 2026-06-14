/**
 * ─── SISURAT Navigation & Error UX Module ─────────────────────────────────────
 * Sprint 4.1E — Navigation & Error UX Alignment
 *
 * Satu sumber kebenaran untuk:
 *   1. Sidebar toggle (mobile)
 *   2. Username mobile sync
 *   3. Super Admin sidebar section visibility
 *   4. Active divisi badge di header
 *   5. Error mapper global (backend code → pesan ramah)
 *   6. Toast notification system
 *   7. Session expired auto-redirect
 *
 * Include setelah auth.js, sebelum modul per-halaman.
 */
(function initSisuratNavigation(global) {
  "use strict";

  // ─── 1. Sidebar Toggle ──────────────────────────────────────────────────────

  global.toggleSidebar = function () {
    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("sidebar-overlay");
    if (sidebar) sidebar.classList.toggle("open");
    if (overlay) overlay.classList.toggle("open");
  };

  global.closeSidebar = function () {
    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("sidebar-overlay");
    if (sidebar) sidebar.classList.remove("open");
    if (overlay) overlay.classList.remove("open");
  };

  // ─── 2. Username Mobile Sync ────────────────────────────────────────────────

  function syncMobileUsername() {
    const nm = document.getElementById("user-name");
    const nmm = document.getElementById("user-name-mobile");
    if (nm && nmm) {
      // Sync immediately
      nmm.textContent = nm.textContent;
      // Watch for future changes
      const obs = new MutationObserver(() => {
        nmm.textContent = nm.textContent;
      });
      obs.observe(nm, { childList: true, characterData: true, subtree: true });
    }
  }

  // ─── 3. Super Admin Sidebar Section ─────────────────────────────────────────

  function initSuperAdminSidebar() {
    if (
      typeof global.SisuratAuth !== "undefined" &&
      global.SisuratAuth.isSuperAdmin()
    ) {
      const saSection = document.getElementById("sidebar-superadmin-section");
      if (saSection) saSection.classList.remove("hidden");
    }
  }

  // ─── 4. Active Divisi Badge ─────────────────────────────────────────────────

  function showActiveDivisiBadge() {
    if (typeof global.SisuratDivision === "undefined") return;
    if (!global.SisuratDivision.isSuperAdmin()) return;

    const activeDivisi = global.SisuratDivision.getActiveDivisi();
    const badgeContainer = document.getElementById("active-divisi-badge");
    if (!badgeContainer) return;

    badgeContainer.classList.remove("hidden");

    if (activeDivisi) {
      badgeContainer.innerHTML =
        '<div class="inline-flex items-center gap-2 px-4 py-2 bg-white/15 rounded-full border border-white/25 text-sm font-bold text-white shadow-sm backdrop-blur-sm">' +
          '<i class="fas fa-building text-[#7fffd4]"></i>' +
          '<span>Divisi Aktif:</span>' +
          '<span class="px-2 py-0.5 bg-[#00ADB5] rounded-lg text-white font-extrabold tracking-wider text-xs">' +
            _escapeHTML(activeDivisi) +
          '</span>' +
        '</div>';
    } else {
      badgeContainer.innerHTML =
        '<div class="inline-flex items-center gap-2 px-4 py-2 bg-amber-500/20 rounded-full border border-amber-400/30 text-sm font-bold text-amber-200 shadow-sm backdrop-blur-sm animate-pulse">' +
          '<i class="fas fa-exclamation-triangle text-amber-300"></i>' +
          '<span>Belum memilih divisi aktif</span>' +
        '</div>';
    }
  }

  // ─── 5. Error Mapper ────────────────────────────────────────────────────────

  const ERROR_MAP = Object.freeze({
    ERR_401_SESSION: "Sesi habis. Silakan login kembali.",
    ERR_403_ROLE: "Anda tidak memiliki izin untuk fitur ini.",
    ERR_403_DIVISI: "Anda tidak memiliki akses ke data divisi lain.",
    ERR_403_SCOPE: "Fitur ini hanya untuk Super Admin.",
    ERR_409_DIVISI: "Kode divisi sudah digunakan.",
    ERR_413_FILE: "Ukuran file melebihi batas.",
    ERR_500_SERVER: "Terjadi kesalahan sistem. Hubungi administrator.",
    ERR_400_DIVISI_REQUIRED: "Pilih divisi aktif terlebih dahulu.",
  });

  /**
   * Map backend error code (or raw message) ke pesan ramah.
   * Jika code tidak ditemukan di ERROR_MAP, kembalikan pesan asli.
   */
  function mapError(codeOrMessage) {
    if (!codeOrMessage) return "Terjadi kesalahan yang tidak diketahui.";
    const key = String(codeOrMessage).trim();
    return ERROR_MAP[key] || key;
  }

  // ─── 6. Toast Notification System ───────────────────────────────────────────

  // Ensure a single toast container exists in the DOM
  function _getToastContainer() {
    let container = document.getElementById("sisurat-toast-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "sisurat-toast-container";
      container.className = "sisurat-toast-container";
      document.body.appendChild(container);
    }
    return container;
  }

  const TOAST_ICONS = {
    success: "fa-check-circle",
    error: "fa-times-circle",
    warning: "fa-exclamation-triangle",
    info: "fa-info-circle",
  };

  const TOAST_DURATION_MS = 4500;

  /**
   * Tampilkan toast notification.
   * @param {string} message — Pesan yang ditampilkan
   * @param {"success"|"error"|"warning"|"info"} [type="info"]
   * @param {number} [durationMs] — Override durasi default
   */
  function showToast(message, type, durationMs) {
    type = type || "info";
    durationMs = durationMs || TOAST_DURATION_MS;

    const container = _getToastContainer();

    const toast = document.createElement("div");
    toast.className = "sisurat-toast sisurat-toast--" + type;

    const icon = TOAST_ICONS[type] || TOAST_ICONS.info;
    toast.innerHTML =
      '<div class="sisurat-toast__icon"><i class="fas ' + icon + '"></i></div>' +
      '<div class="sisurat-toast__message">' + _escapeHTML(message) + '</div>' +
      '<button class="sisurat-toast__close" aria-label="Tutup">' +
        '<i class="fas fa-times"></i>' +
      '</button>';

    // Close button handler
    toast.querySelector(".sisurat-toast__close").addEventListener("click", function () {
      _dismissToast(toast);
    });

    container.appendChild(toast);

    // Trigger enter animation on next frame
    requestAnimationFrame(function () {
      toast.classList.add("sisurat-toast--visible");
    });

    // Auto dismiss
    const timer = setTimeout(function () {
      _dismissToast(toast);
    }, durationMs);

    toast._timer = timer;
  }

  function _dismissToast(toast) {
    if (toast._dismissed) return;
    toast._dismissed = true;
    clearTimeout(toast._timer);
    toast.classList.remove("sisurat-toast--visible");
    toast.classList.add("sisurat-toast--exit");
    toast.addEventListener("animationend", function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    });
    // Fallback cleanup
    setTimeout(function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 500);
  }

  /**
   * Tampilkan error toast. Otomatis map error code ke pesan ramah.
   * @param {string} codeOrMessage — Backend error code atau pesan
   */
  function showError(codeOrMessage) {
    const message = mapError(codeOrMessage);

    // Auto-redirect pada session expired
    if (
      codeOrMessage === "ERR_401_SESSION" ||
      String(codeOrMessage).includes("ERR_401")
    ) {
      showToast(message, "error", 3000);
      setTimeout(function () {
        if (typeof global.SisuratAuth !== "undefined") {
          global.SisuratAuth.clearStoredUser();
        }
        window.location.href = "index.html";
      }, 2000);
      return;
    }

    showToast(message, "error");
  }

  // ─── 7. API Response Interceptor ────────────────────────────────────────────

  /**
   * Hook ke postAction untuk auto-handle error codes.
   * Dipanggil setelah SisuratApi di-init.
   */
  function installApiInterceptor() {
    if (typeof global.SisuratApi === "undefined" || !global.SisuratApi.postAction) return;

    const originalPostAction = global.SisuratApi.postAction;

    global.SisuratApi.postAction = async function (action, data) {
      try {
        const result = await originalPostAction.call(global.SisuratApi, action, data);

        // Intercept session expired responses
        if (result && result.status !== "success" && result.code) {
          if (result.code === "ERR_401_SESSION") {
            showError("ERR_401_SESSION");
            throw new Error(mapError("ERR_401_SESSION"));
          }
        }

        return result;
      } catch (err) {
        // Rethrow — caller decides whether to show error or not
        throw err;
      }
    };
  }

  // ─── Utility ────────────────────────────────────────────────────────────────

  function _escapeHTML(str) {
    const div = document.createElement("div");
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  global.SisuratUI = {
    showToast: showToast,
    showError: showError,
    mapError: mapError,
    ERROR_MAP: ERROR_MAP,
  };

  // ─── Auto-Init on DOMContentLoaded ──────────────────────────────────────────

  document.addEventListener("DOMContentLoaded", function () {
    syncMobileUsername();
    initSuperAdminSidebar();
    showActiveDivisiBadge();
    installApiInterceptor();
  });
})(window);
