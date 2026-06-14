// ============================================================
// SISURAT — Google Apps Script Backend
// Versi: 3.1 (Backend RBAC Validation + Audit Log)
//
// PERUBAHAN dari v3.0:
//   - doGet         -> health check only; data/auth melalui POST
//   - _lookupUser() → helper baca db_users per username
//   - _checkRole()  → RBAC validator per action + table (Issue 1 fix)
//   - writeAuditLog() → tulis ke sheet db_audit_log (Issue 2 fix)
//   - simpanRecord  → RBAC check + audit log
//   - updateRecord  → RBAC check + audit log
//   - hapusRecord   → RBAC check + audit log
//   - manageUser    → RBAC check (super_admin only) + audit log
//   - resetPassword → audit log
//
// Sheet yang dibutuhkan:
//   "db_users"      — Kolom: username | password | role | nama | email | role_id
//   "db_audit_log"  — Auto-dibuat: timestamp | actor | action | table | record_id | detail
//
// Folder ID Google Drive per kategori:
//   Surat Masuk  : 18hTuZTOgGuB1bfaEq-5VK8n-7g04Ku6KwKEx5DZ5X5HPbGsexHgx-6Tu-Lj93jQKD6rMdYIO
//   Surat Keluar : 1V190s7wG2iJE4v5JDe5uvhMkziYOnTzJRQlpY23VVr4GWA92RPwI21vp8E8m9znHsXD5qsXj
//   TTD Piagam   : 1Mg8F5JDGfQmZvJORrlAEKPi-Y6BIlUBG
// ============================================================

var ss = SpreadsheetApp.getActiveSpreadsheet();

var headerMap = {
    "timestamp": "timestamp",
    "email address": "email_address",
    "nama pengupload": "nama_pengupload",
    "nomor surat": "nomor_surat",
    "no surat": "nomor_surat",
    "tanggal surat": "tanggal_surat",
    "asal surat": "asal_surat",
    perihal: "perihal",
    "upload file": "upload_file",
    "tanggal surat diterima": "tanggal_terima",
    "tanggal surat di share": "tanggal_share",

    "nama pengambil": "nama_pengambil",
    jabatan: "jabatan",
    "unit kerja": "unit_kerja",
    npsn: "npsn",
    pengambilan: "pengambilan",
    "jenis perlombaan": "jenis_perlombaan",
    "tahun perlombaan": "tahun_perlombaan",
    "nama siswal": "nama_siswa",
    "asal sekolah": "asal_sekolah",
    "ttd pengambil": "ttd_pengambil",

    // ── Tabel Referensi (ref_*) ───────────────────────────────────────────────
    // ref_sekolah
    "nama sekolah": "nama_sekolah",

    // ref_pengambilan & ref_jenis_perlombaan
    // kolom "nama" dan "aktif" sudah di-normalize otomatis oleh normalizeKey()
    // sehingga tidak wajib didaftarkan, tapi didaftarkan eksplisit agar konsisten
    nama: "nama",
    aktif: "aktif",
};

// ─── Folder ID Google Drive per kategori ─────────────────────────────────────
// Masing-masing kategori upload punya folder tujuan tersendiri
var DRIVE_FOLDERS = {
    db_surat_masuk: "18hTuZTOgGuB1bfaEq-5VK8n-7g04Ku6KwKEx5DZ5X5HPbGsexHgx-6Tu-Lj93jQKD6rMdYIO",
    db_surat_keluar: "1V190s7wG2iJE4v5JDe5uvhMkziYOnTzJRQlpY23VVr4GWA92RPwI21vp8E8m9znHsXD5qsXj",
    db_piagam_ttd: "1Mg8F5JDGfQmZvJORrlAEKPi-Y6BIlUBG", // folder khusus TTD piagam
};

// Folder fallback jika kategori tidak cocok
var DRIVE_FOLDER_ID = "1Mg8F5JDGfQmZvJORrlAEKPi-Y6BIlUBG";

var SESSION_TTL_SECONDS = 2 * 60 * 60;
var LOGIN_FAIL_LIMIT = 5;
var LOGIN_BLOCK_SECONDS = 15 * 60;

// ─── RBAC Rules: permission per action + table [Issue 1 Fix] ─────────────────
var RBAC_RULES = {
    "get_data:db_surat_masuk":  ["super_admin", "admin", "operator"],
    "get_data:db_surat_keluar": ["super_admin", "admin", "operator"],
    "get_data:db_piagam":       ["super_admin", "admin", "operator"],
    "get_data:db_users":        ["super_admin", "admin"],
    "get_data:ref_sekolah":     ["super_admin", "admin", "operator"],
    "get_data:ref_pengambilan": ["super_admin", "admin", "operator"],
    "get_data:ref_jenis_perlombaan": ["super_admin", "admin", "operator"],
    "create:db_surat_masuk":    ["super_admin", "admin", "operator"],
    "create:db_surat_keluar":   ["super_admin", "admin", "operator"],
    "create:db_piagam":         ["super_admin", "admin", "operator"],
    "update:db_surat_masuk":    ["super_admin", "admin"],
    "update:db_surat_keluar":   ["super_admin", "admin"],
    "update:db_piagam":         ["super_admin", "admin"],
    "delete:db_surat_masuk":    ["super_admin", "admin"],
    "delete:db_surat_keluar":   ["super_admin", "admin"],
    "delete:db_piagam":         ["super_admin", "admin"],
    "manage_user:*":            ["super_admin"],
    "reset_password:*":         ["super_admin"],
};

function _errorResponse(code) {
    return responseJSON({ status: "error", code: code, message: code });
}

function _logServerError(context, error) {
    var detail = context + ": " + (error && error.stack ? error.stack : String(error));
    writeAuditLog("system", "-", "SERVER_ERROR", context, "-", detail);
    console.error(detail);
}

function _serverError(context, error) {
    _logServerError(context, error);
    return _errorResponse("ERR_500_SERVER");
}

function _sessionKey(token) {
    return "session_" + token;
}

function _sessionToken(data) {
    return data && data.session_token ? String(data.session_token).trim() : "";
}

function _sessionJson(session) {
    return JSON.stringify({
        token: session.token,
        username: session.username,
        nama: session.nama,
        email: session.email,
        role: session.role,
        role_id: session.role_id || "",
        divisi_id: session.divisi_id || "",
        scope: session.scope || "",
        expires: session.expires,
    });
}

function _storeSession(session) {
    var key = _sessionKey(session.token);
    var json = _sessionJson(session);
    CacheService.getScriptCache().put(key, json, SESSION_TTL_SECONDS);
    PropertiesService.getScriptProperties().setProperty(key, json);
}

function _deleteSession(token) {
    if (!token) return;
    var key = _sessionKey(token);
    CacheService.getScriptCache().remove(key);
    PropertiesService.getScriptProperties().deleteProperty(key);
}

function _createSession(user) {
    var session = {
        token: Utilities.getUuid(),
        username: user.username,
        nama: user.nama,
        email: user.email || "",
        role: user.role,
        role_id: user.role_id || "",
        divisi_id: user.divisi_id || "",
        scope: user.scope || "",
        expires: Date.now() + SESSION_TTL_SECONDS * 1000,
    };
    _storeSession(session);
    return session;
}

function _getSession(token) {
    if (!token) {
        return { ok: false, detail: "missing token" };
    }

    var key = _sessionKey(token);
    var raw = CacheService.getScriptCache().get(key);
    if (!raw) {
        raw = PropertiesService.getScriptProperties().getProperty(key);
    }
    if (!raw) {
        return { ok: false, detail: "token not found" };
    }

    var session;
    try {
        session = JSON.parse(raw);
    } catch (err) {
        _deleteSession(token);
        return { ok: false, detail: "session parse failed" };
    }

    if (!session.expires || Number(session.expires) <= Date.now()) {
        _deleteSession(token);
        return { ok: false, detail: "token expired" };
    }

    var user = _lookupUser(session.username);
    if (!user || user.aktif === false) {
        _deleteSession(token);
        return { ok: false, detail: "user inactive or missing" };
    }

    session.nama = user.nama;
    session.email = user.email || "";
    session.role = user.role;
    session.role_id = user.role_id || "";
    session.divisi_id = user.divisi_id || "";
    session.scope = user.scope || "";
    session.expires = Date.now() + SESSION_TTL_SECONDS * 1000;
    _storeSession(session);

    return { ok: true, session: session };
}

function _requireSessionFromData(data, action) {
    var result = _getSession(_sessionToken(data));
    if (!result.ok) {
        writeAuditLog("system", "-", "DENIED:session", action || "-", "-", result.detail);
    }
    return result;
}

function _sessionResponse(result) {
    if (!result || !result.ok) {
        return _errorResponse("ERR_401_SESSION");
    }
    return null;
}

function _publicSession(session) {
    return {
        username: session.username,
        nama: session.nama,
        email: session.email,
        role: session.role,
        role_id: session.role_id || "",
        role_ids: session.role_id ? [session.role_id] : [],
        divisi_id: session.divisi_id || "",
        scope: session.scope || "",
        expires: session.expires,
    };
}

// ─── Helper: baca user dari db_users berdasarkan username ────────────────────
function _lookupUser(username) {
    if (!username) return null;
    var sheet = ss.getSheetByName("db_users") || ss.getSheetByName("users");
    if (!sheet) return null;
    var data = sheet.getDataRange().getDisplayValues();
    var headers = data[0].map(function(h){ return h.toLowerCase().trim(); });
    var uCol = headers.indexOf("username");
    if (uCol < 0) return null;
    for (var i = 1; i < data.length; i++) {
        var row = data[i];
        if (String(row[uCol]).trim() !== String(username).trim()) continue;
        var get = function(name) {
            var idx = headers.indexOf(name);
            return idx >= 0 ? String(row[idx]).trim() : "";
        };
        return {
            username: get("username"),
            role:     get("role").toLowerCase().replace(/[\s_-]+/g, "_"),
            nama:     get("nama") || username,
            email:    get("email"),
            role_id:  get("role_id"),
            divisi_id: get("divisi_id"),
            scope:    get("scope"),
            aktif:    (function(value) {
                if (value === "") return true;
                return /^(true|1|yes|ya|aktif)$/i.test(String(value).trim());
            })(get("aktif") || get("active")),
        };
    }
    return null;
}

// ─── Helper: validasi RBAC per action + table ─────────────────────────────────
// @returns {allowed: boolean, role: string, msg: string}
function _checkRole(actor_username, action, tableName) {
    var user = _lookupUser(actor_username);
    if (!user) {
        return { allowed: false, role: "", msg: "Actor tidak ditemukan: " + actor_username };
    }
    var role = user.role;
    // Super Admin bypass semua permission
    if (role === "super_admin") {
        return { allowed: true, role: role, msg: "" };
    }
    var specificKey = action + ":" + tableName;
    var wildcardKey = action + ":*";
    var allowedRoles = RBAC_RULES[specificKey] || RBAC_RULES[wildcardKey] || [];
    var allowed = allowedRoles.indexOf(role) !== -1;
    return {
        allowed: allowed,
        role: role,
        msg: allowed ? "" : ("Role '" + role + "' tidak diizinkan untuk " + action + " pada " + tableName),
    };
}

// ─── Helper: Tulis Audit Log ke sheet db_audit_log [Issue 2 Fix] ─────────────
// Kolom: Timestamp | Actor | Role | Action | Table | Record ID | Detail
// Sheet auto-dibuat dengan format header jika belum ada.
function writeAuditLog(actor, role, action, tableName, recordId, detail) {
    try {
        var logSheet = ss.getSheetByName("db_audit_log");
        if (!logSheet) {
            logSheet = ss.insertSheet("db_audit_log");
            logSheet.appendRow(["Timestamp", "Actor", "Role", "Action", "Table", "Record ID", "Detail"]);
            logSheet.setFrozenRows(1);
            logSheet.getRange(1, 1, 1, 7)
                .setBackground("#222831")
                .setFontColor("#FFFFFF")
                .setFontWeight("bold");
        }
        logSheet.appendRow([
            new Date(),
            actor     || "system",
            role      || "-",
            action    || "-",
            tableName || "-",
            recordId  || "-",
            detail    || "-",
        ]);
    } catch (logErr) {
        // Error audit log tidak boleh interrupt request utama
        console.error("writeAuditLog error: " + logErr.toString());
    }
}

// ─── doGet ───────────────────────────────────────────────────────────────────
function doGet(e) {
    var action = e && e.parameter ? e.parameter.action : "";

    if (action == "get_data") {
        return _errorResponse("ERR_405_POST_REQUIRED");
    }

    if (action == "verify_session") {
        return _errorResponse("ERR_405_POST_REQUIRED");
    }

    return ContentService.createTextOutput("API SISURAT v3.1").setMimeType(
        ContentService.MimeType.TEXT,
    );
}


// ─── doPost ──────────────────────────────────────────────────────────────────
// Frontend mengirim body dengan struktur:
//   { action, data: { table, id?, data } }
function doPost(e) {
    try {
        if (!e || !e.postData || !e.postData.contents) {
            return responseJSON({ status: "error", message: "Data post kosong" });
        }

        var params = JSON.parse(e.postData.contents);
        var action = params.action;
        var data = params.data || {};
        var sessionResult;
        var sessionError;

        if (action == "simpan_piagam") {
            sessionResult = _requireSessionFromData(data, action);
            sessionError = _sessionResponse(sessionResult);
            if (sessionError) return sessionError;
            return simpanPiagam(data, sessionResult.session);
        } else if (action == "login") {
            return cekLogin(data);
        } else if (action == "verify_session") {
            sessionResult = _requireSessionFromData(data, action);
            sessionError = _sessionResponse(sessionResult);
            if (sessionError) return sessionError;
            return responseJSON({ status: "success", user: _publicSession(sessionResult.session) });
        } else if (action == "logout") {
            sessionResult = _requireSessionFromData(data, action);
            sessionError = _sessionResponse(sessionResult);
            if (sessionError) return sessionError;
            _deleteSession(sessionResult.session.token);
            writeAuditLog(sessionResult.session.username, sessionResult.session.role, "logout", "-", "-", "Logout");
            return responseJSON({ status: "success", message: "Logout berhasil" });
        } else if (action == "get_data") {
            sessionResult = _requireSessionFromData(data, action);
            sessionError = _sessionResponse(sessionResult);
            if (sessionError) return sessionError;
            var tableName = data.table || "";
            var rbacGet = _checkRole(sessionResult.session.username, "get_data", tableName);
            if (!rbacGet.allowed) {
                writeAuditLog(sessionResult.session.username, rbacGet.role, "DENIED:get_data", tableName, "-", rbacGet.msg);
                return _errorResponse("ERR_403_ROLE");
            }
            return getData(tableName);
        } else if (action == "simpan_record") {
            sessionResult = _requireSessionFromData(data, action);
            sessionError = _sessionResponse(sessionResult);
            if (sessionError) return sessionError;
            return simpanRecord(data.table, data.data || {}, sessionResult.session);
        } else if (action == "update_record") {
            sessionResult = _requireSessionFromData(data, action);
            sessionError = _sessionResponse(sessionResult);
            if (sessionError) return sessionError;
            return updateRecord(data.table, data.id, data.data || {}, sessionResult.session);
        } else if (action == "hapus_record") {
            sessionResult = _requireSessionFromData(data, action);
            sessionError = _sessionResponse(sessionResult);
            if (sessionError) return sessionError;
            return hapusRecord(data.table, data.id, sessionResult.session);
        } else if (action == "upload_chunk") {
            sessionResult = _requireSessionFromData(data, action);
            sessionError = _sessionResponse(sessionResult);
            if (sessionError) return sessionError;
            return handleUploadChunk(data);
        } else if (action == "finalize_upload") {
            sessionResult = _requireSessionFromData(data, action);
            sessionError = _sessionResponse(sessionResult);
            if (sessionError) return sessionError;
            return finalizeUpload(data);

        // ── RBAC: User Management (v3.0) ──────────────────────────────────────
        } else if (action == "manage_user") {
            sessionResult = _requireSessionFromData(data, action);
            sessionError = _sessionResponse(sessionResult);
            if (sessionError) return sessionError;
            return manageUser(data, sessionResult.session);
        } else if (action == "reset_password") {
            sessionResult = _requireSessionFromData(data, action);
            sessionError = _sessionResponse(sessionResult);
            if (sessionError) return sessionError;
            return resetPassword(data, sessionResult.session);
        }

        return responseJSON({ status: "error", message: "Action tidak dikenal: " + action });
    } catch (error) {
        return _serverError("doPost", error);
    }
}

// ─── Login ───────────────────────────────────────────────────────────────────
// Sheet "db_users" (v3.0) atau "users" (legacy).
// Kolom yang diharapkan:
//   A: username | B: password | C: role | D: nama | E: email | F: role_id (opsional)
function cekLogin(data) {
    data = data || {};
    var username = String(data.username || "").trim();
    var password = String(data.password || "");
    var failKey = "login_fail_" + username.toLowerCase();
    var cache = CacheService.getScriptCache();
    var failed = parseInt(cache.get(failKey) || "0", 10);

    if (!username || !password) {
        return responseJSON({ status: "error", message: "Username atau Password salah!" });
    }

    // Coba sheet baru "db_users" dulu, fallback ke "users" (backward compat)
    var sheet = ss.getSheetByName("db_users") || ss.getSheetByName("users");
    if (!sheet) {
        writeAuditLog("system", "-", "SERVER_ERROR", "login", "-", "Sheet users tidak ditemukan");
        return _errorResponse("ERR_500_SERVER");
    }

    var dataUsers = sheet.getDataRange().getDisplayValues();
    var headers   = dataUsers[0].map(function(h){ return h.toLowerCase().trim(); });

    // Helper: ambil nilai kolom berdasarkan nama header
    function col(row, name) {
        var idx = headers.indexOf(name);
        return idx >= 0 ? row[idx] : "";
    }

    for (var i = 1; i < dataUsers.length; i++) {
        var row    = dataUsers[i];
        var dbUser = col(row, "username") || row[0];
        var dbPass = col(row, "password") || row[1];

        if (dbUser == username && dbPass == password) {
            var user = _lookupUser(dbUser);
            if (!user || user.aktif === false) {
                writeAuditLog(dbUser || "system", "-", "DENIED:login", "-", "-", "Akun nonaktif atau tidak ditemukan");
                return responseJSON({ status: "error", message: "Username atau Password salah!" });
            }
            cache.remove(failKey);
            var session = _createSession(user);
            writeAuditLog(user.username, user.role, "login", "-", "-", "Login berhasil");
            return responseJSON({
                status: "success",
                message: "Login Berhasil",
                session_token: session.token,
                user: _publicSession(session),
            });
        }
    }

    failed += 1;
    cache.put(failKey, String(failed), LOGIN_BLOCK_SECONDS);
    writeAuditLog(username, "-", "DENIED:login", "-", "-", "Login gagal ke-" + failed);
    if (failed >= LOGIN_FAIL_LIMIT) {
        return responseJSON({
            status: "error",
            code: "ERR_429_LOGIN",
            message: "Terlalu banyak percobaan login. Coba lagi dalam 15 menit.",
        });
    }

    return responseJSON({
        status: "error",
        message: "Username atau Password salah!",
    });
}

// ─── Helper: Normalisasi header kolom ────────────────────────────────────────
function normalizeHeader(header) {
    return header
        .toLowerCase()
        .trim()
        .replace(/\(.*?\)/g, "")
        .replace(/[^\w\s]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

// ─── Helper: normalize key kolom header (spasi → underscore) ─────────────────
function normalizeKey(header) {
    return header
        .toLowerCase()
        .trim()
        .replace(/\(.*?\)/g, "")
        .replace(/[^\w\s]/g, "")
        .replace(/\s+/g, "_")
        .trim();
}

// ─── Helper: Ambil data dari sheet ───────────────────────────────────────────
// Tabel users yang boleh di-read oleh admin (password akan di-strip)
var USER_TABLES = ["db_users", "users"];

function getData(tableName) {
    // Tabel users: izinkan read tapi strip kolom password sebelum dikirim
    var isUserTable = USER_TABLES.indexOf(tableName) !== -1;
    if (tableName == "users" && tableName != "db_users") {
        // "users" (legacy) tetap diblokir langsung untuk keamanan
        return responseJSON({ status: "error", message: "Akses ditolak" });
    }

    var sheet = ss.getSheetByName(tableName);
    if (!sheet) {
        return responseJSON({
            status: "error",
            message: "Tabel tidak ditemukan: " + tableName,
        });
    }

    var data = sheet.getDataRange().getDisplayValues();
    if (data.length <= 1) {
        return responseJSON({ status: "success", data: [] });
    }

    var headers = data[0];
    var rows = data.slice(1);

    var result = rows.map(function (row, rowIndex) {
        var obj = {};

        // Sisipkan nomor baris sheet (row 2 = data pertama, dst.)
        // Frontend menggunakan ini sebagai ID untuk delete/update
        obj.row_number = rowIndex + 2;

        headers.forEach(function (header, index) {
            var clean = normalizeHeader(header);
            var finalKey = headerMap[clean]
                ? headerMap[clean]
                : clean.replace(/\s+/g, "_");

            // ── Keamanan: Jangan pernah kirim kolom password ke frontend ──────
            if (finalKey === "password") return;

            if (obj[finalKey] !== undefined && finalKey !== "row_number") {
                obj[finalKey + "_2"] = row[index];
            } else {
                obj[finalKey] = row[index];
            }
        });
        return obj;
    });

    return responseJSON({ status: "success", data: result });
}

// ─── Helper: Response JSON ────────────────────────────────────────────────────
function responseJSON(object) {
    return ContentService.createTextOutput(JSON.stringify(object)).setMimeType(
        ContentService.MimeType.JSON,
    );
}

// ─── Simpan Piagam (legacy – dari piagam.html) ───────────────────────────────
function simpanPiagam(dataInput, session) {
    if (!dataInput) {
        return responseJSON({
            status: "error",
            message: "Data Input tidak diterima oleh fungsi simpanPiagam.",
        });
    }

    var actor = session.username;
    var rbac = _checkRole(actor, "create", "db_piagam");
    if (!rbac.allowed) {
        writeAuditLog(actor, rbac.role, "DENIED:create", "db_piagam", "-", rbac.msg);
        return _errorResponse("ERR_403_ROLE");
    }

    var sheet = ss.getSheetByName("db_piagam");
    if (!sheet) {
        return responseJSON({ status: "error", message: "Tabel tidak ditemukan: db_piagam" });
    }

    var linkTTD = "";

    if (dataInput.ttd_base64 && dataInput.ttd_base64.includes("base64,")) {
        try {
            var splitBase64 = dataInput.ttd_base64.split(",");
            var imageBlob = Utilities.newBlob(
                Utilities.base64Decode(splitBase64[1]),
                "image/png",
                "ttd_" + Date.now() + ".png",
            );

            var folderId = DRIVE_FOLDERS.db_piagam_ttd;
            var folder = DriveApp.getFolderById(folderId);

            var file = folder.createFile(imageBlob);
            file.setSharing(
                DriveApp.Access.ANYONE_WITH_LINK,
                DriveApp.Permission.VIEW,
            );
            var fileId = file.getId();
            linkTTD = "https://drive.google.com/uc?export=view&id=" + fileId;
        } catch (err) {
            return _serverError("simpanPiagam.uploadTTD", err);
        }
    }

    dataInput.email_address = session.email || session.username;
    dataInput.nama_pengupload = session.nama || session.username;
    dataInput.divisi_id = session.divisi_id || "";
    dataInput.ttd_pengambil = linkTTD;
    delete dataInput.actor;
    delete dataInput.ttd_base64;
    delete dataInput.ttd_folder_id;

    var now = new Date();
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var newRow = headers.map(function(header) {
        var headerNorm = String(header).toLowerCase().trim();
        if (headerNorm === "id") return Utilities.getUuid();
        if (headerNorm === "timestamp") return now;
        if (headerNorm === "email address") return dataInput.email_address;
        if (headerNorm === "nama pengupload") return dataInput.nama_pengupload;
        if (headerNorm === "divisi_id") return dataInput.divisi_id;
        var key = headerMap[normalizeHeader(header)] || normalizeKey(header);
        if (key === "npsn") return "'" + (dataInput[key] || "-");
        return dataInput[key] !== undefined ? dataInput[key] : "";
    });

    sheet.appendRow(newRow);
    writeAuditLog(actor, rbac.role, "create", "db_piagam", "-", "Tambah piagam");

    return responseJSON({
        status: "success",
        message: "Data Berhasil Disimpan!",
    });
}

// ─── Helper: Pancingan izin DriveApp ─────────────────────────────────────────
function pancingIzin() {
    var folder = DriveApp.getRootFolder();
    folder.createFile("pancingan.txt", "Tes Izin", MimeType.PLAIN_TEXT);
    console.log("Izin CREATE FILE berhasil didapatkan!");
}

// ─── Helper: Upload file (base64) ke Google Drive ────────────────────────────
// Parameter folderId bersifat opsional; jika tidak dikirim, pakai DRIVE_FOLDER_ID default
function uploadFileToDrive(base64DataUrl, fileName, folderId) {
    // Format: "data:<mime>;base64,<data>"
    var parts = base64DataUrl.split(",");
    if (parts.length < 2) throw new Error("Format base64 tidak valid");

    var meta = parts[0]; // "data:application/pdf;base64"
    var contentMatch = meta.match(/data:([^;]+);/);
    var mimeType = contentMatch ? contentMatch[1] : "application/octet-stream";

    var blob = Utilities.newBlob(
        Utilities.base64Decode(parts[1]),
        mimeType,
        fileName || ("file_" + Date.now())
    );

    // Gunakan folderId yang dikirim frontend, atau fallback ke default
    var targetFolderId = folderId || DRIVE_FOLDER_ID;
    var folder = DriveApp.getFolderById(targetFolderId);
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return "https://drive.google.com/uc?export=view&id=" + file.getId();
}

// ─── Chunked Upload: Terima satu chunk Base64 ────────────────────────────────
// Chunk dikirim sebagai Base64 string yang bersih.
// Chunk disimpan sementara di CacheService untuk menghindari limit 500KB PropertiesService.
// Kunci: "chunk_<uploadId>_<chunkIndex>"
function handleUploadChunk(data) {
    try {
        var uploadId    = data.uploadId;
        var chunkIndex  = data.chunkIndex;
        var chunkBase64 = data.chunkBase64;

        if (!uploadId || chunkIndex === undefined || !chunkBase64) {
            return responseJSON({ status: "error", message: "Parameter chunk tidak lengkap" });
        }

        var key = "chunk_" + uploadId + "_" + chunkIndex;
        CacheService.getScriptCache().put(key, chunkBase64, 3600); // Expiry 1 jam

        return responseJSON({ status: "success", message: "Chunk " + chunkIndex + " diterima" });
    } catch (err) {
        return _serverError("handleUploadChunk", err);
    }
}

// ─── Chunked Upload: Finalize ─────────────────────────────────────────────────
// Setelah semua chunk diterima, gabungkan menjadi satu file dan simpan ke Drive.
// Bersihkan semua chunk dari CacheService setelah selesai.
function finalizeUpload(data) {
    try {
        var uploadId    = data.uploadId;
        var totalChunks = parseInt(data.totalChunks, 10);
        var fileName    = data.fileName  || ("file_" + Date.now());
        var mimeType    = data.mimeType  || "application/octet-stream";
        var folderId    = data.folderId  || DRIVE_FOLDER_ID;

        if (!uploadId || !totalChunks) {
            return responseJSON({ status: "error", message: "Parameter finalize tidak lengkap" });
        }

        var cache = CacheService.getScriptCache();

        // Gabungkan semua Base64 chunks menjadi satu string
        var fullBase64 = "";
        for (var i = 0; i < totalChunks; i++) {
            var key = "chunk_" + uploadId + "_" + i;
            var chunk = cache.get(key);
            if (!chunk) {
                // Bersihkan chunk yang sudah ada sebelum return error
                for (var j = 0; j < i; j++) {
                    cache.remove("chunk_" + uploadId + "_" + j);
                }
                return responseJSON({
                    status: "error",
                    message: "Chunk " + i + " tidak ditemukan. Coba upload ulang."
                });
            }
            fullBase64 += chunk;
        }

        // Hapus semua chunk dari Cache setelah digabungkan
        for (var k = 0; k < totalChunks; k++) {
            cache.remove("chunk_" + uploadId + "_" + k);
        }

        // Buat blob dari Base64 gabungan dan simpan ke Google Drive
        var blob = Utilities.newBlob(
            Utilities.base64Decode(fullBase64),
            mimeType,
            fileName
        );

        var folder = DriveApp.getFolderById(folderId);
        var file = folder.createFile(blob);
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        var fileUrl = "https://drive.google.com/uc?export=view&id=" + file.getId();

        return responseJSON({
            status: "success",
            message: "File berhasil disimpan ke Drive.",
            fileUrl: fileUrl
        });
    } catch (err) {
        return _serverError("finalizeUpload", err);
    }
}

// ─── Helper: Hapus file dari Drive berdasarkan URL ───────────────────────────
// Mendukung URL format: uc?export=view&id=xxx, /file/d/ID/view, /d/ID
function deleteFileFromDrive(fileUrl) {
    try {
        if (!fileUrl || fileUrl.indexOf("id=") === -1 && fileUrl.indexOf("/d/") === -1) return;
        var idMatch = fileUrl.match(/[?&]id=([^&]+)/) ||
            fileUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
            fileUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
        if (!idMatch) return;
        var fileId = idMatch[1];
        DriveApp.getFileById(fileId).setTrashed(true);
    } catch (e) {
        // Abaikan jika file tidak ada atau sudah dihapus
        console.log("deleteFileFromDrive: " + e.toString());
    }
}

// ─── Helper: cari nomor baris di sheet ───────────────────────────────────────
// Mendukung dua mode:
//   - id berupa angka (misal: 2, 3, 4) → dianggap nomor baris sheet langsung
//   - id berupa UUID/string            → cari nilai di kolom A
function getSheetRow(sheet, id) {
    var num = parseInt(id, 10);
    var lastRow = sheet.getLastRow();

    // Mode nomor baris langsung
    if (!isNaN(num) && String(num) === String(id) && num >= 2 && num <= lastRow) {
        return num;
    }

    // Mode cari UUID / string di kolom pertama
    var colA = sheet.getRange(1, 1, lastRow, 1).getValues();
    for (var i = 1; i < colA.length; i++) {
        if (String(colA[i][0]).trim() === String(id).trim()) {
            return i + 1; // +1: getValues 0-indexed, sheet 1-indexed
        }
    }
    return -1;
}

// ─── Simpan record baru ke sheet ─────────────────────────────────────────────
// data.folder_id      → folder Drive untuk file upload biasa (Surat Masuk/Keluar)
// data.ttd_folder_id  → folder Drive untuk TTD piagam
// Identitas penginput ditetapkan backend dari session.
function simpanRecord(tableName, dataInput, session) {
    // Blokir akses langsung ke tabel users via simpan_record umum
    if (tableName == "users" || tableName == "db_users") {
        return responseJSON({ status: "error", message: "Gunakan action manage_user untuk mengelola user" });
    }

    // ─── RBAC validation (Issue 1 fix) ───────────────────────────────
    var actor = session.username;
    var rbac  = _checkRole(actor, "create", tableName);
    if (!rbac.allowed) {
        writeAuditLog(actor, rbac.role, "DENIED:create", tableName, "-", rbac.msg);
        return _errorResponse("ERR_403_ROLE");
    }

    var sheet = ss.getSheetByName(tableName);
    if (!sheet) {
        return responseJSON({ status: "error", message: "Tabel tidak ditemukan: " + tableName });
    }

    // Proses upload file lampiran jika ada (legacy Base64 — hanya jika upload_file belum ada)
    // Catatan: Sejak v3.0, file dokumen dikirim via chunked upload dan upload_file sudah berisi URL.
    //          Blok ini tetap dipertahankan untuk kompatibilitas jika ada client lama.
    if (!dataInput.upload_file && dataInput.file_base64 && dataInput.file_base64.indexOf("base64,") !== -1) {
        try {
            var fileFolderId = dataInput.folder_id || DRIVE_FOLDERS[tableName] || DRIVE_FOLDER_ID;
            dataInput.upload_file = uploadFileToDrive(
                dataInput.file_base64,
                dataInput.file_name || "",
                fileFolderId
            );
        } catch (err) {
            return _serverError("simpanRecord.uploadFile", err);
        }
    }
    // Bersihkan field sementara agar tidak masuk ke spreadsheet
    delete dataInput.file_base64;
    delete dataInput.file_name;
    delete dataInput.folder_id;

    // Proses upload TTD piagam jika ada (masih via Base64 karena gambar kecil)
    if (dataInput.ttd_base64 && dataInput.ttd_base64.indexOf("base64,") !== -1) {
        try {
            var ttdFolderId = dataInput.ttd_folder_id || DRIVE_FOLDERS.db_piagam_ttd || DRIVE_FOLDER_ID;
            var ttdFileName = "ttd_" + Date.now() + ".png";
            dataInput.ttd_pengambil = uploadFileToDrive(dataInput.ttd_base64, ttdFileName, ttdFolderId);
            delete dataInput.ttd_base64;
            delete dataInput.ttd_folder_id;
        } catch (err) {
            return _serverError("simpanRecord.uploadTTD", err);
        }
    }

    dataInput.email_address = session.email || session.username;
    dataInput.nama_pengupload = session.nama || session.username;
    dataInput.divisi_id = session.divisi_id || "";
    delete dataInput.actor;

    // Waktu input saat ini (untuk kolom Timestamp)
    var now = new Date();

    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var newRow = headers.map(function (header, colIdx) {
        var headerNorm = header.toLowerCase().trim();

        // Kolom Timestamp → isi waktu saat ini
        if (headerNorm === "timestamp") {
            return now;
        }

        // Kolom Email Address → isi dari data yang dikirim frontend (username/email admin)
        if (headerNorm === "email address") {
            return session.email || session.username;
        }

        if (headerNorm === "nama pengupload") {
            return session.nama || session.username;
        }

        if (headerNorm === "divisi_id") {
            return session.divisi_id || "";
        }

        // Kolom ID (hanya jika nama kolomnya benar-benar "id") → UUID
        if (headerNorm === "id") {
            return Utilities.getUuid();
        }

        var key = headerMap[normalizeHeader(header)] || normalizeKey(header);
        return dataInput[key] !== undefined ? dataInput[key] : "";
    });

    sheet.appendRow(newRow);

    // ─── Audit Log (Issue 2 fix) ──────────────────────────────────
    writeAuditLog(actor, rbac.role, "create", tableName, "-",
        "Tambah data baru ke " + tableName);

    return responseJSON({ status: "success", message: "Data berhasil disimpan!" });
}

// ─── Update record berdasarkan ID ─────────────────────────────────────────────
// data.folder_id    → folder untuk file upload baru (Surat Masuk/Keluar)
// data.ttd_folder_id → folder untuk TTD piagam baru
function updateRecord(tableName, id, dataInput, session) {
    if (tableName == "users" || tableName == "db_users") {
        return responseJSON({ status: "error", message: "Gunakan action manage_user untuk mengelola user" });
    }

    // ─── RBAC validation (Issue 1 fix) ───────────────────────────────
    var actor = session.username;
    var rbac  = _checkRole(actor, "update", tableName);
    if (!rbac.allowed) {
        writeAuditLog(actor, rbac.role, "DENIED:update", tableName, id, rbac.msg);
        return _errorResponse("ERR_403_ROLE");
    }

    var sheet = ss.getSheetByName(tableName);
    if (!sheet) {
        return responseJSON({ status: "error", message: "Tabel tidak ditemukan: " + tableName });
    }

    var rowNumber = getSheetRow(sheet, id);
    if (rowNumber === -1) {
        return responseJSON({ status: "error", message: "Data tidak ditemukan (id: " + id + ")" });
    }

    // Proses upload file lampiran baru jika ada
    // Skenario 1: Chunked upload (v3.0+) — upload_file sudah berisi URL dari frontend
    if (dataInput.upload_file && dataInput.old_file_url) {
        // File baru sudah terupload via chunked, hapus file lama dari Drive
        deleteFileFromDrive(dataInput.old_file_url);
        delete dataInput.old_file_url;
        delete dataInput.file_base64;
        delete dataInput.file_name;
        delete dataInput.folder_id;
    // Skenario 2: Legacy Base64 (backward compat untuk client lama)
    } else if (!dataInput.upload_file && dataInput.file_base64 && dataInput.file_base64.indexOf("base64,") !== -1) {
        try {
            if (dataInput.old_file_url) {
                deleteFileFromDrive(dataInput.old_file_url);
                delete dataInput.old_file_url;
            }
            var fileFolderId = dataInput.folder_id || DRIVE_FOLDERS[tableName] || DRIVE_FOLDER_ID;
            dataInput.upload_file = uploadFileToDrive(
                dataInput.file_base64,
                dataInput.file_name || "",
                fileFolderId
            );
            delete dataInput.file_base64;
            delete dataInput.file_name;
            delete dataInput.folder_id;
        } catch (err) {
            return _serverError("updateRecord.uploadFile", err);
        }
    } else if (dataInput.old_file_url) {
        delete dataInput.old_file_url;
    }

    // Proses upload TTD piagam baru jika ada (gambar ulang)
    if (dataInput.ttd_base64 && dataInput.ttd_base64.indexOf("base64,") !== -1) {
        try {
            // Hapus TTD lama dari Drive
            if (dataInput.old_ttd_url) {
                deleteFileFromDrive(dataInput.old_ttd_url);
                delete dataInput.old_ttd_url;
            }
            // Upload TTD baru ke folder TTD piagam
            var ttdFolderId = dataInput.ttd_folder_id || DRIVE_FOLDERS.db_piagam_ttd || DRIVE_FOLDER_ID;
            var ttdFileName = "ttd_" + Date.now() + ".png";
            dataInput.ttd_pengambil = uploadFileToDrive(dataInput.ttd_base64, ttdFileName, ttdFolderId);
            delete dataInput.ttd_base64;
            delete dataInput.ttd_folder_id;
        } catch (err) {
            return _serverError("updateRecord.uploadTTD", err);
        }
    } else if (dataInput.old_ttd_url) {
        delete dataInput.old_ttd_url;
    }

    dataInput.email_address = session.email || session.username;
    dataInput.nama_pengupload = session.nama || session.username;
    dataInput.divisi_id = session.divisi_id || "";
    delete dataInput.actor;

    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var rowRange = sheet.getRange(rowNumber, 1, 1, headers.length);
    var rowValues = rowRange.getValues()[0];

    headers.forEach(function (header, colIdx) {
        var key = headerMap[normalizeHeader(header)] || normalizeKey(header);
        if (dataInput[key] !== undefined) {
            rowValues[colIdx] = dataInput[key];
        }
    });

    rowRange.setValues([rowValues]);

    // ─── Audit Log (Issue 2 fix) ──────────────────────────────────
    writeAuditLog(actor, rbac.role, "update", tableName, id,
        "Update record id=" + id + " di " + tableName);

    return responseJSON({ status: "success", message: "Data berhasil diupdate!" });
}

// ─── Hapus record berdasarkan ID ──────────────────────────────────────────────
// Sebelum menghapus baris di spreadsheet, fungsi ini akan:
//   1. Membaca URL file dari kolom yang relevan (Upload File, TTD Pengambil)
//   2. Menghapus file tersebut dari Google Drive via deleteFileFromDrive()
//   3. Baru menghapus baris di spreadsheet
function hapusRecord(tableName, id, session) {
    if (tableName == "users" || tableName == "db_users") {
        return responseJSON({ status: "error", message: "Gunakan action manage_user untuk mengelola user" });
    }

    // ─── RBAC validation (Issue 1 fix) ───────────────────────────────
    var actor = session.username;
    var rbac  = _checkRole(actor, "delete", tableName);
    if (!rbac.allowed) {
        writeAuditLog(actor, rbac.role, "DENIED:delete", tableName, id, rbac.msg);
        return _errorResponse("ERR_403_ROLE");
    }

    var sheet = ss.getSheetByName(tableName);
    if (!sheet) {
        return responseJSON({ status: "error", message: "Tabel tidak ditemukan: " + tableName });
    }

    var rowNumber = getSheetRow(sheet, id);
    if (rowNumber === -1) {
        return responseJSON({ status: "error", message: "Data tidak ditemukan (id: " + id + ")" });
    }

    // ── Baca nilai baris sebelum dihapus ──────────────────────────────────────
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var rowValues = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];

    // Buat objek data dari header + nilai baris
    var rowData = {};
    headers.forEach(function (header, colIdx) {
        var key = headerMap[normalizeHeader(header)] || normalizeKey(header);
        rowData[key] = rowValues[colIdx];
    });

    // ── Hapus file lampiran dari Google Drive (jika ada) ─────────────────────
    // Kolom "Upload File" → rowData.upload_file (surat masuk / surat keluar)
    if (rowData.upload_file && String(rowData.upload_file).trim() !== "") {
        deleteFileFromDrive(String(rowData.upload_file).trim());
    }

    // Kolom "TTD Pengambil" → rowData.ttd_pengambil (piagam)
    if (rowData.ttd_pengambil && String(rowData.ttd_pengambil).trim() !== "") {
        deleteFileFromDrive(String(rowData.ttd_pengambil).trim());
    }

    // ── Hapus baris spreadsheet ───────────────────────────────────────────────
    sheet.deleteRow(rowNumber);
    writeAuditLog(actor, rbac.role, "delete", tableName, id, "Hapus record id=" + id + " dari " + tableName);
    return responseJSON({ status: "success", message: "Data berhasil dihapus!" });
}

// ─── Manage User (RBAC v3.0) ──────────────────────────────────────────────────
// Satu-satunya pintu masuk untuk CRUD tabel db_users.
// Struktur params.data yang diharapkan:
//   { sub_action: "create"|"update"|"delete", row_number?, username, password?, nama, email, role, role_id }
function manageUser(data, session) {
    if (!data || !data.sub_action) {
        return responseJSON({ status: "error", message: "sub_action tidak ditemukan" });
    }

    // ─── RBAC validation: hanya super_admin (Issue 1 fix) ────────────────
    var actor = session.username;
    var rbac  = _checkRole(actor, "manage_user", "db_users");
    if (!rbac.allowed) {
        writeAuditLog(actor, rbac.role, "DENIED:manage_user", "db_users", "-", rbac.msg);
        return _errorResponse("ERR_403_ROLE");
    }
    delete data.actor;
    delete data.email_address;

    var sheet = ss.getSheetByName("db_users");
    if (!sheet) {
        sheet = ss.insertSheet("db_users");
        sheet.appendRow(["username", "password", "role", "nama", "email", "role_id"]);
    }

    var sub = data.sub_action;

    // ── CREATE ───────────────────────────────────────────────────────────────
    if (sub === "create") {
        if (!data.username || !data.password) {
            return responseJSON({ status: "error", message: "Username dan password wajib diisi" });
        }

        // Cek duplikat username
        var existing = sheet.getDataRange().getDisplayValues();
        for (var i = 1; i < existing.length; i++) {
            if (existing[i][0] === data.username) {
                return responseJSON({ status: "error", message: "Username \"" + data.username + "\" sudah digunakan" });
            }
        }

        sheet.appendRow([
            data.username,
            data.password,
            data.role     || "Admin",
            data.nama     || data.username,
            data.email    || "",
            data.role_id  || "",
        ]);
        writeAuditLog(actor, rbac.role, "create_user", "db_users", data.username,
            "User baru: " + data.username + " (role: " + (data.role || "Admin") + ")");
        return responseJSON({ status: "success", message: "User \"" + data.username + "\" berhasil ditambahkan" });
    }

    // ── UPDATE ───────────────────────────────────────────────────────────────
    if (sub === "update") {
        if (!data.row_number) {
            return responseJSON({ status: "error", message: "row_number wajib untuk update" });
        }
        var rowNum = parseInt(data.row_number, 10);
        var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
        var rowVals  = sheet.getRange(rowNum, 1, 1, headers.length).getValues()[0];

        headers.forEach(function(h, idx) {
            var key = h.toLowerCase().trim();
            // Jangan timpa password jika tidak dikirim (field kosong = tidak berubah)
            if (key === "password" && (!data.password || data.password.trim() === "")) return;
            if (data[key] !== undefined && data[key] !== null && data[key] !== "") {
                rowVals[idx] = data[key];
            }
        });

        sheet.getRange(rowNum, 1, 1, headers.length).setValues([rowVals]);
        writeAuditLog(actor, rbac.role, "update_user", "db_users", data.username || String(data.row_number),
            "Update user row=" + data.row_number);
        return responseJSON({ status: "success", message: "User berhasil diperbarui" });
    }

    // ── DELETE ───────────────────────────────────────────────────────────────
    if (sub === "delete") {
        if (!data.row_number) {
            return responseJSON({ status: "error", message: "row_number wajib untuk delete" });
        }
        var delRow = parseInt(data.row_number, 10);
        if (delRow < 2 || delRow > sheet.getLastRow()) {
            return responseJSON({ status: "error", message: "Baris tidak valid: " + delRow });
        }
        // Baca username sebelum dihapus untuk audit log
        var deletedUsername = "-";
        try { deletedUsername = sheet.getRange(delRow, 1).getValue(); } catch(_) {}
        sheet.deleteRow(delRow);
        writeAuditLog(actor, rbac.role, "delete_user", "db_users", deletedUsername,
            "Hapus user row=" + delRow);
        return responseJSON({ status: "success", message: "User berhasil dihapus" });
    }

    return responseJSON({ status: "error", message: "sub_action tidak dikenal: " + sub });
}

// ─── Reset Password (RBAC v3.0) ───────────────────────────────────────────────
// { username, new_password, row_number? }
function resetPassword(data, session) {
    if (!data || !data.username || !data.new_password) {
        return responseJSON({ status: "error", message: "username dan new_password wajib diisi" });
    }

    var sheet = ss.getSheetByName("db_users") || ss.getSheetByName("users");
    if (!sheet) {
        return responseJSON({ status: "error", message: "Sheet users tidak ditemukan" });
    }

    var allData = sheet.getDataRange().getDisplayValues();
    var headers = allData[0].map(function(h){ return h.toLowerCase().trim(); });
    var userColIdx = headers.indexOf("username");
    var passColIdx = headers.indexOf("password");

    if (userColIdx < 0 || passColIdx < 0) {
        return responseJSON({ status: "error", message: "Kolom username/password tidak ditemukan di sheet" });
    }

    var resetActor = session.username;
    var rbacReset  = _checkRole(resetActor, "reset_password", "db_users");
    if (!rbacReset.allowed) {
        writeAuditLog(resetActor, rbacReset.role, "DENIED:reset_password", "db_users", data.username, rbacReset.msg);
        return _errorResponse("ERR_403_ROLE");
    }
    delete data.actor;

    for (var i = 1; i < allData.length; i++) {
        if (allData[i][userColIdx] === data.username) {
            sheet.getRange(i + 1, passColIdx + 1).setValue(data.new_password);
            writeAuditLog(resetActor, rbacReset.role, "reset_password", "db_users", data.username,
                "Password user \"" + data.username + "\" direset oleh " + resetActor);
            return responseJSON({ status: "success", message: "Password user \"" + data.username + "\" berhasil direset" });
        }
    }

    return responseJSON({ status: "error", message: "User \"" + data.username + "\" tidak ditemukan" });
}
