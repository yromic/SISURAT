// ============================================================
// SISURAT — Chunked Upload Service
// ============================================================

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

        var divisiId = (session.role === "super_admin" && data.divisi_id)
            ? String(data.divisi_id).trim().toUpperCase()
            : (session.divisi_id ? String(session.divisi_id).trim().toUpperCase() : "GLOBAL");
        var key = "chunk_" + divisiId + "_" + uploadId + "_" + chunkIndex;
        CacheService.getScriptCache().put(key, chunkBase64, 3600);

        return responseJSON({ status: "success", message: "Chunk " + chunkIndex + " diterima" });
    } catch (err) {
        return _serverError("handleUploadChunk", err);
    }
}

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

        var divisiId = (session.role === "super_admin" && data.divisi_id)
            ? String(data.divisi_id).trim().toUpperCase()
            : (session.divisi_id ? String(session.divisi_id).trim().toUpperCase() : "GLOBAL");
        var cache = CacheService.getScriptCache();

        var fullBase64 = "";
        for (var i = 0; i < totalChunks; i++) {
            var key = "chunk_" + divisiId + "_" + uploadId + "_" + i;
            var chunk = cache.get(key);
            if (!chunk) {
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

        for (var k = 0; k < totalChunks; k++) {
            cache.remove("chunk_" + divisiId + "_" + uploadId + "_" + k);
        }

        var totalBytes = Math.floor(fullBase64.length * 0.75);
        if (totalBytes > 10 * 1024 * 1024) {
            return _errorResponse("ERR_413_FILE");
        }

        var folderId = DRIVE_FOLDER_ID;
        if (divisiId !== "GLOBAL") {
            folderId = _getFolderIdForDivisi(divisiId);
        } else if (data.folderId) {
            folderId = data.folderId;
        }

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
