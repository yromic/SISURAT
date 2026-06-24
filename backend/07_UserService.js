// ============================================================
// SISURAT — User Management Service
// ============================================================

function _ensureUserPasswordColumns(sheet) {
    if (!sheet) return null;
    if (sheet.getName() === "db_users") return _ensureHeaders(sheet, DB_USERS_HEADERS);
    var headers = _getHeaders(sheet);
    var usernameIdx = _headerIndex(headers, "username");
    var passwordIdx = _headerIndex(headers, "password");
    if (usernameIdx < 0 || passwordIdx < 0) {
        writeAuditLog("system", "-", "-", "SERVER_ERROR", "db_users", "-", "Header username/password tidak ditemukan");
        return null;
    }
    return _appendMissingHeaders(sheet, ["password_hash", "password_salt", "password_v"]);
}

function _lookupUser(username) {
    if (!username) return null;
    
    var cacheKey = "sisurat:v1:user:" + username;
    var cached = CacheService.getScriptCache().get(cacheKey);
    if (cached) {
        console.log("CACHE HIT: user " + username);
        try {
            return JSON.parse(cached);
        } catch (_) {}
    }
    
    console.log("CACHE MISS: user " + username);
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
        var userObj = {
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
        CacheService.getScriptCache().put(cacheKey, JSON.stringify(userObj), 300); // User Cache TTL: 300 seconds
        return userObj;
    }
    return null;
}

function manageUser(data, session) {
    if (!data || !data.sub_action) {
        return responseJSON({ status: "error", message: "sub_action tidak ditemukan" });
    }

    if (!session) {
        return _errorResponse("ERR_401_SESSION");
    }

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
    var sessionUsername = String(session.username || "").trim();

    if (sub === "create") {
        if (!data.username || !data.password) {
            return responseJSON({ status: "error", message: "Username dan password wajib diisi" });
        }

        if (!isSuperAdmin && String(data.role || "").toLowerCase() === "super_admin") {
            return _errorResponse("ERR_403_ROLE");
        }

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
        var isSelfUpdate = existingUsername && sessionUsername && existingUsername === sessionUsername;

        if (isSelfUpdate && data.aktif !== undefined && data.aktif !== null && data.aktif !== "") {
            var requestedAktif = String(data.aktif).trim().toLowerCase();
            if (data.aktif === false || /^(false|0|no|tidak|nonaktif|inactive)$/i.test(requestedAktif)) {
                writeAuditLog(session.username, session.role, session.divisi_id || "-", "DENIED:self_deactivate", "db_users", existingUsername, "Attempt to deactivate own account");
                return responseJSON({
                    status: "error",
                    code: "ERR_400_SELF_DEACTIVATE",
                    message: "Anda tidak dapat menonaktifkan akun sendiri."
                });
            }
        }

        if (!isSuperAdmin) {
            if (existingDivisiId !== String(session.divisi_id).toUpperCase()) {
                writeAuditLog(session.username, session.role, session.divisi_id || "-", "DENIED:manage_user_cross_divisi", "db_users", existingUsername, "Attempt to update cross-division user");
                return _errorResponse("ERR_403_DIVISI");
            }
            if (data.role && String(data.role).toLowerCase() === "super_admin") {
                return _errorResponse("ERR_403_ROLE");
            }
            data.divisi_id = session.divisi_id;
            data.scope = "divisi";
        }

        var updatedPassword = null;
        if (data.password && data.password.trim() !== "") {
            updatedPassword = _passwordHashFields(data.password);
        }

        headers.forEach(function(h, idx) {
            var key = _normalizeHeaderName(h);
            if (["password", "password_hash", "password_salt", "password_v"].indexOf(key) !== -1) {
                if (updatedPassword) rowVals[idx] = updatedPassword[key];
                return;
            }
            if (data[key] !== undefined && data[key] !== null && data[key] !== "") {
                rowVals[idx] = data[key];
            }
        });

        sheet.getRange(rowNum, 1, 1, headers.length).setValues([rowVals]);

        // Invalidate Cache & Force Logout
        CacheService.getScriptCache().remove("sisurat:v1:user:" + existingUsername);
        if (data.username && data.username !== existingUsername) {
            CacheService.getScriptCache().remove("sisurat:v1:user:" + data.username);
        }
        _forceLogoutUser(existingUsername);

        var logDivisi = isSuperAdmin ? (data.divisi_id || existingDivisiId) : session.divisi_id;
        writeAuditLog(session.username, rbac.session.role, logDivisi, "update_user", "db_users", data.username || String(data.row_number),
            "Update user row=" + data.row_number);
        return responseJSON({ status: "success", message: "User berhasil diperbarui" });
    }

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

        if (existingUsername && sessionUsername && existingUsername === sessionUsername) {
            writeAuditLog(session.username, session.role, session.divisi_id || "-", "DENIED:self_delete", "db_users", existingUsername, "Attempt to delete own account");
            return responseJSON({
                status: "error",
                code: "ERR_400_SELF_DELETE",
                message: "Anda tidak dapat menghapus akun sendiri."
            });
        }

        if (!isSuperAdmin) {
            if (existingDivisiId !== String(session.divisi_id).toUpperCase()) {
                writeAuditLog(session.username, session.role, session.divisi_id || "-", "DENIED:manage_user_cross_divisi", "db_users", existingUsername, "Attempt to delete cross-division user");
                return _errorResponse("ERR_403_DIVISI");
            }
        }

        sheet.deleteRow(delRow);

        // Invalidate Cache & Force Logout
        CacheService.getScriptCache().remove("sisurat:v1:user:" + existingUsername);
        _forceLogoutUser(existingUsername);

        writeAuditLog(session.username, rbac.session.role, isSuperAdmin ? existingDivisiId : session.divisi_id, "delete_user", "db_users", existingUsername,
            "Hapus user row=" + delRow);
        return responseJSON({ status: "success", message: "User berhasil dihapus" });
    }

    return responseJSON({ status: "error", message: "sub_action tidak dikenal: " + sub });
}

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

            // Invalidate cache & Force logout
            CacheService.getScriptCache().remove("sisurat:v1:user:" + data.username);
            _forceLogoutUser(data.username);

            writeAuditLog(session.username, rbacReset.session.role, isSuperAdmin ? targetUserDivisiId : session.divisi_id, "reset_password", "db_users", data.username,
                "Password user \"" + data.username + "\" direset oleh " + session.username);
            return responseJSON({ status: "success", message: "Password user \"" + data.username + "\" berhasil direset" });
        }
    }

    return responseJSON({ status: "error", message: "User \"" + data.username + "\" tidak ditemukan" });
}
