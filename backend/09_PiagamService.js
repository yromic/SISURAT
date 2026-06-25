// ============================================================
// SISURAT — TTD Piagam Service
// ============================================================

function simpanPiagam(dataInput, session) {
    if (!dataInput) {
        return responseJSON({
            status: "error",
            message: "Data Input tidak diterima oleh fungsi simpanPiagam.",
        });
    }

    var targetDivisi = "";
    var isPublicSubmit = !session;

    if (isPublicSubmit) {
        var settings = _getSettings();
        targetDivisi = String(settings.public_piagam_target_divisi || "").trim().toUpperCase();
        if (!targetDivisi) {
            return responseJSON({
                status: "error",
                message: "Pengiriman ditolak: Target divisi belum diatur. Silakan hubungi Administrator."
            });
        }
    } else {
        if (session.role === "super_admin") {
            targetDivisi = dataInput.divisi_id ? String(dataInput.divisi_id).trim().toUpperCase() : "";
        } else {
            targetDivisi = session.divisi_id ? String(session.divisi_id).trim().toUpperCase() : "";
        }
    }

    var div = _findDivisiByCode(targetDivisi);
    if (!targetDivisi || !div || (String(div.data.status).toLowerCase() !== "active" && String(div.data.status).toLowerCase() !== "aktif")) {
        if (!isPublicSubmit) {
            writeAuditLog(session.username, session.role, "-", "DENIED:create", "db_piagam", "-", "Invalid division code: " + targetDivisi);
            return _errorResponse("ERR_403_DIVISI");
        } else {
            return responseJSON({
                status: "error",
                message: "Pengiriman ditolak: Divisi target '" + targetDivisi + "' tidak aktif atau tidak ditemukan."
            });
        }
    }

    var tableName = targetDivisi + "_piagam";

    if (!isPublicSubmit) {
        var rbac = _checkRole(session, "create", tableName, dataInput);
        if (!rbac.allowed) {
            return _errorResponse(rbac.error || "ERR_403_ROLE");
        }
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

    dataInput.email_address = isPublicSubmit ? "public_user" : (session.email || session.username);
    dataInput.nama_pengupload = isPublicSubmit ? "Public Piagam Form" : (session.nama || session.username);
    dataInput.divisi_id = targetDivisi;
    dataInput.ttd_pengambil = linkTTD;
    delete dataInput.actor;
    delete dataInput.ttd_base64;
    delete dataInput.ttd_folder_id;

    var now = new Date();
    var recordId = Utilities.getUuid();
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var newRow = headers.map(function (header) {
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
    if (isPublicSubmit) {
        writeAuditLog("public", "public_user", targetDivisi, "create", tableName, recordId, "Tambah piagam publik");
    } else {
        writeAuditLog(session.username, rbac.session.role, targetDivisi, "create", tableName, recordId, "Tambah piagam");
    }
    updateSummary(targetDivisi, "piagam", 1);

    return responseJSON({
        status: "success",
        message: "Data Berhasil Disimpan!",
    });
}
