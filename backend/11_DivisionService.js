// ============================================================
// SISURAT — Division Management Service
// ============================================================

function _normalizeDivisiCode(code) {
    return String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
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
        writeAuditLog(session.username, auth.role, divisiId, "init_divisi", "db_divisi", divisiId, "Init divisi " + kode);
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
        writeAuditLog(session.username, auth.role, divisi.data.id || kode, "retry_init_divisi", "db_divisi", divisi.data.id || kode, "Retry init divisi " + kode);
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
        writeAuditLog(session.username, auth.role, divisi.data.id || kode, "cleanup_divisi", "db_divisi", divisi.data.id || kode, "Cleanup divisi pending " + kode);
        return responseJSON({ status: "success", kode_divisi: kode, divisi_id: divisi.data.id || kode });
    } catch (err) {
        return _serverError("cleanupDivisi", err);
    } finally {
        lock.releaseLock();
    }
}

function deactivateDivisi(data, session) {
    var auth = _requireSuperAdmin(session, "deactivate_divisi");
    if (!auth.ok) return auth.response;
    var kode = _normalizeDivisiCode(data.kode_divisi);
    if (!kode) return _errorResponse("ERR_400_DIVISI");

    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
        _ensureGlobalSheets();
        var divisi = _findDivisiByCode(kode);
        if (!divisi) return _errorResponse("ERR_404_DIVISI");

        _setDivisiValue(divisi, "status", "inactive");
        writeAuditLog(session.username, auth.role, divisi.data.id || kode, "deactivate_divisi", "db_divisi", divisi.data.id || kode, "Deactivate divisi " + kode);
        return responseJSON({ status: "success", kode_divisi: kode, divisi_id: divisi.data.id || kode });
    } catch (err) {
        return _serverError("deactivateDivisi", err);
    } finally {
        lock.releaseLock();
    }
}

function _resolveDivisionTable(session, tableName, dataInput) {
    if (!tableName) return "";
    var GLOBAL_TABLES = ["db_divisi", "db_users", "db_audit_log", "db_summary", "ref_sekolah"];
    if (GLOBAL_TABLES.indexOf(tableName) !== -1) {
        return tableName;
    }

    var parts = tableName.split("_");
    if (parts.length > 1) {
        var firstPart = parts[0].toUpperCase();
        if (firstPart !== "DB" && firstPart !== "REF") {
            // Already division-specific table name
            return tableName;
        }
    }

    var divisionCode = "";
    var isSA = session && (session.role === "super_admin" || String(session.role).toLowerCase() === "super_admin");
    if (isSA) {
        if (dataInput) {
            if (dataInput.divisi_id) {
                divisionCode = String(dataInput.divisi_id).trim().toUpperCase();
            } else if (dataInput.data && dataInput.data.divisi_id) {
                divisionCode = String(dataInput.data.divisi_id).trim().toUpperCase();
            }
        }
    } else if (session) {
        divisionCode = session.divisi_id ? String(session.divisi_id).trim().toUpperCase() : "";
    }

    if (!divisionCode) {
        return "ERR_400_DIVISI_REQUIRED";
    }

    var suffix = "";
    if (tableName === "db_surat_masuk" || tableName === "surat_masuk") suffix = "surat_masuk";
    else if (tableName === "db_surat_keluar" || tableName === "surat_keluar") suffix = "surat_keluar";
    else if (tableName === "db_piagam" || tableName === "piagam") suffix = "piagam";
    else if (tableName === "ref_pengambilan") suffix = "ref_pengambilan";
    else if (tableName === "ref_jenis_perlombaan" || tableName === "ref_jenis") suffix = "ref_jenis";
    else suffix = tableName;

    return divisionCode + "_" + suffix;
}
