(function initDivisiPage(global) {
  "use strict";

  const { SisuratApi, SisuratAuth } = global;

  if (!SisuratApi || !SisuratAuth) {
    console.error("Module API/Auth belum dimuat.");
    return;
  }

  let rawDivisiData = [];

  function checkAccess() {
    const isSuper = SisuratAuth.isSuperAdmin();
    const noAccessBanner = document.getElementById("no-access-banner");
    const mainContent = document.getElementById("divisi-main-content");

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

  async function loadDivisi() {
    const loadingEl = document.getElementById("div-loading");
    const emptyEl = document.getElementById("div-empty");
    const wrapperEl = document.getElementById("div-table-wrapper");
    const tbody = document.getElementById("div-tbody");

    if (loadingEl) loadingEl.classList.remove("hidden");
    if (emptyEl) emptyEl.classList.add("hidden");
    if (wrapperEl) wrapperEl.classList.add("hidden");

    try {
      const res = await SisuratApi.getData("db_divisi");
      if (res && res.status === "success" && Array.isArray(res.data)) {
        rawDivisiData = res.data;
        localStorage.setItem("sisurat_divisions", JSON.stringify(res.data));
        renderTable(rawDivisiData);
      } else {
        showError("Gagal mengambil data divisi.");
      }
    } catch (error) {
      console.error(error);
      showError("Terjadi kesalahan jaringan.");
    } finally {
      if (loadingEl) loadingEl.classList.add("hidden");
    }
  }

  function renderTable(data) {
    const emptyEl = document.getElementById("div-empty");
    const wrapperEl = document.getElementById("div-table-wrapper");
    const tbody = document.getElementById("div-tbody");

    if (!data || data.length === 0) {
      if (emptyEl) emptyEl.classList.remove("hidden");
      if (wrapperEl) wrapperEl.classList.add("hidden");
      return;
    }

    if (emptyEl) emptyEl.classList.add("hidden");
    if (wrapperEl) wrapperEl.classList.remove("hidden");

    tbody.innerHTML = data.map((div, idx) => {
      const isPending = String(div.status).toLowerCase() === "pending";
      const isActive = String(div.status).toLowerCase() === "active" || String(div.status).toLowerCase() === "aktif";
      const isInactive = String(div.status).toLowerCase() === "inactive";

      let statusBadge = "";
      let actions = "";

      if (isActive) {
        statusBadge = '<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200"><span class="w-1.5 h-1.5 rounded-full bg-green-500"></span>Aktif</span>';
        actions = `
          <div class="flex items-center justify-end gap-2">
            <button onclick="divDeactivate('${div.kode_divisi}', this)" class="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-600 rounded-lg text-xs font-bold transition-all flex items-center gap-1 border border-amber-200">
              <i class="fas fa-ban"></i> Nonaktifkan
            </button>
          </div>
        `;
      } else if (isInactive) {
        statusBadge = '<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200"><span class="w-1.5 h-1.5 rounded-full bg-red-500"></span>Nonaktif</span>';
        actions = '<span class="text-xs text-gray-400 font-semibold italic">Dinonaktifkan</span>';
      } else if (isPending) {
        statusBadge = '<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 animate-pulse"><span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>Pending</span>';
        actions = `
          <div class="flex items-center justify-end gap-2">
            <button onclick="divRetry('${div.kode_divisi}', this)" class="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-xs font-bold transition-all flex items-center gap-1 border border-blue-200">
              <i class="fas fa-sync-alt"></i> Retry
            </button>
            <button onclick="divCleanup('${div.kode_divisi}', this)" class="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-xs font-bold transition-all flex items-center gap-1 border border-red-200">
              <i class="fas fa-trash-alt"></i> Cleanup
            </button>
          </div>
        `;
      } else {
        statusBadge = `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-gray-50 text-gray-700 border border-gray-200">${div.status || "Unknown"}</span>`;
        actions = `<span class="text-xs text-gray-400">—</span>`;
      }

      const folderId = div.drive_folder_id || "—";
      const createdBy = div.created_by || "System";
      const createdAt = div.created_at ? new Date(div.created_at).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric"
      }) : "—";

      return `
        <tr class="hover:bg-gray-50/50 transition-all duration-150">
          <td class="px-5 py-4 font-medium text-gray-400">${idx + 1}</td>
          <td class="px-5 py-4 font-extrabold text-[#222831] font-outfit tracking-wide">${div.kode_divisi}</td>
          <td class="px-5 py-4 text-[#393E46] font-medium">${div.nama_divisi}</td>
          <td class="px-5 py-4 text-center">${statusBadge}</td>
          <td class="px-5 py-4 font-mono text-xs text-gray-400 select-all truncate max-w-[200px]" title="${folderId}">${folderId}</td>
          <td class="px-5 py-4">
            <div class="text-xs font-bold text-[#393E46]">${createdBy}</div>
            <div class="text-[10px] text-gray-400">${createdAt}</div>
          </td>
          <td class="px-5 py-4 text-right">${actions}</td>
        </tr>
      `;
    }).join("");
  }

  function divFilterTable(query) {
    const q = String(query).toLowerCase().trim();
    if (!q) {
      renderTable(rawDivisiData);
      return;
    }
    const filtered = rawDivisiData.filter(div =>
      String(div.kode_divisi).toLowerCase().includes(q) ||
      String(div.nama_divisi).toLowerCase().includes(q)
    );
    renderTable(filtered);
  }

  function divOpenModal() {
    const modal = document.getElementById("divisi-modal");
    const form = document.getElementById("divisi-form");
    const alertBox = document.getElementById("divisi-modal-alert");
    
    if (form) form.reset();
    if (alertBox) alertBox.classList.add("hidden");
    if (modal) modal.classList.remove("hidden");
  }

  function divCloseModalDirect() {
    const modal = document.getElementById("divisi-modal");
    if (modal) modal.classList.add("hidden");
  }

  function divCloseModal(event) {
    if (event.target === document.getElementById("divisi-modal")) {
      divCloseModalDirect();
    }
  }

  function showAlert(msg, type = "success") {
    const alertBox = document.getElementById("divisi-modal-alert");
    if (!alertBox) return;

    alertBox.className = `mb-4 px-4 py-3 rounded-xl text-sm font-semibold flex items-center gap-2 ${
      type === "error" ? "bg-red-50 text-red-700 border border-red-200" : "bg-green-50 text-green-700 border border-green-200"
    }`;
    alertBox.innerHTML = `<i class="fas ${type === "error" ? "fa-exclamation-circle" : "fa-check-circle"}"></i> <span>${msg}</span>`;
    alertBox.classList.remove("hidden");
  }

  async function divSubmitForm() {
    const kodeInput = document.getElementById("input-kode-divisi");
    const namaInput = document.getElementById("input-nama-divisi");
    const submitBtn = document.getElementById("divisi-submit-btn");

    const kode = kodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "").trim();
    const nama = namaInput.value.trim();

    if (!kode || !nama) {
      showAlert("Kode dan Nama divisi wajib diisi.", "error");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Memproses...';

    try {
      const res = await SisuratApi.postAction("init_divisi", {
        kode_divisi: kode,
        nama_divisi: nama
      });

      if (res && res.status === "success") {
        showAlert("Divisi berhasil dibuat & di-provision!");
        setTimeout(() => {
          divCloseModalDirect();
          loadDivisi();
        }, 1500);
      } else {
        showAlert(res.message || "Gagal membuat divisi.", "error");
      }
    } catch (error) {
      console.error(error);
      showAlert("Terjadi kesalahan jaringan/server.", "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fas fa-save"></i> Tambah';
    }
  }

  async function divRetry(kode_divisi, btn) {
    const confirmed = await SisuratUI.showConfirm({
      type: "warning",
      title: "Retry Provisioning",
      message: `Apakah Anda yakin ingin mencoba ulang provisioning divisi ${kode_divisi}?`,
      confirmText: "Ya, Retry",
      cancelText: "Batal",
    });
    if (!confirmed) return;

    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Retry...';

    try {
      const res = await SisuratApi.postAction("retry_init_divisi", { kode_divisi });
      if (res && res.status === "success") {
        SisuratUI.showToast(`Divisi ${kode_divisi} berhasil di-provision!`, "success");
        loadDivisi();
      } else {
        SisuratUI.showToast(res.message || `Gagal retry divisi ${kode_divisi}.`, "error");
      }
    } catch (error) {
      console.error(error);
      SisuratUI.showToast("Terjadi kesalahan koneksi.", "error");
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalHTML;
    }
  }

  async function divCleanup(kode_divisi, btn) {
    const confirmed = await SisuratUI.showConfirm({
      type: "danger",
      title: "Cleanup Divisi",
      message: `WARNING: Anda akan menghapus provisioning pending untuk ${kode_divisi}. Aksi ini tidak dapat dibatalkan!`,
      confirmText: "Ya, Cleanup",
      cancelText: "Batal",
    });
    if (!confirmed) return;

    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Cleanup...';

    try {
      const res = await SisuratApi.postAction("cleanup_divisi", { kode_divisi });
      if (res && res.status === "success") {
        SisuratUI.showToast(`Divisi ${kode_divisi} berhasil dibersihkan.`, "success");
        loadDivisi();
      } else {
        SisuratUI.showToast(res.message || `Gagal membersihkan divisi ${kode_divisi}.`, "error");
      }
    } catch (error) {
      console.error(error);
      SisuratUI.showToast("Terjadi kesalahan koneksi.", "error");
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalHTML;
    }
  }

  async function divDeactivate(kode_divisi, btn) {
    const confirmed = await SisuratUI.showConfirm({
      type: "warning",
      title: "Nonaktifkan Divisi",
      message: `Apakah Anda yakin ingin menonaktifkan divisi ${kode_divisi}? Operator dan admin divisi ini tidak akan dapat login atau mengakses data.`,
      confirmText: "Ya, Nonaktifkan",
      cancelText: "Batal",
    });
    if (!confirmed) return;

    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Memproses...';

    try {
      const res = await SisuratApi.postAction("deactivate_divisi", { kode_divisi });
      if (res && res.status === "success") {
        localStorage.removeItem("sisurat_divisions");
        SisuratUI.showToast(`Divisi ${kode_divisi} dinonaktifkan.`, "success");
        loadDivisi();
      } else {
        SisuratUI.showToast(res.message || `Gagal menonaktifkan divisi ${kode_divisi}.`, "error");
      }
    } catch (error) {
      console.error(error);
      SisuratUI.showToast("Terjadi kesalahan koneksi.", "error");
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalHTML;
    }
  }

  function logout() {
    SisuratAuth.logoutToHome();
  }

  function init() {
    if (checkAccess()) {
      loadDivisi();
    }
  }

  // Bind globals for inline onclick handlers
  global.divOpenModal = divOpenModal;
  global.divCloseModalDirect = divCloseModalDirect;
  global.divCloseModal = divCloseModal;
  global.divSubmitForm = divSubmitForm;
  global.divFilterTable = divFilterTable;
  global.divRetry = divRetry;
  global.divCleanup = divCleanup;
  global.divDeactivate = divDeactivate;
  global.logout = logout;

  global.addEventListener("load", init);
})(window);
