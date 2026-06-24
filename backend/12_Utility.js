// ============================================================
// SISURAT — Utility Helpers
// ============================================================

function _errorResponse(code) {
    return responseJSON({ status: "error", code: code, message: code });
}

function _logServerError(context, error) {
    var detail = context + ": " + (error && error.stack ? error.stack : String(error));
    writeAuditLog("system", "-", "-", "SERVER_ERROR", context, "-", detail);
    console.error(detail);
}

function _serverError(context, error) {
    _logServerError(context, error);
    return _errorResponse("ERR_500_SERVER");
}

function _getSettings() {
    var sheet = ss.getSheetByName("db_config");
    if (!sheet) {
        sheet = _ensureSheet("db_config", ["key", "value"]);
    }
    var data = sheet.getDataRange().getDisplayValues();
    var settings = {
        public_piagam_target_divisi: "",
        nama_instansi: "",
        logo_url: "",
        app_name: ""
    };
    if (data.length <= 1) {
        return settings;
    }
    for (var i = 1; i < data.length; i++) {
        var k = String(data[i][0]).trim();
        var v = String(data[i][1]).trim();
        if (k) {
            settings[k] = v;
        }
    }
    return settings;
}

function _saveSettings(settingsObj) {
    var sheet = ss.getSheetByName("db_config");
    if (!sheet) {
        sheet = _ensureSheet("db_config", ["key", "value"]);
    }
    var data = sheet.getDataRange().getDisplayValues();
    var existingKeys = {};
    for (var i = 1; i < data.length; i++) {
        var key = String(data[i][0]).trim();
        existingKeys[key] = i + 1;
    }
    var keys = ["public_piagam_target_divisi", "nama_instansi", "logo_url", "app_name"];
    keys.forEach(function(k) {
        var val = settingsObj[k] !== undefined ? String(settingsObj[k]).trim() : "";
        if (existingKeys[k]) {
            sheet.getRange(existingKeys[k], 2).setValue(val);
        } else {
            sheet.appendRow([k, val]);
        }
    });
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

function normalizeHeader(header) {
    return header
        .toLowerCase()
        .trim()
        .replace(/\(.*?\)/g, "")
        .replace(/[^\w\s]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function normalizeKey(header) {
    return header
        .toLowerCase()
        .trim()
        .replace(/\(.*?\)/g, "")
        .replace(/[^\w\s]/g, "")
        .replace(/\s+/g, "_")
        .trim();
}

function responseJSON(object) {
    return ContentService.createTextOutput(JSON.stringify(object)).setMimeType(
        ContentService.MimeType.JSON,
    );
}

function pancingIzin() {
    var folder = DriveApp.getRootFolder();
    folder.createFile("pancingan.txt", "Tes Izin", MimeType.PLAIN_TEXT);
    console.log("Izin CREATE FILE berhasil didapatkan!");
}

function _rowObjectFromValues(headers, rowValues) {
    var obj = {};
    headers.forEach(function(header, index) {
        obj[header] = rowValues[index];
    });
    return obj;
}
