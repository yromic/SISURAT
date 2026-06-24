// ============================================================
// SISURAT — Drive Integration
// ============================================================

function _getFolderIdForDivisi(divisiId, tableName) {
    var divisi = _findDivisiByCode(divisiId);
    if (divisi && divisi.data && divisi.data.drive_folder_id) {
        return String(divisi.data.drive_folder_id).trim();
    }
    return DRIVE_FOLDER_ID;
}

function uploadFileToDrive(base64DataUrl, fileName, folderId) {
    var parts = base64DataUrl.split(",");
    if (parts.length < 2) throw new Error("Format base64 tidak valid");

    var meta = parts[0];
    var contentMatch = meta.match(/data:([^;]+);/);
    var mimeType = contentMatch ? contentMatch[1] : "application/octet-stream";

    var blob = Utilities.newBlob(
        Utilities.base64Decode(parts[1]),
        mimeType,
        fileName || ("file_" + Date.now())
    );

    var targetFolderId = folderId || DRIVE_FOLDER_ID;
    var folder = DriveApp.getFolderById(targetFolderId);
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return "https://drive.google.com/uc?export=view&id=" + file.getId();
}

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
        console.log("deleteFileFromDrive: " + e.toString());
    }
}

function deleteFileFromDriveSecure(fileUrlOrId, session, divisiId) {
    try {
        if (!session) return;
        if (!fileUrlOrId) return;

        var fileId = fileUrlOrId;
        if (typeof fileUrlOrId === "string" && (fileUrlOrId.indexOf("id=") !== -1 || fileUrlOrId.indexOf("/d/") !== -1)) {
            var idMatch = fileUrlOrId.match(/[?&]id=([^&]+)/) ||
                fileUrlOrId.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
                fileUrlOrId.match(/\/d\/([a-zA-Z0-9_-]+)/);
            if (!idMatch) return;
            fileId = idMatch[1];
        }

        var targetDiv = _normalizeDivisiCode(divisiId);
        var divFolderId = _getFolderIdForDivisi(targetDiv);
        var ttdFolderId = _getFolderIdForDivisi(targetDiv, "db_piagam_ttd");

        var file = DriveApp.getFileById(fileId);
        if (!file) return;

        var parents = file.getParents();
        if (!parents.hasNext()) return;
        var parentFolder = parents.next();
        var parentId = parentFolder.getId();

        var allowedFolders = [];
        if (divFolderId) allowedFolders.push(divFolderId);
        if (ttdFolderId) allowedFolders.push(ttdFolderId);

        allowedFolders.push(DRIVE_FOLDER_ID);
        if (DRIVE_FOLDERS.db_surat_masuk) allowedFolders.push(DRIVE_FOLDERS.db_surat_masuk);
        if (DRIVE_FOLDERS.db_surat_keluar) allowedFolders.push(DRIVE_FOLDERS.db_surat_keluar);
        if (DRIVE_FOLDERS.db_piagam_ttd) allowedFolders.push(DRIVE_FOLDERS.db_piagam_ttd);

        if (allowedFolders.indexOf(parentId) === -1) {
            writeAuditLog(
                session.username || "system",
                session.role || "-",
                session.divisi_id || "-",
                "SECURITY_WARNING",
                "-",
                fileId,
                "Unauthorized delete attempt: parent folder " + parentId + " does not belong to divisi " + divisiId
            );
            return;
        }

        file.setTrashed(true);
        writeAuditLog(
            session.username || "system",
            session.role || "-",
            session.divisi_id || "-",
            "delete_file",
            "-",
            fileId,
            "Berhasil menghapus file dari Drive: " + file.getName()
        );
    } catch (e) {
        console.error("deleteFileFromDriveSecure error: " + e.toString());
    }
}
