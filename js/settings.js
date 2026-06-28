(function initSettingsPage(global) {
  "use strict";

  const { SisuratApi, SisuratAuth, SisuratUI } = global;

  if (!SisuratApi || !SisuratAuth || !SisuratUI) {
    console.error("Module API/Auth/UI belum dimuat.");
    return;
  }

  function checkAccess() {
    const isSuper = SisuratAuth.isSuperAdmin();
    const noAccessBanner = document.getElementById("no-access-banner");
    const mainContent = document.getElementById("settings-main-content");

    if (!isSuper) {
      if (noAccessBanner) noAccessBanner.classList.remove("hidden");
      if (mainContent) mainContent.classList.add("hidden");
      return false;
    } else {
      if (noAccessBanner) noAccessBanner.classList.add("hidden");
      if (mainContent) mainContent.classList.remove("hidden");
      return true;
    }
  }

  async function loadTargetDivisiOptions(selectedDivisiCode) {
    const select = document.getElementById("settings-target-divisi");
    if (!select) return;

    try {
      const res = await SisuratApi.getData("db_divisi");
      if (res && res.status === "success" && Array.isArray(res.data)) {
        // Clear options except first
        select.innerHTML = '<option value="">-- Pilih Target Divisi --</option>';
        res.data.forEach((div) => {
          const isActive = String(div.status).toLowerCase() === "active" || String(div.status).toLowerCase() === "aktif";
          if (isActive) {
            const opt = document.createElement("option");
            opt.value = div.kode_divisi;
            opt.textContent = `${div.kode_divisi} - ${div.nama_divisi}`;
            select.appendChild(opt);
          }
        });
        if (selectedDivisiCode) {
          select.value = selectedDivisiCode;
        }
      }
    } catch (err) {
      console.error("Gagal mengambil daftar divisi:", err);
      SisuratUI.showToast("Gagal memuat daftar divisi.", "error");
    }
  }

  async function loadSettings() {
    const submitBtn = document.getElementById("settings-submit-btn");
    const originalHTML = submitBtn ? submitBtn.innerHTML : "";

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Memuat...';
    }

    try {
      const res = await SisuratApi.getSettings();
      if (res && res.status === "success" && res.settings) {
        const s = res.settings;
        document.getElementById("settings-app-name").value = s.app_name || "";
        document.getElementById("settings-nama-instansi").value = s.nama_instansi || "";
        document.getElementById("settings-logo-url").value = s.logo_url || "";

        // Load target division options and set the selected value
        await loadTargetDivisiOptions(s.public_piagam_target_divisi);
      } else {
        SisuratUI.showToast("Gagal mengambil data pengaturan.", "error");
      }
    } catch (err) {
      console.error(err);
      SisuratUI.showToast("Terjadi kesalahan koneksi.", "error");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalHTML;
      }
    }
  }

  async function submitSettings() {
    const submitBtn = document.getElementById("settings-submit-btn");
    const originalHTML = submitBtn.innerHTML;

    const settingsObj = {
      app_name: document.getElementById("settings-app-name").value.trim(),
      nama_instansi: document.getElementById("settings-nama-instansi").value.trim(),
      logo_url: document.getElementById("settings-logo-url").value.trim(),
      public_piagam_target_divisi: document.getElementById("settings-target-divisi").value
    };

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';

    try {
      const res = await SisuratApi.updateSettings(settingsObj);
      if (res && res.status === "success") {
        SisuratUI.showToast("Pengaturan berhasil disimpan!", "success");
        // Reload settings to ensure everything is synchronized
        await loadSettings();
      } else {
        SisuratUI.showToast(res.message || "Gagal menyimpan pengaturan.", "error");
      }
    } catch (err) {
      console.error(err);
      SisuratUI.showToast("Terjadi kesalahan koneksi.", "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalHTML;
    }
  }

  function logout() {
    SisuratAuth.logoutToHome();
  }

  function init() {
    const user = SisuratAuth.requireAuth();
    if (!user) return;

    if (checkAccess()) {
      loadSettings();
    }
  }

  global.submitSettings = submitSettings;
  global.logout = logout;
  global.addEventListener("load", init);
})(window);
