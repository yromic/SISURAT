(function initLaporanPage(global) {
    "use strict";

    const { SisuratApi, SisuratAuth } = global;

    if (!SisuratApi || !SisuratAuth) {
        console.error("Module API/Auth belum dimuat.");
        return;
    }

    // ─── Cache (reuse pola search.js) ──────────────────────────────────────────────────────────────
    const CACHE_TTL_MS = 2 * 60 * 1000;
    const PREVIEW_PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
    const state = {
        cacheData: null,
        cacheFetchedAt: 0,
        cachePromise: null,
        // Preview table state
        sortKey: null,
        sortDir: 1,   // 1=asc, -1=desc
        previewPage: 1,
        previewPageSize: 10,
    };

    async function getCachedAllData(forceRefresh = false) {
        const now = Date.now();
        const cacheAge = now - state.cacheFetchedAt;
        const cacheValid = state.cacheData && state.cacheFetchedAt > 0 && cacheAge < CACHE_TTL_MS;

        if (!forceRefresh && cacheValid) return state.cacheData;

        if (!state.cachePromise) {
            state.cachePromise = SisuratApi.fetchAllTables()
                .then((result) => {
                    state.cacheData = result;
                    state.cacheFetchedAt = Date.now();
                    return result;
                })
                .finally(() => {
                    state.cachePromise = null;
                });
        }
        return state.cachePromise;
    }

    // Invalidasi jika data berubah dari master.js
    SisuratApi.onCacheInvalidate(() => {
        state.cacheData = null;
        state.cacheFetchedAt = 0;
    });

    // ─── Mapping Kolom CSV per Jenis ─────────────────────────────────────────────
    const CSV_COLUMNS = {
        db_piagam: [
            { header: "Tahun", key: "tahun_perlombaan" },
            { header: "Jenis Perlombaan", key: "jenis_perlombaan" },
            { header: "Nama Siswa", key: "nama_siswa" },
            { header: "NPSN", key: "npsn" },
            { header: "Pengambilan", key: "pengambilan" },
            { header: "Unit Kerja", key: "unit_kerja" },
        ],
        db_surat_masuk: [
            { header: "Nomor Surat", key: "nomor_surat" },
            { header: "Asal", key: "asal" },
            { header: "Perihal", key: "perihal" },
            { header: "Tanggal Diterima", key: "tanggal_surat" },
            { header: "Nama Upload", key: "nama_upload" },
        ],
        db_surat_keluar: [
            { header: "No Surat", key: "nomor_surat" },
            { header: "Perihal", key: "perihal" },
            { header: "Tanggal Shared", key: "tanggal_surat" },
            { header: "Nama Upload", key: "nama_upload" },
        ],
    };

    // Label tampilan
    const TABLE_LABELS = {
        db_piagam: "Piagam",
        db_surat_masuk: "Surat Masuk",
        db_surat_keluar: "Surat Keluar",
    };

    // ─── Filter & Hasil ──────────────────────────────────────────────────────────
    let filteredResult = { all: [], byTable: {} };

    async function applyFilter() {
        // Tampilkan loading di badge dan tabel saat mulai memuat
        showBadgeLoading();
        showTableLoading();

        const fromVal = document.getElementById("filter-from").value;
        const toVal = document.getElementById("filter-to").value;
        const jenisVal = document.getElementById("filter-jenis").value;

        try {
            const { all: allData, byTable } = await getCachedAllData();

            // Filter by jenis
            let selectedTables = jenisVal ? [jenisVal] : Object.keys(byTable);

            let filtered = [];
            const resultByTable = {};

            selectedTables.forEach((table) => {
                let rows = [...(byTable[table] || [])];

                // Filter date range
                if (fromVal) {
                    const fromDate = SisuratApi.parseDate(fromVal);
                    rows = rows.filter((row) => {
                        const d = SisuratApi.parseDate(row.tanggal);
                        return d && fromDate && d >= fromDate;
                    });
                }
                if (toVal) {
                    const toDate = SisuratApi.parseDate(toVal);
                    // set toDate ke akhir hari
                    if (toDate) toDate.setHours(23, 59, 59, 999);
                    rows = rows.filter((row) => {
                        const d = SisuratApi.parseDate(row.tanggal);
                        return d && toDate && d <= toDate;
                    });
                }

                resultByTable[table] = rows;
                filtered = filtered.concat(rows);
            });

            filteredResult = { all: filtered, byTable: resultByTable };

            updateCountBadge(filtered.length);
            renderPreviewTable(filtered);
        } catch (err) {
            console.error("Gagal filter:", err);
            // Tunjukkan error di badge jika gagal
            const el = document.getElementById("result-count");
            el.innerHTML = `<i class="fas fa-exclamation-circle mr-1"></i>Gagal memuat data`;
        }
    }

    // Tampilkan spinner di badge saat data sedang dimuat
    function showBadgeLoading() {
        const el = document.getElementById("result-count");
        el.innerHTML = `<i class="fas fa-circle-notch fa-spin mr-1"></i>Memuat data...`;
    }

    // Tampilkan baris loading di tabel saat data sedang dimuat
    function showTableLoading() {
        const thead = document.getElementById("preview-thead");
        const tbody = document.getElementById("preview-tbody");
        if (thead) thead.innerHTML = "";
        if (tbody) tbody.innerHTML = `
            <tr>
                <td colspan="6" class="py-16 text-center text-[#00ADB5]">
                    <i class="fas fa-circle-notch fa-spin text-3xl block mb-2"></i>
                    <span class="text-sm font-medium text-[#393E46]">Memuat data...</span>
                </td>
            </tr>`;
    }

    // Tampilkan jumlah data ditemukan di badge (menggantikan spinner)
    function updateCountBadge(count) {
        const el = document.getElementById("result-count");
        el.innerHTML = `<i class="fas fa-check-circle mr-1"></i>${count} data ditemukan`;
    }

    // ─── Sorting & Pagination for Preview ────────────────────────────────────────────────
    let _lastPreviewData = [];

    function renderPreviewTable(data) {
        _lastPreviewData = data;
        state.previewPage = 1;
        _renderPreviewPage();
    }

    function sortPreviewBy(key) {
        if (state.sortKey === key) {
            state.sortDir *= -1;
        } else {
            state.sortKey = key;
            state.sortDir = 1;
        }
        state.previewPage = 1;
        _renderPreviewPage();
    }

    function setPreviewPageSize(size) {
        state.previewPageSize = Number(size);
        state.previewPage = 1;
        _renderPreviewPage();
    }

    function prevPreviewPage() {
        if (state.previewPage > 1) { state.previewPage--; _renderPreviewPage(); }
    }

    function nextPreviewPage() {
        const totalPages = Math.ceil(_lastPreviewData.length / state.previewPageSize);
        if (state.previewPage < totalPages) { state.previewPage++; _renderPreviewPage(); }
    }

    function goPreviewPage(p) {
        state.previewPage = p;
        _renderPreviewPage();
    }

    function _renderPreviewPage() {
        const data = _lastPreviewData;
        const container = document.getElementById("preview-tbody");
        const thead = document.getElementById("preview-thead");

        if (data.length === 0) {
            thead.innerHTML = "";
            container.innerHTML = `
        <tr>
          <td colspan="6" class="py-16 text-center text-gray-400">
            <i class="fas fa-folder-open text-4xl opacity-30 block mb-2"></i>
            Tidak ada data sesuai filter
          </td>
        </tr>`;
            // Sembunyikan pagination preview
            const pager = document.getElementById("preview-pagination");
            if (pager) pager.style.display = "none";
            return;
        }

        // Sort
        let sorted = [...data];
        if (state.sortKey) {
            sorted.sort((a, b) => {
                const va = String(a[state.sortKey] || "").toLowerCase();
                const vb = String(b[state.sortKey] || "").toLowerCase();
                const na = Number(va), nb = Number(vb);
                if (!isNaN(na) && !isNaN(nb)) return (na - nb) * state.sortDir;
                return va.localeCompare(vb) * state.sortDir;
            });
        }

        // Pagination
        const total = sorted.length;
        const pageSize = state.previewPageSize;
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        const page = Math.min(state.previewPage, totalPages);
        state.previewPage = page;
        const start = (page - 1) * pageSize;
        const end = Math.min(start + pageSize, total);
        const pageData = sorted.slice(start, end);

        // Tentukan kolom berdasar jenis pertama
        const firstRow = pageData[0] || data[0];
        const table = firstRow._table || "db_piagam";
        const cols = CSV_COLUMNS[table] || CSV_COLUMNS["db_piagam"];

        // Render header dengan sort ikon
        thead.innerHTML = `
      <tr>
        ${cols.map((c) => {
            const isActive = state.sortKey === c.key;
            const icon = isActive
                ? (state.sortDir === 1 ? 'fa-sort-up text-[#00ADB5]' : 'fa-sort-down text-[#00ADB5]')
                : 'fa-sort text-gray-300';
            return `<th class="th-preview cursor-pointer hover:bg-[#e6fafb] select-none"
                onclick="sortPreviewBy('${c.key}')">
                <span class="flex items-center gap-1">
                    ${c.header}
                    <i class="fas ${icon} text-xs"></i>
                </span>
            </th>`;
        }).join('')}
        <th class="th-preview text-center cursor-pointer hover:bg-[#e6fafb] select-none"
            onclick="sortPreviewBy('_table')">
            <span class="flex items-center gap-1 justify-center">
                Jenis
                <i class="fas ${state.sortKey === '_table'
                ? (state.sortDir === 1 ? 'fa-sort-up' : 'fa-sort-down')
                : 'fa-sort'} text-xs ${state.sortKey === '_table' ? 'text-[#00ADB5]' : 'text-gray-300'}"></i>
            </span>
        </th>
      </tr>`;

        // Render body
        container.innerHTML = pageData
            .map((row) => {
                const rowTable = row._table || table;
                const rowCols = CSV_COLUMNS[rowTable] || cols;
                return `
          <tr class="tr-preview">
            ${rowCols.map((c) => `<td class="td-preview">${row[c.key] || "—"}</td>`).join('')}
            <td class="td-preview text-center">
              <span class="inline-block px-2 py-0.5 rounded-full text-xs font-medium
                ${rowTable === "db_piagam" ? "bg-yellow-100 text-yellow-700" : rowTable === "db_surat_masuk" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}">
                ${TABLE_LABELS[rowTable] || "—"}
              </span>
            </td>
          </tr>`;
            })
            .join('');

        // Update pagination preview
        const pager = document.getElementById("preview-pagination");
        if (pager) {
            // Tampilkan pagination hanya jika ada lebih dari 1 halaman
            pager.style.display = (totalPages > 1 || total > pageSize) ? "flex" : "none";
            const infoEl = document.getElementById("preview-page-info");
            if (infoEl) infoEl.textContent = `${start + 1}–${end} dari ${total} data`;
            document.getElementById("preview-btn-prev").disabled = page <= 1;
            document.getElementById("preview-btn-next").disabled = page >= totalPages;
            // Page buttons
            const numbersEl = document.getElementById("preview-page-numbers");
            if (numbersEl) {
                let html = "";
                const delta = 2;
                let pages = new Set([1, totalPages]);
                for (let i = Math.max(1, page - delta); i <= Math.min(totalPages, page + delta); i++) pages.add(i);
                [...pages].sort((a, b) => a - b).forEach((p, i, arr) => {
                    if (i > 0 && p - arr[i - 1] > 1) html += `<span class="text-gray-400 text-xs px-1">…</span>`;
                    const active = p === page;
                    html += `<button onclick="goPreviewPage(${p})"
                        class="w-7 h-7 rounded-lg text-xs font-semibold transition ${active
                            ? 'bg-[#00ADB5] text-white'
                            : 'bg-white border border-gray-200 text-[#393E46] hover:bg-[#00ADB5] hover:text-white'
                        }">${p}</button>`;
                });
                numbersEl.innerHTML = html;
            }
        }
    }


    // ─── Download CSV ─────────────────────────────────────────────────────────────
    function downloadCsv() {
        const jenisVal = document.getElementById("filter-jenis").value;

        if (jenisVal) {
            // Satu jenis: export dengan kolom spesifik + kolom Total
            const rows = filteredResult.byTable[jenisVal] || [];
            if (rows.length === 0) {
                alert("Tidak ada data untuk diexport.");
                return;
            }
            const cols = CSV_COLUMNS[jenisVal];
            const csvRows = rows.map((row, idx) => {
                const obj = {};
                cols.forEach((c) => { obj[c.header] = row[c.key] || ""; });
                obj["Total"] = idx + 1;
                return obj;
            });
            SisuratApi.exportCsv(csvRows, `rekap_${TABLE_LABELS[jenisVal]}_${today()}.csv`);
        } else {
            // Semua jenis: gabung semua kolom
            const all = filteredResult.all;
            if (all.length === 0) {
                alert("Tidak ada data untuk diexport.");
                return;
            }
            const csvRows = all.map((row, idx) => ({
                Jenis: row.jenis || row._table || "",
                "Nomor / Tahun": row.nomor_surat || row.tahun_perlombaan || "",
                "Perihal / Perlombaan": row.perihal || row.jenis_perlombaan || "",
                "Tanggal": row.tanggal || "",
                "Nama": row.nama_siswa || row.nama_upload || "",
                Total: idx + 1,
            }));
            SisuratApi.exportCsv(csvRows, `rekap_semua_${today()}.csv`);
        }
    }

    // ─── Download PDF ─────────────────────────────────────────────────────────────
    async function downloadPdf() {
        const { jsPDF } = global.jspdf || {};
        if (!jsPDF) {
            alert("Library jsPDF belum dimuat. Pastikan internet tersedia.");
            return;
        }

        const jenisVal = document.getElementById("filter-jenis").value;
        const fromVal = document.getElementById("filter-from").value;
        const toVal = document.getElementById("filter-to").value;

        const selectedTables = jenisVal ? [jenisVal] : Object.keys(CSV_COLUMNS);

        const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
        doc.setFont("helvetica");

        let yStart = 15;

        // Header dokumen
        doc.setFontSize(16);
        doc.setTextColor(34, 40, 49);
        doc.text("LAPORAN REKAPITULASI SISURAT", 14, yStart);
        yStart += 7;
        doc.setFontSize(9);
        doc.setTextColor(57, 62, 70);
        const periodeText = fromVal || toVal
            ? `Periode: ${fromVal || "awal"} s/d ${toVal || "akhir"}`
            : "Periode: Semua Waktu";
        doc.text(periodeText, 14, yStart);
        doc.text(`Dicetak: ${new Date().toLocaleString("id-ID")}`, 14, yStart + 5);
        yStart += 14;

        for (const table of selectedTables) {
            const rows = filteredResult.byTable[table] || [];
            if (rows.length === 0) continue;

            const cols = CSV_COLUMNS[table];
            const label = TABLE_LABELS[table];

            doc.setFontSize(11);
            doc.setTextColor(0, 173, 181);
            doc.text(`${label} (${rows.length} data)`, 14, yStart);
            yStart += 5;

            const headers = [[...cols.map((c) => c.header), "No"]];
            const body = rows.map((row, idx) => [
                ...cols.map((c) => String(row[c.key] || "")),
                String(idx + 1),
            ]);

            doc.autoTable({
                startY: yStart,
                head: headers,
                body: body,
                theme: "striped",
                headStyles: { fillColor: [0, 173, 181], textColor: 255, fontStyle: "bold", fontSize: 8 },
                bodyStyles: { fontSize: 8 },
                alternateRowStyles: { fillColor: [240, 253, 253] },
                margin: { left: 14, right: 14 },
            });

            yStart = doc.lastAutoTable.finalY + 10;

            if (yStart > 160 && selectedTables.indexOf(table) < selectedTables.length - 1) {
                doc.addPage();
                yStart = 14;
            }
        }

        doc.save(`rekap_sisurat_${today()}.pdf`);
    }

    // ─── Kirim Email via Gmail ────────────────────────────────────────────────────
    function sendEmail() {
        const jenisVal = document.getElementById("filter-jenis").value;
        const fromVal = document.getElementById("filter-from").value;
        const toVal = document.getElementById("filter-to").value;

        const jenisLabel = jenisVal ? TABLE_LABELS[jenisVal] : "Semua";
        const count = filteredResult.all.length;

        if (count === 0) {
            alert("Tidak ada data untuk dikirim. Silakan filter terlebih dahulu.");
            return;
        }

        // ── 1. Auto-download CSV agar user bisa langsung lampirkan ke Gmail ──
        downloadCsv();

        // ── 2. Susun baris ringkasan data untuk body Gmail ───────────────────
        // Batas maks karakter URL Gmail ~2000 karakter, kita potong di 20 baris
        const MAX_ROWS_IN_BODY = 20;
        const allRows = filteredResult.all.slice(0, MAX_ROWS_IN_BODY);
        let dataLines = "";
        allRows.forEach((row, idx) => {
            const rowTable = row._table || jenisVal || "db_piagam";
            const cols = CSV_COLUMNS[rowTable] || [];
            const values = cols.map((c) => `${c.header}: ${row[c.key] || "-"}`).join(" | ");
            dataLines += `${idx + 1}. [${TABLE_LABELS[rowTable] || rowTable}] ${values}\n`;
        });
        if (count > MAX_ROWS_IN_BODY) {
            dataLines += `... dan ${count - MAX_ROWS_IN_BODY} data lainnya (lihat file CSV terlampir).\n`;
        }

        const subject = encodeURIComponent(`Laporan Rekap SISURAT — ${jenisLabel}`);
        const body = encodeURIComponent(
            `Halo,\n\nBerikut laporan rekapitulasi data dari SISURAT:\n\n` +
            `Jenis    : ${jenisLabel}\n` +
            `Periode  : ${fromVal || "awal"} s/d ${toVal || "akhir"}\n` +
            `Total    : ${count} data\n` +
            `Dicetak  : ${new Date().toLocaleString("id-ID")}\n\n` +
            `──────────────── RINGKASAN DATA ────────────────\n` +
            dataLines +
            `────────────────────────────────────────────────\n\n` +
            `📎 File CSV telah otomatis terunduh di komputer Anda.\n` +
            `   Silakan lampirkan file tersebut pada email ini sebelum dikirim.\n\n` +
            `Salam,\nSISURAT`
        );

        // ── 3. Buka Gmail Compose di tab baru ────────────────────────────────
        const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&su=${subject}&body=${body}`;
        global.open(gmailUrl, "_blank");
    }

    // ─── Utils ────────────────────────────────────────────────────────────────────
    function today() {
        return new Date().toISOString().slice(0, 10);
    }

    // ─── Logout ───────────────────────────────────────────────────────────────────
    function logout() {
        SisuratAuth.logoutToHome();
    }

    // ─── Init & Bind ─────────────────────────────────────────────────────────────
    function bindEvents() {
        document.getElementById("filter-from").addEventListener("change", applyFilter);
        document.getElementById("filter-to").addEventListener("change", applyFilter);
        document.getElementById("filter-jenis").addEventListener("change", applyFilter);
    }

    function init() {
        const user = SisuratAuth.requireAuth();
        if (!user) return;

        const userNameEl = document.getElementById("user-name");
        if (userNameEl) userNameEl.textContent = user.username || "User";

        bindEvents();
        applyFilter();
    }

    global.downloadCsv = downloadCsv;
    global.downloadPdf = downloadPdf;
    global.sendEmail = sendEmail;
    global.sortPreviewBy = sortPreviewBy;
    global.setPreviewPageSize = setPreviewPageSize;
    global.prevPreviewPage = prevPreviewPage;
    global.nextPreviewPage = nextPreviewPage;
    global.goPreviewPage = goPreviewPage;
    global.logout = logout;

    global.addEventListener("load", init);
})(window);
