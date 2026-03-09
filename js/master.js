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
            { key: "asal", label: "Asal" },
            { key: "perihal", label: "Perihal" },
            { key: "tanggal_surat", label: "Tanggal Diterima" },
            { key: "nama_upload", label: "Nama Upload" },
        ],
        keluar: [
            { key: "nomor_surat", label: "No Surat" },
            { key: "perihal", label: "Perihal" },
            { key: "tanggal_surat", label: "Tanggal Shared" },
            { key: "nama_upload", label: "Nama Upload" },
        ],
    };

    // Field form per tab untuk modal +Tambah/Edit
    const FORM_FIELDS = {
        piagam: [
            { id: "tahun_perlombaan", label: "Tahun Perlombaan", type: "number", icon: "fa-calendar", placeholder: "2025" },
            { id: "jenis_perlombaan", label: "Jenis Perlombaan", type: "text", icon: "fa-trophy", placeholder: "OSN Matematika" },
            { id: "nama_siswa", label: "Nama Siswa", type: "text", icon: "fa-graduation-cap", placeholder: "Siti Aisyah" },
            { id: "npsn", label: "NPSN", type: "text", icon: "fa-hashtag", placeholder: "20501234" },
            { id: "unit_kerja", label: "Unit Kerja", type: "text", icon: "fa-building", placeholder: "SMPN 1 Jakarta" },
            { id: "pengambilan", label: "Tanggal Pengambilan", type: "date", icon: "fa-calendar-alt", placeholder: "" },
            { id: "nama_pengambil", label: "Nama Pengambil", type: "text", icon: "fa-user", placeholder: "Ahmad Fauzi" },
            { id: "jabatan", label: "Jabatan", type: "text", icon: "fa-briefcase", placeholder: "Kepala Sekolah" },
            { id: "asal_sekolah", label: "Asal Sekolah", type: "text", icon: "fa-school", placeholder: "SMPN 1 Bandung" },
        ],
        masuk: [
            { id: "nomor_surat", label: "Nomor Surat", type: "text", icon: "fa-hashtag", placeholder: "001/SM/2025" },
            { id: "asal", label: "Asal Surat", type: "text", icon: "fa-building", placeholder: "Dinas Pendidikan" },
            { id: "perihal", label: "Perihal", type: "text", icon: "fa-envelope", placeholder: "Undangan Rapat" },
            { id: "tanggal_surat", label: "Tanggal Diterima", type: "date", icon: "fa-calendar-alt", placeholder: "" },
            { id: "nama_upload", label: "Nama Upload", type: "text", icon: "fa-user", placeholder: "Nama penginput" },
        ],
        keluar: [
            { id: "nomor_surat", label: "No Surat", type: "text", icon: "fa-hashtag", placeholder: "001/SK/2025" },
            { id: "perihal", label: "Perihal", type: "text", icon: "fa-envelope", placeholder: "Permohonan Izin" },
            { id: "tanggal_surat", label: "Tanggal Shared", type: "date", icon: "fa-calendar-alt", placeholder: "" },
            { id: "nama_upload", label: "Nama Upload", type: "text", icon: "fa-user", placeholder: "Nama penginput" },
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
    };

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
        const keyword = document.getElementById("master-search").value.toLowerCase().trim();
        state.filteredData = keyword
            ? state.rawData.filter((row) =>
                JSON.stringify(row).toLowerCase().includes(keyword)
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
                const na = Number(va), nb = Number(vb);
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
        panel.innerHTML = cols.map(c => {
            const hidden = isColHidden(tab, c.key);
            return `<label class="flex items-center gap-2 cursor-pointer select-none text-xs py-1">
                <input type="checkbox" ${hidden ? '' : 'checked'}
                    onchange="toggleColumn('${c.key}')"
                    class="accent-[#00ADB5] w-3.5 h-3.5">
                <span class="${hidden ? 'text-gray-400 line-through' : 'text-[#222831]'}">${c.label}</span>
            </label>`;
        }).join('');
    }

    // ─── Render Table ─────────────────────────────────────────────────────────────
    function renderTable() {
        const tab = state.activeTab;
        const allCols = TABLE_COLUMNS[tab];
        const visibleCols = allCols.filter(c => !isColHidden(tab, c.key));
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
        ${visibleCols.map((c) => {
            const isActive = state.sortKey === c.key;
            const icon = isActive
                ? (state.sortDir === 1 ? 'fa-sort-up text-[#00ADB5]' : 'fa-sort-down text-[#00ADB5]')
                : 'fa-sort text-gray-300';
            return `<th class="th-cell cursor-pointer hover:bg-[#e6fafb] select-none group"
                onclick="sortBy('${c.key}')">
                <span class="flex items-center gap-1">
                    ${c.label}
                    <i class="fas ${icon} text-xs transition-colors"></i>
                </span>
            </th>`;
        }).join('')}
        ${isSA ? '<th class="th-cell text-center">Aksi</th>' : ''}
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
                                return `<td class="td-cell">${val != null && val !== '' ? val : '<span class="text-gray-300">—</span>'}</td>`;
                            })
                            .join('')}
            ${isSA
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
                            : ''
                        }
          </tr>`;
                })
                .join('');
        }

        // Pagination info & buttons
        const pageInfoEl = document.getElementById("page-info");
        if (pageInfoEl) {
            pageInfoEl.textContent = total === 0 ? "0 data" : `${start + 1}–${end} dari ${total} data`;
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
        for (let i = Math.max(1, current - delta); i <= Math.min(total, current + delta); i++) pages.add(i);
        const sorted = [...pages].sort((a, b) => a - b);
        let last = 0;
        sorted.forEach(p => {
            if (last > 0 && p - last > 1) html += `<span class="px-1 text-gray-400 text-xs self-center">…</span>`;
            const active = p === current;
            html += `<button onclick="goToPage(${p})"
                class="w-7 h-7 rounded-lg text-xs font-semibold transition ${active
                    ? 'bg-[#00ADB5] text-white shadow-sm'
                    : 'bg-white border border-gray-200 text-[#393E46] hover:bg-[#00ADB5] hover:text-white hover:border-[#00ADB5]'
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
        </label>
        <input
          type="${f.type}"
          id="form-${f.id}"
          name="${f.id}"
          placeholder="${f.placeholder}"
          class="form-input"
          ${f.type === "number" ? 'min="1900" max="2100"' : ""}
        />
      </div>`;

        let ttdSection = "";
        if (tab === "piagam") {
            ttdSection = `
        <div class="mt-4 col-span-2">
          <label class="block text-xs font-semibold text-[#393E46] mb-2 uppercase tracking-wide">
            <i class="fas fa-pen text-[#00ADB5] mr-1"></i>Tanda Tangan
          </label>
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

        let uploadSection = `
      <div class="mt-4 col-span-2">
        <label class="block text-xs font-semibold text-[#393E46] mb-1 uppercase tracking-wide">
          <i class="fas fa-paperclip text-[#00ADB5] mr-1"></i>Upload File
          <span class="text-gray-400 font-normal capitalize">(opsional)</span>
        </label>
        <div class="relative">
          <input type="file" id="form-file" accept=".pdf,.jpg,.jpeg,.png"
            class="block w-full text-sm text-gray-500
              file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0
              file:text-sm file:font-semibold file:bg-[#00ADB5] file:text-white
              hover:file:bg-[#00939c] file:cursor-pointer cursor-pointer"/>
          <p class="text-xs text-gray-400 mt-1">Format: PDF, JPG, PNG</p>
        </div>
      </div>`;

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
        document.getElementById("modal-title").textContent = `Tambah ${getTabLabel()}`;
        document.getElementById("modal-form-body").innerHTML = buildFormHTML(state.activeTab);
        document.getElementById("master-modal").classList.remove("hidden");
        document.getElementById("master-modal").classList.add("flex");
        if (state.activeTab === "piagam") {
            initModalCanvas();
        }
    }

    function openEditModal(rowData, rowId) {
        state.editingId = rowId;
        document.getElementById("modal-title").textContent = `Edit ${getTabLabel()}`;
        document.getElementById("modal-form-body").innerHTML = buildFormHTML(state.activeTab);

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
        return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
    }

    function canvasStart(e) {
        e.preventDefault();
        state.drawing = true;
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
    }

    // ─── Form Submit ──────────────────────────────────────────────────────────────
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

        // Validasi minimal: semua field wajib terisi (kecuali upload file)
        const emptyField = fields.find((f) => !data[f.id]);
        if (emptyField) {
            showModalAlert("error", `Field "${emptyField.label}" harus diisi!`);
            return;
        }

        // TTD piagam
        if (tab === "piagam" && state.canvas) {
            data.ttd_base64 = state.canvas.toDataURL("image/png");
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Menyimpan...';

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
                showToast("success", state.editingId ? "Data berhasil diupdate!" : "Data berhasil disimpan!");
            } else {
                showModalAlert("error", (result && result.message) || "Gagal menyimpan.");
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
        const idx = state.rawData.findIndex((r) => (r.id || r.row_number) === rowId);
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
            "Data ini akan dihapus <strong class='text-red-600'>secara permanen</strong> dan <strong>tidak dapat dikembalikan</strong>."
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
            `Seluruh <strong>${state.trash[tab].length} item</strong> di sampah akan dihapus <strong class='text-red-600'>secara permanen</strong> dan tidak dapat dikembalikan.`
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
        document.getElementById("confirm-delete-btn").disabled = val.toUpperCase() !== "HAPUS";
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
                showToast("error", (result && result.message) || "Gagal menghapus data.");
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
        const map = { piagam: "Piagam", masuk: "Surat Masuk", keluar: "Surat Keluar" };
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
        if (chevron) chevron.style.transform = state.trashOpen ? "rotate(180deg)" : "";
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
            ${visibleCols.map((c) => `<th class="th-cell">${c.label}</th>`).join('')}
            <th class="th-cell text-center">Aksi</th>
        </tr>`;

        if (items.length === 0) {
            tbody.innerHTML = `<tr><td colspan="${visibleCols.length + 2}" class="py-10 text-center text-gray-400 text-sm">
                <i class="fas fa-check-circle text-green-300 text-3xl block mb-2"></i>Sampah kosong
            </td></tr>`;
            return;
        }

        tbody.innerHTML = items.map((item, idx) => {
            const row = item.row;
            const rowId = item.id;
            return `<tr class="tr-trashed">
                <td class="td-cell text-center text-gray-300 text-xs">${idx + 1}</td>
                ${visibleCols.map((c) => {
                const val = row[c.key];
                return `<td class="td-cell">${val != null && val !== '' ? val : '<span class="text-gray-200">—</span>'}</td>`;
            }).join('')}
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
        }).join('');
    }

    // ─── Init ──────────────────────────────────────────────────────────────────────
    function bindEvents() {
        const debouncedSearch = debounce(applySearch, DEBOUNCE_MS);
        document.getElementById("master-search").addEventListener("input", debouncedSearch);

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

        // Atur nama user di header
        const userNameEl = document.getElementById("user-name");
        if (userNameEl) userNameEl.textContent = user.username || "User";

        bindEvents();

        // Register cache invalidation handler dari search.js jika ada
        SisuratApi.onCacheInvalidate(() => {
            // search.js punya state sendiri; kita hanya perlu sinyal bahwa data berubah
            // search.js akan refresh saat user pindah ke halaman cari
        });

        switchTab("piagam");
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

    global.addEventListener("load", init);
})(window);
