// ============================================================
// SISURAT — Logging Service
// ============================================================

function writeAuditLog(actor, role, divisi_id, action, tableName, recordId, detail) {
    try {
        var logSheet = _ensureSheet("db_audit_log", DB_AUDIT_LOG_HEADERS);
        var row = {
            timestamp: new Date(),
            actor: actor || "system",
            role: role || "-",
            divisi_id: divisi_id || "-",
            action: action || "-",
            table_name: tableName || "-",
            record_id: recordId || "-",
            detail: detail || "-",
        };
        var headers = _getHeaders(logSheet);
        logSheet.appendRow(headers.map(function(header) {
            return row[header] !== undefined ? row[header] : "";
        }));
    } catch (logErr) {
        console.error("writeAuditLog error: " + logErr.toString());
    }
}

// Extensible placeholders for future development
function _writeSecurityLog(actor, action, detail) {
    // For future security specific logging
    writeAuditLog(actor, "SECURITY", "-", action, "-", "-", detail);
}

function _writePerformanceLog(context, durationMs) {
    // For future performance tracking
    console.log("[PERF] " + context + " took " + durationMs + "ms");
}
