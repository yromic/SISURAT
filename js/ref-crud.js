(function initRefCrud(global) {
  "use strict";

  const { SisuratApi, SisuratAuth } = global;
  if (!SisuratApi) {
    console.error("[ref-crud] SisuratApi belum dimuat.");
    return;
  }

  // ─── Konfigurasi Tiap Tab ──────────────────────────────────────────────────
  const TAB_CONFIG = {
    sekolah: {
      table: "ref_sekolah",
      label: "Nama Sekolah",
      panelSub: "Data sekolah untuk dropdown formulir Piagam",
      fieldLabel: "Nama Sekolah",
      namaKey: "nama_sekolah",
      placeholder: "Cth: SMP NEGERI 1 AMBARAWA",
      counterId: "count-sekolah",
    },
    pengambilan: {
      table: "ref_pengambilan",
      label: "Jenis Pengambilan",
      panelSub: "Pilihan jenis pengambilan pada formulir Piagam",
      fieldLabel: "Jenis Pengambilan",
      namaKey: "nama",
      placeholder: "Cth: Piagam, Piala, Medali...",
      counterId: "count-pengambilan",
    },
    perlombaan: {
      table: "ref_jenis_perlombaan",
      label: "Jenis Perlombaan",
      panelSub: "Daftar kompetisi untuk dropdown Kelas Kompetisi",
      fieldLabel: "Nama Perlombaan / Kompetisi",
      namaKey: "nama",
      placeholder: "Cth: O2SN/KOSN, FLS2N, MAPSI...",
      counterId: "count-perlombaan",
    },
  };

  // ─── State ─────────────────────────────────────────────────────────────────
  let currentTab = "sekolah";
  let currentData = [];
  let filteredData = [];

  // ─── Helpers UI ────────────────────────────────────────────────────────────
  function setLoading(show) {
    const loading = document.getElementById("ref-loading");
    const empty = document.getElementById("ref-empty");
    const wrapper = document.getElementById("ref-table-wrapper");
    const counter = document.getElementById("ref-counter");
    if (loading) loading.classList.toggle("hidden", !show);
    if (empty) { empty.classList.add("hidden"); empty.classList.remove("flex"); }
    if (wrapper) wrapper.classList.add("hidden");
    if (counter) counter.classList.add("hidden");
  }

  function renderTable(data) {
    const cfg = TAB_CONFIG[currentTab];
    const tbody = document.getElementById("ref-tbody");
    const colLabel = document.getElementById("ref-col-label");
    const loading = document.getElementById("ref-loading");
    const empty = document.getElementById("ref-empty");
    const wrapper = document.getElementById("ref-table-wrapper");
    const counter = document.getElementById("ref-counter");

    if (colLabel) colLabel.textContent = cfg.fieldLabel;
    if (loading) loading.classList.add("hidden");

    if (!data || data.length === 0) {
      if (empty) { empty.classList.remove("hidden"); empty.classList.add("flex"); }
      if (wrapper) wrapper.classList.add("hidden");
      if (counter) counter.classList.add("hidden");
      return;
    }

    if (empty) { empty.classList.add("hidden"); empty.classList.remove("flex"); }
    if (wrapper) wrapper.classList.remove("hidden");

    if (counter) {
      const aktifCount = data.filter(r => String(r.aktif).toUpperCase() === "TRUE").length;
      counter.textContent = `${data.length} data · ${aktifCount} aktif`;
      counter.classList.remove("hidden");
    }

    if (!tbody) return;
    tbody.innerHTML = data
      .map((row, idx) => {
        const nama = row[cfg.namaKey] || "-";
        const aktif = String(row.aktif).toUpperCase() === "TRUE";
        const rowNum = row.row_number;
        const safeNama = nama.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

        return `
          <tr class="hover:bg-gray-50/80 transition-colors group">
            <td class="px-5 py-3.5 text-gray-400 font-medium text-sm">${idx + 1}</td>
            <td class="px-5 py-3.5 font-semibold text-[#222831] text-sm">${nama}</td>
            <td class="px-5 py-3.5 text-center">
              ${aktif
                ? '<span class="inline-flex items-center gap-1.5 px-3 py-1 bg-green-50 text-green-700 text-xs font-bold rounded-full border border-green-100"><i class="fas fa-circle text-[6px]"></i> Aktif</span>'
                : '<span class="inline-flex items-center gap-1.5 px-3 py-1 bg-red-50 text-red-500 text-xs font-bold rounded-full border border-red-100"><i class="fas fa-circle text-[6px]"></i> Non-aktif</span>'
              }
            </td>
            <td class="px-5 py-3.5 text-right">
              <div class="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onclick="refEdit(${rowNum}, '${safeNama}', '${aktif ? "TRUE" : "FALSE"}')"
                  class="w-8 h-8 rounded-lg bg-blue-50 hover:bg-blue-500 text-blue-500 hover:text-white flex items-center justify-center transition-all text-xs"
                  title="Edit"
                ><i class="fas fa-pencil-alt"></i></button>
                <button
                  onclick="refHapus(${rowNum}, '${safeNama}')"
                  class="w-8 h-8 rounded-lg bg-red-50 hover:bg-red-500 text-red-500 hover:text-white flex items-center justify-center transition-all text-xs"
                  title="Hapus"
                ><i class="fas fa-trash"></i></button>
              </div>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  // ─── Update Info Card counter ───────────────────────────────────────────────
  async function loadAllCounts() {
    for (const [key, cfg] of Object.entries(TAB_CONFIG)) {
      try {
        const url = `${SisuratApi.BASE_URL}?action=get_data&table=${encodeURIComponent(cfg.table)}`;
        const res = await fetch(url);
        const result = await res.json();
        const rows = Array.isArray(result.data) ? result.data : [];
        const aktif = rows.filter(r => String(r.aktif).toUpperCase() === "TRUE").length;
        const el = document.getElementById(cfg.counterId);
        if (el) el.textContent = `${aktif} aktif / ${rows.length} total`;
      } catch (_) {}
    }
  }

  // ─── Filter tabel berdasarkan input search ──────────────────────────────────
  function refFilterTable(keyword) {
    const cfg = TAB_CONFIG[currentTab];
    if (!keyword.trim()) {
      filteredData = currentData;
    } else {
      const kw = keyword.toLowerCase();
      filteredData = currentData.filter(row =>
        String(row[cfg.namaKey] || "").toLowerCase().includes(kw)
      );
    }
    renderTable(filteredData);
  }

  // ─── Load Data Tab Aktif ───────────────────────────────────────────────────
  async function loadTabData() {
    const cfg = TAB_CONFIG[currentTab];
    setLoading(true);

    // Reset search
    const searchEl = document.getElementById("ref-search");
    if (searchEl) searchEl.value = "";

    try {
      const url = `${SisuratApi.BASE_URL}?action=get_data&table=${encodeURIComponent(cfg.table)}`;
      const res = await fetch(url);
      const result = await res.json();
      currentData = Array.isArray(result.data) ? result.data : [];
      filteredData = currentData;
      renderTable(filteredData);
    } catch (err) {
      setLoading(false);
      console.error("[ref-crud] Gagal fetch:", err);
    }
  }

  // ─── Switch Tab ────────────────────────────────────────────────────────────
  function refSwitchTab(tab) {
    currentTab = tab;
    const cfg = TAB_CONFIG[tab];

    // Update panel title & subtitle
    const title = document.getElementById("ref-panel-title");
    const sub = document.getElementById("ref-panel-sub");
    if (title) title.textContent = cfg.label;
    if (sub) sub.textContent = cfg.panelSub;

    // Update tab button styles
    document.querySelectorAll(".ref-tab-btn").forEach((btn) => {
      btn.classList.remove("border-[#00ADB5]", "text-[#00ADB5]", "bg-[#00ADB5]/5");
      btn.classList.add("border-transparent", "text-gray-400");
    });
    const activeBtn = document.getElementById(`tab-${tab}`);
    if (activeBtn) {
      activeBtn.classList.remove("border-transparent", "text-gray-400");
      activeBtn.classList.add("border-[#00ADB5]", "text-[#00ADB5]", "bg-[#00ADB5]/5");
    }

    // Update info card highlight
    document.querySelectorAll(".ref-info-card").forEach(c => {
      c.classList.remove("border-[#00ADB5]", "shadow-[0_4px_20px_rgba(0,173,181,0.15)]");
      c.classList.add("border-gray-100");
    });
    const cardMap = { sekolah: 0, pengambilan: 1, perlombaan: 2 };
    const cards = document.querySelectorAll(".ref-info-card");
    if (cards[cardMap[tab]]) {
      cards[cardMap[tab]].classList.add("border-[#00ADB5]", "shadow-[0_4px_20px_rgba(0,173,181,0.15)]");
      cards[cardMap[tab]].classList.remove("border-gray-100");
    }

    loadTabData();
  }

  // ─── Buka Modal Tambah ──────────────────────────────────────────────────────
  function refTambah() {
    const cfg = TAB_CONFIG[currentTab];
    document.getElementById("ref-modal-title").textContent = `Tambah ${cfg.label}`;
    document.getElementById("ref-modal-icon").className = "fas fa-plus text-[#00ADB5]";
    document.getElementById("ref-field-label").textContent = cfg.fieldLabel;
    document.getElementById("ref-input-nama").placeholder = cfg.placeholder;
    document.getElementById("ref-input-nama").value = "";
    document.getElementById("ref-edit-id").value = "";
    document.getElementById("ref-edit-row").value = "";
    document.querySelector('input[name="ref-aktif"][value="TRUE"]').checked = true;
    hideModalAlert();
    openModal();
    setTimeout(() => document.getElementById("ref-input-nama").focus(), 100);
  }

  // ─── Buka Modal Edit ────────────────────────────────────────────────────────
  function refEdit(rowNum, nama, aktif) {
    const cfg = TAB_CONFIG[currentTab];
    document.getElementById("ref-modal-title").textContent = `Edit ${cfg.label}`;
    document.getElementById("ref-modal-icon").className = "fas fa-pencil-alt text-blue-500";
    document.getElementById("ref-field-label").textContent = cfg.fieldLabel;
    document.getElementById("ref-input-nama").placeholder = cfg.placeholder;
    document.getElementById("ref-input-nama").value = nama;
    document.getElementById("ref-edit-row").value = rowNum;
    const radioAktif = document.querySelector(`input[name="ref-aktif"][value="${aktif}"]`);
    if (radioAktif) radioAktif.checked = true;
    hideModalAlert();
    openModal();
    setTimeout(() => document.getElementById("ref-input-nama").focus(), 100);
  }

  function openModal() {
    const modal = document.getElementById("ref-modal");
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }

  // ─── Tutup Modal ───────────────────────────────────────────────────────────
  function refCloseModal(event) {
    const modal = document.getElementById("ref-modal");
    if (event.target === modal || event.target.classList.contains("absolute")) {
      refCloseModalDirect();
    }
  }

  function refCloseModalDirect() {
    const modal = document.getElementById("ref-modal");
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  }

  // ─── Alert dalam Modal ─────────────────────────────────────────────────────
  function showModalAlert(type, msg) {
    const el = document.getElementById("ref-modal-alert");
    el.className = `mb-4 px-4 py-3 rounded-xl text-sm font-semibold flex items-center gap-2 ${
      type === "success"
        ? "bg-green-50 text-green-700 border border-green-100"
        : "bg-red-50 text-red-600 border border-red-100"
    }`;
    el.innerHTML = `<i class="fas ${type === "success" ? "fa-check-circle" : "fa-exclamation-circle"}"></i> ${msg}`;
    el.classList.remove("hidden");
  }

  function hideModalAlert() {
    const el = document.getElementById("ref-modal-alert");
    if (el) el.classList.add("hidden");
  }

  // ─── Simpan (Tambah / Edit) ─────────────────────────────────────────────────
  async function refSimpan() {
    const cfg = TAB_CONFIG[currentTab];
    const namaVal = document.getElementById("ref-input-nama").value.trim();
    const aktifVal = document.querySelector('input[name="ref-aktif"]:checked').value;
    const rowNum = document.getElementById("ref-edit-row").value;
    const submitBtn = document.getElementById("ref-submit-btn");
    const isEdit = !!rowNum;

    if (!namaVal) {
      showModalAlert("error", "Nama tidak boleh kosong.");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';
    hideModalAlert();

    try {
      let result;
      const payload = { aktif: aktifVal };
      payload[cfg.namaKey] = namaVal;

      if (isEdit) {
        result = await SisuratApi.updateRecord(cfg.table, rowNum, payload);
      } else {
        result = await SisuratApi.saveRecord(cfg.table, payload);
      }

      if (result && result.status === "success") {
        showModalAlert("success", isEdit ? "Data berhasil diperbarui!" : "Data berhasil ditambahkan!");
        // Invalidasi cache agar piagam.html fetch ulang
        SisuratApi.invalidateRef(cfg.table);

        setTimeout(async () => {
          refCloseModalDirect();
          await loadTabData();
          await loadAllCounts();
        }, 800);
      } else {
        showModalAlert("error", result?.message || "Gagal menyimpan data.");
      }
    } catch (err) {
      console.error("[ref-crud] Gagal simpan:", err);
      showModalAlert("error", "Terjadi kesalahan jaringan.");
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fas fa-save"></i> Simpan';
    }
  }

  // ─── Hapus ─────────────────────────────────────────────────────────────────
  async function refHapus(rowNum, nama) {
    const cfg = TAB_CONFIG[currentTab];
    const confirmed = window.confirm(
      `Hapus "${nama}" dari ${cfg.label}?\n\nData tidak bisa dikembalikan.`
    );
    if (!confirmed) return;

    try {
      const result = await SisuratApi.deleteRecord(cfg.table, rowNum);
      if (result && result.status === "success") {
        SisuratApi.invalidateRef(cfg.table);
        await loadTabData();
        await loadAllCounts();
      } else {
        alert("Gagal menghapus: " + (result?.message || "Error tidak diketahui"));
      }
    } catch (err) {
      console.error("[ref-crud] Gagal hapus:", err);
      alert("Terjadi kesalahan jaringan saat menghapus.");
    }
  }

  // ─── Logout ────────────────────────────────────────────────────────────────
  function logout() {
    if (SisuratAuth) SisuratAuth.logoutToHome();
  }

  // ─── Init ──────────────────────────────────────────────────────────────────
  function init() {
    // Cek auth jika SisuratAuth tersedia
    if (SisuratAuth) {
      const user = SisuratAuth.requireAuth();
      if (!user) return;
    }

    // Hanya jalankan jika panel ada di DOM
    if (!document.getElementById("panel-referensi")) return;

    // Load data tab aktif + semua counter
    refSwitchTab("sekolah");
    loadAllCounts();
  }

  // ─── Expose ke global ──────────────────────────────────────────────────────
  global.refSwitchTab = refSwitchTab;
  global.refTambah = refTambah;
  global.refEdit = refEdit;
  global.refHapus = refHapus;
  global.refSimpan = refSimpan;
  global.refFilterTable = refFilterTable;
  global.refCloseModal = refCloseModal;
  global.refCloseModalDirect = refCloseModalDirect;
  global.logout = global.logout || logout; // tidak override logout yg sudah ada

  global.addEventListener("load", init);
})(window);
