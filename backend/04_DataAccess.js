// ============================================================
// SISURAT — Data Access Layer (Repository)
// ============================================================

// ==========================================
// ─── Header Operations ───
// ==========================================

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

// ==========================================
// ─── Sheet Operations ───
// ==========================================

function _getUserSheet() {
    var sheet = ss.getSheetByName("db_users") || ss.getSheetByName("users");
    return sheet;
}

function _ensureSheet(name, headers) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) {
        sheet = ss.insertSheet(name);
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
        sheet.setFrozenRows(1);
    } else {
        _ensureHeaders(sheet, headers);
    }
    return sheet;
}

function _ensureGlobalSheets() {
    Object.keys(GLOBAL_SHEETS).forEach(function(name) {
        _ensureSheet(name, GLOBAL_SHEETS[name]);
    });
}

// ==========================================
// ─── Row Operations ───
// ==========================================

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

function _setRowValueByHeader(sheet, rowNumber, headers, name, value) {
    var idx = _headerIndex(headers, name);
    if (idx >= 0) sheet.getRange(rowNumber, idx + 1).setValue(value);
}

// ==========================================
// ─── Migration Operations ───
// ==========================================

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

    var divisionSheet = ss.getSheetByName("db_divisi");
    if (divisionSheet && divisionSheet.getLastRow() >= 2) {
        var map = _getHeaderIndexMap(divisionSheet);
        var values = divisionSheet.getRange(2, 1, divisionSheet.getLastRow() - 1, divisionSheet.getLastColumn()).getValues();
        values.forEach(function(row) {
            var divisiId = String(row[map.kode_divisi] || "").trim().toUpperCase();
            if (divisiId) {
                try {
                    _recomputeSummary(divisiId);
                    results.push({ division: divisiId, summary_recalculated: true });
                } catch (e) {
                    results.push({ division: divisiId, summary_recalculated: false, error: e.toString() });
                }
            }
        });
    }

    return results;
}
