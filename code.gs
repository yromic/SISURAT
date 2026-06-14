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
    "read:surat_masuk":         ["super_admin", "admin_divisi", "admin", "operator"],
    "read:surat_keluar":        ["super_admin", "admin_divisi", "admin", "operator"],
    "read:piagam":              ["super_admin", "admin_divisi", "admin", "operator"],
    "read:ref_pengambilan":     ["super_admin", "admin_divisi", "admin", "operator"],
    "read:ref_jenis":           ["super_admin", "admin_divisi", "admin", "operator"],
    "read:ref_sekolah":         ["super_admin", "admin_divisi", "admin", "operator"],
    "read:ref_jenis_perlombaan":["super_admin", "admin_divisi", "admin", "operator"],
    "read:db_users":            ["super_admin", "admin_divisi", "admin"],
    "read:db_summary":          ["super_admin", "admin_divisi", "admin", "operator"],
    "read:db_audit_log":        ["super_admin", "admin_divisi", "admin"],
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
    "init_divisi:db_divisi":    ["super_admin"],
    "retry_init_divisi:db_divisi": ["super_admin"],
    "cleanup_divisi:db_divisi": ["super_admin"],
    "migrate_existing_records:db_divisi": ["super_admin"],
    "init_divisi:*":            ["super_admin"],
    "retry_init_divisi:*":      ["super_admin"],
    "cleanup_divisi:*":         ["super_admin"],
    "migrate_existing_records:*": ["super_admin"],
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

var DB_DIVISI_HEADERS = ["id", "kode_divisi", "nama_divisi", "status", "drive_folder_id", "created_at", "created_by"];
var DB_USERS_HEADERS = [
    "username",
    "password",
    "role",
    "nama",
    "email",
    "role_id",
    "aktif",
    "divisi_id",
    "scope",
    "password_hash",
    "password_salt",
    "password_v",
];
var DB_AUDIT_LOG_HEADERS = ["timestamp", "actor", "role", "divisi_id", "action", "table_name", "record_id", "detail"];
var DB_SUMMARY_HEADERS = ["divisi_id", "total_surat_masuk", "total_surat_keluar", "total_piagam", "last_updated"];
var REF_SEKOLAH_HEADERS = ["id", "nama_sekolah", "npsn", "aktif"];
var SURAT_MASUK_HEADERS = ["id", "timestamp", "email_address", "nama_pengupload", "divisi_id", "asal_surat", "nomor_surat", "tanggal_surat", "perihal", "tanggal_diterima", "upload_file", "is_deleted", "deleted_at", "deleted_by"];
var SURAT_KELUAR_HEADERS = ["id", "timestamp", "email_address", "nama_pengupload", "divisi_id", "nomor_surat", "tanggal_surat", "perihal", "tanggal_share", "upload_file", "is_deleted", "deleted_at", "deleted_by"];
var PIAGAM_HEADERS = ["id", "timestamp", "email_address", "nama_pengupload", "divisi_id", "nama_pengambil", "jabatan", "unit_kerja", "npsn", "pengambilan", "jenis_perlombaan", "tahun_perlombaan", "nama_siswa", "asal_sekolah", "ttd_pengambil", "is_deleted", "deleted_at", "deleted_by"];
var REF_DIVISI_HEADERS = ["id", "nama", "aktif"];
var DIVISI_SHEET_HEADERS = {
    surat_masuk: SURAT_MASUK_HEADERS,
    surat_keluar: SURAT_KELUAR_HEADERS,
    piagam: PIAGAM_HEADERS,
    ref_pengambilan: REF_DIVISI_HEADERS,
    ref_jenis: REF_DIVISI_HEADERS,
};
var GLOBAL_SHEETS = {
    db_divisi: DB_DIVISI_HEADERS,
    db_users: DB_USERS_HEADERS,
    db_audit_log: DB_AUDIT_LOG_HEADERS,
    db_summary: DB_SUMMARY_HEADERS,
    ref_sekolah: REF_SEKOLAH_HEADERS,
};

function _normalizeHeaderName(header) {
    return String(header || "").toLowerCase().trim();
}

function _headerIndex(headers, name) {
    return headers.map(_normalizeHeaderName).indexOf(name);
}

function _getHeaders(sheet) {
    if (!sheet || sheet.getLastColumn() < 1) return [];
    return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(_normalizeHeaderName);
}

function _getHeaderIndexMap(sheet) {
    var headers = _getHeaders(sheet);
    var map = {};
    headers.forEach(function(header, index) {
        if (header) map[header] = index;
    });
    return map;
}

function _appendMissingHeaders(sheet, requiredHeaders) {
    var headers = _getHeaders(sheet);
    requiredHeaders.forEach(function(header) {
        var normalized = _normalizeHeaderName(header);
        if (_headerIndex(headers, normalized) >= 0) return;
        sheet.insertColumnAfter(Math.max(sheet.getLastColumn(), 1));
        sheet.getRange(1, sheet.getLastColumn()).setValue(header);
        headers.push(normalized);
    });
    return headers;
}

function _ensureHeaders(sheet, headers) {
    if (!sheet) return null;
    if (sheet.getLastRow() < 1 || sheet.getLastColumn() < 1) {
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
        sheet.setFrozenRows(1);
        return headers.map(_normalizeHeaderName);
    }
    return _appendMissingHeaders(sheet, headers);
}

function _ensureSheet(name, headers) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) {
        sheet = ss.insertSheet(name);
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
        sheet.setFrozenRows(1);
        return sheet;
    }
    _ensureHeaders(sheet, headers);
    return sheet;
}

function _ensureGlobalSheets() {
    Object.keys(GLOBAL_SHEETS).forEach(function(name) {
        _ensureSheet(name, GLOBAL_SHEETS[name]);
    });
}

function _getUserSheet() {
    return ss.getSheetByName("db_users") || ss.getSheetByName("users");
}

function _ensureUserPasswordColumns(sheet) {
    if (!sheet) return null;
    if (sheet.getName() === "db_users") return _ensureHeaders(sheet, DB_USERS_HEADERS);
    var headers = _getHeaders(sheet);
    var usernameIdx = _headerIndex(headers, "username");
    var passwordIdx = _headerIndex(headers, "password");
    if (usernameIdx < 0 || passwordIdx < 0) {
        writeAuditLog("system", "-", "SERVER_ERROR", "db_users", "-", "Header username/password tidak ditemukan");
        return null;
    }
    return _appendMissingHeaders(sheet, ["password_hash", "password_salt", "password_v"]);
}

function _hashPassword(password, salt) {
    var digest = Utilities.computeDigest(
        Utilities.DigestAlgorithm.SHA_256,
        String(salt || "") + ":" + String(password || ""),
        Utilities.Charset.UTF_8
    );
    return digest.map(function(byte) {
        var value = byte < 0 ? byte + 256 : byte;
        return ("0" + value.toString(16)).slice(-2);
    }).join("");
}

function _generateSalt() {
    return Utilities.getUuid() + "-" + Utilities.getUuid();
}

function _passwordRecordFromRow(row, headers) {
    var get = function(name) {
        var idx = _headerIndex(headers, name);
        return idx >= 0 ? String(row[idx] || "").trim() : "";
    };
    return {
        password: get("password"),
        password_hash: get("password_hash"),
        password_salt: get("password_salt"),
        password_v: get("password_v"),
    };
}

function _verifyPassword(inputPassword, user) {
    var version = String(user.password_v || "").trim();
    if (version === "2") {
        return !!(user.password_hash && user.password_salt) &&
            _hashPassword(inputPassword, user.password_salt) === user.password_hash;
    }
    return String(user.password || "") === String(inputPassword || "");
}

function _setRowValueByHeader(sheet, rowNumber, headers, name, value) {
    var idx = _headerIndex(headers, name);
    if (idx >= 0) sheet.getRange(rowNumber, idx + 1).setValue(value);
}

function _upgradePasswordIfNeeded(sheet, rowNumber, headers, row, inputPassword) {
    var userPassword = _passwordRecordFromRow(row, headers);
    if (String(userPassword.password_v || "").trim() === "2") return false;
    var salt = _generateSalt();
    var hash = _hashPassword(inputPassword, salt);
    _setRowValueByHeader(sheet, rowNumber, headers, "password_hash", hash);
    _setRowValueByHeader(sheet, rowNumber, headers, "password_salt", salt);
    _setRowValueByHeader(sheet, rowNumber, headers, "password_v", "2");
    _setRowValueByHeader(sheet, rowNumber, headers, "password", "__MIGRATED__");
    return true;
}

function _passwordHashFields(password) {
    var salt = _generateSalt();
    return {
        password: "__MIGRATED__",
        password_hash: _hashPassword(password, salt),
        password_salt: salt,
        password_v: "2",
    };
}

// ─── Helper: baca user dari db_users berdasarkan username ────────────────────
function _lookupUser(username) {
    if (!username) return null;
    var sheet = _getUserSheet();
    if (!sheet) return null;
    var data = sheet.getDataRange().getDisplayValues();
    var headers = data[0].map(_normalizeHeaderName);
    var uCol = _headerIndex(headers, "username");
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

function _getTableSuffix(tableName) {
    if (!tableName) return "";
    var match = tableName.match(/^([A-Z0-9]+)_(surat_masuk|surat_keluar|piagam|ref_pengambilan|ref_jenis)$/i);
    if (match) {
        return match[2].toLowerCase();
    }
    return tableName;
}

function _extractDivisi(tableName) {
    if (!tableName) return "";
    var match = tableName.match(/^([A-Z0-9]+)_(surat_masuk|surat_keluar|piagam|ref_pengambilan|ref_jenis)$/i);
    if (match) {
        var code = match[1].toUpperCase();
        if (code !== "DB" && code !== "REF") {
            return code;
        }
    }
    return "";
}

function _validateTableName(tableName) {
    if (!tableName) return false;
    if (GLOBAL_SHEETS[tableName]) return true;
    var match = tableName.match(/^([A-Z0-9]+)_(surat_masuk|surat_keluar|piagam|ref_pengambilan|ref_jenis)$/i);
    if (!match) return false;
    var code = match[1].toUpperCase();
    if (code === "DB" || code === "REF") {
        return true;
    }
    return _findDivisiByCode(code) !== null;
}

function _getFolderIdForDivisi(divisiId, tableName) {
    var divisi = _findDivisiByCode(divisiId);
    if (divisi && divisi.data && divisi.data.drive_folder_id) {
        return String(divisi.data.drive_folder_id).trim();
    }
    return DRIVE_FOLDER_ID;
}

// ─── Helper: validasi RBAC per action + table ─────────────────────────────────
// @returns {allowed: boolean, role: string, msg: string}
function _checkRole(session, action, tableName) {
    var actor_username = (session && typeof session === "object") ? session.username : session;
    var user = _lookupUser(actor_username);
    if (!user) {
        return { allowed: false, role: "", msg: "Actor tidak ditemukan: " + actor_username, error: "ERR_401_SESSION", session: session || null };
    }
    var role = user.role;

    if (!_validateTableName(tableName)) {
        return { allowed: false, role: role, msg: "Tabel tidak valid atau tidak ditemukan: " + tableName, error: "ERR_404_TABLE", session: (session && typeof session === "object") ? session : user };
    }

    // Super Admin bypass semua permission dan divisi
    if (role === "super_admin") {
        return { allowed: true, role: role, msg: "", session: (session && typeof session === "object") ? session : user, tableSuffix: _getTableSuffix(tableName), targetDivisi: _extractDivisi(tableName) };
    }

    // Validasi Divisi / Scope
    var tableDivisi = _extractDivisi(tableName);
    if (tableDivisi) {
        var userDivisi = String(user.divisi_id || "").toUpperCase();
        if (tableDivisi !== userDivisi) {
            return { allowed: false, role: role, msg: "Akses lintas divisi ditolak", error: "ERR_403_DIVISI", session: (session && typeof session === "object") ? session : user };
        }
    }

    var suffix = _getTableSuffix(tableName);
    var specificKey = action + ":" + suffix;
    var rawKey = action + ":" + tableName;
    var wildcardKey = action + ":*";
    var allowedRoles = RBAC_RULES[specificKey] || RBAC_RULES[rawKey] || RBAC_RULES[wildcardKey] || [];
    var allowed = allowedRoles.indexOf(role) !== -1;

    return {
        allowed: allowed,
        role: role,
        msg: allowed ? "" : ("Role '" + role + "' tidak diizinkan untuk " + action + " pada " + tableName),
        error: allowed ? "" : "ERR_403_ROLE",
        session: (session && typeof session === "object") ? session : user,
        tableSuffix: suffix,
        targetDivisi: tableDivisi || user.divisi_id
    };
}

// ─── Helper: Tulis Audit Log ke sheet db_audit_log [Issue 2 Fix] ─────────────
// Kolom: Timestamp | Actor | Role | Action | Table | Record ID | Detail
// Sheet auto-dibuat dengan format header jika belum ada.
function writeAuditLog(actor, role, action, tableName, recordId, detail) {
    try {
        var logSheet = _ensureSheet("db_audit_log", DB_AUDIT_LOG_HEADERS);
        var row = {
            timestamp: new Date(),
            actor: actor || "system",
            role: role || "-",
            divisi_id: "-",
            action: action || "-",
            table_name: tableName || "-",
            record_id: recordId || "-",
            detail: detail || "-",
        };
        var headers = _getHeaders(logSheet);
        logSheet.appendRow(headers.map(function(header) {
            return row[header] !== undefined ? row[header] : "";
        }));
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
        _ensureGlobalSheets();
        if (params.session_token && !data.session_token) {
            data.session_token = params.session_token;
        }
        if (action == "login") {
            data = params.data && typeof params.data === "object" ? params.data : {};
            data.username = data.username || params.username || "";
            data.password = data.password || params.password || "";
        }
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
            return getData(tableName, sessionResult.session, data);
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
        } else if (action == "init_divisi") {
            sessionResult = _requireSessionFromData(data, action);
            sessionError = _sessionResponse(sessionResult);
            if (sessionError) return sessionError;
            return initDivisi(data, sessionResult.session);
        } else if (action == "retry_init_divisi") {
            sessionResult = _requireSessionFromData(data, action);
            sessionError = _sessionResponse(sessionResult);
            if (sessionError) return sessionError;
            return retryInitDivisi(data, sessionResult.session);
        } else if (action == "cleanup_divisi") {
            sessionResult = _requireSessionFromData(data, action);
            sessionError = _sessionResponse(sessionResult);
            if (sessionError) return sessionError;
            return cleanupDivisi(data, sessionResult.session);
        } else if (action == "migrate_existing_records") {
            sessionResult = _requireSessionFromData(data, action);
            sessionError = _sessionResponse(sessionResult);
            if (sessionError) return sessionError;
            return runMigrateExistingRecords(sessionResult.session);
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
    var sheet = _getUserSheet();
    if (!sheet) {
        writeAuditLog("system", "-", "SERVER_ERROR", "login", "-", "Sheet users tidak ditemukan");
        return _errorResponse("ERR_500_SERVER");
    }

    var ensuredHeaders = _ensureUserPasswordColumns(sheet);
    if (!ensuredHeaders) {
        return _errorResponse("ERR_500_SERVER");
    }

    var dataUsers = sheet.getDataRange().getDisplayValues();
    var headers   = dataUsers[0].map(_normalizeHeaderName);

    // Helper: ambil nilai kolom berdasarkan nama header
    function col(row, name) {
        var idx = _headerIndex(headers, name);
        return idx >= 0 ? row[idx] : "";
    }

    for (var i = 1; i < dataUsers.length; i++) {
        var row    = dataUsers[i];
        var dbUser = col(row, "username") || row[0];

        if (dbUser == username) {
            var passwordRecord = _passwordRecordFromRow(row, headers);
            if (!_verifyPassword(password, passwordRecord)) {
                break;
            }

            var user = _lookupUser(dbUser);
            if (!user || user.aktif === false) {
                writeAuditLog(dbUser || "system", "-", "DENIED:login", "-", "-", "Akun nonaktif atau tidak ditemukan");
                return responseJSON({ status: "error", message: "Username atau Password salah!" });
            }
            _upgradePasswordIfNeeded(sheet, i + 1, headers, row, password);
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

function getData(tableName, session, data) {
    if (!session) {
        return _errorResponse("ERR_401_SESSION");
    }

    var rbac = _checkRole(session, "read", tableName, data || {});
    if (!rbac.allowed) {
        writeAuditLog(session.username, session.role || "-", session.divisi_id || "-", "DENIED:read", tableName, "-", rbac.msg);
        return _errorResponse(rbac.error || "ERR_403_ROLE");
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
    var headerMapByName = _getHeaderIndexMap(sheet);
    var deletedIdx = headerMapByName.is_deleted;

    var isSuperAdmin = session.role === "super_admin";

    var result = rows.map(function (row, rowIndex) {
        if (deletedIdx !== undefined && /^(true|1|yes|ya)$/i.test(String(row[deletedIdx]).trim())) {
            return null;
        }

        if (tableName === "db_users") {
            if (session.role === "operator") return null;
            if (!isSuperAdmin) {
                var divIdx = headerMapByName.divisi_id;
                var userDivId = (divIdx !== undefined) ? String(row[divIdx] || "").trim() : "";
                if (userDivId.toUpperCase() !== String(session.divisi_id).toUpperCase()) {
                    return null;
                }
            }
        }

        if (tableName === "db_summary") {
            if (!isSuperAdmin) {
                var divIdx = headerMapByName.divisi_id;
                var summaryDivId = (divIdx !== undefined) ? String(row[divIdx] || "").trim() : "";
                if (summaryDivId.toUpperCase() !== String(session.divisi_id).toUpperCase()) {
                    return null;
                }
            }
        }

        if (tableName === "db_audit_log") {
            if (session.role === "operator") return null;
            if (!isSuperAdmin) {
                var divIdx = headerMapByName.divisi_id;
                var auditDivId = (divIdx !== undefined) ? String(row[divIdx] || "").trim() : "";
                if (auditDivId.toUpperCase() !== String(session.divisi_id).toUpperCase()) {
                    return null;
                }
            }
        }

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
            if (["password", "password_hash", "password_salt"].indexOf(finalKey) !== -1) return;

            if (obj[finalKey] !== undefined && finalKey !== "row_number") {
                obj[finalKey + "_2"] = row[index];
            } else {
                obj[finalKey] = row[index];
            }
        });
        return obj;
    }).filter(function(row) { return row !== null; });

    return responseJSON({ status: "success", data: result });
}

function _isRecordSheetName(sheetName) {
    return /_(surat_masuk|surat_keluar|piagam)$/i.test(sheetName) ||
        ["db_surat_masuk", "db_surat_keluar", "db_piagam"].indexOf(sheetName) !== -1;
}

function _requiredRecordHeaders(sheetName) {
    var lower = String(sheetName || "").toLowerCase();
    if (/_surat_masuk$/.test(lower) || lower === "db_surat_masuk") return SURAT_MASUK_HEADERS;
    if (/_surat_keluar$/.test(lower) || lower === "db_surat_keluar") return SURAT_KELUAR_HEADERS;
    if (/_piagam$/.test(lower) || lower === "db_piagam") return PIAGAM_HEADERS;
    return ["id", "is_deleted", "deleted_at", "deleted_by"];
}

function _migrateSheetRecords(sheetName, headers) {
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) return { sheet: sheetName, migrated: 0 };
    var required = headers || _requiredRecordHeaders(sheetName);
    _ensureHeaders(sheet, required);
    var headerMapByName = _getHeaderIndexMap(sheet);
    var idIdx = headerMapByName.id;
    var deletedIdx = headerMapByName.is_deleted;
    if (idIdx === undefined || deletedIdx === undefined || sheet.getLastRow() < 2) {
        return { sheet: sheetName, migrated: 0 };
    }

    var range = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn());
    var values = range.getValues();
    var migrated = 0;
    values.forEach(function(row) {
        if (!String(row[idIdx] || "").trim()) {
            row[idIdx] = Utilities.getUuid();
            migrated += 1;
        }
        if (String(row[deletedIdx] || "").trim() === "") {
            row[deletedIdx] = false;
        }
    });
    range.setValues(values);
    return { sheet: sheetName, migrated: migrated };
}

function migrateExistingRecords() {
    _ensureGlobalSheets();
    var results = [];
    ss.getSheets().forEach(function(sheet) {
        var name = sheet.getName();
        if (_isRecordSheetName(name)) {
            results.push(_migrateSheetRecords(name));
        }
    });
    return results;
}

function runMigrateExistingRecords(session) {
    var auth = _requireSuperAdmin(session, "migrate_existing_records");
    if (!auth.ok) return auth.response;
    var results = migrateExistingRecords();
    writeAuditLog(session.username, auth.role, "migrate_existing_records", "-", "-", "Migrasi UUID/soft-delete record existing");
    return responseJSON({ status: "success", results: results });
}

function _normalizeDivisiCode(code) {
    return String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function _requireSuperAdmin(session, action) {
  var rbac = _checkRole(session, action, "db_divisi", {});
  if (!rbac.allowed) {
    writeAuditLog(
      session && session.username ? session.username : "-",
      session && session.role ? session.role : "-",
      session && session.divisi_id ? session.divisi_id : "-",
      "DENIED:" + action,
      "db_divisi",
      "-",
      rbac.error || "ERR_403_ROLE"
    );
    return {
      ok: false,
      response: _errorResponse(rbac.error || "ERR_403_ROLE"),
      role: session && session.role
    };
  }
  return {
    ok: true,
    role: session.role
  };
}

function _rowObjectFromValues(headers, rowValues) {
    var obj = {};
    headers.forEach(function(header, index) {
        obj[header] = rowValues[index];
    });
    return obj;
}

function _findDivisiByCode(kode) {
    var sheet = _ensureSheet("db_divisi", DB_DIVISI_HEADERS);
    var headers = _getHeaders(sheet);
    var map = _getHeaderIndexMap(sheet);
    if (sheet.getLastRow() < 2) return null;
    var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
    for (var i = 0; i < values.length; i++) {
        if (String(values[i][map.kode_divisi] || "").trim() === kode) {
            return {
                sheet: sheet,
                rowNumber: i + 2,
                headers: headers,
                values: values[i],
                data: _rowObjectFromValues(headers, values[i]),
            };
        }
    }
    return null;
}

function _setDivisiValue(divisi, name, value) {
    var idx = _headerIndex(divisi.headers, name);
    if (idx >= 0) {
        divisi.values[idx] = value;
        divisi.sheet.getRange(divisi.rowNumber, idx + 1).setValue(value);
        divisi.data[name] = value;
    }
}

function _ensureSummaryRow(divisi_id) {
    var sheet = _ensureSheet("db_summary", DB_SUMMARY_HEADERS);
    var map = _getHeaderIndexMap(sheet);
    if (sheet.getLastRow() >= 2) {
        var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
        for (var i = 0; i < values.length; i++) {
            if (String(values[i][map.divisi_id] || "").trim() === String(divisi_id).trim()) {
                return i + 2;
            }
        }
    }
    var row = {
        divisi_id: divisi_id,
        total_surat_masuk: 0,
        total_surat_keluar: 0,
        total_piagam: 0,
        last_updated: new Date(),
    };
    sheet.appendRow(_getHeaders(sheet).map(function(header) {
        return row[header] !== undefined ? row[header] : "";
    }));
    return sheet.getLastRow();
}

function updateSummary(divisi_id, tipe, delta) {
    var sheet = _ensureSheet("db_summary", DB_SUMMARY_HEADERS);
    var rowNumber = _ensureSummaryRow(divisi_id);
    var map = _getHeaderIndexMap(sheet);
    var field = "total_" + String(tipe || "").replace(/^db_/, "");
    if (map[field] === undefined) return;
    var current = Number(sheet.getRange(rowNumber, map[field] + 1).getValue() || 0);
    sheet.getRange(rowNumber, map[field] + 1).setValue(current + Number(delta || 0));
    sheet.getRange(rowNumber, map.last_updated + 1).setValue(new Date());
}

function _recomputeSummary(divisi_id) {
    var counts = {
        total_surat_masuk: 0,
        total_surat_keluar: 0,
        total_piagam: 0,
    };
    ["surat_masuk", "surat_keluar", "piagam"].forEach(function(tipe) {
        var sheet = ss.getSheetByName(divisi_id + "_" + tipe);
        if (!sheet || sheet.getLastRow() < 2) return;
        var map = _getHeaderIndexMap(sheet);
        var deletedIdx = map.is_deleted;
        var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
        counts["total_" + tipe] = values.filter(function(row) {
            return deletedIdx === undefined || !/^(true|1|yes|ya)$/i.test(String(row[deletedIdx]).trim());
        }).length;
    });
    var summarySheet = _ensureSheet("db_summary", DB_SUMMARY_HEADERS);
    var rowNumber = _ensureSummaryRow(divisi_id);
    var summaryMap = _getHeaderIndexMap(summarySheet);
    Object.keys(counts).forEach(function(key) {
        summarySheet.getRange(rowNumber, summaryMap[key] + 1).setValue(counts[key]);
    });
    summarySheet.getRange(rowNumber, summaryMap.last_updated + 1).setValue(new Date());
}

function _ensureDivisiSheets(kode) {
    _ensureSheet(kode + "_surat_masuk", SURAT_MASUK_HEADERS);
    _ensureSheet(kode + "_surat_keluar", SURAT_KELUAR_HEADERS);
    _ensureSheet(kode + "_piagam", PIAGAM_HEADERS);
    _ensureSheet(kode + "_ref_pengambilan", REF_DIVISI_HEADERS);
    _ensureSheet(kode + "_ref_jenis", REF_DIVISI_HEADERS);
}

function _createDivisiFolder(namaDivisi) {
    return DriveApp.createFolder("Arsip Surat - " + namaDivisi).getId();
}

function _deletePartialDivisiSheets(kode) {
    [
        kode + "_surat_masuk",
        kode + "_surat_keluar",
        kode + "_piagam",
        kode + "_ref_pengambilan",
        kode + "_ref_jenis",
    ].forEach(function(name) {
        var sheet = ss.getSheetByName(name);
        if (sheet) ss.deleteSheet(sheet);
    });
}

function _deleteSummaryRow(divisi_id) {
    var sheet = _ensureSheet("db_summary", DB_SUMMARY_HEADERS);
    var map = _getHeaderIndexMap(sheet);
    if (sheet.getLastRow() < 2) return;
    var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
    for (var i = values.length - 1; i >= 0; i--) {
        if (String(values[i][map.divisi_id] || "").trim() === divisi_id) {
            sheet.deleteRow(i + 2);
        }
    }
}

function initDivisi(data, session) {
    var auth = _requireSuperAdmin(session, "init_divisi");
    if (!auth.ok) return auth.response;
    var kode = _normalizeDivisiCode(data.kode_divisi);
    var nama = String(data.nama_divisi || "").trim();
    if (!kode || kode.length > 10 || !nama) return _errorResponse("ERR_400_DIVISI");

    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
        _ensureGlobalSheets();
        if (_findDivisiByCode(kode)) return _errorResponse("ERR_409_DIVISI");

        var sheet = _ensureSheet("db_divisi", DB_DIVISI_HEADERS);
        var divisiId = kode;
        var row = {
            id: divisiId,
            kode_divisi: kode,
            nama_divisi: nama,
            status: "pending",
            drive_folder_id: "",
            created_at: new Date(),
            created_by: session.username,
        };
        sheet.appendRow(_getHeaders(sheet).map(function(header) {
            return row[header] !== undefined ? row[header] : "";
        }));

        var divisi = _findDivisiByCode(kode);
        _ensureDivisiSheets(kode);
        var folderId = _createDivisiFolder(nama);
        _setDivisiValue(divisi, "drive_folder_id", folderId);
        _setDivisiValue(divisi, "status", "active");
        _ensureSummaryRow(divisiId);
        writeAuditLog(session.username, auth.role, "init_divisi", "db_divisi", divisiId, "Init divisi " + kode);
        return responseJSON({ status: "success", kode_divisi: kode, divisi_id: divisiId, drive_folder_id: folderId });
    } catch (err) {
        return _serverError("initDivisi", err);
    } finally {
        lock.releaseLock();
    }
}

function retryInitDivisi(data, session) {
    var auth = _requireSuperAdmin(session, "retry_init_divisi");
    if (!auth.ok) return auth.response;
    var kode = _normalizeDivisiCode(data.kode_divisi);
    if (!kode) return _errorResponse("ERR_400_DIVISI");

    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
        _ensureGlobalSheets();
        var divisi = _findDivisiByCode(kode);
        if (!divisi) return _errorResponse("ERR_404_DIVISI");
        if (String(divisi.data.status || "").toLowerCase() !== "pending") return _errorResponse("ERR_409_DIVISI_STATUS");

        _ensureDivisiSheets(kode);
        var folderId = String(divisi.data.drive_folder_id || "").trim();
        var folderOk = false;
        if (folderId) {
            try {
                DriveApp.getFolderById(folderId).getName();
                folderOk = true;
            } catch (_) {
                folderOk = false;
            }
        }
        if (!folderOk) {
            folderId = _createDivisiFolder(divisi.data.nama_divisi || kode);
            _setDivisiValue(divisi, "drive_folder_id", folderId);
        }
        _setDivisiValue(divisi, "status", "active");
        _ensureSummaryRow(divisi.data.id || kode);
        writeAuditLog(session.username, auth.role, "retry_init_divisi", "db_divisi", divisi.data.id || kode, "Retry init divisi " + kode);
        return responseJSON({ status: "success", kode_divisi: kode, divisi_id: divisi.data.id || kode, drive_folder_id: folderId });
    } catch (err) {
        return _serverError("retryInitDivisi", err);
    } finally {
        lock.releaseLock();
    }
}

function cleanupDivisi(data, session) {
    var auth = _requireSuperAdmin(session, "cleanup_divisi");
    if (!auth.ok) return auth.response;
    var kode = _normalizeDivisiCode(data.kode_divisi);
    if (!kode) return _errorResponse("ERR_400_DIVISI");

    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
        _ensureGlobalSheets();
        var divisi = _findDivisiByCode(kode);
        if (!divisi) return _errorResponse("ERR_404_DIVISI");
        if (String(divisi.data.status || "").toLowerCase() === "active") return _errorResponse("ERR_409_DIVISI_STATUS");
        if (String(divisi.data.status || "").toLowerCase() !== "pending") return _errorResponse("ERR_409_DIVISI_STATUS");

        _deletePartialDivisiSheets(kode);
        var folderId = String(divisi.data.drive_folder_id || "").trim();
        if (folderId) {
            try { DriveApp.getFolderById(folderId).setTrashed(true); } catch (_) {}
        }
        _deleteSummaryRow(divisi.data.id || kode);
        _setDivisiValue(divisi, "status", "cleanup");
        writeAuditLog(session.username, auth.role, "cleanup_divisi", "db_divisi", divisi.data.id || kode, "Cleanup divisi pending " + kode);
        return responseJSON({ status: "success", kode_divisi: kode, divisi_id: divisi.data.id || kode });
    } catch (err) {
        return _serverError("cleanupDivisi", err);
    } finally {
        lock.releaseLock();
    }
}

// ─── Helper: Response JSON ────────────────────────────────────────────────────
function responseJSON(object) {
    return ContentService.createTextOutput(JSON.stringify(object)).setMimeType(
        ContentService.MimeType.JSON,
    );
}

// ─── Simpan Piagam (legacy – dari piagam.html) ───────────────────────────────
function simpanPiagam(dataInput, session) {
    if (!session) {
        return _errorResponse("ERR_401_SESSION");
    }

    if (!dataInput) {
        return responseJSON({
            status: "error",
            message: "Data Input tidak diterima oleh fungsi simpanPiagam.",
        });
    }

    var targetDivisi = "";
    if (session.role === "super_admin") {
        targetDivisi = dataInput.divisi_id ? String(dataInput.divisi_id).trim().toUpperCase() : "";
    } else {
        targetDivisi = session.divisi_id ? String(session.divisi_id).trim().toUpperCase() : "";
    }

    if (!targetDivisi || !_findDivisiByCode(targetDivisi)) {
        writeAuditLog(session.username, session.role, "-", "DENIED:create", "db_piagam", "-", "Invalid division code: " + targetDivisi);
        return _errorResponse("ERR_403_DIVISI");
    }

    var tableName = targetDivisi + "_piagam";
    var rbac = _checkRole(session, "create", tableName, dataInput);
    if (!rbac.allowed) {
        return _errorResponse(rbac.error || "ERR_403_ROLE");
    }

    var sheet = ss.getSheetByName(tableName);
    if (!sheet) {
        return responseJSON({ status: "error", message: "Tabel tidak ditemukan: " + tableName });
    }
    _ensureHeaders(sheet, PIAGAM_HEADERS);

    var linkTTD = "";

    if (dataInput.ttd_base64 && dataInput.ttd_base64.includes("base64,")) {
        try {
            var splitBase64 = dataInput.ttd_base64.split(",");
            var imageBlob = Utilities.newBlob(
                Utilities.base64Decode(splitBase64[1]),
                "image/png",
                "ttd_" + Date.now() + ".png",
            );

            var folderId = _getFolderIdForDivisi(targetDivisi, "db_piagam_ttd");
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
    dataInput.divisi_id = targetDivisi;
    dataInput.ttd_pengambil = linkTTD;
    delete dataInput.actor;
    delete dataInput.ttd_base64;
    delete dataInput.ttd_folder_id;

    var now = new Date();
    var recordId = Utilities.getUuid();
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var newRow = headers.map(function(header) {
        var headerNorm = String(header).toLowerCase().trim();
        if (headerNorm === "id") return recordId;
        if (headerNorm === "timestamp") return now;
        if (headerNorm === "email address" || headerNorm === "email_address") return dataInput.email_address;
        if (headerNorm === "nama pengupload" || headerNorm === "nama_pengupload") return dataInput.nama_pengupload;
        if (headerNorm === "divisi_id") return dataInput.divisi_id;
        if (headerNorm === "is_deleted") return false;
        if (headerNorm === "deleted_at" || headerNorm === "deleted_by") return "";
        var key = headerMap[normalizeHeader(header)] || normalizeKey(header);
        if (key === "npsn") return "'" + (dataInput[key] || "-");
        return dataInput[key] !== undefined ? dataInput[key] : "";
    });

    sheet.appendRow(newRow);
    writeAuditLog(session.username, rbac.session.role, targetDivisi, "create", tableName, recordId, "Tambah piagam");
    updateSummary(targetDivisi, "piagam", 1);

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
// Kunci: "chunk_{divisi_id}_{uploadId}_{chunkIndex}"
function handleUploadChunk(data, session) {
    try {
        if (!session) {
            return _errorResponse("ERR_401_SESSION");
        }

        var uploadId    = data.uploadId;
        var chunkIndex  = data.chunkIndex;
        var chunkBase64 = data.chunkBase64;

        if (!uploadId || chunkIndex === undefined || !chunkBase64) {
            return responseJSON({ status: "error", message: "Parameter chunk tidak lengkap" });
        }

        var divisiId = session.divisi_id ? String(session.divisi_id).trim().toUpperCase() : "GLOBAL";
        var key = "chunk_" + divisiId + "_" + uploadId + "_" + chunkIndex;
        CacheService.getScriptCache().put(key, chunkBase64, 3600); // Expiry 1 jam

        return responseJSON({ status: "success", message: "Chunk " + chunkIndex + " diterima" });
    } catch (err) {
        return _serverError("handleUploadChunk", err);
    }
}

// ─── Chunked Upload: Finalize ─────────────────────────────────────────────────
// Setelah semua chunk diterima, gabungkan menjadi satu file dan simpan ke Drive.
// Bersihkan semua chunk dari CacheService setelah selesai.
function finalizeUpload(data, session) {
    try {
        if (!session) {
            return _errorResponse("ERR_401_SESSION");
        }

        var uploadId    = data.uploadId;
        var totalChunks = parseInt(data.totalChunks, 10);
        var fileName    = data.fileName  || ("file_" + Date.now());
        var mimeType    = data.mimeType  || "application/octet-stream";

        if (!uploadId || !totalChunks) {
            return responseJSON({ status: "error", message: "Parameter finalize tidak lengkap" });
        }

        var divisiId = session.divisi_id ? String(session.divisi_id).trim().toUpperCase() : "GLOBAL";
        var cache = CacheService.getScriptCache();

        // Gabungkan semua Base64 chunks menjadi satu string
        var fullBase64 = "";
        for (var i = 0; i < totalChunks; i++) {
            var key = "chunk_" + divisiId + "_" + uploadId + "_" + i;
            var chunk = cache.get(key);
            if (!chunk) {
                // Bersihkan chunk yang sudah ada sebelum return error
                for (var j = 0; j < i; j++) {
                    cache.remove("chunk_" + divisiId + "_" + uploadId + "_" + j);
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
            cache.remove("chunk_" + divisiId + "_" + uploadId + "_" + k);
        }

        // Verify size limit: 10 MB per file
        var totalBytes = Math.floor(fullBase64.length * 0.75);
        if (totalBytes > 10 * 1024 * 1024) {
            return _errorResponse("ERR_413_FILE");
        }

        // Determine destination folder ID authoritatively
        var folderId = data.folderId || DRIVE_FOLDER_ID;
        if (session.role !== "super_admin" && session.divisi_id) {
            folderId = _getFolderIdForDivisi(session.divisi_id);
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

        writeAuditLog(session.username, session.role, session.divisi_id || "-", "upload", "-", "-", "Upload file: " + fileName);

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
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return -1;

    var headers = _getHeaders(sheet);
    var idIdx = _headerIndex(headers, "id");
    if (idIdx >= 0) {
        var values = sheet.getRange(2, idIdx + 1, lastRow - 1, 1).getDisplayValues();
        for (var i = 0; i < values.length; i++) {
            if (String(values[i][0]).trim() === String(id).trim()) {
                return i + 2;
            }
        }
        return -1;
    }

    var num = parseInt(id, 10);
    if (!isNaN(num) && String(num) === String(id) && num >= 2 && num <= lastRow) return num;

    var colA = sheet.getRange(1, 1, lastRow, 1).getValues();
    for (var j = 1; j < colA.length; j++) {
        if (String(colA[j][0]).trim() === String(id).trim()) {
            return j + 1;
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

    if (!session) {
        return _errorResponse("ERR_401_SESSION");
    }

    var rbac = _checkRole(session, "create", tableName, dataInput);
    if (!rbac.allowed) {
        return _errorResponse(rbac.error || "ERR_403_ROLE");
    }

    var sheet = ss.getSheetByName(tableName);
    if (!sheet) {
        return responseJSON({ status: "error", message: "Tabel tidak ditemukan: " + tableName });
    }
    if (_isRecordSheetName(tableName)) {
        _ensureHeaders(sheet, _requiredRecordHeaders(tableName));
    }

    // Override/force divisi_id for non-super_admin, and use rbac.targetDivisi
    var targetDivisi = rbac.targetDivisi || "";
    dataInput.divisi_id = targetDivisi;

    // Proses upload file lampiran jika ada (legacy Base64 — hanya jika upload_file belum ada)
    if (!dataInput.upload_file && dataInput.file_base64 && dataInput.file_base64.indexOf("base64,") !== -1) {
        try {
            var fileFolderId = _getFolderIdForDivisi(targetDivisi, tableName);
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
            var ttdFolderId = _getFolderIdForDivisi(targetDivisi, "db_piagam_ttd");
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
    delete dataInput.actor;

    // Waktu input saat ini (untuk kolom Timestamp)
    var now = new Date();

    var recordId = Utilities.getUuid();
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var newRow = headers.map(function (header, colIdx) {
        var headerNorm = header.toLowerCase().trim();

        // Kolom Timestamp → isi waktu saat ini
        if (headerNorm === "timestamp") {
            return now;
        }

        // Kolom Email Address → isi dari data yang dikirim frontend (username/email admin)
        if (headerNorm === "email address" || headerNorm === "email_address") {
            return session.email || session.username;
        }

        if (headerNorm === "nama pengupload" || headerNorm === "nama_pengupload") {
            return session.nama || session.username;
        }

        if (headerNorm === "divisi_id") {
            return targetDivisi;
        }

        // Kolom ID (hanya jika nama kolomnya benar-benar "id") → UUID
        if (headerNorm === "id") {
            return recordId;
        }
        if (headerNorm === "is_deleted") return false;
        if (headerNorm === "deleted_at" || headerNorm === "deleted_by") return "";

        var key = headerMap[normalizeHeader(header)] || normalizeKey(header);
        if (key === "npsn") return "'" + (dataInput[key] || "-");
        return dataInput[key] !== undefined ? dataInput[key] : "";
    });

    sheet.appendRow(newRow);

    // ─── Audit Log & Summary ──────────────────────────────────
    writeAuditLog(session.username, rbac.session.role, targetDivisi || "-", "create", tableName, recordId,
        "Tambah data baru ke " + tableName);

    if (targetDivisi && (rbac.tableSuffix === "surat_masuk" || rbac.tableSuffix === "surat_keluar" || rbac.tableSuffix === "piagam")) {
        updateSummary(targetDivisi, rbac.tableSuffix, 1);
    }

    return responseJSON({ status: "success", message: "Data berhasil disimpan!" });
}

// ─── Update record berdasarkan ID ─────────────────────────────────────────────
// data.folder_id    → folder untuk file upload baru (Surat Masuk/Keluar)
// data.ttd_folder_id → folder untuk TTD piagam baru
function updateRecord(tableName, id, dataInput, session) {
    if (tableName == "users" || tableName == "db_users") {
        return responseJSON({ status: "error", message: "Gunakan action manage_user untuk mengelola user" });
    }

    if (!session) {
        return _errorResponse("ERR_401_SESSION");
    }

    var rbac = _checkRole(session, "update", tableName, dataInput);
    if (!rbac.allowed) {
        return _errorResponse(rbac.error || "ERR_403_ROLE");
    }

    var sheet = ss.getSheetByName(tableName);
    if (!sheet) {
        return responseJSON({ status: "error", message: "Tabel tidak ditemukan: " + tableName });
    }
    if (_isRecordSheetName(tableName)) {
        _ensureHeaders(sheet, _requiredRecordHeaders(tableName));
    }

    var rowNumber = getSheetRow(sheet, id);
    if (rowNumber === -1) {
        return responseJSON({ status: "error", message: "Data tidak ditemukan (id: " + id + ")" });
    }

    var headers = _getHeaders(sheet);
    var rowRange = sheet.getRange(rowNumber, 1, 1, headers.length);
    var rowValues = rowRange.getValues()[0];
    var headerMapByName = _getHeaderIndexMap(sheet);

    var targetDivisi = rbac.targetDivisi || "";
    var isSuperAdmin = session.role === "super_admin";

    // Division isolation check on the record level
    if (!isSuperAdmin) {
        var divIdx = headerMapByName.divisi_id;
        if (divIdx !== undefined) {
            var existingDivisiId = String(rowValues[divIdx] || "").trim().toUpperCase();
            var userDivisiId = String(session.divisi_id || "").trim().toUpperCase();
            if (existingDivisiId !== userDivisiId) {
                writeAuditLog(session.username, session.role, session.divisi_id || "-", "DENIED:update_division_mismatch", tableName, id, "Cross-division update blocked");
                return _errorResponse("ERR_403_DIVISI");
            }
        }
    }

    // Resolving folder ID authoritatively
    var fileFolderId = _getFolderIdForDivisi(targetDivisi, tableName);
    var ttdFolderId = _getFolderIdForDivisi(targetDivisi, "db_piagam_ttd");

    // Proses upload file lampiran baru jika ada
    if (dataInput.upload_file && dataInput.old_file_url) {
        deleteFileFromDriveSecure(dataInput.old_file_url, fileFolderId);
        delete dataInput.old_file_url;
        delete dataInput.file_base64;
        delete dataInput.file_name;
        delete dataInput.folder_id;
    } else if (!dataInput.upload_file && dataInput.file_base64 && dataInput.file_base64.indexOf("base64,") !== -1) {
        try {
            if (dataInput.old_file_url) {
                deleteFileFromDriveSecure(dataInput.old_file_url, fileFolderId);
                delete dataInput.old_file_url;
            }
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
            if (dataInput.old_ttd_url) {
                deleteFileFromDriveSecure(dataInput.old_ttd_url, ttdFolderId);
                delete dataInput.old_ttd_url;
            }
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

    // Protect sensitive system fields from being modified via update request
    var protectedKeys = ["id", "timestamp", "divisi_id", "email_address", "nama_pengupload", "is_deleted", "deleted_at", "deleted_by"];
    protectedKeys.forEach(function(key) {
        delete dataInput[key];
    });
    delete dataInput.actor;

    headers.forEach(function (header, colIdx) {
        var key = headerMap[normalizeHeader(header)] || normalizeKey(header);
        if (dataInput[key] !== undefined) {
            rowValues[colIdx] = dataInput[key];
        }
    });

    rowRange.setValues([rowValues]);

    // ─── Audit Log ──────────────────────────────────
    writeAuditLog(session.username, rbac.session.role, targetDivisi || "-", "update", tableName, id,
        "Update record id=" + id + " di " + tableName);

    return responseJSON({ status: "success", message: "Data berhasil diupdate!" });
}

// ─── Hapus record berdasarkan ID ──────────────────────────────────────────────
// Soft delete record berdasarkan UUID pada kolom id.
// File Drive tidak dihapus; record ditandai melalui is_deleted/deleted_at/deleted_by.
function hapusRecord(tableName, id, session) {
    if (tableName == "users" || tableName == "db_users") {
        return responseJSON({ status: "error", message: "Gunakan action manage_user untuk mengelola user" });
    }

    if (!session) {
        return _errorResponse("ERR_401_SESSION");
    }

    var rbac = _checkRole(session, "delete", tableName);
    if (!rbac.allowed) {
        return _errorResponse(rbac.error || "ERR_403_ROLE");
    }

    var sheet = ss.getSheetByName(tableName);
    if (!sheet) {
        return responseJSON({ status: "error", message: "Tabel tidak ditemukan: " + tableName });
    }
    if (_isRecordSheetName(tableName)) {
        _ensureHeaders(sheet, _requiredRecordHeaders(tableName));
    }

    var rowNumber = getSheetRow(sheet, id);
    if (rowNumber === -1) {
        return responseJSON({ status: "error", message: "Data tidak ditemukan (id: " + id + ")" });
    }

    var headers = _getHeaders(sheet);
    var rowRange = sheet.getRange(rowNumber, 1, 1, headers.length);
    var rowValues = rowRange.getValues()[0];
    var headerMapByName = _getHeaderIndexMap(sheet);

    var targetDivisi = rbac.targetDivisi || "";
    var isSuperAdmin = session.role === "super_admin";

    // Division isolation check on the record level
    if (!isSuperAdmin) {
        var divIdx = headerMapByName.divisi_id;
        if (divIdx !== undefined) {
            var existingDivisiId = String(rowValues[divIdx] || "").trim().toUpperCase();
            var userDivisiId = String(session.divisi_id || "").trim().toUpperCase();
            if (existingDivisiId !== userDivisiId) {
                writeAuditLog(session.username, session.role, session.divisi_id || "-", "DENIED:delete_division_mismatch", tableName, id, "Cross-division delete blocked");
                return _errorResponse("ERR_403_DIVISI");
            }
        }
    }

    var wasDeleted = headerMapByName.is_deleted !== undefined && /^(true|1|yes|ya)$/i.test(String(rowValues[headerMapByName.is_deleted]).trim());
    if (wasDeleted) {
        return responseJSON({ status: "success", message: "Data sudah dihapus sebelumnya." });
    }

    rowValues[headerMapByName.is_deleted] = true;
    rowValues[headerMapByName.deleted_at] = new Date();
    rowValues[headerMapByName.deleted_by] = session.username;
    rowRange.setValues([rowValues]);

    writeAuditLog(session.username, rbac.session.role, targetDivisi || "-", "delete", tableName, id, "Soft delete record id=" + id + " dari " + tableName);

    // Decrement summary count
    if (targetDivisi && (rbac.tableSuffix === "surat_masuk" || rbac.tableSuffix === "surat_keluar" || rbac.tableSuffix === "piagam")) {
        updateSummary(targetDivisi, rbac.tableSuffix, -1);
    }

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

    if (!session) {
        return _errorResponse("ERR_401_SESSION");
    }

    // ─── RBAC validation (Issue 1 fix) ────────────────
    var rbac = _checkRole(session, "manage_user", "db_users");
    if (!rbac.allowed) {
        return _errorResponse(rbac.error || "ERR_403_ROLE");
    }
    delete data.actor;
    delete data.email_address;

    var sheet = ss.getSheetByName("db_users");
    if (!sheet) {
        sheet = ss.insertSheet("db_users");
        sheet.appendRow(DB_USERS_HEADERS);
    }
    var userHeaders = _ensureUserPasswordColumns(sheet);
    if (!userHeaders) {
        return _errorResponse("ERR_500_SERVER");
    }

    var sub = data.sub_action;
    var isSuperAdmin = session.role === "super_admin";

    // ── CREATE ───────────────────────────────────────────────────────────────
    if (sub === "create") {
        if (!data.username || !data.password) {
            return responseJSON({ status: "error", message: "Username dan password wajib diisi" });
        }

        // Prevent admin_divisi from creating super_admin users
        if (!isSuperAdmin && String(data.role || "").toLowerCase() === "super_admin") {
            return _errorResponse("ERR_403_ROLE");
        }

        // Cek duplikat username
        var existing = sheet.getDataRange().getDisplayValues();
        var existingHeaders = existing[0].map(_normalizeHeaderName);
        var existingUserCol = _headerIndex(existingHeaders, "username");
        for (var i = 1; i < existing.length; i++) {
            if (String(existing[i][existingUserCol]).trim() === String(data.username).trim()) {
                return responseJSON({ status: "error", message: "Username \"" + data.username + "\" sudah digunakan" });
            }
        }

        var passwordFields = _passwordHashFields(data.password);
        var userDivisi = isSuperAdmin ? (data.divisi_id || "") : session.divisi_id;
        var userScope = isSuperAdmin ? (data.scope || "") : "divisi";

        var newUser = {
            username: data.username,
            password: passwordFields.password,
            password_hash: passwordFields.password_hash,
            password_salt: passwordFields.password_salt,
            password_v: passwordFields.password_v,
            role: data.role || "Admin",
            nama: data.nama || data.username,
            email: data.email || "",
            role_id: data.role_id || "",
            aktif: data.aktif !== undefined ? data.aktif : "TRUE",
            divisi_id: userDivisi,
            scope: userScope,
        };
        sheet.appendRow(userHeaders.map(function(header) {
            return newUser[header] !== undefined ? newUser[header] : "";
        }));
        writeAuditLog(session.username, rbac.session.role, userDivisi, "create_user", "db_users", data.username,
            "User baru: " + data.username + " (role: " + (data.role || "Admin") + ")");
        return responseJSON({ status: "success", message: "User \"" + data.username + "\" berhasil ditambahkan" });
    }

    // ── UPDATE ───────────────────────────────────────────────────────────────
    if (sub === "update") {
        if (!data.row_number) {
            return responseJSON({ status: "error", message: "row_number wajib untuk update" });
        }
        var rowNum = parseInt(data.row_number, 10);
        var headers = _ensureUserPasswordColumns(sheet);
        if (!headers) {
            return _errorResponse("ERR_500_SERVER");
        }
        if (rowNum < 2 || rowNum > sheet.getLastRow()) {
            return responseJSON({ status: "error", message: "Baris tidak valid: " + rowNum });
        }

        var rowVals = sheet.getRange(rowNum, 1, 1, headers.length).getValues()[0];
        var headerMapByName = _getHeaderIndexMap(sheet);
        var existingUsername = String(rowVals[headerMapByName.username] || "").trim();
        var existingDivisiId = String(rowVals[headerMapByName.divisi_id] || "").trim().toUpperCase();

        // Cross-division update protection
        if (!isSuperAdmin) {
            if (existingDivisiId !== String(session.divisi_id).toUpperCase()) {
                writeAuditLog(session.username, session.role, session.divisi_id || "-", "DENIED:manage_user_cross_divisi", "db_users", existingUsername, "Attempt to update cross-division user");
                return _errorResponse("ERR_403_DIVISI");
            }
            if (data.role && String(data.role).toLowerCase() === "super_admin") {
                return _errorResponse("ERR_403_ROLE");
            }
            // Force divisi_id and scope for updates by non-super_admins
            data.divisi_id = session.divisi_id;
            data.scope = "divisi";
        }

        var updatedPassword = null;
        if (data.password && data.password.trim() !== "") {
            updatedPassword = _passwordHashFields(data.password);
        }

        headers.forEach(function(h, idx) {
            var key = _normalizeHeaderName(h);
            // Jangan timpa password jika tidak dikirim (field kosong = tidak berubah)
            if (["password", "password_hash", "password_salt", "password_v"].indexOf(key) !== -1) {
                if (updatedPassword) rowVals[idx] = updatedPassword[key];
                return;
            }
            if (data[key] !== undefined && data[key] !== null && data[key] !== "") {
                rowVals[idx] = data[key];
            }
        });

        sheet.getRange(rowNum, 1, 1, headers.length).setValues([rowVals]);
        var logDivisi = isSuperAdmin ? (data.divisi_id || existingDivisiId) : session.divisi_id;
        writeAuditLog(session.username, rbac.session.role, logDivisi, "update_user", "db_users", data.username || String(data.row_number),
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

        var headers = _ensureUserPasswordColumns(sheet);
        if (!headers) {
            return _errorResponse("ERR_500_SERVER");
        }
        var rowVals = sheet.getRange(delRow, 1, 1, headers.length).getValues()[0];
        var headerMapByName = _getHeaderIndexMap(sheet);
        var existingUsername = String(rowVals[headerMapByName.username] || "").trim();
        var existingDivisiId = String(rowVals[headerMapByName.divisi_id] || "").trim().toUpperCase();

        // Cross-division delete protection
        if (!isSuperAdmin) {
            if (existingDivisiId !== String(session.divisi_id).toUpperCase()) {
                writeAuditLog(session.username, session.role, session.divisi_id || "-", "DENIED:manage_user_cross_divisi", "db_users", existingUsername, "Attempt to delete cross-division user");
                return _errorResponse("ERR_403_DIVISI");
            }
        }

        sheet.deleteRow(delRow);
        writeAuditLog(session.username, rbac.session.role, isSuperAdmin ? existingDivisiId : session.divisi_id, "delete_user", "db_users", existingUsername,
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

    if (!session) {
        return _errorResponse("ERR_401_SESSION");
    }

    var sheet = _getUserSheet();
    if (!sheet) {
        return responseJSON({ status: "error", message: "Sheet users tidak ditemukan" });
    }

    var ensuredHeaders = _ensureUserPasswordColumns(sheet);
    if (!ensuredHeaders) {
        return _errorResponse("ERR_500_SERVER");
    }

    var allData = sheet.getDataRange().getDisplayValues();
    var headers = allData[0].map(_normalizeHeaderName);
    var userColIdx = _headerIndex(headers, "username");
    var passColIdx = _headerIndex(headers, "password");

    if (userColIdx < 0 || passColIdx < 0) {
        return responseJSON({ status: "error", message: "Kolom username/password tidak ditemukan di sheet" });
    }

    var rbacReset = _checkRole(session, "reset_password", "db_users");
    if (!rbacReset.allowed) {
        return _errorResponse(rbacReset.error || "ERR_403_ROLE");
    }
    delete data.actor;

    var isSuperAdmin = session.role === "super_admin";

    for (var i = 1; i < allData.length; i++) {
        if (allData[i][userColIdx] === data.username) {
            var targetUserDivisiId = String(allData[i][_headerIndex(headers, "divisi_id")] || "").trim().toUpperCase();

            // Cross-division reset password protection
            if (!isSuperAdmin) {
                if (targetUserDivisiId !== String(session.divisi_id).toUpperCase()) {
                    writeAuditLog(session.username, session.role, session.divisi_id || "-", "DENIED:reset_password_cross_divisi", "db_users", data.username, "Attempt to reset password of cross-division user");
                    return _errorResponse("ERR_403_DIVISI");
                }
            }

            var passwordFields = _passwordHashFields(data.new_password);
            _setRowValueByHeader(sheet, i + 1, headers, "password", passwordFields.password);
            _setRowValueByHeader(sheet, i + 1, headers, "password_hash", passwordFields.password_hash);
            _setRowValueByHeader(sheet, i + 1, headers, "password_salt", passwordFields.password_salt);
            _setRowValueByHeader(sheet, i + 1, headers, "password_v", passwordFields.password_v);
            writeAuditLog(session.username, rbacReset.session.role, isSuperAdmin ? targetUserDivisiId : session.divisi_id, "reset_password", "db_users", data.username,
                "Password user \"" + data.username + "\" direset oleh " + session.username);
            return responseJSON({ status: "success", message: "Password user \"" + data.username + "\" berhasil direset" });
        }
    }

    return responseJSON({ status: "error", message: "User \"" + data.username + "\" tidak ditemukan" });
}
