/**
 * sidebar-init.js — Helper inisialisasi sidebar untuk semua halaman protected.
 * Menampilkan/menyembunyikan menu Super Admin berdasarkan role user aktif.
 * Disertakan setelah shield.guard.js di semua halaman.
 */
(function initSidebarSuperAdmin() {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    // Pastikan ShieldStore & ShieldGuard sudah termuat
    if (
      typeof ShieldStore === "undefined" ||
      typeof ShieldGuard === "undefined"
    ) {
      return;
    }

    ShieldStore.init();
    ShieldGuard.init(ShieldStore);

    if (ShieldGuard.isSuperAdmin()) {
      // Tampilkan section Super Admin di sidebar
      const saSection = document.getElementById("sidebar-superadmin-section");
      if (saSection) saSection.classList.remove("hidden");
    }

    // Terapkan directive data-shield di seluruh halaman
    ShieldGuard.applyDirectives();
  });
})();
