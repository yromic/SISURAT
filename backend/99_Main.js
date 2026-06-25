// ============================================================
// SISURAT — Main Entry Points (doGet & doPost)
// ============================================================

function doGet(e) {
    var action = e && e.parameter ? e.parameter.action : "";

    if (action == "get_data") {
        return _errorResponse("ERR_405_POST_REQUIRED");
    }

    if (action == "verify_session") {
        return _errorResponse("ERR_405_POST_REQUIRED");
    }

    return ContentService.createTextOutput("API SISURAT v3.1").setMimeType(
        ContentService.MimeType.TEXT,
    );
}

function doPost(e) {
    try {
        if (!e || !e.postData || !e.postData.contents) {
            return responseJSON({ status: "error", message: "Data post kosong" });
        }

        var params = JSON.parse(e.postData.contents);
        var action = params.action;

        if (action === "ping") {
            return responseJSON({ status: "ok", ts: Date.now() });
        }

        // Origin validation
        var requestOrigin = params.origin || "";
        var isOriginAllowed = ALLOWED_ORIGINS.some(function(allowed) {
            return allowed === requestOrigin;
        });
        if (!isOriginAllowed) {
            return responseJSON({
                status: "error",
                code: "ERR_403_ORIGIN",
                message: "Akses tidak diizinkan.",
            });
        }
        var action = params.action;
        var data = params.data || {};
        _ensureGlobalSheets();
        if (params.session_token && !data.session_token) {
            data.session_token = params.session_token;
        }
        if (action == "login") {
            data = params.data && typeof params.data === "object" ? params.data : {};
            data.username = data.username || params.username || "";
            data.password = data.password || params.password || "";
        }

        return routeAction(action, data, params);
    } catch (error) {
        return _serverError("doPost", error);
    }
}
