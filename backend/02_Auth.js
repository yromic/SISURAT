// ============================================================
// SISURAT — Authentication Layer
// ============================================================

function _sessionKey(token) {
    return "sisurat:v1:session:" + token;
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
    CacheService.getScriptCache().put(key, json, 300); // Session Cache TTL: 300 seconds
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
    console.time("PERF:_getSession");
    if (!token) {
        console.timeEnd("PERF:_getSession");
        return { ok: false, detail: "missing token" };
    }

    var key = _sessionKey(token);
    var raw = CacheService.getScriptCache().get(key);
    if (raw) {
        console.log("CACHE HIT: session " + token);
    } else {
        console.log("CACHE MISS: session " + token);
        raw = PropertiesService.getScriptProperties().getProperty(key);
        if (raw) {
            CacheService.getScriptCache().put(key, raw, 300);
        }
    }

    if (!raw) {
        console.timeEnd("PERF:_getSession");
        return { ok: false, detail: "token not found" };
    }

    var session;
    try {
        session = JSON.parse(raw);
    } catch (err) {
        _deleteSession(token);
        console.timeEnd("PERF:_getSession");
        return { ok: false, detail: "session parse failed" };
    }

    if (!session.expires || Number(session.expires) <= Date.now()) {
        _deleteSession(token);
        console.timeEnd("PERF:_getSession");
        return { ok: false, detail: "token expired" };
    }

    var user = _lookupUser(session.username);
    if (!user || user.aktif === false) {
        _deleteSession(token);
        console.timeEnd("PERF:_getSession");
        return { ok: false, detail: "user inactive or missing" };
    }

    if (user.role !== "super_admin" && user.divisi_id) {
        var div = _findDivisiByCode(user.divisi_id);
        if (div && String(div.data.status || "").toLowerCase() === "inactive") {
            _deleteSession(token);
            console.timeEnd("PERF:_getSession");
            return { ok: false, detail: "division inactive" };
        }
    }

    session.nama = user.nama;
    session.email = user.email || "";
    session.role = user.role;
    session.role_id = user.role_id || "";
    session.divisi_id = user.divisi_id || "";
    session.scope = user.scope || "";
    session.expires = Date.now() + SESSION_TTL_SECONDS * 1000;
    _storeSession(session);

    console.timeEnd("PERF:_getSession");
    return { ok: true, session: session };
}

function _requireSessionFromData(data, action) {
    var result = _getSession(_sessionToken(data));
    if (!result.ok) {
        writeAuditLog("system", "-", "-", "DENIED:session", action || "-", "-", result.detail);
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

    var sheet = _getUserSheet();
    if (!sheet) {
        writeAuditLog("system", "-", "-", "SERVER_ERROR", "login", "-", "Sheet users tidak ditemukan");
        return _errorResponse("ERR_500_SERVER");
    }

    var ensuredHeaders = _ensureUserPasswordColumns(sheet);
    if (!ensuredHeaders) {
        return _errorResponse("ERR_500_SERVER");
    }

    var dataUsers = sheet.getDataRange().getDisplayValues();
    var headers   = dataUsers[0].map(_normalizeHeaderName);

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
                writeAuditLog(dbUser || "system", "-", "-", "DENIED:login", "-", "-", "Akun nonaktif atau tidak ditemukan");
                return responseJSON({ status: "error", message: "Username atau Password salah!" });
            }
            if (user.role !== "super_admin" && user.divisi_id) {
                var div = _findDivisiByCode(user.divisi_id);
                if (div && String(div.data.status || "").toLowerCase() === "inactive") {
                    writeAuditLog(dbUser || "system", "-", user.divisi_id, "DENIED:login_inactive_divisi", "-", "-", "Akun diblokir karena divisi inactive");
                    return responseJSON({ status: "error", message: "Divisi Anda dinonaktifkan. Silakan hubungi Super Admin." });
                }
            }
            _upgradePasswordIfNeeded(sheet, i + 1, headers, row, password);
            cache.remove(failKey);
            var session = _createSession(user);
            writeAuditLog(user.username, user.role, user.divisi_id || "-", "login", "-", "-", "Login berhasil");
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
    writeAuditLog(username, "-", "-", "DENIED:login", "-", "-", "Login gagal ke-" + failed);
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

function _forceLogoutUser(username) {
    if (!username) return;
    try {
        var props = PropertiesService.getScriptProperties().getProperties();
        for (var k in props) {
            if (k.indexOf("sisurat:v1:session:") === 0 || k.indexOf("session_") === 0) {
                var raw = props[k];
                try {
                    var session = JSON.parse(raw);
                    if (session && String(session.username).toLowerCase() === String(username).toLowerCase()) {
                        _deleteSession(session.token);
                    }
                } catch (_) {}
            }
        }
    } catch (e) {
        console.error("Gagal _forceLogoutUser: " + e.toString());
    }
}

function _forceLogoutDivisionUsers(divisiId) {
    if (!divisiId) return;
    try {
        var props = PropertiesService.getScriptProperties().getProperties();
        for (var k in props) {
            if (k.indexOf("sisurat:v1:session:") === 0 || k.indexOf("session_") === 0) {
                var raw = props[k];
                try {
                    var session = JSON.parse(raw);
                    if (session && String(session.divisi_id).toUpperCase() === String(divisiId).toUpperCase()) {
                        _deleteSession(session.token);
                    }
                } catch (_) {}
            }
        }
    } catch (e) {
        console.error("Gagal _forceLogoutDivisionUsers: " + e.toString());
    }
}
