/**
 * shield.guard.js — Policy enforcement: can() / cannot()
 * Memeriksa permission user aktif sebelum merender elemen UI.
 * Inspired by BezhanSalleh/filament-shield
 */
(function initShieldGuard(global) {
  "use strict";

  let _store = null;
  let _initChecksum = null; // checksum saat inisialisasi untuk deteksi tamper

  // ── Checksum ringan untuk deteksi tamper (Known Limitation 1 mitigation) ──
  function _computeRoleHash(roles) {
    if (!Array.isArray(roles)) return "";
    const snapshot = roles.map((r) => `${r.id}:${r.is_super_admin}:${(r.permissions || []).join(",")}`).join("|");
    // simple djb2 hash (bukan kriptografis, hanya deteksi perubahan tidak sengaja)
    let h = 5381;
    for (let i = 0; i < snapshot.length; i++) {
      h = (h * 33) ^ snapshot.charCodeAt(i);
    }
    return (h >>> 0).toString(16);
  }

  /**
   * Periksa apakah konfigurasi roles di store berbeda dari checksum inisialisasi.
   * Jika berbeda, kemungkinan ada manipulasi via DevTools.
   * @returns {boolean} true jika terdeteksi tamper
   */
  function detectTamper() {
    if (!_store || !_initChecksum) return false;
    const currentHash = _computeRoleHash(_store.getAllRoles());
    return currentHash !== _initChecksum;
  }

  function init(store) {
    _store = store || global.ShieldStore;
    if (!_store) {
      console.warn("[ShieldGuard] ShieldStore tidak tersedia.");
      return;
    }
    _store.init();

    // Simpan checksum awal untuk deteksi tamper
    _initChecksum = _computeRoleHash(_store.getAllRoles());

    // ⚠️ Security Warning — Known Limitation 1
    /* eslint-disable no-console */
    console.warn(
      "%c[ShieldGuard] ⚠️ PERINGATAN KEAMANAN — CLIENT-SIDE RBAC",
      "color:#e11d48;font-weight:bold;font-size:12px;",
      "\n\nRBAC ini berjalan sepenuhnya di sisi client (localStorage).\n" +
      "Konfigurasi role DAPAT dimanipulasi via DevTools > Application > localStorage.\n" +
      "Ini adalah KNOWN LIMITATION (lihat known_limitations di PRD Permission-Shield).\n\n" +
      "MITIGASI yang sudah diterapkan:\n" +
      "  ✓ Role checksum detection (detectTamper())\n" +
      "  ✓ Session verification via SisuratAuth.verifyRoleFromServer()\n" +
      "  ✗ Server-side validation belum diimplementasikan (perlu GAS endpoint)\n"
    );
    /* eslint-enable no-console */
  }

  /**
   * Periksa apakah user aktif memiliki permission tertentu.
   * @param {string} permission - nama permission (contoh: "view_surat", "create_user")
   * @returns {boolean}
   */
  function can(permission) {
    if (!_store) return false;
    const roles = _store.getCurrentUserRoles();
    if (!roles || roles.length === 0) return false;

    // Super Admin bypass — akses semua tanpa cek
    if (roles.some((r) => r.is_super_admin)) return true;

    // Kumpulkan union permission dari semua role milik user
    const allPerms = new Set(roles.flatMap((r) => r.permissions || []));

    // Cek apakah permission ada (bisa berupa ID perm atau nama perm)
    if (allPerms.has(permission)) return true;

    // Fallback: cari berdasarkan name field
    const allPermObjects = _store.getAllPermissions();
    const permObj = allPermObjects.find(
      (p) => p.name === permission || p.id === permission
    );
    if (permObj && allPerms.has(permObj.id)) return true;

    return false;
  }

  function cannot(permission) {
    return !can(permission);
  }

  /**
   * Periksa apakah user aktif adalah Super Admin
   */
  function isSuperAdmin() {
    if (!_store) return false;
    const roles = _store.getCurrentUserRoles();
    return roles.some((r) => r.is_super_admin);
  }

  /**
   * Terapkan directive [data-shield] ke semua elemen di document.
   * Mode hide (default): sembunyikan elemen jika tidak punya permission.
   * Mode disable: disable elemen (masih tampil tapi tidak bisa diklik).
   *
   * Usage di HTML:
   *   <button data-shield="create_surat">Tambah</button>
   *   <button data-shield="delete_user" data-shield-mode="disable">Hapus</button>
   */
  function applyDirectives(root) {
    const target = root || document;
    target.querySelectorAll("[data-shield]").forEach((el) => {
      const perm = el.dataset.shield;
      const mode = el.dataset.shieldMode || "hide";
      const superOnly = el.dataset.shieldSuperadmin === "true";

      const allowed = superOnly ? isSuperAdmin() : can(perm);

      if (!allowed) {
        if (mode === "disable") {
          el.disabled = true;
          el.classList.add("shield-disabled");
          el.setAttribute("title", "Anda tidak memiliki akses untuk aksi ini.");
        } else {
          el.style.display = "none";
        }
      } else {
        // Pastikan elemen tampil jika sebelumnya di-hide
        if (el.style.display === "none") el.style.removeProperty("display");
        el.classList.remove("shield-disabled");
        if (el.disabled === true) el.disabled = false;
      }
    });
  }

  global.ShieldGuard = {
    init,
    can,
    cannot,
    isSuperAdmin,
    applyDirectives,
    detectTamper,
  };
})(window);
