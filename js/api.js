(function initSisuratApi(global) {
  "use strict";

  const BASE_URL =
    "https://script.google.com/macros/s/AKfycbwAvxXJZiBIQc1Ex_GJs2vfU2A9-psQ_KMe5TLK5ymsWXo5nsFnDhsgFP4OdgMLZbHi/exec";

  // ─── Google Drive Folder IDs per kategori ─────────────────────────────────
  // Setiap kategori memiliki folder upload tersendiri di Google Drive
  const DRIVE_FOLDERS = Object.freeze({
    db_surat_masuk: "18hTuZTOgGuB1bfaEq-5VK8n-7g04Ku6KwKEx5DZ5X5HPbGsexHgx-6Tu-Lj93jQKD6rMdYIO",
    db_surat_keluar: "1V190s7wG2iJE4v5JDe5uvhMkziYOnTzJRQlpY23VVr4GWA92RPwI21vp8E8m9znHsXD5qsXj",
    db_piagam_ttd: "1Mg8F5JDGfQmZvJORrlAEKPi-Y6BIlUBG",   // folder khusus TTD piagam
  });

  const TABLE_CONFIG = Object.freeze({
    db_surat_masuk: {
      label: "Surat Masuk",
      dateFields: ["tanggal_surat", "timestamp"],
    },
    db_surat_keluar: {
      label: "Surat Keluar",
      dateFields: ["tanggal_surat", "timestamp"],
    },
    db_piagam: {
      label: "Piagam",
      dateFields: ["pengambilan", "timestamp", "tahun_perlombaan"],
    },
  });

  function getTables() {
    return Object.keys(TABLE_CONFIG);
  }

  function getTableConfig(table) {
    return (
      TABLE_CONFIG[table] || {
        label: "Dokumen",
        dateFields: ["timestamp"],
      }
    );
  }

  function pickFirstFilledField(record, fields) {
    for (const field of fields) {
      const value = record ? record[field] : null;
      if (value === null || value === undefined) {
        continue;
      }
      const textValue = String(value).trim();
      if (textValue !== "") {
        return textValue;
      }
    }
    return null;
  }

  function parseDate(value) {
    if (value === null || value === undefined || value === "") {
      return null;
    }

    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }

    const stringValue = String(value).trim();
    if (!stringValue) {
      return null;
    }

    if (/^\d{4}$/.test(stringValue)) {
      const yearDate = new Date(`${stringValue}-01-01T00:00:00`);
      return Number.isNaN(yearDate.getTime()) ? null : yearDate;
    }

    const parsed = new Date(stringValue);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function normalizeRecord(record, table) {
    const config = getTableConfig(table);
    const tanggal = pickFirstFilledField(record, config.dateFields);

    return {
      ...record,
      jenis: config.label,
      tanggal: tanggal || null,
      _table: table,
    };
  }

  async function fetchTable(table) {
    try {
      const url = `${BASE_URL}?action=get_data&table=${encodeURIComponent(table)}`;
      const response = await fetch(url);
      const result = await response.json();
      const rows = Array.isArray(result.data) ? result.data : [];
      return rows.map((row) => normalizeRecord(row, table));
    } catch (error) {
      console.error(`Gagal mengambil data dari ${table}:`, error);
      return [];
    }
  }

  async function fetchAllTables() {
    const tables = getTables();
    const results = await Promise.all(tables.map((table) => fetchTable(table)));

    const byTable = {};
    tables.forEach((table, index) => {
      byTable[table] = results[index];
    });

    const all = results.flat();
    return { byTable, all };
  }

  async function postAction(action, data) {
    const response = await fetch(BASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify({
        action,
        data,
      }),
    });

    return response.json();
  }

  function login(username, password) {
    return postAction("login", { username, password });
  }

  function savePiagam(data) {
    return postAction("simpan_piagam", data);
  }

  // ─── Master Data CRUD ────────────────────────────────────────────────────────

  /**
   * Kembalikan folder_id Drive yang sesuai untuk upload file.
   * @param {string} table   - nama tabel (db_surat_masuk / db_surat_keluar / db_piagam)
   * @param {boolean} isTtd  - true jika upload adalah TTD piagam
   */
  function getFolderId(table, isTtd = false) {
    if (isTtd) return DRIVE_FOLDERS.db_piagam_ttd;
    return DRIVE_FOLDERS[table] || null;
  }

  function saveRecord(table, data) {
    // Tambahkan folder_id otomatis agar backend simpan di folder yang tepat
    const payload = { ...data };
    if (payload.file_base64 && !payload.folder_id) {
      payload.folder_id = getFolderId(table, false);
    }
    if (payload.ttd_base64 && !payload.ttd_folder_id) {
      payload.ttd_folder_id = getFolderId(table, true);
    }
    // Struktur: { action, data: { table, data: payload } } — sesuai backend (params.data.table)
    return postAction("simpan_record", { table, data: payload });
  }

  function updateRecord(table, id, data) {
    // Tambahkan folder_id otomatis agar backend simpan di folder yang tepat
    const payload = { ...data };
    if (payload.file_base64 && !payload.folder_id) {
      payload.folder_id = getFolderId(table, false);
    }
    if (payload.ttd_base64 && !payload.ttd_folder_id) {
      payload.ttd_folder_id = getFolderId(table, true);
    }
    // Struktur: { action, data: { table, id, data: payload } } — sesuai backend (params.data.table)
    return postAction("update_record", { table, id, data: payload });
  }

  function deleteRecord(table, id) {
    return postAction("hapus_record", { table, id });
  }

  async function uploadFile(formData) {
    const response = await fetch(BASE_URL, {
      method: "POST",
      body: formData,
    });
    return response.json();
  }

  // ─── Export Helpers ───────────────────────────────────────────────────────────

  function exportCsv(rows, filename) {
    if (!rows || rows.length === 0) {
      return;
    }
    const headers = Object.keys(rows[0]);
    const escape = (val) => {
      const str = val === null || val === undefined ? "" : String(val);
      return str.includes(",") || str.includes('"') || str.includes("\n")
        ? `"${str.replace(/"/g, '""')}"`
        : str;
    };
    const lines = [
      headers.map(escape).join(","),
      ...rows.map((row) => headers.map((h) => escape(row[h])).join(",")),
    ];
    const blob = new Blob(["\uFEFF" + lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "export.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  // ─── Cache Invalidation (dipanggil setelah write/delete) ─────────────────────
  // Modul lain bisa set handler ini untuk di-notify saat data berubah.
  const _cacheInvalidateHandlers = [];

  function onCacheInvalidate(fn) {
    _cacheInvalidateHandlers.push(fn);
  }

  function invalidateCache() {
    _cacheInvalidateHandlers.forEach((fn) => fn());
  }

  global.SisuratApi = {
    BASE_URL,
    TABLE_CONFIG,
    DRIVE_FOLDERS,
    getTables,
    getFolderId,
    parseDate,
    normalizeRecord,
    fetchTable,
    fetchAllTables,
    login,
    savePiagam,
    saveRecord,
    updateRecord,
    deleteRecord,
    uploadFile,
    exportCsv,
    onCacheInvalidate,
    invalidateCache,
  };
})(window);
