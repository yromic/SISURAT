(function initSisuratApi(global) {
  "use strict";

  const BASE_URL =
    "https://script.google.com/macros/s/AKfycbzrqXJS9i9opdjuxk-YSJLfj4xLADU_5BOgEAMd9eDKE4vl-4GF5GS0q3PhI58Rt0ng6g/exec";

  // ─── Batas ukuran file upload ─────────────────────────────────────────────────
  // Google Apps Script memiliki batas eksekusi 6 menit dan payload ~50MB,
  // namun browser mulai tidak stabil saat encode Base64 file >10MB.
  // Kita batasi di 10MB dan kompres gambar otomatis jika >1MB.
  const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
  const IMAGE_COMPRESS_THRESHOLD = 1 * 1024 * 1024; // 1 MB
  // PENTING: CacheService GAS memiliki batas 100 KB per nilai.
  // Chunk size raw dalam bytes HARUS kelipatan 3 agar bit padding Base64 tidak kacau saat digabungkan.
  // 72 KB = 73728 bytes (kelipatan 3). Base64 = 98304 karakter (~96 KB). Sangat aman di bawah limit 100 KB.
  const CHUNK_SIZE_BYTES = 72 * 1024; // Wajib kelipatan 3!

  let paginationState = {
    currentPage: 1,
    itemsPerPage: 50,
    currentTable: null,
    totalPages: 0,
    total: 0
  };
 
  // ─── Google Drive Folder IDs per kategori ─────────────────────────────────
  // Setiap kategori memiliki folder upload tersendiri di Google Drive
  // DRIVE_FOLDERS dipindahkan ke backend demi keamanan.

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

  async function fetchTable(table, options = {}) {
    try {
      const fetchOptions = { ...options };
      if (options.onFresh) {
        fetchOptions.onFresh = (freshResult) => {
          const freshData = Array.isArray(freshResult.data) ? freshResult.data : [];
          const normalized = freshData.map((row) => normalizeRecord(row, table));
          options.onFresh(normalized);
        };
      }
      const result = await getData(table, fetchOptions);
      const rows = Array.isArray(result.data) ? result.data : [];
      return rows.map((row) => normalizeRecord(row, table));
    } catch (error) {
      console.error(`Gagal mengambil data dari ${table}:`, error);
      return [];
    }
  }

  async function fetchAllTables(options = {}) {
    const tables = getTables();
    const freshResults = {};

    const results = await Promise.all(
      tables.map((table) => {
        const tableOptions = {};
        if (options.staleWhileRevalidate && options.onFresh) {
          tableOptions.staleWhileRevalidate = true;
          tableOptions.onFresh = (freshData) => {
            freshResults[table] = freshData;
            if (Object.keys(freshResults).length === tables.length) {
              const all = tables.flatMap((t) => freshResults[t]);
              options.onFresh({ byTable: freshResults, all });
            }
          };
        }
        return fetchTable(table, tableOptions);
      })
    );

    const byTable = {};
    tables.forEach((table, index) => {
      byTable[table] = results[index];
    });

    const all = results.flat();
    return { byTable, all };
  }

  function getSessionToken() {
    try {
      const explicitToken = localStorage.getItem("session_token");
      if (explicitToken) return explicitToken;
      const rawValue = localStorage.getItem("user");
      if (!rawValue) return "";
      const user = JSON.parse(rawValue);
      return user.session_token || "";
    } catch (_) {
      return "";
    }
  }

  const divisionTables = [
    "db_surat_masuk",
    "db_surat_keluar",
    "db_piagam",
    "ref_pengambilan",
    "ref_jenis_perlombaan"
  ];

  async function postActionRaw(action, data = {}) {
    const payloadData = { ...data };
    if (action !== "login" && !payloadData.session_token) {
      payloadData.session_token = getSessionToken();
    }

    if (action !== "login") {
      const fp = localStorage.getItem("sisurat_fp") || "";
      payloadData.fp = fp || "missing";
    }

    // Determine current user's role and division
    const userRole = localStorage.getItem("user_role") || "";
    const userDivisi = localStorage.getItem("user_divisi_id") || "";
    const isSA = userRole.toLowerCase().replace(/[\s_-]+/g, "_") === "super_admin";

    // Resolve divisi_id context depending on role (Fix 5: Admin Divisi / Operator ignore active_divisi)
    let activeDiv = "";
    if (isSA) {
      activeDiv = localStorage.getItem("active_divisi") || "";
    } else {
      activeDiv = userDivisi;
    }

    // Fix 4: Super Admin Lockout check
    const isDivisionScopedAction = (action === "simpan_piagam" || action === "upload_chunk" || action === "finalize_upload");
    const isDivisionScopedTable = (payloadData.table && divisionTables.includes(payloadData.table));

    if (isSA && (isDivisionScopedAction || isDivisionScopedTable)) {
      if (!activeDiv) {
        if (typeof SisuratUI !== "undefined") {
          SisuratUI.showError("ERR_400_DIVISI_REQUIRED");
        }
        throw new Error("Pilih divisi aktif terlebih dahulu di sidebar.");
      }
    }

    // Fix 2 & Fix 3: Inject division context to division-scoped requests only
    if (isDivisionScopedAction || isDivisionScopedTable) {
      if (activeDiv) {
        payloadData.divisi_id = activeDiv;
        if (payloadData.data && typeof payloadData.data === "object") {
          payloadData.data.divisi_id = activeDiv;
        }
      }
    }

    // Fix 7: Debug payload
    if (
      (action === "get_data" && (payloadData.table === "db_surat_masuk" || payloadData.table === "ref_pengambilan")) ||
      (action === "simpan_record" && payloadData.table === "ref_pengambilan")
    ) {
      console.log(`[QA][API PAYLOAD] Action: ${action}, Table: ${payloadData.table}, divisi_id: ${payloadData.divisi_id}`);
    }

    const response = await fetch(BASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify({
        action,
        origin: window.location.origin,
        data: payloadData,
      }),
    });

    const resJson = await response.json();
    if (resJson && resJson.status === "success" && window.SisuratCache) {
      if (["init_divisi", "retry_init_divisi", "cleanup_divisi", "deactivate_divisi"].includes(action)) {
        window.SisuratCache.remove("sisurat:v1:divisi:active-list");
        window.SisuratCache.clearByPrefix("sisurat:v1:summary:");
      }
    }
    return resJson;
  }

  async function postAction(action, data = {}) {
    const isMutation = ["simpan_record", "update_record", "hapus_record", "simpan_piagam"].includes(action);
    const isOffline = !navigator.onLine;

    if (isMutation && isOffline && window.SisuratSync) {
      console.warn(`[API] Offline. Memasukkan aksi ${action} ke antrean sync.`);
      window.SisuratSync.enqueue(action, data);
      return { status: "success", optimistic: true };
    }

    try {
      const res = await postActionRaw(action, data);
      return res;
    } catch (error) {
      if (isMutation && window.SisuratSync) {
        console.warn(`[API] Gagal koneksi/timeout. Memasukkan aksi ${action} ke antrean sync.`, error);
        window.SisuratSync.enqueue(action, data);
        return { status: "success", optimistic: true };
      }
      throw error;
    }
  }

  function login(username, password, fp) {
    const payload = { username, password };
    if (fp) {
      payload.fp = fp;
    }
    return postAction("login", payload);
  }

  function logout() {
    return postAction("logout", {});
  }

  function verifySession() {
    return postAction("verify_session", {});
  }

  const CACHE_CONFIGS = Object.freeze({
    db_divisi: {
      ttl: 60 * 60 * 1000, // 60 minutes (1 hour)
      prefix: "sisurat:v1:divisi:active-list"
    },
    db_summary: {
      ttl: 60 * 1000, // 60 seconds
      prefix: "sisurat:v1:summary:"
    },
    db_surat_masuk: {
      ttl: 60 * 1000, // 60 seconds
      prefix: "sisurat:v1:master:db_surat_masuk:"
    },
    db_surat_keluar: {
      ttl: 60 * 1000, // 60 seconds
      prefix: "sisurat:v1:master:db_surat_keluar:"
    },
    db_piagam: {
      ttl: 60 * 1000, // 60 seconds
      prefix: "sisurat:v1:master:db_piagam:"
    }
  });

  function getData(table, options = {}) {
    const isCacheable = CACHE_CONFIGS[table];
    if (!isCacheable) {
      return postAction("get_data", { table });
    }

    const userRole = localStorage.getItem("user_role") || "";
    const userDivisi = localStorage.getItem("user_divisi_id") || "";
    const isSA = userRole.toLowerCase().replace(/[\s_-]+/g, "_") === "super_admin";
    let activeDiv = isSA ? (localStorage.getItem("active_divisi") || "") : userDivisi;

    let cacheKey = "";
    if (table === "db_divisi") {
      cacheKey = CACHE_CONFIGS.db_divisi.prefix;
    } else if (table === "db_summary") {
      cacheKey = `${CACHE_CONFIGS.db_summary.prefix}${userRole}:${activeDiv}`;
    } else {
      cacheKey = `${CACHE_CONFIGS[table].prefix}${userRole}:${activeDiv}`;
    }

    const ttl = CACHE_CONFIGS[table].ttl;
    const fetcher = () => postAction("get_data", { table });

    if (window.SisuratCache) {
      if (options.staleWhileRevalidate) {
        return window.SisuratCache.staleWhileRevalidate(cacheKey, ttl, fetcher, options.onFresh);
      } else {
        return window.SisuratCache.getOrFetch(cacheKey, ttl, fetcher);
      }
    } else {
      return fetcher();
    }
  }

  async function savePiagam(data) {
    const res = await postAction("simpan_piagam", data);
    if (res && res.status === "success" && window.SisuratCache) {
      window.SisuratCache.clearByPrefix("sisurat:v1:master:db_piagam:");
      window.SisuratCache.clearByPrefix("sisurat:v1:summary:");
    }
    return res;
  }

  function getSettings(options = {}) {
    const cacheKey = "sisurat:v1:settings:public";
    const ttl = 30 * 60 * 1000; // 30 minutes
    const fetcher = () => postAction("get_settings", {});

    if (window.SisuratCache) {
      if (options.staleWhileRevalidate) {
        return window.SisuratCache.staleWhileRevalidate(cacheKey, ttl, fetcher, options.onFresh);
      } else {
        return window.SisuratCache.getOrFetch(cacheKey, ttl, fetcher);
      }
    } else {
      return fetcher();
    }
  }

  async function updateSettings(settings) {
    const res = await postAction("update_settings", { settings });
    if (res && res.status === "success" && window.SisuratCache) {
      window.SisuratCache.remove("sisurat:v1:settings:public");
    }
    return res;
  }

  // ─── Master Data CRUD ────────────────────────────────────────────────────────

  /**
   * Kembalikan folder_id Drive yang sesuai untuk upload file.
   * @param {string} table   - nama tabel (db_surat_masuk / db_surat_keluar / db_piagam)
   * @param {boolean} isTtd  - true jika upload adalah TTD piagam
   */
  function getFolderId(table, isTtd = false) {
    if (isTtd) return "db_piagam_ttd";
    return table || null;
  }

  async function saveRecord(table, data) {
    // Tambahkan folder_id otomatis agar backend simpan di folder yang tepat
    const payload = { ...data };
    if (payload.file_base64 && !payload.folder_id) {
      payload.folder_id = getFolderId(table, false);
    }
    if (payload.ttd_base64 && !payload.ttd_folder_id) {
      payload.ttd_folder_id = getFolderId(table, true);
    }
    delete payload.actor;
    delete payload.email_address;
    delete payload.nama_pengupload;
    const res = await postAction("simpan_record", { table, data: payload });
    if (res && res.status === "success" && window.SisuratCache) {
      window.SisuratCache.clearByPrefix(`sisurat:v1:master:${table}:`);
      window.SisuratCache.clearByPrefix("sisurat:v1:summary:");
    }
    return res;
  }

  async function updateRecord(table, id, data) {
    // Tambahkan folder_id otomatis agar backend simpan di folder yang tepat
    const payload = { ...data };
    if (payload.file_base64 && !payload.folder_id) {
      payload.folder_id = getFolderId(table, false);
    }
    if (payload.ttd_base64 && !payload.ttd_folder_id) {
      payload.ttd_folder_id = getFolderId(table, true);
    }
    delete payload.actor;
    delete payload.email_address;
    delete payload.nama_pengupload;
    const res = await postAction("update_record", { table, id, data: payload });
    if (res && res.status === "success" && window.SisuratCache) {
      window.SisuratCache.clearByPrefix(`sisurat:v1:master:${table}:`);
      window.SisuratCache.clearByPrefix("sisurat:v1:summary:");
    }
    return res;
  }

  async function deleteRecord(table, id) {
    const res = await postAction("hapus_record", { table, id });
    if (res && res.status === "success" && window.SisuratCache) {
      window.SisuratCache.clearByPrefix(`sisurat:v1:master:${table}:`);
      window.SisuratCache.clearByPrefix("sisurat:v1:summary:");
    }
    return res;
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

  function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
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

    // 3. Direct upload (bypass chunking) jika file kecil (< 500 KB)
    if (processedFile.size < 500 * 1024) {
      console.log("Direct upload (bypass chunking) for file: " + processedFile.name);
      const base64DataUrl = await fileToDataURL(processedFile);
      const token = getSessionToken();
      const finalRes = await postAction("upload_file", {
        base64DataUrl,
        fileName: processedFile.name,
        folderId,
        session_token: token
      });
      if (!finalRes || finalRes.status !== "success") {
        throw new Error((finalRes && finalRes.message) || "Gagal menyelesaikan upload file.");
      }
      if (typeof onProgress === "function") onProgress(100);
      return finalRes.fileUrl;
    }

    // 4. Konversi ke ArrayBuffer → Base64 (split per chunk)
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

  // ─── Fetch Tabel Referensi (dengan cache SisuratCache + TTL) ─────────────────

  async function fetchRef(tableName, forceRefresh = false) {
    const userRole = localStorage.getItem("user_role") || "";
    const userDivisi = localStorage.getItem("user_divisi_id") || "";
    const isSA = userRole.toLowerCase().replace(/[\s_-]+/g, "_") === "super_admin";
    let activeDiv = isSA ? (localStorage.getItem("active_divisi") || "") : userDivisi;

    let cacheKey = "";
    let ttl = 60 * 60 * 1000; // 60 minutes (1 hour) default for division-scoped static refs
    if (tableName === "ref_sekolah") {
      cacheKey = "sisurat:v1:ref:sekolah";
      ttl = 60 * 60 * 1000; // 60 minutes (1 hour) for global
    } else {
      cacheKey = `sisurat:v1:ref:${tableName}:${activeDiv}`;
    }

    if (!forceRefresh && window.SisuratCache) {
      const cached = window.SisuratCache.get(cacheKey);
      if (cached !== null) {
        return cached;
      }
    }

    try {
      const result = await getData(tableName);
      const rows = Array.isArray(result.data) ? result.data : [];

      // Filter hanya baris yang aktif (kolom aktif = "TRUE" atau "true")
      const activeRows = rows.filter(
        (row) => String(row.aktif).toUpperCase() === "TRUE"
      );

      if (activeRows.length > 0 && window.SisuratCache) {
        window.SisuratCache.set(cacheKey, activeRows, ttl);
      }

      return activeRows;
    } catch (error) {
      console.error(`Gagal mengambil data referensi ${tableName}:`, error);
      return [];
    }
  }

  function invalidateRef(tableName) {
    if (window.SisuratCache) {
      if (tableName === "ref_sekolah") {
        window.SisuratCache.remove("sisurat:v1:ref:sekolah");
      } else {
        window.SisuratCache.clearByPrefix(`sisurat:v1:ref:${tableName}:`);
      }
    }
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


  const _clientCache = {};
  const CLIENT_CACHE_TTL_MS = 60 * 1000; // 60 seconds

  function clearClientCache() {
    for (const k in _clientCache) delete _clientCache[k];
    console.log("CLIENT CACHE: cleared");
  }

  // Hook invalidasi cache untuk membersihkan cache lokal
  onCacheInvalidate(() => {
    clearClientCache();
  });

  async function loadData(table, page = 1, forceRefresh = false) {
    if (table !== paginationState.currentTable) {
      page = 1;
      paginationState.currentTable = table;
    }

    const cacheKey = `${table}_${page}_${paginationState.itemsPerPage}`;
    if (!forceRefresh && _clientCache[cacheKey]) {
      const cached = _clientCache[cacheKey];
      if (Date.now() - cached.timestamp < CLIENT_CACHE_TTL_MS) {
        console.log("CLIENT CACHE HIT: " + cacheKey);
        const res = cached.data;
        paginationState.currentPage = res.page || page;
        paginationState.totalPages = res.totalPages || 0;
        paginationState.total = res.total || 0;
        updatePaginationUI();
        return res;
      }
    }

    console.log("CLIENT CACHE MISS/FORCE: " + cacheKey);
    const token = getSessionToken();
    const res = await postAction("get_data", {
      table: table,
      page: page,
      limit: paginationState.itemsPerPage,
      session_token: token
    });

    if (res && res.status === "success") {
      paginationState.currentPage = res.page || page;
      paginationState.totalPages = res.totalPages || 0;
      paginationState.total = res.total || 0;
      updatePaginationUI();
      _clientCache[cacheKey] = {
        timestamp: Date.now(),
        data: res
      };
    }
    return res;
  }

  async function bootstrapApp(initialTable) {
    const token = getSessionToken();
    const res = await postAction("bootstrap", {
      session_token: token,
      table: initialTable,
      page: 1,
      limit: paginationState.itemsPerPage
    });

    if (res && res.status === "success") {
      if (res.initialData && res.initialData.status === "success") {
        const cacheKey = `${initialTable}_1_${paginationState.itemsPerPage}`;
        _clientCache[cacheKey] = {
          timestamp: Date.now(),
          data: res.initialData
        };
        paginationState.currentPage = res.initialData.page || 1;
        paginationState.totalPages = res.initialData.totalPages || 0;
        paginationState.total = res.initialData.total || 0;
        updatePaginationUI();
      }
    }
    return res;
  }

  function goToPage(newPage) {
    if (newPage >= 1 && newPage <= paginationState.totalPages) {
      if (typeof window.loadTab === "function") {
        paginationState.currentPage = newPage;
        window.loadTab();
      } else {
        loadData(paginationState.currentTable, newPage);
      }
    }
  }

  function updatePaginationUI() {
    const btnPrev = document.getElementById("btn-prev");
    const btnNext = document.getElementById("btn-next");
    const pageInfo = document.getElementById("page-info");

    if (btnPrev) {
      btnPrev.disabled = (paginationState.currentPage <= 1);
    }
    if (btnNext) {
      btnNext.disabled = (paginationState.currentPage >= paginationState.totalPages);
    }
    if (pageInfo) {
      pageInfo.innerText = `Halaman ${paginationState.currentPage} dari ${paginationState.totalPages || 1}`;
    }
  }

  global.SisuratApi = {
    BASE_URL,
    TABLE_CONFIG,
    MAX_FILE_SIZE_BYTES,
    getTables,
    getFolderId,
    parseDate,
    normalizeRecord,
    postAction,
    postActionRaw,
    getData,
    fetchTable,
    fetchAllTables,
    fetchRef,
    invalidateRef,
    login,
    logout,
    verifySession,
    savePiagam,
    getSettings,
    updateSettings,
    saveRecord,
    updateRecord,
    deleteRecord,
    validateFileSize,
    compressImage,
    uploadFileChunked,
    exportCsv,
    onCacheInvalidate,
    invalidateCache,
    paginationState,
    loadData,
    goToPage,
    updatePaginationUI,
    bootstrapApp,
    clearClientCache,
  };
  global.paginationState = paginationState;
  global.loadData = loadData;
  global.goToPage = goToPage;
  global.updatePaginationUI = updatePaginationUI;
  global.bootstrapApp = bootstrapApp;
  global.clearClientCache = clearClientCache;
})(window);
