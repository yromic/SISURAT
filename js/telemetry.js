/**
 * SISURAT — Dual-Track Client Performance Telemetry Module
 * Digunakan untuk mengukur performa end-to-end (Client UI, Render, Search, Sync, Network, Server)
 * khusus untuk kebutuhan pengujian performa, analisis bottleneck, dan penelitian akademik.
 */
(function initSisuratTelemetry(global) {
  "use strict";

  const STORAGE_KEY = "sisurat:v1:perf-records";
  const MAX_RECORDS = 200; // Ring-buffer cap untuk mencegah storage bloat
  const activeTimers = new Map();

  // Membaca record dari localStorage
  function getRecords() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (_) {
      return [];
    }
  }

  // Menyimpan record ke localStorage (FIFO ring buffer)
  function saveRecords(records) {
    try {
      const trimmed = records.slice(-MAX_RECORDS);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch (e) {
      console.warn("[Telemetry] Gagal menyimpan log performa ke localStorage:", e);
    }
  }

  // Menambahkan record baru
  function pushRecord(record) {
    const records = getRecords();
    records.push({
      id: `perf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      ...record
    });
    saveRecords(records);

    // Dispatch event jika panel UI sedang terbuka
    try {
      global.dispatchEvent(new CustomEvent("sisurat-telemetry-updated", { detail: record }));
    } catch (_) {}
  }

  // Memulai timer lokal
  function startTimer(tag) {
    activeTimers.set(tag, performance.now());
  }

  // Menghentikan timer lokal dan mencatat hasilnya
  function stopTimer(tag, meta = {}) {
    const start = activeTimers.get(tag);
    if (start === undefined) return 0;
    activeTimers.delete(tag);
    const duration = Math.round(performance.now() - start);

    pushRecord({
      category: "frontend_ui",
      operation: tag,
      client_duration_ms: duration,
      ...meta
    });

    return duration;
  }

  // Mencatat hasil mutasi data (Tambah, Edit, Hapus Surat)
  function recordMutation(action, table, traceId, clientDurationMs, serverRes, isSync = false) {
    const serverMetrics = (serverRes && serverRes.server_metrics) || {};
    const serverTotalMs = serverMetrics.server_total_ms || 0;
    const driveUploadMs = serverMetrics.drive_upload_ms || 0;
    const lockWaitMs = serverMetrics.lock_wait_ms || 0;
    const sheetWriteMs = serverMetrics.sheet_write_ms || 0;
    const syncQueueMs = serverMetrics.sync_queue_ms || 0;

    const record = {
      category: "mutation",
      action: action,
      table: table || "-",
      trace_id: traceId || "-",
      client_total_ms: clientDurationMs,
      server_total_ms: serverTotalMs,
      drive_upload_ms: driveUploadMs,
      lock_wait_ms: lockWaitMs,
      sheet_write_ms: sheetWriteMs,
      sync_queue_ms: syncQueueMs,
      is_background_sync: isSync || serverMetrics.is_sync || false,
      status: (serverRes && serverRes.status) || "unknown"
    };

    pushRecord(record);

    console.log(
      `%c[PERF TRACE] ${action} (${table}) | Client: ${clientDurationMs}ms | Server: ${serverTotalMs}ms (Drive: ${driveUploadMs}ms, Lock: ${lockWaitMs}ms, Sheet: ${sheetWriteMs}ms)`,
      "color: #10b981; font-weight: bold;"
    );
  }

  // Menghapus seluruh data pengujian lokal
  function clearRecords() {
    localStorage.removeItem(STORAGE_KEY);
    try {
      global.dispatchEvent(new CustomEvent("sisurat-telemetry-cleared"));
    } catch (_) {}
  }

  // Export seluruh data telemetri ke format CSV (Siap diolah di Excel / SPSS / Python)
  function exportCSV() {
    const records = getRecords();
    if (records.length === 0) {
      alert("Belum ada data pengujian performa yang tercatat.");
      return;
    }

    const headers = [
      "timestamp",
      "category",
      "operation_action",
      "table",
      "trace_id",
      "client_total_ms",
      "server_total_ms",
      "drive_upload_ms",
      "lock_wait_ms",
      "sheet_write_ms",
      "sync_queue_ms",
      "is_background_sync",
      "status"
    ];

    const rows = records.map((r) => [
      `"${r.timestamp || ""}"`,
      `"${r.category || ""}"`,
      `"${r.operation || r.action || ""}"`,
      `"${r.table || ""}"`,
      `"${r.trace_id || ""}"`,
      r.client_duration_ms || r.client_total_ms || 0,
      r.server_total_ms || 0,
      r.drive_upload_ms || 0,
      r.lock_wait_ms || 0,
      r.sheet_write_ms || 0,
      r.sync_queue_ms || 0,
      r.is_background_sync ? "TRUE" : "FALSE",
      `"${r.status || ""}"`
    ]);

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((row) => row.join(","))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `sisurat_perf_dataset_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // Render UI Modal Diagnostik & Riset
  function renderModalUI() {
    let modal = document.getElementById("sisurat-telemetry-modal");
    if (modal) {
      modal.classList.toggle("hidden");
      updateModalTable();
      return;
    }

    modal = document.createElement("div");
    modal.id = "sisurat-telemetry-modal";
    modal.className = "fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4";
    modal.innerHTML = `
      <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden border border-gray-200 dark:border-gray-700">
        <!-- Header -->
        <div class="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between bg-gray-50/50 dark:bg-gray-800/50">
          <div class="flex items-center space-x-3">
            <span class="p-2 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 rounded-xl text-lg">
              <i class="fas fa-stopwatch"></i>
            </span>
            <div>
              <h3 class="text-lg font-bold text-gray-900 dark:text-white">Panel Telemetri & Riset Performa</h3>
              <p class="text-xs text-gray-500 dark:text-gray-400">Pengukuran Latensi Dual-Track (Client & Server Google Apps Script)</p>
            </div>
          </div>
          <button id="close-telemetry-modal" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl font-bold p-1">
            <i class="fas fa-times"></i>
          </button>
        </div>

        <!-- Quick Summary Stats -->
        <div class="p-6 grid grid-cols-2 md:grid-cols-4 gap-4 bg-gray-50/30 dark:bg-gray-900/20 border-b border-gray-100 dark:border-gray-700 text-xs">
          <div class="p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
            <span class="text-gray-400 uppercase font-semibold text-[10px] block mb-1">Rata-rata Simpan</span>
            <span id="stat-avg-save" class="text-lg font-extrabold text-emerald-600 dark:text-emerald-400">- ms</span>
          </div>
          <div class="p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
            <span class="text-gray-400 uppercase font-semibold text-[10px] block mb-1">Rata-rata Drive Upload</span>
            <span id="stat-avg-drive" class="text-lg font-extrabold text-blue-600 dark:text-blue-400">- ms</span>
          </div>
          <div class="p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
            <span class="text-gray-400 uppercase font-semibold text-[10px] block mb-1">Rata-rata Lock Wait</span>
            <span id="stat-avg-lock" class="text-lg font-extrabold text-amber-600 dark:text-amber-400">- ms</span>
          </div>
          <div class="p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
            <span class="text-gray-400 uppercase font-semibold text-[10px] block mb-1">Total Log Sampel</span>
            <span id="stat-total-samples" class="text-lg font-extrabold text-purple-600 dark:text-purple-400">0</span>
          </div>
        </div>

        <!-- Data Log Table -->
        <div class="p-6 flex-1 overflow-auto">
          <table class="w-full text-left text-xs text-gray-600 dark:text-gray-300">
            <thead class="bg-gray-100 dark:bg-gray-700/50 text-[11px] uppercase tracking-wider text-gray-500 font-semibold sticky top-0">
              <tr>
                <th class="p-2">Waktu</th>
                <th class="p-2">Aksi / Operasi</th>
                <th class="p-2">Client Total</th>
                <th class="p-2">Server Total</th>
                <th class="p-2">Drive API</th>
                <th class="p-2">Lock Wait</th>
                <th class="p-2">Sheet I/O</th>
                <th class="p-2">Sync Dwell</th>
              </tr>
            </thead>
            <tbody id="telemetry-log-tbody" class="divide-y divide-gray-100 dark:divide-gray-700">
              <!-- Diisi otomatis -->
            </tbody>
          </table>
        </div>

        <!-- Actions Footer -->
        <div class="px-6 py-4 bg-gray-50/70 dark:bg-gray-800/70 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <div class="text-xs text-gray-400">
            Shortcut: <kbd class="px-2 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-gray-700 dark:text-gray-300 font-mono">Ctrl + Shift + P</kbd>
          </div>
          <div class="flex items-center space-x-2">
            <button id="btn-clear-telemetry" class="px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition font-medium">
              <i class="fas fa-trash-alt mr-1"></i>Reset Log
            </button>
            <button id="btn-export-telemetry" class="px-4 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm transition font-semibold flex items-center">
              <i class="fas fa-file-csv mr-1.5"></i>Download Dataset (CSV)
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    document.getElementById("close-telemetry-modal").addEventListener("click", () => {
      modal.classList.add("hidden");
    });

    document.getElementById("btn-clear-telemetry").addEventListener("click", () => {
      if (confirm("Hapus seluruh log telemetri lokal?")) {
        clearRecords();
        updateModalTable();
      }
    });

    document.getElementById("btn-export-telemetry").addEventListener("click", () => {
      exportCSV();
    });

    updateModalTable();
  }

  function updateModalTable() {
    const tbody = document.getElementById("telemetry-log-tbody");
    if (!tbody) return;

    const records = getRecords().reverse(); // Tampilkan yang terbaru di atas
    document.getElementById("stat-total-samples").textContent = records.length;

    // Hitung rata-rata
    const mutationRecords = records.filter(r => r.category === "mutation");
    if (mutationRecords.length > 0) {
      const avgSave = Math.round(mutationRecords.reduce((acc, r) => acc + (r.client_total_ms || 0), 0) / mutationRecords.length);
      const avgDrive = Math.round(mutationRecords.reduce((acc, r) => acc + (r.drive_upload_ms || 0), 0) / mutationRecords.length);
      const avgLock = Math.round(mutationRecords.reduce((acc, r) => acc + (r.lock_wait_ms || 0), 0) / mutationRecords.length);

      document.getElementById("stat-avg-save").textContent = `${avgSave} ms`;
      document.getElementById("stat-avg-drive").textContent = `${avgDrive} ms`;
      document.getElementById("stat-avg-lock").textContent = `${avgLock} ms`;
    } else {
      document.getElementById("stat-avg-save").textContent = "- ms";
      document.getElementById("stat-avg-drive").textContent = "- ms";
      document.getElementById("stat-avg-lock").textContent = "- ms";
    }

    if (records.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="p-4 text-center text-gray-400 italic">Belum ada data pengujian yang terekam. Lakukan simpan, edit, hapus, atau pencarian surat terlebih dahulu.</td></tr>`;
      return;
    }

    tbody.innerHTML = records.slice(0, 50).map(r => {
      const timeStr = r.timestamp ? new Date(r.timestamp).toLocaleTimeString() : "-";
      const opName = r.action || r.operation || "-";
      const isSyncBadge = r.is_background_sync ? '<span class="ml-1 px-1.5 py-0.2 bg-amber-100 text-amber-700 rounded text-[9px]">SYNC</span>' : '';
      
      return `
        <tr class="hover:bg-gray-50/50 dark:hover:bg-gray-700/20">
          <td class="p-2 font-mono text-[11px]">${timeStr}</td>
          <td class="p-2 font-semibold text-gray-800 dark:text-gray-200">${opName} ${isSyncBadge}</td>
          <td class="p-2 font-mono font-bold ${r.client_total_ms > 3000 ? 'text-amber-500' : 'text-emerald-600'}">${r.client_duration_ms || r.client_total_ms || 0} ms</td>
          <td class="p-2 font-mono">${r.server_total_ms ? r.server_total_ms + ' ms' : '-'}</td>
          <td class="p-2 font-mono">${r.drive_upload_ms ? r.drive_upload_ms + ' ms' : '-'}</td>
          <td class="p-2 font-mono">${r.lock_wait_ms ? r.lock_wait_ms + ' ms' : '-'}</td>
          <td class="p-2 font-mono">${r.sheet_write_ms ? r.sheet_write_ms + ' ms' : '-'}</td>
          <td class="p-2 font-mono">${r.sync_queue_ms ? r.sync_queue_ms + ' ms' : '-'}</td>
        </tr>
      `;
    }).join("");
  }

  // Pasang keyboard shortcut global (Ctrl + Shift + P)
  global.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.shiftKey && (e.key === "P" || e.key === "p")) {
      e.preventDefault();
      renderModalUI();
    }
  });

  global.addEventListener("sisurat-telemetry-updated", () => {
    updateModalTable();
  });

  // Ekspor API ke global
  global.SisuratTelemetry = {
    startTimer,
    stopTimer,
    recordMutation,
    getRecords,
    clearRecords,
    exportCSV,
    openModal: renderModalUI
  };
})(window);
