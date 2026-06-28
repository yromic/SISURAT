// ============================================================
// SISURAT — Authorization Layer (RBAC)
// ============================================================

function _checkRole(session, action, tableName) {
    var actor_username = (session && typeof session === "object") ? session.username : session;
    var user = _lookupUser(actor_username);
    if (!user) {
        return { allowed: false, role: "", msg: "Actor tidak ditemukan: " + actor_username, error: "ERR_401_SESSION", session: session || null };
    }
    var role = user.role;

    if (!_validateTableName(tableName)) {
        return { allowed: false, role: role, msg: "Tabel tidak valid atau tidak ditemukan: " + tableName, error: "ERR_404_TABLE", session: (session && typeof session === "object") ? session : user };
    }

    // Super Admin bypass semua permission dan divisi
    if (role === "super_admin") {
        return { allowed: true, role: role, msg: "", session: (session && typeof session === "object") ? session : user, tableSuffix: _getTableSuffix(tableName), targetDivisi: _extractDivisi(tableName) };
    }

    // Validasi Divisi / Scope
    var tableDivisi = _extractDivisi(tableName);
    if (tableDivisi) {
        var userDivisi = String(user.divisi_id || "").toUpperCase();
        if (tableDivisi !== userDivisi) {
            return { allowed: false, role: role, msg: "Akses lintas divisi ditolak", error: "ERR_403_DIVISI", session: (session && typeof session === "object") ? session : user };
        }
    }

    var suffix = _getTableSuffix(tableName);
    var specificKey = action + ":" + suffix;
    var rawKey = action + ":" + tableName;
    var wildcardKey = action + ":*";
    var allowedRoles = RBAC_RULES[specificKey] || RBAC_RULES[rawKey] || RBAC_RULES[wildcardKey] || [];
    var allowed = allowedRoles.indexOf(role) !== -1;

    return {
        allowed: allowed,
        role: role,
        msg: allowed ? "" : ("Role '" + role + "' tidak diizinkan untuk " + action + " pada " + tableName),
        error: allowed ? "" : "ERR_403_ROLE",
        session: (session && typeof session === "object") ? session : user,
        tableSuffix: suffix,
        targetDivisi: tableDivisi || user.divisi_id
    };
}

function _requireSuperAdmin(session, action) {
  var rbac = _checkRole(session, action, "db_divisi", {});
  if (!rbac.allowed) {
    writeAuditLog(
      session && session.username ? session.username : "-",
      session && session.role ? session.role : "-",
      session && session.divisi_id ? session.divisi_id : "-",
      "DENIED:" + action,
      "db_divisi",
      "-",
      rbac.error || "ERR_403_ROLE"
    );
    return {
      ok: false,
      response: _errorResponse(rbac.error || "ERR_403_ROLE"),
      role: session && session.role
    };
  }
  return {
    ok: true,
    role: session.role
  };
}
