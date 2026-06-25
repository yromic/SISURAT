// ============================================================
// SISURAT — Request Router
// ============================================================

function routeAction(action, data, params) {
    var sessionResult;
    var sessionError;

    switch (action) {
        case "login":
            return cekLogin(data);

        case "simpan_piagam":
            var session = null;
            var token = _sessionToken(data);
            if (token) {
                var resSession = _getSession(token);
                if (resSession.ok) {
                    session = resSession.session;
                } else {
                    return _errorResponse("ERR_401_SESSION");
                }
            }
            return simpanPiagam(data, session);

        case "verify_session":
            sessionResult = _requireSessionFromData(data, action);
            sessionError = _sessionResponse(sessionResult);
            if (sessionError) return sessionError;
            return responseJSON({ status: "success", user: _publicSession(sessionResult.session) });

        case "logout":
            sessionResult = _requireSessionFromData(data, action);
            sessionError = _sessionResponse(sessionResult);
            if (sessionError) return sessionError;
            _deleteSession(sessionResult.session.token);
            writeAuditLog(sessionResult.session.username, sessionResult.session.role, sessionResult.session.divisi_id || "-", "logout", "-", "-", "Logout");
            return responseJSON({ status: "success", message: "Logout berhasil" });

        case "get_data":
            var isPublicTable = (data.table === "ref_sekolah" || data.table === "ref_pengambilan" || data.table === "ref_jenis" || data.table === "ref_jenis_perlombaan");
            var sessionData = null;
            var tokenData = _sessionToken(data);
            if (tokenData) {
                var resSessionData = _getSession(tokenData);
                if (resSessionData.ok) {
                    sessionData = resSessionData.session;
                } else {
                    return _errorResponse("ERR_401_SESSION");
                }
            }

            if (!sessionData && !isPublicTable) {
                return _errorResponse("ERR_401_SESSION");
            }

            var resolvedTable = "";
            if (sessionData) {
                resolvedTable = _resolveDivisionTable(sessionData, data.table || "", data);
                if (resolvedTable === "ERR_400_DIVISI_REQUIRED") {
                    return _errorResponse("ERR_400_DIVISI_REQUIRED");
                }
            } else {
                if (data.table === "ref_sekolah") {
                    resolvedTable = "ref_sekolah";
                } else {
                    var settingsObj = _getSettings();
                    var targetDiv = String(settingsObj.public_piagam_target_divisi || "").trim().toUpperCase();
                    if (!targetDiv) {
                        return responseJSON({ status: "success", data: [] });
                    }
                    var suffix = "";
                    if (data.table === "ref_pengambilan") suffix = "ref_pengambilan";
                    else suffix = "ref_jenis";
                    resolvedTable = targetDiv + "_" + suffix;
                }
            }

            if (!_validateTableName(resolvedTable)) {
                return responseJSON({ status: "success", data: [] });
            }

            var page = Number(data.page) || 1;
            var limit = Number(data.limit) || 50;

            return getData(resolvedTable, sessionData, data, page, limit);

        case "get_settings":
            var isSA = false;
            var tokenSet = _sessionToken(data);
            if (tokenSet) {
                var resSessionSet = _getSession(tokenSet);
                if (resSessionSet.ok && resSessionSet.session.role === "super_admin") {
                    isSA = true;
                }
            }
            var settings = _getSettings();
            if (!isSA) {
                return responseJSON({
                    status: "success",
                    settings: {
                        app_name: settings.app_name || "",
                        nama_instansi: settings.nama_instansi || "",
                        logo_url: settings.logo_url || ""
                    }
                });
            } else {
                return responseJSON({
                    status: "success",
                    settings: settings
                });
            }

        case "update_settings":
            sessionResult = _requireSessionFromData(data, action);
            sessionError = _sessionResponse(sessionResult);
            if (sessionError) return sessionError;
            if (sessionResult.session.role !== "super_admin") {
                writeAuditLog(sessionResult.session.username, sessionResult.session.role, sessionResult.session.divisi_id || "-", "update_settings", "db_config", "-", "DENIED: unauthorized update settings");
                return _errorResponse("ERR_403_SCOPE");
            }
            var newSettings = data.settings || {};
            _saveSettings(newSettings);
            writeAuditLog(sessionResult.session.username, sessionResult.session.role, sessionResult.session.divisi_id || "-", "update_settings", "db_config", "-", "Update system settings");
            return responseJSON({ status: "success", message: "Settings updated successfully" });

        case "simpan_record":
            sessionResult = _requireSessionFromData(data, action);
            sessionError = _sessionResponse(sessionResult);
            if (sessionError) return sessionError;
            var tableToSave = _resolveDivisionTable(sessionResult.session, data.table || "", data.data || {});
            if (tableToSave === "ERR_400_DIVISI_REQUIRED") {
                return _errorResponse("ERR_400_DIVISI_REQUIRED");
            }
            data.table = tableToSave;
            return simpanRecord(tableToSave, data.data || {}, sessionResult.session);

        case "update_record":
            sessionResult = _requireSessionFromData(data, action);
            sessionError = _sessionResponse(sessionResult);
            if (sessionError) return sessionError;
            var tableToUpdate = _resolveDivisionTable(sessionResult.session, data.table || "", data.data || {});
            if (tableToUpdate === "ERR_400_DIVISI_REQUIRED") {
                return _errorResponse("ERR_400_DIVISI_REQUIRED");
            }
            data.table = tableToUpdate;
            return updateRecord(tableToUpdate, data.id, data.data || {}, sessionResult.session);

        case "hapus_record":
            sessionResult = _requireSessionFromData(data, action);
            sessionError = _sessionResponse(sessionResult);
            if (sessionError) return sessionError;
            var tableToDelete = _resolveDivisionTable(sessionResult.session, data.table || "", data);
            if (tableToDelete === "ERR_400_DIVISI_REQUIRED") {
                return _errorResponse("ERR_400_DIVISI_REQUIRED");
            }
            data.table = tableToDelete;
            return hapusRecord(tableToDelete, data.id, sessionResult.session);

        case "upload_chunk":
            sessionResult = _requireSessionFromData(data, action);
            sessionError = _sessionResponse(sessionResult);
            if (sessionError) return sessionError;
            return handleUploadChunk(data, sessionResult.session);

        case "finalize_upload":
            sessionResult = _requireSessionFromData(data, action);
            sessionError = _sessionResponse(sessionResult);
            if (sessionError) return sessionError;
            return finalizeUpload(data, sessionResult.session);

        case "manage_user":
            sessionResult = _requireSessionFromData(data, action);
            sessionError = _sessionResponse(sessionResult);
            if (sessionError) return sessionError;
            return manageUser(data, sessionResult.session);

        case "reset_password":
            sessionResult = _requireSessionFromData(data, action);
            sessionError = _sessionResponse(sessionResult);
            if (sessionError) return sessionError;
            return resetPassword(data, sessionResult.session);

        case "init_divisi":
            sessionResult = _requireSessionFromData(data, action);
            sessionError = _sessionResponse(sessionResult);
            if (sessionError) return sessionError;
            return initDivisi(data, sessionResult.session);

        case "retry_init_divisi":
            sessionResult = _requireSessionFromData(data, action);
            sessionError = _sessionResponse(sessionResult);
            if (sessionError) return sessionError;
            return retryInitDivisi(data, sessionResult.session);

        case "cleanup_divisi":
            sessionResult = _requireSessionFromData(data, action);
            sessionError = _sessionResponse(sessionResult);
            if (sessionError) return sessionError;
            return cleanupDivisi(data, sessionResult.session);

        case "deactivate_divisi":
            sessionResult = _requireSessionFromData(data, action);
            sessionError = _sessionResponse(sessionResult);
            if (sessionError) return sessionError;
            return deactivateDivisi(data, sessionResult.session);

        case "hard_delete_divisi":
            sessionResult = _requireSessionFromData(data, action);
            sessionError = _sessionResponse(sessionResult);
            if (sessionError) return sessionError;
            return hardDeleteDivisi(data, sessionResult.session);

        case "migrate_existing_records":
            sessionResult = _requireSessionFromData(data, action);
            sessionError = _sessionResponse(sessionResult);
            if (sessionError) return sessionError;
            return runMigrateExistingRecords(sessionResult.session);

        case "bootstrap":
            var tokenBoot = _sessionToken(data);
            var sessionBoot = null;
            if (tokenBoot) {
                var resSessionBoot = _getSession(tokenBoot);
                if (resSessionBoot.ok) {
                    sessionBoot = resSessionBoot.session;
                }
            }
            var settingsBoot = _getSettings();
            var initialData = null;
            if (sessionBoot && data.table) {
                var resolvedTable = _resolveDivisionTable(sessionBoot, data.table, data);
                if (resolvedTable !== "ERR_400_DIVISI_REQUIRED" && _validateTableName(resolvedTable)) {
                    var page = Number(data.page) || 1;
                    var limit = Number(data.limit) || 50;
                    var dataRes = getData(resolvedTable, sessionBoot, data, page, limit);
                    try {
                        initialData = JSON.parse(dataRes.getContent());
                    } catch (_) {}
                }
            }
            var responsePayload = {
                status: "success",
                session: sessionBoot ? _publicSession(sessionBoot) : null,
                settings: sessionBoot && sessionBoot.role === "super_admin" ? settingsBoot : {
                    app_name: settingsBoot.app_name || "",
                    nama_instansi: settingsBoot.nama_instansi || "",
                    logo_url: settingsBoot.logo_url || ""
                },
                initialData: initialData
            };
            return responseJSON(responsePayload);

        case "upload_file":
            sessionResult = _requireSessionFromData(data, action);
            sessionError = _sessionResponse(sessionResult);
            if (sessionError) return sessionError;
            
            var base64DataUrl = data.base64DataUrl;
            var fileName = data.fileName || ("file_" + Date.now());
            var folderId = DRIVE_FOLDER_ID;
            
            var divisiId = (sessionResult.session.role === "super_admin" && data.divisi_id)
                ? String(data.divisi_id).trim().toUpperCase()
                : (sessionResult.session.divisi_id ? String(sessionResult.session.divisi_id).trim().toUpperCase() : "GLOBAL");
            if (divisiId !== "GLOBAL") {
                folderId = _getFolderIdForDivisi(divisiId, data.folderId);
            } else if (data.folderId) {
                folderId = _resolveDriveFolder(data.folderId);
            }
            
            var fileUrl = uploadFileToDrive(base64DataUrl, fileName, folderId);
            writeAuditLog(sessionResult.session.username, sessionResult.session.role, sessionResult.session.divisi_id || "-", "upload", "-", "-", "Upload file utuh: " + fileName);
            return responseJSON({
                status: "success",
                message: "File berhasil disimpan ke Drive.",
                fileUrl: fileUrl
            });

        default:
            return responseJSON({ status: "error", message: "Action tidak dikenal: " + action });
    }
}
