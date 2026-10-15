// ============================================================
// SISURAT — Logging Service
// ============================================================

function writeAuditLog(actor, role, divisi_id, action, tableName, recordId, detail, metrics) {
    try {
        var logSheet = _ensureSheet("db_audit_log", DB_AUDIT_LOG_HEADERS);
        var headers = _ensureHeaders(logSheet, DB_AUDIT_LOG_HEADERS) || _getHeaders(logSheet);
        metrics = metrics || {};
        var row = {
            timestamp: new Date(),
            actor: actor || "system",
            role: role || "-",
            divisi_id: divisi_id || "-",
            action: action || "-",
            table_name: tableName || "-",
            record_id: recordId || "-",
            detail: detail || "-",
            trace_id: metrics.trace_id || "",
            server_total_ms: typeof metrics.server_total_ms === "number" ? metrics.server_total_ms : "",
            drive_upload_ms: typeof metrics.drive_upload_ms === "number" ? metrics.drive_upload_ms : "",
            lock_wait_ms: typeof metrics.lock_wait_ms === "number" ? metrics.lock_wait_ms : "",
            sheet_write_ms: typeof metrics.sheet_write_ms === "number" ? metrics.sheet_write_ms : "",
            client_prep_ms: typeof metrics.client_prep_ms === "number" ? metrics.client_prep_ms : "",
            sync_queue_ms: typeof metrics.sync_queue_ms === "number" ? metrics.sync_queue_ms : "",
            is_sync: metrics.is_sync === true ? true : (metrics.is_sync === false ? false : ""),
        };
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
