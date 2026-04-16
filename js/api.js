(function initSisuratApi(global) {
  "use strict";

  const BASE_URL =
    "https://script.google.com/macros/s/AKfycbz1njCfL9mhDMN_4aTjLGU2twkNAtJOn093bOyURBBBdHLcuByi4lUzVpqY0ljDJ2il/exec";

  // ─── Batas ukuran file upload ─────────────────────────────────────────────────
  // Google Apps Script memiliki batas eksekusi 6 menit dan payload ~50MB,
  // namun browser mulai tidak stabil saat encode Base64 file >10MB.
  // Kita batasi di 20MB dan kompres gambar otomatis jika >1MB.
  const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB
  const IMAGE_COMPRESS_THRESHOLD = 1 * 1024 * 1024; // 1 MB
  // PENTING: CacheService GAS memiliki batas 100 KB per nilai.
  // Chunk size raw dalam bytes HARUS kelipatan 3 agar bit padding Base64 tidak kacau saat digabungkan.
  // 48 KB = 49152 bytes (kelipatan 3). Base64 = 65536 karakter (~64 KB). Sangat aman di bawah limit 100 KB.
  const CHUNK_SIZE_BYTES = 48 * 1024; // Wajib kelipatan 3!

  // ─── Google Drive Folder IDs per kategori ─────────────────────────────────
  // Setiap kategori memiliki folder upload tersendiri di Google Drive
  const DRIVE_FOLDERS = Object.freeze({
    db_surat_masuk:
      "18hTuZTOgGuB1bfaEq-5VK8n-7g04Ku6KwKEx5DZ5X5HPbGsexHgx-6Tu-Lj93jQKD6rMdYIO",
    db_surat_keluar:
      "1V190s7wG2iJE4v5JDe5uvhMkziYOnTzJRQlpY23VVr4GWA92RPwI21vp8E8m9znHsXD5qsXj",
    db_piagam_ttd: "1Mg8F5JDGfQmZvJORrlAEKPi-Y6BIlUBG", // folder khusus TTD piagam
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
    // Sertakan identitas aktor untuk validasi RBAC
    const user = typeof SisuratAuth !== "undefined" ? SisuratAuth.getStoredUser() : null;
    if (user && user.username) {
      payload.actor = user.username;
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
    // Sertakan identitas aktor untuk validasi RBAC
    const user = typeof SisuratAuth !== "undefined" ? SisuratAuth.getStoredUser() : null;
    if (user && user.username) {
      payload.actor = user.username;
    }
    // Struktur: { action, data: { table, id, data: payload } } — sesuai backend (params.data.table)
    return postAction("update_record", { table, id, data: payload });
  }

  function deleteRecord(table, id) {
    // Sertakan actor agar backend bisa validasi RBAC + tulis audit log
    const user = typeof SisuratAuth !== "undefined" ? SisuratAuth.getStoredUser() : null;
    const actor = user ? (user.username || user.email || "") : "";
    return postAction("hapus_record", { table, id, actor });
  }

  async function uploadFile(formData) {
    const response = await fetch(BASE_URL, {
      method: "POST",
      body: formData,
    });
    return response.json();
  }

  // ─── Validasi ukuran file ─────────────────────────────────────────────────────
  /**
   * Periksa apakah file melebihi batas maksimum.
   * @param {File} file
   * @returns {{ valid: boolean, message?: string }}
   */
  function validateFileSize(file) {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      const sizeMB = (file.size / 1024 / 1024).toFixed(1);
      const limitMB = (MAX_FILE_SIZE_BYTES / 1024 / 1024).toFixed(0);
      return {
        valid: false,
        message: `File "${file.name}" (${sizeMB} MB) melebihi batas ${limitMB} MB. Kompres file terlebih dahulu atau gunakan format yang lebih kecil.`,
      };
    }
    return { valid: true };
  }

  // ─── Kompresi gambar via Canvas ───────────────────────────────────────────────
  /**
   * Kompres file gambar (JPEG/PNG/WebP) via Canvas API.
   * Jika file ≤ threshold atau bukan gambar, kembalikan file asli.
   * @param {File} file
   * @param {number} [quality=0.82]  JPEG quality (0–1)
   * @param {number} [maxDimension=1920]  Maksimum lebar/tinggi piksel
   * @returns {Promise<File>}  File terkompresi (atau file asli jika tidak perlu)
   */
  function compressImage(file, quality = 0.82, maxDimension = 1920) {
    return new Promise((resolve) => {
      // Hanya kompres gambar yang > threshold
      if (!file.type.startsWith("image/") || file.size <= IMAGE_COMPRESS_THRESHOLD) {
        return resolve(file);
      }

      const img = new Image();
      const objectUrl = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(objectUrl);

        // Hitung dimensi baru dengan mempertahankan aspek rasio
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        // Gunakan JPEG untuk semua gambar (kecuali PNG transparan) agar lebih kecil
        const outputMime = file.type === "image/png" ? "image/png" : "image/jpeg";
        canvas.toBlob(
          (blob) => {
            if (!blob) return resolve(file); // fallback ke file asli
            const compressed = new File([blob], file.name, { type: outputMime });
            // Jika kompresi justru lebih besar (jarang), pakai asli
            resolve(compressed.size < file.size ? compressed : file);
          },
          outputMime,
          quality,
        );
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(file); // fallback ke file asli
      };

      img.src = objectUrl;
    });
  }

  // ─── Chunked File Upload ──────────────────────────────────────────────────────
  /**
   * Upload file ke Google Drive via Apps Script dalam potongan (chunks).
   * Setiap chunk dikirim sebagai Base64 string 1MB.
   * Apps Script mengumpulkan chunk di Properties Service, lalu menggabungkan
   * dan menyimpannya ke Drive saat finalize.
   *
   * @param {File} file              - File yang akan diupload
   * @param {string} folderId        - ID folder Google Drive tujuan
   * @param {function} [onProgress]  - Callback progress(persen: number)
   * @returns {Promise<string>}      - URL publik file di Google Drive
   */
  async function uploadFileChunked(file, folderId, onProgress) {
    // 1. Validasi ukuran
    const validation = validateFileSize(file);
    if (!validation.valid) throw new Error(validation.message);

    // 2. Kompres gambar jika perlu
    const processedFile = await compressImage(file);

    // 3. Konversi ke ArrayBuffer → Base64 (split per chunk)
    const arrayBuffer = await processedFile.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const totalBytes = bytes.length;
    const totalChunks = Math.ceil(totalBytes / CHUNK_SIZE_BYTES);

    // Buat session ID unik untuk upload ini
    const uploadId = `upload_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // 4. Kirim semua chunk
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE_BYTES;
      const end = Math.min(start + CHUNK_SIZE_BYTES, totalBytes);
      const chunk = bytes.slice(start, end);

      // Konversi Uint8Array chunk → Base64 string
      let binary = "";
      for (let j = 0; j < chunk.length; j++) {
        binary += String.fromCharCode(chunk[j]);
      }
      const chunkBase64 = btoa(binary);

      const res = await postAction("upload_chunk", {
        uploadId,
        chunkIndex: i,
        totalChunks,
        chunkBase64,
      });

      if (!res || res.status !== "success") {
        throw new Error(
          (res && res.message) || `Gagal mengirim chunk ${i + 1}/${totalChunks}`,
        );
      }

      if (typeof onProgress === "function") {
        onProgress(Math.round(((i + 1) / totalChunks) * 90)); // maks 90% saat chunk selesai
      }
    }

    // 5. Finalize: gabungkan chunk + simpan ke Drive
    const finalRes = await postAction("finalize_upload", {
      uploadId,
      totalChunks,
      fileName: processedFile.name,
      mimeType: processedFile.type || "application/octet-stream",
      folderId,
    });

    if (!finalRes || finalRes.status !== "success") {
      throw new Error(
        (finalRes && finalRes.message) || "Gagal menyelesaikan upload file.",
      );
    }

    if (typeof onProgress === "function") onProgress(100);

    return finalRes.fileUrl; // URL publik Google Drive
  }

  // ─── Fetch Tabel Referensi (dengan cache sessionStorage + TTL) ───────────────
  /**
   * Ambil data tabel referensi dan cache di sessionStorage selama 10 menit.
   * Data di-fetch ulang jika cache kosong, kedaluwarsa, atau forceRefresh = true.
   *
   * @param {string} tableName       - "ref_sekolah" | "ref_pengambilan" | "ref_jenis_perlombaan"
   * @param {boolean} [forceRefresh] - Paksa fetch ulang meskipun ada cache
   * @returns {Promise<Array>}       - Array objek baris (hanya yang aktif = TRUE)
   */
  const REF_CACHE_TTL_MS = 10 * 60 * 1000; // 10 menit

  async function fetchRef(tableName, forceRefresh = false) {
    const CACHE_KEY = `sisurat_ref_${tableName}`;

    // Cek cache dulu (dengan validasi TTL)
    if (!forceRefresh) {
      try {
        const cached = sessionStorage.getItem(CACHE_KEY);
        if (cached) {
          const { data, timestamp } = JSON.parse(cached);
          const isExpired = Date.now() - timestamp > REF_CACHE_TTL_MS;
          if (!isExpired && Array.isArray(data)) {
            return data;
          }
        }
      } catch (_) {
        // Abaikan error parsing — fetch ulang
      }
    }

    try {
      const url = `${BASE_URL}?action=get_data&table=${encodeURIComponent(tableName)}`;
      const response = await fetch(url);
      const result = await response.json();
      const rows = Array.isArray(result.data) ? result.data : [];

      // Filter hanya baris yang aktif (kolom aktif = "TRUE" atau "true")
      const activeRows = rows.filter(
        (row) => String(row.aktif).toUpperCase() === "TRUE"
      );

      // Simpan ke cache beserta timestamp (hanya jika ada data)
      if (activeRows.length > 0) {
        try {
          sessionStorage.setItem(
            CACHE_KEY,
            JSON.stringify({ data: activeRows, timestamp: Date.now() })
          );
        } catch (_) {
          // sessionStorage penuh / private mode — abaikan
        }
      }

      return activeRows;
    } catch (error) {
      console.error(`Gagal mengambil data referensi ${tableName}:`, error);
      return [];
    }
  }

  /**
   * Invalidasi cache tabel referensi tertentu (dipanggil setelah admin CRUD).
   * @param {string} tableName
   */
  function invalidateRef(tableName) {
    try {
      sessionStorage.removeItem(`sisurat_ref_${tableName}`);
    } catch (_) {}
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
    MAX_FILE_SIZE_BYTES,
    getTables,
    getFolderId,
    parseDate,
    normalizeRecord,
    fetchTable,
    fetchAllTables,
    fetchRef,
    invalidateRef,
    login,
    savePiagam,
    saveRecord,
    updateRecord,
    deleteRecord,
    uploadFile,
    validateFileSize,
    compressImage,
    uploadFileChunked,
    exportCsv,
    onCacheInvalidate,
    invalidateCache,
  };
})(window);
