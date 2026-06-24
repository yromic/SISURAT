// ============================================================
// SISURAT — Document & Record Management Service
// ============================================================

function getData(tableName, session, data, page, limit) {
    console.time("PERF:getData");
    page = page || 1;
    limit = limit || 50;

    var isPublicTable = false;
    if (tableName === "ref_sekolah") {
        isPublicTable = true;
    } else {
        var match = tableName.match(/^([A-Z0-9]+)_(ref_pengambilan|ref_jenis)$/i);
        if (match) {
            isPublicTable = true;
        }
    }

    if (!session && !isPublicTable) {
        return _errorResponse("ERR_401_SESSION");
    }

    if (session) {
        var rbac = _checkRole(session, "read", tableName, data || {});
        if (!rbac.allowed) {
            writeAuditLog(session.username, session.role || "-", session.divisi_id || "-", "DENIED:read", tableName, "-", rbac.msg);
            return _errorResponse(rbac.error || "ERR_403_ROLE");
        }
    }

    var sheet = ss.getSheetByName(tableName);
    if (!sheet) {
        return responseJSON({
            status: "error",
            message: "Tabel tidak ditemukan: " + tableName,
        });
    }

    var totalRows = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (totalRows <= 1 || lastCol === 0) {
        console.timeEnd("PERF:getData");
        return responseJSON({
            status: "success",
            data: [],
            total: 0,
            page: page,
            limit: limit,
            totalPages: 0
        });
    }

    // 1. Bangun daftar nomor baris yang AKTIF (dari bawah ke atas)
    var activeRowNumbers = [];
    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var headerMapByName = _getHeaderIndexMap(sheet);
    var deletedIdx = headerMapByName.is_deleted;

    if (deletedIdx === undefined || deletedIdx === -1) {
        for (var i = totalRows; i >= 2; i--) {
            activeRowNumbers.push(i);
        }
    } else {
        var deletedRange = sheet.getRange(2, deletedIdx + 1, totalRows - 1, 1).getValues();
        for (var i = totalRows - 2; i >= 0; i--) {
            var rowNum = i + 2;
            var isDel = String(deletedRange[i][0]).trim();
            if (!/^(true|1|yes|ya)$/i.test(isDel)) {
                activeRowNumbers.push(rowNum);
            }
        }
    }

    // 2. Hitung paginasi berdasarkan daftar aktif
    var activeCount = activeRowNumbers.length;
    var totalPages = Math.ceil(activeCount / limit);
    if (page > totalPages && totalPages > 0) {
        page = totalPages;
    }

    // 3. Ambil potongan nomor baris untuk halaman yang diminta
    var startIndex = (page - 1) * limit;
    var endIndex = Math.min(startIndex + limit, activeCount);
    var pageRowNumbers = activeRowNumbers.slice(startIndex, endIndex);

    // 4. Ambil data dengan Bounding Range Read (1x RPC)
    var result = [];
    if (pageRowNumbers.length > 0) {
        var startRow = pageRowNumbers[pageRowNumbers.length - 1]; // Terkecil
        var endRow = pageRowNumbers[0]; // Terbesar
        var rowCount = endRow - startRow + 1;

        var chunkValues = sheet.getRange(startRow, 1, rowCount, lastCol).getDisplayValues();
        var isSuperAdmin = session ? (session.role === "super_admin") : false;

        pageRowNumbers.forEach(function(rowNum) {
            var localIndex = rowNum - startRow;
            var row = chunkValues[localIndex];

            if (session && tableName === "db_users") {
                if (session.role === "operator") return;
                if (!isSuperAdmin) {
                    var divIdx = headerMapByName.divisi_id;
                    var userDivId = (divIdx !== undefined) ? String(row[divIdx] || "").trim() : "";
                    if (userDivId.toUpperCase() !== String(session.divisi_id).toUpperCase()) {
                        return;
                    }
                }
            }

            if (session && tableName === "db_summary") {
                if (!isSuperAdmin) {
                    var divIdx = headerMapByName.divisi_id;
                    var summaryDivId = (divIdx !== undefined) ? String(row[divIdx] || "").trim() : "";
                    if (summaryDivId.toUpperCase() !== String(session.divisi_id).toUpperCase()) {
                        return;
                    }
                }
            }

            if (session && tableName === "db_audit_log") {
                if (session.role === "operator") return;
                if (!isSuperAdmin) {
                    var divIdx = headerMapByName.divisi_id;
                    var auditDivId = (divIdx !== undefined) ? String(row[divIdx] || "").trim() : "";
                    if (auditDivId.toUpperCase() !== String(session.divisi_id).toUpperCase()) {
                        return;
                    }
                }
            }

            var obj = {};
            obj.row_number = rowNum;

            headers.forEach(function (header, index) {
                var clean = normalizeHeader(header);
                var finalKey = headerMap[clean]
                    ? headerMap[clean]
                    : clean.replace(/\s+/g, "_");

                if (["password", "password_hash", "password_salt"].indexOf(finalKey) !== -1) return;

                if (obj[finalKey] !== undefined && finalKey !== "row_number") {
                    obj[finalKey + "_2"] = row[index];
                } else {
                    obj[finalKey] = row[index];
                }
            });
            result.push(obj);
        });
    }

    console.timeEnd("PERF:getData");
    return responseJSON({
        status: "success",
        data: result,
        total: activeCount,
        page: page,
        limit: limit,
        totalPages: totalPages
    });
}

function simpanRecord(tableName, dataInput, session) {
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
        _ensureSheet(tableName, _requiredRecordHeaders(tableName));
    }

    var targetDivisi = rbac.targetDivisi || "";
    dataInput.divisi_id = targetDivisi;

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
    delete dataInput.file_base64;
    delete dataInput.file_name;
    delete dataInput.folder_id;

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

    var now = new Date();
    var recordId = Utilities.getUuid();
    var headers = _getHeaders(sheet);
    var newRow = headers.map(function (header, colIdx) {
        var headerNorm = header.toLowerCase().trim();

        if (headerNorm === "timestamp") {
            return now;
        }

        if (headerNorm === "email address" || headerNorm === "email_address") {
            return session.email || session.username;
        }

        if (headerNorm === "nama pengupload" || headerNorm === "nama_pengupload") {
            return session.nama || session.username;
        }

        if (headerNorm === "divisi_id") {
            return targetDivisi;
        }

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

    writeAuditLog(session.username, rbac.session.role, targetDivisi || "-", "create", tableName, recordId,
        "Tambah data baru ke " + tableName);

    if (targetDivisi && (rbac.tableSuffix === "surat_masuk" || rbac.tableSuffix === "surat_keluar" || rbac.tableSuffix === "piagam")) {
        updateSummary(targetDivisi, rbac.tableSuffix, 1);
    }

    return responseJSON({ status: "success", message: "Data berhasil disimpan!" });
}

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
        _ensureSheet(tableName, _requiredRecordHeaders(tableName));
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

    var fileFolderId = _getFolderIdForDivisi(targetDivisi, tableName);
    var ttdFolderId = _getFolderIdForDivisi(targetDivisi, "db_piagam_ttd");

    if (dataInput.upload_file && dataInput.old_file_url) {
        deleteFileFromDriveSecure(dataInput.old_file_url, session, targetDivisi);
        delete dataInput.old_file_url;
        delete dataInput.file_base64;
        delete dataInput.file_name;
        delete dataInput.folder_id;
    } else if (!dataInput.upload_file && dataInput.file_base64 && dataInput.file_base64.indexOf("base64,") !== -1) {
        try {
            if (dataInput.old_file_url) {
                deleteFileFromDriveSecure(dataInput.old_file_url, session, targetDivisi);
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

    if (dataInput.ttd_base64 && dataInput.ttd_base64.indexOf("base64,") !== -1) {
        try {
            if (dataInput.old_ttd_url) {
                deleteFileFromDriveSecure(dataInput.old_ttd_url, session, targetDivisi);
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

    writeAuditLog(session.username, rbac.session.role, targetDivisi || "-", "update", tableName, id,
        "Update record id=" + id + " di " + tableName);

    return responseJSON({ status: "success", message: "Data berhasil diupdate!" });
}

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
        _ensureSheet(tableName, _requiredRecordHeaders(tableName));
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

    var deletedType = "";
    if (headerMapByName.is_deleted !== undefined) {
        var wasDeleted = /^(true|1|yes|ya)$/i.test(String(rowValues[headerMapByName.is_deleted]).trim());
        if (wasDeleted) {
            return responseJSON({ status: "success", message: "Data sudah dihapus sebelumnya." });
        }
        rowValues[headerMapByName.is_deleted] = true;
        rowValues[headerMapByName.deleted_at] = new Date();
        rowValues[headerMapByName.deleted_by] = session.username;
        rowRange.setValues([rowValues]);
        deletedType = "soft";
    } else if (headerMapByName.aktif !== undefined) {
        var isAlreadyInactive = /^(false|0|no|tidak|nonaktif)$/i.test(String(rowValues[headerMapByName.aktif]).trim());
        if (isAlreadyInactive) {
            return responseJSON({ status: "success", message: "Data sudah dinonaktifkan." });
        }
        rowValues[headerMapByName.aktif] = false;
        if (headerMapByName.deleted_at !== undefined) rowValues[headerMapByName.deleted_at] = new Date();
        if (headerMapByName.deleted_by !== undefined) rowValues[headerMapByName.deleted_by] = session.username;
        rowRange.setValues([rowValues]);
        deletedType = "deactivate";
    } else {
        sheet.deleteRow(rowNumber);
        deletedType = "hard";
    }

    var logDetail = (deletedType === "hard" ? "Hard delete" : (deletedType === "deactivate" ? "Deactivate" : "Soft delete")) + " record id=" + id + " dari " + tableName;
    writeAuditLog(session.username, rbac.session.role, targetDivisi || "-", "delete", tableName, id, logDetail);

    if (deletedType === "soft" && targetDivisi && (rbac.tableSuffix === "surat_masuk" || rbac.tableSuffix === "surat_keluar" || rbac.tableSuffix === "piagam")) {
        updateSummary(targetDivisi, rbac.tableSuffix, -1);
    }

    return responseJSON({ status: "success", message: "Data berhasil dihapus!" });
}
