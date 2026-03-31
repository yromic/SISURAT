(function initMasterPage(global) {
  "use strict";

  const { SisuratApi, SisuratAuth } = global;

  if (!SisuratApi || !SisuratAuth) {
    console.error("Module API/Auth belum dimuat.");
    return;
  }

  // ─── Constants ────────────────────────────────────────────────────────────────
  const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
  const DEBOUNCE_MS = 300;

  // Tab ke nama tabel
  const TAB_TABLE = {
    piagam: "db_piagam",
    masuk: "db_surat_masuk",
    keluar: "db_surat_keluar",
  };

  // Kolom yang ditampilkan di DataTable per tab
  const TABLE_COLUMNS = {
    piagam: [
      { key: "tahun_perlombaan", label: "Tahun" },
      { key: "jenis_perlombaan", label: "Jenis Perlombaan" },
      { key: "nama_siswa", label: "Nama Siswa" },
      { key: "npsn", label: "NPSN" },
      { key: "unit_kerja", label: "Unit Kerja" },
      { key: "pengambilan", label: "Tgl Pengambilan" },
    ],
    masuk: [
      { key: "nomor_surat", label: "Nomor Surat" },
      { key: "asal_surat", label: "Asal" },
      { key: "perihal", label: "Perihal" },
      { key: "tanggal_surat", label: "Tanggal Surat" },
      { key: "tanggal_terima", label: "Tanggal Diterima" },
      { key: "nama_pengupload", label: "Nama Upload" },
    ],
    keluar: [
      { key: "nomor_surat", label: "No Surat" },
      { key: "perihal", label: "Perihal" },
      { key: "tanggal_surat", label: "Tanggal Surat" },
      { key: "tanggal_share", label: "Tanggal Shared" },
      { key: "nama_pengupload", label: "Nama Upload" },
    ],
  };

  // Field form per tab untuk modal +Tambah/Edit
  const FORM_FIELDS = {
    piagam: [
      {
        id: "tahun_perlombaan",
        label: "Tahun Perlombaan",
        type: "number",
        icon: "fa-calendar",
        placeholder: "2025",
      },
      {
        id: "jenis_perlombaan",
        label: "Jenis Perlombaan",
        type: "text",
        icon: "fa-trophy",
        placeholder: "OSN Matematika",
      },
      {
        id: "nama_siswa",
        label: "Nama Siswa",
        type: "text",
        icon: "fa-graduation-cap",
        placeholder: "Siti Aisyah",
      },
      {
        id: "npsn",
        label: "NPSN",
        type: "text",
        icon: "fa-hashtag",
        placeholder: "20501234",
      },
      {
        id: "unit_kerja",
        label: "Unit Kerja",
        type: "text",
        icon: "fa-building",
        placeholder: "SMPN 1 Jakarta",
      },
      {
        id: "pengambilan",
        label: "Tanggal Pengambilan",
        type: "date",
        icon: "fa-calendar-alt",
        placeholder: "",
        optional: true,
      },
      {
        id: "nama_pengambil",
        label: "Nama Pengambil",
        type: "text",
        icon: "fa-user",
        placeholder: "Ahmad Fauzi",
        optional: true,
      },
      {
        id: "jabatan",
        label: "Jabatan",
        type: "text",
        icon: "fa-briefcase",
        placeholder: "Kepala Sekolah",
        optional: true,
      },
      {
        id: "asal_sekolah",
        label: "Asal Sekolah",
        type: "text",
        icon: "fa-school",
        placeholder: "SMPN 1 Bandung",
        optional: true,
      },
    ],
    masuk: [
      {
        id: "nomor_surat",
        label: "Nomor Surat",
        type: "text",
        icon: "fa-hashtag",
        placeholder: "001/SM/2025",
      },
      {
        id: "asal_surat",
        label: "Asal Surat",
        type: "text",
        icon: "fa-building",
        placeholder: "Dinas Pendidikan",
      },
      {
        id: "perihal",
        label: "Perihal",
        type: "text",
        icon: "fa-envelope",
        placeholder: "Undangan Rapat",
      },
      {
        id: "tanggal_surat",
        label: "Tanggal Surat",
        type: "date",
        icon: "fa-calendar",
        placeholder: "",
      },
      {
        id: "tanggal_terima",
        label: "Tanggal Diterima",
        type: "date",
        icon: "fa-calendar-alt",
        placeholder: "",
      },
      {
        id: "nama_pengupload",
        label: "Nama Upload",
        type: "text",
        icon: "fa-user",
        placeholder: "Terisi otomatis",
        readonly: true,
      },
    ],
    keluar: [
      {
        id: "nomor_surat",
        label: "No Surat",
        type: "text",
        icon: "fa-hashtag",
        placeholder: "001/SK/2025",
      },
      {
        id: "perihal",
        label: "Perihal",
        type: "text",
        icon: "fa-envelope",
        placeholder: "Permohonan Izin",
      },
      {
        id: "tanggal_surat",
        label: "Tanggal Surat",
        type: "date",
        icon: "fa-calendar",
        placeholder: "",
      },
      {
        id: "tanggal_share",
        label: "Tanggal Shared",
        type: "date",
        icon: "fa-calendar-alt",
        placeholder: "",
      },
      {
        id: "nama_pengupload",
        label: "Nama Upload",
        type: "text",
        icon: "fa-user",
        placeholder: "Terisi otomatis",
        readonly: true,
      },
    ],
  };

  // ─── State ────────────────────────────────────────────────────────────────────
  const state = {
    activeTab: "piagam",
    rawData: [],
    filteredData: [],
    currentPage: 1,
    pageSize: 10,
    editingId: null,
    // Sorting
    sortKey: null,
    sortDir: 1, // 1=asc, -1=desc
    // Column visibility per tab { piagam: { key: true/false }, ... }
    hiddenCols: { piagam: {}, masuk: {}, keluar: {} },
    // Canvas TTD (Piagam only)
    canvas: null,
    ctx: null,
    drawing: false,
    canvasDirty: false, // true jika user telah menggambar TTD baru
    // Trash: { piagam: [{row, id},...], masuk:[...], keluar:[...] }
    trash: { piagam: [], masuk: [], keluar: [] },
    // Trash UI open/closed
    trashOpen: false,
    // Undo timer
    undoTimer: null,
    undoPendingId: null,
    // Force-delete pending row id
    forceDeleteId: null,
    forceDeleteIsEmpty: false, // true = kosongkan semua
    // URL file/TTD lama saat mode edit (untuk dihapus jika upload ulang)
    existingFileUrl: null,
    existingTtdUrl: null,
  };

  // ─── Helper: Ekstrak Google Drive File ID dari berbagai format URL ────────────
  // Mendukung: uc?id=..., uc?export=view&id=..., /file/d/ID/view, /thumbnail?id=...
  function extractDriveId(url) {
    if (!url) return "";
    // Format: /file/d/FILE_ID/
    let m = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (m) return m[1];
    // Format: ?id=FILE_ID atau &id=FILE_ID
    m = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (m) return m[1];
    // Format: /d/FILE_ID (Google Slides, Docs, dll)
    m = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (m) return m[1];
    return "";
  }

  // ─── Debounce ─────────────────────────────────────────────────────────────────
  function debounce(fn, waitMs) {
    let timer = null;
    return function debounced(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), waitMs);
    };
  }

  // ─── Tab ──────────────────────────────────────────────────────────────────────
  function switchTab(tabName) {
    state.activeTab = tabName;
    state.currentPage = 1;
    state.editingId = null;
    state.sortKey = null;
    state.sortDir = 1;

    // Update tab UI
    document.querySelectorAll("[data-tab]").forEach((btn) => {
      const isActive = btn.dataset.tab === tabName;
      btn.classList.toggle("tab-active", isActive);
      btn.classList.toggle("tab-inactive", !isActive);
    });

    // Reset search
    document.getElementById("master-search").value = "";

    // Update column toggle panel jika terbuka
    renderColTogglePanel();

    loadTab();
  }

  // ─── Load Data ────────────────────────────────────────────────────────────────
  async function loadTab() {
    const table = TAB_TABLE[state.activeTab];
    showTableLoading(true);
    try {
      const rows = await SisuratApi.fetchTable(table);
      state.rawData = rows;
      applySearch();
    } catch (e) {
      console.error("Gagal memuat data:", e);
      renderError();
    } finally {
      showTableLoading(false);
    }
  }

  function applySearch() {
    const keyword = document
      .getElementById("master-search")
      .value.toLowerCase()
      .trim();
    state.filteredData = keyword
      ? state.rawData.filter((row) =>
          JSON.stringify(row).toLowerCase().includes(keyword),
        )
      : [...state.rawData];
    state.currentPage = 1;
    applySortToFiltered();
  }

  // ─── Sorting ──────────────────────────────────────────────────────────────────
  function sortBy(key) {
    if (state.sortKey === key) {
      state.sortDir *= -1;
    } else {
      state.sortKey = key;
      state.sortDir = 1;
    }
    state.currentPage = 1;
    applySortToFiltered();
  }

  function applySortToFiltered() {
    if (state.sortKey) {
      state.filteredData.sort((a, b) => {
        const va = String(a[state.sortKey] || "").toLowerCase();
        const vb = String(b[state.sortKey] || "").toLowerCase();
        // Coba numeric sort
        const na = Number(va),
          nb = Number(vb);
        if (!isNaN(na) && !isNaN(nb)) return (na - nb) * state.sortDir;
        return va.localeCompare(vb) * state.sortDir;
      });
    }
    renderTable();
  }

  // ─── Column Toggle ────────────────────────────────────────────────────────────
  function isColHidden(tab, key) {
    return state.hiddenCols[tab] && state.hiddenCols[tab][key] === true;
  }

  function toggleColumn(key) {
    const tab = state.activeTab;
    if (!state.hiddenCols[tab]) state.hiddenCols[tab] = {};
    state.hiddenCols[tab][key] = !state.hiddenCols[tab][key];
    renderColTogglePanel();
    renderTable();
  }

  function renderColTogglePanel() {
    const tab = state.activeTab;
    const cols = TABLE_COLUMNS[tab];
    const panel = document.getElementById("col-toggle-panel");
    if (!panel) return;
    panel.innerHTML = cols
      .map((c) => {
        const hidden = isColHidden(tab, c.key);
        return `<label class="flex items-center gap-2 cursor-pointer select-none text-xs py-1">
                <input type="checkbox" ${hidden ? "" : "checked"}
                    onchange="toggleColumn('${c.key}')"
                    class="accent-[#00ADB5] w-3.5 h-3.5">
                <span class="${hidden ? "text-gray-400 line-through" : "text-[#222831]"}">${c.label}</span>
            </label>`;
      })
      .join("");
  }

  // ─── Render Table ─────────────────────────────────────────────────────────────
  function renderTable() {
    const tab = state.activeTab;
    const allCols = TABLE_COLUMNS[tab];
    const visibleCols = allCols.filter((c) => !isColHidden(tab, c.key));
    const isSA = SisuratAuth.isSuperAdmin();
    const total = state.filteredData.length;
    const pageSize = state.pageSize;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(state.currentPage, totalPages);
    state.currentPage = page;

    const start = (page - 1) * pageSize;
    const end = Math.min(start + pageSize, total);
    const pageData = state.filteredData.slice(start, end);

    // Render header dengan sort
    const thead = document.getElementById("master-thead");
    thead.innerHTML = `
      <tr>
        <th class="th-cell w-8 text-center">#</th>
        ${visibleCols
          .map((c) => {
            const isActive = state.sortKey === c.key;
            const icon = isActive
              ? state.sortDir === 1
                ? "fa-sort-up text-[#00ADB5]"
                : "fa-sort-down text-[#00ADB5]"
              : "fa-sort text-gray-300";
            return `<th class="th-cell cursor-pointer hover:bg-[#e6fafb] select-none group"
                onclick="sortBy('${c.key}')">
                <span class="flex items-center gap-1">
                    ${c.label}
                    <i class="fas ${icon} text-xs transition-colors"></i>
                </span>
            </th>`;
          })
          .join("")}
        ${isSA ? '<th class="th-cell text-center">Aksi</th>' : ""}
      </tr>`;

    // Render body
    const tbody = document.getElementById("master-tbody");
    const colSpan = visibleCols.length + (isSA ? 2 : 1);
    if (pageData.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="${colSpan}" class="py-16 text-center text-gray-400">
            <i class="fas fa-folder-open text-4xl opacity-30 mb-3 block"></i>
            Tidak ada data ditemukan
          </td>
        </tr>`;
    } else {
      tbody.innerHTML = pageData
        .map((row, idx) => {
          const rowJson = JSON.stringify(row).replace(/'/g, "\\'");
          const rowId = row.id || row.row_number || start + idx + 1;
          return `
          <tr class="tr-row">
            <td class="td-cell text-center text-gray-400 text-xs">${start + idx + 1}</td>
            ${visibleCols
              .map((c) => {
                const val = row[c.key];
                return `<td class="td-cell">${val != null && val !== "" ? val : '<span class="text-gray-300">—</span>'}</td>`;
              })
              .join("")}
            ${
              isSA
                ? `<td class="td-cell text-center">
                <div class="flex gap-1 justify-center">
                  <button onclick='openEditModal(${rowJson},${JSON.stringify(rowId)})'
                    class="action-btn-edit" title="Edit">
                    <i class="fas fa-pencil-alt"></i>
                  </button>
                  <button onclick='confirmDelete(${JSON.stringify(rowId)})'
                    class="action-btn-delete" title="Hapus">
                    <i class="fas fa-trash"></i>
                  </button>
                </div>
              </td>`
                : ""
            }
          </tr>`;
        })
        .join("");
    }

    // Pagination info & buttons
    const pageInfoEl = document.getElementById("page-info");
    if (pageInfoEl) {
      pageInfoEl.textContent =
        total === 0 ? "0 data" : `${start + 1}–${end} dari ${total} data`;
    }
    document.getElementById("btn-prev").disabled = page <= 1;
    document.getElementById("btn-next").disabled = page >= totalPages;

    // Render page number buttons
    renderPageButtons(page, totalPages);

    // Tambah button visibility
    const addBtn = document.getElementById("btn-tambah");
    if (addBtn) {
      addBtn.classList.toggle("hidden", !isSA);
    }
  }

  function renderPageButtons(current, total) {
    const container = document.getElementById("page-numbers");
    if (!container) return;
    let html = "";
    const delta = 2;
    let pages = new Set();
    pages.add(1);
    pages.add(total);
    for (
      let i = Math.max(1, current - delta);
      i <= Math.min(total, current + delta);
      i++
    )
      pages.add(i);
    const sorted = [...pages].sort((a, b) => a - b);
    let last = 0;
    sorted.forEach((p) => {
      if (last > 0 && p - last > 1)
        html += `<span class="px-1 text-gray-400 text-xs self-center">…</span>`;
      const active = p === current;
      html += `<button onclick="goToPage(${p})"
                class="w-7 h-7 rounded-lg text-xs font-semibold transition ${
                  active
                    ? "bg-[#00ADB5] text-white shadow-sm"
                    : "bg-white border border-gray-200 text-[#393E46] hover:bg-[#00ADB5] hover:text-white hover:border-[#00ADB5]"
                }">${p}</button>`;
      last = p;
    });
    container.innerHTML = html;
  }

  function showTableLoading(show) {
    const tbody = document.getElementById("master-tbody");
    const cols = TABLE_COLUMNS[state.activeTab];
    if (show) {
      tbody.innerHTML = `
        <tr>
          <td colspan="${cols.length + 2}" class="py-16 text-center text-[#00ADB5]">
            <i class="fas fa-circle-notch fa-spin text-3xl block mb-2"></i>
            Memuat data...
          </td>
        </tr>`;
    }
  }

  function renderError() {
    const tbody = document.getElementById("master-tbody");
    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="py-16 text-center text-red-400">
          <i class="fas fa-exclamation-triangle text-3xl block mb-2"></i>
          Gagal memuat data. Coba refresh halaman.
        </td>
      </tr>`;
  }

  // ─── Modal Form ───────────────────────────────────────────────────────────────
  function buildFormHTML(tab) {
    const fields = FORM_FIELDS[tab];
    const halfLen = Math.ceil(fields.length / 2);
    const leftFields = fields.slice(0, halfLen);
    const rightFields = fields.slice(halfLen);

    const renderField = (f) => `
      <div>
        <label class="block text-xs font-semibold text-[#393E46] mb-1 uppercase tracking-wide">
          <i class="fas ${f.icon} text-[#00ADB5] mr-1"></i>${f.label}
          ${f.readonly ? '<span class="ml-1 text-[10px] font-normal normal-case bg-[#00ADB5]/10 text-[#00ADB5] px-1.5 py-0.5 rounded-full"><i class="fas fa-lock text-[8px] mr-0.5"></i>Otomatis</span>' : ""}
        </label>
        <input
          type="${f.type}"
          id="form-${f.id}"
          name="${f.id}"
          placeholder="${f.placeholder}"
          class="form-input${f.readonly ? " bg-gray-50 text-gray-500 cursor-not-allowed" : ""}"
          ${f.type === "number" ? 'min="1900" max="2100"' : ""}
          ${f.readonly ? "readonly" : ""}
        />
      </div>`;

    let ttdSection = "";
    if (tab === "piagam") {
      // Pratinjau TTD lama jika mode edit
      const ttdUrl = state.existingTtdUrl;
      const ttdFileId = ttdUrl ? extractDriveId(ttdUrl) : "";
      // Pakai thumbnail URL — tidak diblokir saat di-embed
      const ttdEmbedUrl = ttdFileId
        ? `https://drive.google.com/thumbnail?id=${ttdFileId}&sz=w500`
        : ttdUrl || "";
      const ttdPreview = ttdUrl
        ? `
            <div class="mb-2 rounded-xl border border-violet-200 overflow-hidden bg-violet-50">
              <div class="flex items-center gap-2 px-3 py-2 bg-violet-100 border-b border-violet-200">
                <i class="fas fa-signature text-violet-500 text-sm"></i>
                <span class="text-xs font-semibold text-violet-700 flex-1">TTD Saat Ini</span>
                <a href="${ttdUrl}" target="_blank"
                  class="text-xs text-violet-500 hover:underline flex items-center gap-1">
                  <i class="fas fa-external-link-alt text-[10px]"></i> Buka
                </a>
                <button type="button" onclick="toggleTtdPreview()"
                  id="btn-toggle-ttd"
                  class="text-xs bg-violet-500 text-white px-2 py-0.5 rounded-lg hover:bg-violet-600 transition ml-1">
                  Tampilkan
                </button>
              </div>
              <div id="ttd-preview-area" class="hidden p-3 bg-white flex justify-center items-center">
                <img src="${ttdEmbedUrl}" alt="TTD Saat Ini"
                  class="max-h-28 object-contain rounded-lg border border-gray-100 shadow-sm"
                  onerror="this.src='${ttdUrl}'" />
              </div>
            </div>`
        : ``;

      ttdSection = `
        <div class="mt-4 col-span-2">
          <label class="block text-xs font-semibold text-[#393E46] mb-2 uppercase tracking-wide">
            <i class="fas fa-pen text-[#00ADB5] mr-1"></i>Tanda Tangan
            ${ttdUrl ? '<span class="text-gray-400 font-normal normal-case ml-1">(gambar ulang untuk mengganti)</span>' : ""}
          </label>
          ${ttdPreview}
          <div class="border-2 border-dashed border-[#00ADB5] rounded-xl p-1 bg-[#FAFAFA]">
            <canvas id="modal-canvas" class="w-full h-32 rounded-lg cursor-crosshair"></canvas>
          </div>
          <div class="flex justify-end mt-1">
            <button type="button" onclick="clearModalCanvas()"
              class="text-xs bg-[#393E46] hover:bg-[#4a525c] text-white px-3 py-1 rounded-lg transition">
              <i class="fas fa-eraser mr-1"></i>Hapus TTD
            </button>
          </div>
        </div>`;
    }

    // Preview file lama jika mode edit (visual: gambar inline, PDF iframe)
    let existingFilePreview = ``;
    if (state.existingFileUrl) {
      const url = state.existingFileUrl;
      const fileId = extractDriveId(url);
      // Thumbnail URL: bekerja untuk gambar (JPG/PNG) dan tidak diblokir saat embed
      const thumbUrl = fileId
        ? `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`
        : url;
      // Preview URL untuk iframe (PDF/dokumen)
      const previewUrl = fileId
        ? `https://drive.google.com/file/d/${fileId}/preview`
        : url;
      existingFilePreview = `
            <div class="mt-2 mb-1 rounded-xl border border-[#00ADB5]/30 overflow-hidden bg-[#f8fffe]">
              <!-- Header pratinjau -->
              <div class="flex items-center gap-2 px-3 py-2 bg-[#00ADB5]/10 border-b border-[#00ADB5]/20">
                <i class="fas fa-eye text-[#00ADB5] text-sm"></i>
                <span class="text-xs font-semibold text-[#393E46] flex-1">Pratinjau File Saat Ini</span>
                <a href="${url}" target="_blank"
                  class="text-xs text-[#00ADB5] hover:underline flex items-center gap-1">
                  <i class="fas fa-external-link-alt text-[10px]"></i> Buka
                </a>
                <button type="button" onclick="toggleFilePreview()"
                  id="btn-toggle-preview"
                  class="text-xs bg-[#00ADB5] text-white px-2 py-0.5 rounded-lg hover:bg-[#00939c] transition ml-1">
                  Tampilkan
                </button>
              </div>
              <!-- Area pratinjau: coba gambar dulu, fallback ke iframe -->
              <div id="file-preview-area" class="hidden transition-all duration-300">
                <img src="${thumbUrl}" alt="Pratinjau File"
                  onerror="this.style.display='none'; document.getElementById('file-preview-iframe').classList.remove('hidden');"
                  class="w-full max-h-64 object-contain bg-gray-50" />
                <iframe id="file-preview-iframe"
                  src="${previewUrl}"
                  class="hidden w-full h-64 border-0"
                  allow="autoplay">
                </iframe>
              </div>
            </div>`;
    }

    // Panel live-preview file yang baru dipilih — selalu ada di DOM (tambah & edit)
    const newFilePreviewPanel = `
            <div id="new-file-preview-wrap" class="hidden rounded-xl border border-emerald-200 overflow-hidden bg-emerald-50">
              <div class="flex items-center gap-2 px-3 py-2 bg-emerald-100 border-b border-emerald-200">
                <i class="fas fa-file-upload text-emerald-500 text-sm"></i>
                <span class="text-xs font-semibold text-emerald-700 flex-1">Pratinjau File Dipilih</span>
                <button type="button" onclick="clearNewFilePreview()"
                  class="text-xs text-red-400 hover:text-red-600 transition" title="Hapus pilihan">
                  <i class="fas fa-times"></i>
                </button>
              </div>
              <div id="new-file-preview-content" class="flex justify-center items-center p-2 min-h-[80px]"></div>
            </div>`;

    let uploadSection = ``;
    if (tab !== "piagam") {
      const maxMB = Math.round(SisuratApi.MAX_FILE_SIZE_BYTES / 1024 / 1024);
      uploadSection = `
      <div class="mt-4 col-span-2">
        <label class="block text-xs font-semibold text-[#393E46] mb-1 uppercase tracking-wide">
          <i class="fas fa-paperclip text-[#00ADB5] mr-1"></i>Upload File
          <span class="text-gray-400 font-normal capitalize">(opsional${state.existingFileUrl ? " — biarkan kosong jika tidak ingin mengganti" : ""})</span>
        </label>
        <div class="space-y-2">
          ${existingFilePreview}
          <input type="file" id="form-file" accept=".pdf,.jpg,.jpeg,.png"
            onchange="previewNewFile(this)"
            class="block w-full text-sm text-gray-500
              file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0
              file:text-sm file:font-semibold file:bg-[#00ADB5] file:text-white
              hover:file:bg-[#00939c] file:cursor-pointer cursor-pointer"/>
          <p class="text-xs text-gray-400">
            <i class="fas fa-info-circle mr-1 text-[#00ADB5]"></i>
            Format: PDF, JPG, PNG &bull; Maks. <strong>${maxMB} MB</strong>
            &bull; Gambar dikompres otomatis
          </p>
          <!-- Progress bar chunked upload -->
          <div id="upload-progress-wrap" class="hidden mt-2 rounded-xl border border-[#00ADB5]/30 bg-[#f0fdfe] p-3">
            <div class="flex items-center justify-between mb-1.5">
              <span id="upload-progress-label" class="text-xs font-semibold text-[#00ADB5]">Mengupload file...</span>
              <span id="upload-progress-pct" class="text-xs font-bold text-[#00ADB5]">0%</span>
            </div>
            <div class="w-full bg-[#00ADB5]/20 rounded-full h-2 overflow-hidden">
              <div id="upload-progress-bar"
                class="h-2 rounded-full bg-gradient-to-r from-[#00ADB5] to-[#00d4de] transition-all duration-300"
                style="width: 0%"></div>
            </div>
          </div>
          ${newFilePreviewPanel}
        </div>
      </div>`;
    }


    return `
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="space-y-3">${leftFields.map(renderField).join("")}</div>
        <div class="space-y-3">${rightFields.map(renderField).join("")}</div>
        ${ttdSection}
        ${uploadSection}
      </div>`;
  }

  function openAddModal() {
    state.editingId = null;
    state.existingFileUrl = null;
    state.existingTtdUrl = null;
    document.getElementById("modal-title").textContent =
      `Tambah ${getTabLabel()}`;
    document.getElementById("modal-form-body").innerHTML = buildFormHTML(
      state.activeTab,
    );
    document.getElementById("master-modal").classList.remove("hidden");
    document.getElementById("master-modal").classList.add("flex");
    if (state.activeTab === "piagam") {
      initModalCanvas();
    }
    // Isi field nama_pengupload readonly dengan nama user yang login
    const elNamaPengupload = document.getElementById("form-nama_pengupload");
    if (elNamaPengupload) {
      const currentUser = SisuratAuth.getStoredUser();
      elNamaPengupload.value =
        (currentUser && (currentUser.nama || currentUser.username)) || "";
    }
  }

  function openEditModal(rowData, rowId) {
    state.editingId = rowId;
    // Simpan URL file lama & TTD lama sebelum buildFormHTML
    state.existingFileUrl = rowData.upload_file || null;
    state.existingTtdUrl = rowData.ttd_pengambil || null;
    state.canvasDirty = false;

    document.getElementById("modal-title").textContent =
      `Edit ${getTabLabel()}`;
    document.getElementById("modal-form-body").innerHTML = buildFormHTML(
      state.activeTab,
    );

    // Isi nilai form
    const fields = FORM_FIELDS[state.activeTab];
    fields.forEach((f) => {
      const el = document.getElementById(`form-${f.id}`);
      if (el && rowData[f.id] !== undefined) {
        el.value = rowData[f.id];
      }
    });

    document.getElementById("master-modal").classList.remove("hidden");
    document.getElementById("master-modal").classList.add("flex");
    if (state.activeTab === "piagam") {
      initModalCanvas();
    }
  }

  function closeModal() {
    document.getElementById("master-modal").classList.add("hidden");
    document.getElementById("master-modal").classList.remove("flex");
    state.editingId = null;
    state.existingFileUrl = null;
    state.existingTtdUrl = null;
    state.canvasDirty = false;
    state.canvas = null;
    state.ctx = null;
  }

  // ─── Canvas TTD (Modal) ───────────────────────────────────────────────────────
  function initModalCanvas() {
    const c = document.getElementById("modal-canvas");
    if (!c) return;
    state.canvas = c;
    state.ctx = c.getContext("2d");
    const containerW = c.parentElement.clientWidth;
    c.width = containerW;
    c.height = 128;

    c.addEventListener("mousedown", canvasStart);
    c.addEventListener("mousemove", canvasDraw);
    c.addEventListener("mouseup", canvasStop);
    c.addEventListener("mouseleave", canvasStop);
    c.addEventListener("touchstart", canvasStart, { passive: false });
    c.addEventListener("touchmove", canvasDraw, { passive: false });
    c.addEventListener("touchend", canvasStop);
  }

  function getCoords(event) {
    const c = state.canvas;
    const rect = c.getBoundingClientRect();
    const scaleX = c.width / rect.width;
    const scaleY = c.height / rect.height;
    let clientX = event.clientX;
    let clientY = event.clientY;
    if (event.touches && event.touches[0]) {
      clientX = event.touches[0].clientX;
      clientY = event.touches[0].clientY;
    }
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }

  function canvasStart(e) {
    e.preventDefault();
    state.drawing = true;
    state.canvasDirty = true; // user mulai menggambar TTD baru
    state.ctx.beginPath();
    const { x, y } = getCoords(e);
    state.ctx.moveTo(x, y);
  }

  function canvasDraw(e) {
    e.preventDefault();
    if (!state.drawing) return;
    const { x, y } = getCoords(e);
    const ctx = state.ctx;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#222831";
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function canvasStop() {
    state.drawing = false;
    if (state.ctx) state.ctx.beginPath();
  }

  function clearModalCanvas() {
    const c = state.canvas;
    if (!c || !state.ctx) return;
    state.ctx.clearRect(0, 0, c.width, c.height);
    state.canvasDirty = false; // canvas dikosongkan, tidak ada TTD baru
  }

  // ─── Form Submit ──────────────────────────────────────────────────────────────

  // ─── Upload Progress UI ───────────────────────────────────────────────────────
  // Ditampilkan saat chunked upload sedang berlangsung
  function showUploadProgress(label) {
    const el = document.getElementById("upload-progress-wrap");
    if (!el) return;
    el.classList.remove("hidden");
    const lbl = document.getElementById("upload-progress-label");
    if (lbl) lbl.textContent = label || "Mengupload file...";
    updateUploadProgress(0);
  }

  function updateUploadProgress(pct) {
    const bar = document.getElementById("upload-progress-bar");
    const txt = document.getElementById("upload-progress-pct");
    if (bar) bar.style.width = pct + "%";
    if (txt) txt.textContent = pct + "%";
  }

  function hideUploadProgress() {
    const el = document.getElementById("upload-progress-wrap");
    if (el) el.classList.add("hidden");
  }

  async function submitForm() {
    const tab = state.activeTab;
    const table = TAB_TABLE[tab];
    const fields = FORM_FIELDS[tab];
    const submitBtn = document.getElementById("modal-submit-btn");

    // Kumpulkan data dari form
    const data = {};
    fields.forEach((f) => {
      const el = document.getElementById(`form-${f.id}`);
      data[f.id] = el ? el.value.trim() : "";
    });

    // Validasi minimal: semua field wajib terisi
    // Kecuali: field readonly (otomatis), field optional, dan field upload file
    const emptyField = fields.find((f) => !f.readonly && !f.optional && !data[f.id]);
    if (emptyField) {
      showModalAlert("error", `Field "${emptyField.label}" harus diisi!`);
      return;
    }

    // ─── Isi otomatis Timestamp, Email Address & Nama Pengupload ─────────
    // Hanya untuk mode tambah baru (bukan edit), agar metadata terisi dengan benar
    if (state.editingId === null) {
      // Timestamp: format DD/MM/YYYY HH:MM:SS (sesuai format Google Form)
      const now = new Date();
      const pad = (n) => String(n).padStart(2, "0");
      data.timestamp = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

      // Email Address & Nama Upload: ambil dari sesi login yang tersimpan
      const currentUser = SisuratAuth.getStoredUser();
      data.email_address =
        (currentUser && (currentUser.email || currentUser.username)) || "";
      // nama_pengupload: tampilkan nama lengkap jika ada, fallback ke username
      data.nama_pengupload =
        (currentUser && (currentUser.nama || currentUser.username)) || "";
    }

    // TTD piagam — hanya kirim jika user menggambar ulang (canvasDirty)
    // Pada mode tambah baru: kirim jika canvas ada (walaupun kosong, backend akan abaikan)
    if (tab === "piagam" && state.canvas) {
      if (state.editingId === null || state.canvasDirty) {
        data.ttd_base64 = state.canvas.toDataURL("image/png");
        // Sertakan URL TTD lama agar backend hapus dari Drive
        if (state.canvasDirty && state.existingTtdUrl) {
          data.old_ttd_url = state.existingTtdUrl;
        }
      }
    }

    // Upload file — gunakan chunked upload jika user memilih file baru
    const fileInput = document.getElementById("form-file");
    if (fileInput && fileInput.files && fileInput.files.length > 0) {
      const file = fileInput.files[0];

      // Validasi ukuran sebelum mulai upload
      const validation = SisuratApi.validateFileSize(file);
      if (!validation.valid) {
        showModalAlert("error", validation.message);
        return;
      }

      try {
        const folderId = SisuratApi.getFolderId(table, false);

        // Tampilkan progress bar
        showUploadProgress(`Mengupload "${file.name}"...`);
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-cloud-upload-alt fa-spin mr-1"></i>Mengupload...';

        // Upload via chunked — hasilnya URL publik Google Drive
        const fileUrl = await SisuratApi.uploadFileChunked(
          file,
          folderId,
          (pct) => updateUploadProgress(pct),
        );

        // Simpan URL (bukan Base64) ke payload record
        data.upload_file = fileUrl;

        // Sertakan URL file lama agar backend bisa menghapusnya
        if (state.existingFileUrl) {
          data.old_file_url = state.existingFileUrl;
        }

        hideUploadProgress();
      } catch (err) {
        hideUploadProgress();
        showModalAlert("error", "Gagal upload file: " + err.message);
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-save mr-1"></i>Simpan';
        return;
      }
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML =
      '<i class="fas fa-spinner fa-spin mr-1"></i>Menyimpan...';

    try {
      let result;
      if (state.editingId !== null) {
        result = await SisuratApi.updateRecord(table, state.editingId, data);
      } else {
        result = await SisuratApi.saveRecord(table, data);
      }

      if (result && result.status === "success") {
        closeModal();
        SisuratApi.invalidateCache(); // Invalidasi cache search.js
        await loadTab();
        showToast(
          "success",
          state.editingId
            ? "Data berhasil diupdate!"
            : "Data berhasil disimpan!",
        );
      } else {
        showModalAlert(
          "error",
          (result && result.message) || "Gagal menyimpan.",
        );
      }
    } catch (err) {
      console.error("Gagal submit form:", err);
      showModalAlert("error", "Terjadi kesalahan jaringan.");
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fas fa-save mr-1"></i>Simpan';
    }
  }

  // ─── Soft Delete (Trash) ──────────────────────────────────────────────────────
  function softDelete(rowId) {
    const tab = state.activeTab;
    // Cari row di rawData
    const idx = state.rawData.findIndex(
      (r) => (r.id || r.row_number) === rowId,
    );
    if (idx === -1) return;

    const row = state.rawData[idx];

    // Pindahkan ke trash
    state.trash[tab].unshift({ row, id: rowId });
    state.rawData.splice(idx, 1);
    applySearch();
    updateTrashUI();
    renderTrashTable(); // Render ulang tabel sampah langsung (real-time)

    // Toast dengan tombol Undo
    showUndoToast("Data dipindahkan ke sampah.", () => undoDelete(rowId));
  }

  function undoDelete(rowId) {
    const tab = state.activeTab;
    const trashIdx = state.trash[tab].findIndex((t) => t.id === rowId);
    if (trashIdx === -1) return;
    const { row } = state.trash[tab][trashIdx];
    state.trash[tab].splice(trashIdx, 1);
    state.rawData.unshift(row);
    applySearch();
    updateTrashUI();
    renderTrashTable();
    showToast("success", "Data berhasil dikembalikan.");
  }

  function restoreFromTrash(rowId) {
    undoDelete(rowId);
  }

  // Konfirmasi hapus permanen satu item dari trash
  function confirmForceDelete(rowId) {
    state.forceDeleteId = rowId;
    state.forceDeleteIsEmpty = false;
    openConfirmModal(
      "Hapus Permanen?",
      "Data ini akan dihapus <strong class='text-red-600'>secara permanen</strong> dan <strong>tidak dapat dikembalikan</strong>.",
    );
  }

  // Kosongkan semua trash tab aktif
  function emptyTrash() {
    const tab = state.activeTab;
    if (state.trash[tab].length === 0) return;
    state.forceDeleteIsEmpty = true;
    state.forceDeleteId = null;
    openConfirmModal(
      "Kosongkan Sampah?",
      `Seluruh <strong>${state.trash[tab].length} item</strong> di sampah akan dihapus <strong class='text-red-600'>secara permanen</strong> dan tidak dapat dikembalikan.`,
    );
  }

  function openConfirmModal(title, desc) {
    document.getElementById("confirm-modal-title").textContent = title;
    document.getElementById("confirm-modal-desc").innerHTML = desc;
    const inp = document.getElementById("confirm-type-input");
    inp.value = "";
    document.getElementById("confirm-delete-btn").disabled = true;
    const modal = document.getElementById("confirm-modal");
    modal.classList.remove("hidden");
    modal.classList.add("flex");
    setTimeout(() => inp.focus(), 100);
  }

  function closeConfirmModal() {
    const modal = document.getElementById("confirm-modal");
    modal.classList.add("hidden");
    modal.classList.remove("flex");
    state.forceDeleteId = null;
    state.forceDeleteIsEmpty = false;
  }

  function checkConfirmInput() {
    const val = document.getElementById("confirm-type-input").value.trim();
    document.getElementById("confirm-delete-btn").disabled =
      val.toUpperCase() !== "HAPUS";
  }

  async function doForceDelete() {
    const tab = state.activeTab;
    const table = TAB_TABLE[tab];

    // ⚠️ Snapshot nilai state SEBELUM closeConfirmModal()
    // karena closeConfirmModal() mereset state.forceDeleteId = null
    const isEmptyMode = state.forceDeleteIsEmpty;
    const rowId = state.forceDeleteId;

    closeConfirmModal(); // aman dipanggil setelah nilai sudah disimpan

    if (isEmptyMode) {
      // Hapus semua item di trash tab aktif ke API
      const items = [...state.trash[tab]];
      state.trash[tab] = [];
      updateTrashUI();
      renderTrashTable();
      let failCount = 0;
      for (const item of items) {
        try {
          await SisuratApi.deleteRecord(table, item.id);
        } catch (_) {
          failCount++;
        }
      }
      SisuratApi.invalidateCache();
      if (failCount === 0) {
        showToast("success", `${items.length} item berhasil dihapus permanen.`);
      } else {
        showToast("error", `${failCount} item gagal dihapus dari server.`);
      }
      return;
    }

    // Hapus satu item
    const trashIdx = state.trash[tab].findIndex((t) => t.id === rowId);
    if (trashIdx !== -1) state.trash[tab].splice(trashIdx, 1);
    updateTrashUI();
    renderTrashTable();
    try {
      const result = await SisuratApi.deleteRecord(table, rowId);
      if (result && result.status === "success") {
        SisuratApi.invalidateCache();
        showToast("success", "Data dihapus permanen.");
      } else {
        showToast(
          "error",
          (result && result.message) || "Gagal menghapus data.",
        );
      }
    } catch (err) {
      console.error("Gagal hapus permanen:", err);
      showToast("error", "Terjadi kesalahan jaringan.");
    }
  }

  // Alias untuk dipanggil dari HTML onclick
  function confirmDelete(rowId) {
    softDelete(rowId);
  }

  // ─── UI Helpers ───────────────────────────────────────────────────────────────
  function getTabLabel() {
    const map = {
      piagam: "Piagam",
      masuk: "Surat Masuk",
      keluar: "Surat Keluar",
    };
    return map[state.activeTab] || "Data";
  }

  function showModalAlert(type, msg) {
    const el = document.getElementById("modal-alert");
    el.className = `modal-alert ${type === "error" ? "modal-alert-error" : "modal-alert-success"}`;
    el.innerHTML = `<i class="fas fa-${type === "error" ? "exclamation-circle" : "check-circle"} mr-1"></i>${msg}`;
    el.classList.remove("hidden");
  }

  function showToast(type, msg) {
    const toast = document.getElementById("toast");
    toast.className = `toast ${type === "error" ? "toast-error" : "toast-success"}`;
    toast.innerHTML = `<i class="fas fa-${type === "error" ? "times-circle" : "check-circle"} mr-2"></i>${msg}`;
    toast.classList.remove("hidden");
    if (state.undoTimer) clearTimeout(state.undoTimer);
    state.undoTimer = setTimeout(() => toast.classList.add("hidden"), 3500);
  }

  function showUndoToast(msg, onUndo) {
    const toast = document.getElementById("toast");
    toast.className = "toast toast-error";
    toast.innerHTML = `
            <i class="fas fa-trash mr-2"></i>${msg}
            <button class="toast-undo-btn" onclick="(${onUndo.toString()})()">Undo</button>
        `;
    toast.classList.remove("hidden");
    if (state.undoTimer) clearTimeout(state.undoTimer);
    state.undoTimer = setTimeout(() => toast.classList.add("hidden"), 5000);
  }

  // ─── Pagination ───────────────────────────────────────────────────────────────
  function prevPage() {
    if (state.currentPage > 1) {
      state.currentPage--;
      renderTable();
    }
  }

  function nextPage() {
    const total = state.filteredData.length;
    const totalPages = Math.ceil(total / state.pageSize);
    if (state.currentPage < totalPages) {
      state.currentPage++;
      renderTable();
    }
  }

  function goToPage(p) {
    state.currentPage = p;
    renderTable();
  }

  function setPageSize(size) {
    state.pageSize = Number(size);
    state.currentPage = 1;
    renderTable();
  }

  // ─── Logout ───────────────────────────────────────────────────────────────────
  function logout() {
    SisuratAuth.logoutToHome();
  }

  // ─── Column Toggle Panel ──────────────────────────────────────────────────────────
  function toggleColPanel() {
    const panel = document.getElementById("col-toggle-panel");
    if (!panel) return;
    const wasHidden = panel.classList.contains("hidden");
    panel.classList.toggle("hidden", !wasHidden);
    if (wasHidden) renderColTogglePanel();
  }

  // ─── Trash UI ──────────────────────────────────────────────────────────────────
  function updateTrashUI() {
    const tab = state.activeTab;
    const count = state.trash[tab].length;
    const panel = document.getElementById("trash-panel");
    const badge = document.getElementById("trash-badge");
    const emptyBtn = document.getElementById("btn-empty-trash");
    const wrapper = document.getElementById("trash-table-wrapper");
    const chevron = document.getElementById("trash-chevron");
    if (!panel) return;

    badge.textContent = count;
    panel.classList.toggle("hidden", count === 0);
    if (emptyBtn) emptyBtn.classList.toggle("hidden", count === 0);

    if (count === 0) {
      // Trash kosong: tutup panel
      state.trashOpen = false;
      if (wrapper) wrapper.classList.add("hidden");
      if (chevron) chevron.style.transform = "";
    } else if (!state.trashOpen) {
      // Ada item baru dan panel belum terbuka: auto-expand
      state.trashOpen = true;
      if (wrapper) wrapper.classList.remove("hidden");
      if (chevron) chevron.style.transform = "rotate(180deg)";
    }
  }

  function toggleTrashPanel() {
    state.trashOpen = !state.trashOpen;
    const wrapper = document.getElementById("trash-table-wrapper");
    const chevron = document.getElementById("trash-chevron");
    if (wrapper) wrapper.classList.toggle("hidden", !state.trashOpen);
    if (chevron)
      chevron.style.transform = state.trashOpen ? "rotate(180deg)" : "";
    if (state.trashOpen) renderTrashTable();
  }

  function renderTrashTable() {
    const tab = state.activeTab;
    const allCols = TABLE_COLUMNS[tab];
    const visibleCols = allCols.filter((c) => !isColHidden(tab, c.key));
    const items = state.trash[tab];

    const thead = document.getElementById("trash-thead");
    const tbody = document.getElementById("trash-tbody");
    if (!thead || !tbody) return;

    thead.innerHTML = `<tr>
            <th class="th-cell w-8 text-center">#</th>
            ${visibleCols.map((c) => `<th class="th-cell">${c.label}</th>`).join("")}
            <th class="th-cell text-center">Aksi</th>
        </tr>`;

    if (items.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${visibleCols.length + 2}" class="py-10 text-center text-gray-400 text-sm">
                <i class="fas fa-check-circle text-green-300 text-3xl block mb-2"></i>Sampah kosong
            </td></tr>`;
      return;
    }

    tbody.innerHTML = items
      .map((item, idx) => {
        const row = item.row;
        const rowId = item.id;
        return `<tr class="tr-trashed">
                <td class="td-cell text-center text-gray-300 text-xs">${idx + 1}</td>
                ${visibleCols
                  .map((c) => {
                    const val = row[c.key];
                    return `<td class="td-cell">${val != null && val !== "" ? val : '<span class="text-gray-200">—</span>'}</td>`;
                  })
                  .join("")}
                <td class="td-cell text-center">
                    <div class="flex gap-1 justify-center">
                        <button onclick='restoreFromTrash(${JSON.stringify(rowId)})'
                            class="action-btn-restore" title="Pulihkan">
                            <i class="fas fa-undo"></i>
                        </button>
                        <button onclick='confirmForceDelete(${JSON.stringify(rowId)})'
                            class="action-btn-force-delete" title="Hapus Permanen">
                            <i class="fas fa-fire-alt"></i>
                        </button>
                    </div>
                </td>
            </tr>`;
      })
      .join("");
  }

  // ─── Init ──────────────────────────────────────────────────────────────────────
  function bindEvents() {
    const debouncedSearch = debounce(applySearch, DEBOUNCE_MS);
    document
      .getElementById("master-search")
      .addEventListener("input", debouncedSearch);

    // Wire confirm-delete-btn ke doForceDelete
    const confirmBtn = document.getElementById("confirm-delete-btn");
    if (confirmBtn) confirmBtn.addEventListener("click", doForceDelete);

    // Close col-toggle dropdown when clicking outside
    document.addEventListener("click", (e) => {
      const wrapper = document.getElementById("col-toggle-wrapper");
      const panel = document.getElementById("col-toggle-panel");
      if (wrapper && panel && !wrapper.contains(e.target)) {
        panel.classList.add("hidden");
      }
    });
  }

  function init() {
    const user = SisuratAuth.requireAuth();
    if (!user) return;

    bindEvents();

    // Register cache invalidation handler dari search.js jika ada
    SisuratApi.onCacheInvalidate(() => {
      // search.js punya state sendiri; kita hanya perlu sinyal bahwa data berubah
      // search.js akan refresh saat user pindah ke halaman cari
    });

    switchTab("piagam");
  }

  // ─── File Preview Helpers ──────────────────────────────────────────────────────

  // Toggle tampil/sembunyikan area pratinjau file lama
  function toggleFilePreview() {
    const area = document.getElementById("file-preview-area");
    const btn = document.getElementById("btn-toggle-preview");
    if (!area) return;
    const isHidden = area.classList.contains("hidden");
    area.classList.toggle("hidden", !isHidden);
    if (btn) btn.textContent = isHidden ? "Sembunyikan" : "Tampilkan";
  }

  // Live preview file yang baru dipilih user (sebelum disimpan)
  function previewNewFile(input) {
    const wrap = document.getElementById("new-file-preview-wrap");
    const content = document.getElementById("new-file-preview-content");
    if (!wrap || !content) return;

    if (!input.files || input.files.length === 0) {
      wrap.classList.add("hidden");
      content.innerHTML = "";
      return;
    }

    const file = input.files[0];
    const objectUrl = URL.createObjectURL(file);
    const isImage = file.type.startsWith("image/");
    const isPdf = file.type === "application/pdf";

    wrap.classList.remove("hidden");

    if (isImage) {
      content.innerHTML = `
                <img src="${objectUrl}" alt="Pratinjau File Baru"
                    class="max-h-56 object-contain rounded-lg shadow-sm" />`;
    } else if (isPdf) {
      content.innerHTML = `
                <iframe src="${objectUrl}" class="w-full h-56 rounded-lg border-0"></iframe>`;
    } else {
      content.innerHTML = `
                <div class="flex flex-col items-center gap-2 py-4">
                    <i class="fas fa-file text-emerald-400 text-3xl"></i>
                    <span class="text-xs text-emerald-700">${file.name}</span>
                    <span class="text-xs text-gray-400">${(file.size / 1024).toFixed(1)} KB</span>
                </div>`;
    }
  }

  // Hapus live preview file baru (dan reset input file)
  function clearNewFilePreview() {
    const wrap = document.getElementById("new-file-preview-wrap");
    const content = document.getElementById("new-file-preview-content");
    const fileInput = document.getElementById("form-file");
    if (wrap) wrap.classList.add("hidden");
    if (content) content.innerHTML = "";
    if (fileInput) fileInput.value = "";
  }

  // Toggle tampil/sembunyikan pratinjau TTD lama
  function toggleTtdPreview() {
    const area = document.getElementById("ttd-preview-area");
    const btn = document.getElementById("btn-toggle-ttd");
    if (!area) return;
    const isHidden = area.classList.contains("hidden");
    area.classList.toggle("hidden", !isHidden);
    if (btn) btn.textContent = isHidden ? "Sembunyikan" : "Tampilkan";
  }
  // ─── Expose ke global (dipanggil dari HTML onclick) ───────────────────────────
  global.switchTab = switchTab;
  global.openAddModal = openAddModal;
  global.openEditModal = openEditModal;
  global.closeModal = closeModal;
  global.submitForm = submitForm;
  global.confirmDelete = confirmDelete;
  global.closeConfirmModal = closeConfirmModal;
  global.checkConfirmInput = checkConfirmInput;
  global.clearModalCanvas = clearModalCanvas;
  global.prevPage = prevPage;
  global.nextPage = nextPage;
  global.goToPage = goToPage;
  global.setPageSize = setPageSize;
  global.sortBy = sortBy;
  global.toggleColumn = toggleColumn;
  global.toggleColPanel = toggleColPanel;
  global.logout = logout;
  // Trash functions
  global.toggleTrashPanel = toggleTrashPanel;
  global.restoreFromTrash = restoreFromTrash;
  global.confirmForceDelete = confirmForceDelete;
  global.emptyTrash = emptyTrash;
  // File preview helpers
  global.toggleFilePreview = toggleFilePreview;
  global.previewNewFile = previewNewFile;
  global.clearNewFilePreview = clearNewFilePreview;
  global.toggleTtdPreview = toggleTtdPreview;

  global.addEventListener("load", init);
})(window);
