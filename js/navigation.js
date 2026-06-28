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
    const badgeContainer = _getOrCreateDivisiBadgeContainer();
    if (!badgeContainer) return;

    const currentUser = global.SisuratAuth && typeof global.SisuratAuth.getStoredUser === "function"
      ? global.SisuratAuth.getStoredUser()
      : null;
    const role = currentUser && currentUser.role
      ? String(currentUser.role).toLowerCase().replace(/[\s_-]+/g, "_")
      : "";
    const isSuperAdmin = role === "super_admin";
    const activeDivisi = isSuperAdmin
      ? (localStorage.getItem("active_divisi") || "")
      : (localStorage.getItem("user_divisi_id") || "");

    if (activeDivisi) {
      badgeContainer.classList.remove("hidden");
      badgeContainer.innerHTML =
        '<div class="inline-flex items-center gap-2 px-4 py-2 bg-white/15 rounded-full border border-white/25 text-sm font-bold text-white shadow-sm backdrop-blur-sm">' +
        '<i class="fas fa-building text-[#7fffd4]"></i>' +
        '<span>' + (isSuperAdmin ? 'Divisi Aktif:' : 'Divisi:') + '</span>' +
        '<span class="px-2 py-0.5 bg-[#00ADB5] rounded-lg text-white font-extrabold tracking-wider text-xs">' +
        _escapeHTML(String(activeDivisi).toUpperCase()) +
        '</span>' +
        '</div>';
    } else {
      badgeContainer.innerHTML = "";
      badgeContainer.classList.add("hidden");
    }
  }

  function _getOrCreateDivisiBadgeContainer() {
    let badgeContainer = document.getElementById("active-divisi-badge");
    if (badgeContainer) return badgeContainer;

    const headerFlex = document.querySelector("#settings-main-content .relative.z-10.w-full.flex");
    if (!headerFlex) return null;

    badgeContainer = document.createElement("div");
    badgeContainer.id = "active-divisi-badge";
    badgeContainer.className = "hidden divisi-badge-container";
    headerFlex.appendChild(badgeContainer);
    return badgeContainer;
  }

  // ─── 5. Error Mapper ────────────────────────────────────────────────────────

  const ERROR_MAP = Object.freeze({
    ERR_401_SESSION: "Sesi habis. Silakan login kembali.",
    ERR_403_ROLE: "Anda tidak memiliki izin untuk fitur ini.",
    ERR_403_DIVISI: "Anda tidak memiliki akses ke data divisi lain.",
    ERR_403_SCOPE: "Fitur ini hanya untuk Super Admin.",
    ERR_409_DIVISI: "Kode divisi sudah digunakan.",
    ERR_413_FILE: "Ukuran file melebihi batas 10 MB per file.",
    ERR_500_SERVER: "Terjadi kesalahan sistem. Hubungi administrator.",
    ERR_400_DIVISI_REQUIRED: "Pilih divisi aktif terlebih dahulu.",
    ERR_400_SELF_DELETE: "Anda tidak dapat menghapus akun sendiri.",
    ERR_400_SELF_DEACTIVATE: "Anda tidak dapat menonaktifkan akun sendiri.",
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
   * Aman dipanggil berkali-kali — interceptor hanya didaftarkan sekali.
   */
  function installApiInterceptor() {
    if (typeof global.SisuratApi === "undefined") return;

    if (typeof global.SisuratApi.addInterceptor === "function") {
      global.SisuratApi.addInterceptor(async function (result, action, data) {
        if (result && result.status !== "success" && result.code) {
          if (result.code === "ERR_401_SESSION") {
            showError("ERR_401_SESSION");
            var err = new Error(mapError("ERR_401_SESSION"));
            err.code = "ERR_401_SESSION"; // kode mentah agar catch block di api.js dapat mendeteksi
            throw err;
          }
          if (result.code === "ERR_403_ORIGIN") {
            showError("ERR_403_ORIGIN");
            var err2 = new Error(mapError("ERR_403_ORIGIN"));
            err2.code = "ERR_403_ORIGIN";
            throw err2;
          }
        }
      });
    } else if (global.SisuratApi.postAction) {
      const originalPostAction = global.SisuratApi.postAction;
      global.SisuratApi.postAction = async function (action, data) {
        try {
          const result = await originalPostAction.call(global.SisuratApi, action, data);
          if (result && result.status !== "success" && result.code) {
            if (result.code === "ERR_401_SESSION") {
              showError("ERR_401_SESSION");
              var err = new Error(mapError("ERR_401_SESSION"));
              err.code = "ERR_401_SESSION";
              throw err;
            }
            if (result.code === "ERR_403_ORIGIN") {
              showError("ERR_403_ORIGIN");
              var err2 = new Error(mapError("ERR_403_ORIGIN"));
              err2.code = "ERR_403_ORIGIN";
              throw err2;
            }
          }
          return result;
        } catch (err) {
          throw err;
        }
      };
    }
  }

  // ─── Utility ────────────────────────────────────────────────────────────────

  function _escapeHTML(str) {
    const div = document.createElement("div");
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  // ─── 8. Confirm / Prompt Modal System ───────────────────────────────────────

  // Ensure a singleton modal container
  function _getModalContainer() {
    let el = document.getElementById("sisurat-modal-container");
    if (!el) {
      el = document.createElement("div");
      el.id = "sisurat-modal-container";
      document.body.appendChild(el);
    }
    return el;
  }

  var _activeModalCleanup = null;

  var MODAL_TYPE_CONFIG = {
    danger: {
      accent: "#ef4444",
      accentLight: "rgba(239,68,68,0.1)",
      icon: "fa-exclamation-triangle",
      barClass: "bg-red-500",
    },
    warning: {
      accent: "#f59e0b",
      accentLight: "rgba(245,158,11,0.1)",
      icon: "fa-exclamation-circle",
      barClass: "bg-amber-500",
    },
    info: {
      accent: "#3b82f6",
      accentLight: "rgba(59,130,246,0.1)",
      icon: "fa-info-circle",
      barClass: "bg-blue-500",
    },
  };

  /**
   * Tampilkan confirmation modal premium.
   * @param {Object} opts
   * @param {string} opts.title
   * @param {string} opts.message
   * @param {string} [opts.confirmText="Ya, Lanjutkan"]
   * @param {string} [opts.cancelText="Batal"]
   * @param {"danger"|"warning"|"info"} [opts.type="danger"]
   * @returns {Promise<boolean>}
   */
  function showConfirm(opts) {
    opts = opts || {};
    var title = opts.title || "Konfirmasi";
    var message = opts.message || "Apakah Anda yakin?";
    var confirmText = opts.confirmText || "Ya, Lanjutkan";
    var cancelText = opts.cancelText || "Batal";
    var type = opts.type || "danger";
    var cfg = MODAL_TYPE_CONFIG[type] || MODAL_TYPE_CONFIG.danger;

    // Dismiss any existing modal
    if (_activeModalCleanup) _activeModalCleanup();

    return new Promise(function (resolve) {
      var container = _getModalContainer();

      var html =
        '<div class="sisurat-modal-backdrop">' +
        '<div class="sisurat-modal-dialog sisurat-modal-dialog--' + type + '">' +
        // Color bar
        '<div class="sisurat-modal__bar ' + cfg.barClass + '"></div>' +
        '<div class="sisurat-modal__body">' +
        // Icon
        '<div class="sisurat-modal__icon-ring" style="background:' + cfg.accentLight + ';border-color:' + cfg.accentLight + ';">' +
        '<i class="fas ' + cfg.icon + '" style="color:' + cfg.accent + ';"></i>' +
        '</div>' +
        // Title
        '<h3 class="sisurat-modal__title">' + _escapeHTML(title) + '</h3>' +
        // Message
        '<p class="sisurat-modal__message">' + _escapeHTML(message) + '</p>' +
        // Buttons
        '<div class="sisurat-modal__actions">' +
        '<button class="sisurat-modal__btn sisurat-modal__btn--cancel" data-action="cancel">' +
        _escapeHTML(cancelText) +
        '</button>' +
        '<button class="sisurat-modal__btn sisurat-modal__btn--confirm sisurat-modal__btn--' + type + '" data-action="confirm">' +
        '<i class="fas fa-check mr-1"></i> ' + _escapeHTML(confirmText) +
        '</button>' +
        '</div>' +
        '</div>' +
        '</div>' +
        '</div>';

      container.innerHTML = html;

      var backdrop = container.querySelector(".sisurat-modal-backdrop");
      var dialog = container.querySelector(".sisurat-modal-dialog");
      var confirmBtn = container.querySelector('[data-action="confirm"]');
      var cancelBtn = container.querySelector('[data-action="cancel"]');

      // Animate in
      requestAnimationFrame(function () {
        backdrop.classList.add("sisurat-modal-backdrop--visible");
        dialog.classList.add("sisurat-modal-dialog--visible");
      });

      function cleanup(result) {
        _activeModalCleanup = null;
        dialog.classList.remove("sisurat-modal-dialog--visible");
        dialog.classList.add("sisurat-modal-dialog--exit");
        backdrop.classList.remove("sisurat-modal-backdrop--visible");
        backdrop.classList.add("sisurat-modal-backdrop--exit");
        document.removeEventListener("keydown", onKey);
        setTimeout(function () {
          container.innerHTML = "";
        }, 300);
        resolve(result);
      }

      _activeModalCleanup = function () { cleanup(false); };

      confirmBtn.addEventListener("click", function () { cleanup(true); });
      cancelBtn.addEventListener("click", function () { cleanup(false); });

      // Backdrop click
      backdrop.addEventListener("click", function (e) {
        if (e.target === backdrop) cleanup(false);
      });

      // Escape key
      function onKey(e) {
        if (e.key === "Escape") cleanup(false);
      }
      document.addEventListener("keydown", onKey);

      // Focus confirm button
      setTimeout(function () { confirmBtn.focus(); }, 100);
    });
  }

  /**
   * Tampilkan prompt modal premium (dengan input field).
   * @param {Object} opts
   * @param {string} opts.title
   * @param {string} [opts.message]
   * @param {string} [opts.placeholder]
   * @param {string} [opts.inputType="text"]
   * @param {string} [opts.confirmText="Simpan"]
   * @param {string} [opts.cancelText="Batal"]
   * @param {"danger"|"warning"|"info"} [opts.type="info"]
   * @returns {Promise<string|null>}
   */
  function showPrompt(opts) {
    opts = opts || {};
    var title = opts.title || "Input";
    var message = opts.message || "";
    var placeholder = opts.placeholder || "";
    var inputType = opts.inputType || "text";
    var confirmText = opts.confirmText || "Simpan";
    var cancelText = opts.cancelText || "Batal";
    var type = opts.type || "info";
    var cfg = MODAL_TYPE_CONFIG[type] || MODAL_TYPE_CONFIG.info;

    // Dismiss any existing modal
    if (_activeModalCleanup) _activeModalCleanup();

    return new Promise(function (resolve) {
      var container = _getModalContainer();

      var messageHtml = message
        ? '<p class="sisurat-modal__message">' + _escapeHTML(message) + '</p>'
        : '';

      var html =
        '<div class="sisurat-modal-backdrop">' +
        '<div class="sisurat-modal-dialog sisurat-modal-dialog--' + type + '">' +
        '<div class="sisurat-modal__bar ' + cfg.barClass + '"></div>' +
        '<div class="sisurat-modal__body">' +
        '<div class="sisurat-modal__icon-ring" style="background:' + cfg.accentLight + ';border-color:' + cfg.accentLight + ';">' +
        '<i class="fas ' + cfg.icon + '" style="color:' + cfg.accent + ';"></i>' +
        '</div>' +
        '<h3 class="sisurat-modal__title">' + _escapeHTML(title) + '</h3>' +
        messageHtml +
        // Input
        '<div class="sisurat-modal__input-wrap">' +
        '<input class="sisurat-modal__input" type="' + inputType + '" placeholder="' + _escapeHTML(placeholder) + '" autocomplete="off" />' +
        '</div>' +
        // Buttons
        '<div class="sisurat-modal__actions">' +
        '<button class="sisurat-modal__btn sisurat-modal__btn--cancel" data-action="cancel">' +
        _escapeHTML(cancelText) +
        '</button>' +
        '<button class="sisurat-modal__btn sisurat-modal__btn--confirm sisurat-modal__btn--' + type + '" data-action="confirm">' +
        '<i class="fas fa-check mr-1"></i> ' + _escapeHTML(confirmText) +
        '</button>' +
        '</div>' +
        '</div>' +
        '</div>' +
        '</div>';

      container.innerHTML = html;

      var backdrop = container.querySelector(".sisurat-modal-backdrop");
      var dialog = container.querySelector(".sisurat-modal-dialog");
      var confirmBtn = container.querySelector('[data-action="confirm"]');
      var cancelBtn = container.querySelector('[data-action="cancel"]');
      var input = container.querySelector(".sisurat-modal__input");

      requestAnimationFrame(function () {
        backdrop.classList.add("sisurat-modal-backdrop--visible");
        dialog.classList.add("sisurat-modal-dialog--visible");
      });

      function cleanup(result) {
        _activeModalCleanup = null;
        dialog.classList.remove("sisurat-modal-dialog--visible");
        dialog.classList.add("sisurat-modal-dialog--exit");
        backdrop.classList.remove("sisurat-modal-backdrop--visible");
        backdrop.classList.add("sisurat-modal-backdrop--exit");
        document.removeEventListener("keydown", onKey);
        setTimeout(function () {
          container.innerHTML = "";
        }, 300);
        resolve(result);
      }

      _activeModalCleanup = function () { cleanup(null); };

      confirmBtn.addEventListener("click", function () {
        var val = input.value.trim();
        cleanup(val || null);
      });

      cancelBtn.addEventListener("click", function () { cleanup(null); });

      backdrop.addEventListener("click", function (e) {
        if (e.target === backdrop) cleanup(null);
      });

      function onKey(e) {
        if (e.key === "Escape") cleanup(null);
        if (e.key === "Enter") {
          var val = input.value.trim();
          cleanup(val || null);
        }
      }
      document.addEventListener("keydown", onKey);

      // Focus input
      setTimeout(function () { input.focus(); }, 100);
    });
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  global.SisuratUI = {
    showToast: showToast,
    showError: showError,
    showConfirm: showConfirm,
    showPrompt: showPrompt,
    mapError: mapError,
    ERROR_MAP: ERROR_MAP,
  };

  // ─── Auto-Init — readyState-aware ───────────────────────────────────────────
  //
  // Di production dengan aset ter-cache, event DOMContentLoaded bisa sudah
  // fired sebelum listener ini didaftarkan (karena script dimuat dari cache
  // sangat cepat). Pattern ini memeriksa readyState terlebih dahulu sehingga
  // installApiInterceptor dipanggil dalam kondisi apapun.

  function _runOnDomReady(fn) {
    if (document.readyState === "loading") {
      // DOM belum selesai — daftarkan listener normal
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      // DOM sudah selesai ('interactive' atau 'complete') — panggil langsung
      fn();
    }
  }

  _runOnDomReady(function () {
    syncMobileUsername();
    initSuperAdminSidebar();
    showActiveDivisiBadge();
    installApiInterceptor();
  });
})(window);
