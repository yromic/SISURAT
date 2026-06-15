/**
 * user-management.js — CRUD User & Role Assignment (SISURAT)
 * Izin operasi diputuskan oleh backend.
 */
(function initUserManagement(global) {
  "use strict";

  // ─── State ────────────────────────────────────────────────────────────────
  let _users = [];      // Loaded dari API backend (Google Sheets)
  let _editingId = null;
  let _searchKeyword = "";
  let _sortCol = "nama";
  let _sortAsc = true;
  let _currentPage = 1;
  let _rowsPerPage = 10;
  let _currentUser = null;

  const ROLE_OPTIONS = [
    { id: "super_admin", value: "super_admin", label: "Super Admin", color: "#7c3aed", is_super_admin: true },
    { id: "admin_divisi", value: "admin_divisi", label: "Admin Divisi", color: "#00ADB5", is_super_admin: false },
    { id: "operator", value: "operator", label: "Operator", color: "#10b981", is_super_admin: false },
  ];

  // ─── Init ─────────────────────────────────────────────────────────────────
  document.addEventListener("DOMContentLoaded", function () {
    _currentUser = SisuratAuth.requireAuth({ redirectTo: "index.html" });
    if (!_currentUser) return;

    // Populate dropdowns
    _populateRoleDropdown();
    _populateDivisionDropdown();

    // Load users
    _loadUsers();

    // Event listeners
    const searchEl = document.getElementById("um-search");
    if (searchEl) {
      searchEl.addEventListener("input", function () {
        _searchKeyword = this.value.toLowerCase();
        _currentPage = 1;
        _renderTable();
      });
    }

    const rowsSelect = document.getElementById("um-rows-select");
    if (rowsSelect) {
      rowsSelect.addEventListener("change", function () {
        _rowsPerPage = parseInt(this.value, 10);
        _currentPage = 1;
        _renderTable();
      });
    }
  });

  // ─── Division Helpers ──────────────────────────────────────────────────────
  async function _getDivisions() {
    const cached = localStorage.getItem("sisurat_divisions");
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (_) {}
    }
    try {
      const res = await SisuratApi.getData("db_divisi");
      if (res && res.status === "success" && Array.isArray(res.data)) {
        localStorage.setItem("sisurat_divisions", JSON.stringify(res.data));
        return res.data;
      }
    } catch (_) {}
    return [];
  }

  async function _populateDivisionDropdown() {
    const sel = document.getElementById("um-form-divisi");
    if (!sel) return;
    const divisions = await _getDivisions();
    
    let html = '<option value="">-- Tanpa Divisi (Global/Super Admin) --</option>';
    divisions.forEach((div) => {
      if (div.status === "active" || div.status === "Aktif") {
        html += `<option value="${div.kode_divisi}">${div.kode_divisi} - ${div.nama_divisi}</option>`;
      }
    });
    sel.innerHTML = html;

    const isSA = global.SisuratDivision ? global.SisuratDivision.isSuperAdmin() : false;
    if (!isSA) {
      sel.value = _currentUser ? _currentUser.divisi_id || "" : "";
      sel.disabled = true;
    } else {
      sel.disabled = false;
    }
  }

  // ─── Load Users dari API ──────────────────────────────────────────────────
  async function _loadUsers() {
    _setLoading(true);
    try {
      const result = await SisuratApi.getData("db_users");
      if (result && result.status !== "success") {
        if (result.code === "ERR_403_ROLE") {
          document.getElementById("no-access-banner").classList.remove("hidden");
          document.getElementById("user-main-content").classList.add("hidden");
        }
        throw new Error(result.code || result.message || "Gagal memuat data user");
      }
      _users = Array.isArray(result.data) ? result.data : [];
    } catch (e) {
      _users = [];
      _showToast("Gagal memuat data user dari server.", "error");
      console.error("[UserMgmt] Gagal load users:", e);
    } finally {
      _setLoading(false);
      _renderTable();
      _updateStats();
    }
  }

  function _setLoading(val) {
    const el = document.getElementById("um-loading");
    if (el) el.classList.toggle("hidden", !val);
    const wrapper = document.getElementById("um-table-wrapper");
    if (wrapper) wrapper.classList.toggle("hidden", val);
  }

  // ─── Stats ────────────────────────────────────────────────────────────────
  function _updateStats() {
    const totalEl = document.getElementById("stat-total-user");
    if (totalEl) totalEl.textContent = _users.length;

    const row = document.getElementById("stat-cards-row");
    if (row) {
      const existingDynamic = row.querySelectorAll(".dynamic-stat-card");
      if (existingDynamic.length === 0) {
        ROLE_OPTIONS.forEach((role) => {
          const div = document.createElement("div");
          div.className = "dynamic-stat-card bg-white rounded-2xl p-5 flex items-center gap-4 shadow-sm border border-gray-100";
          div.innerHTML = `
            <div class="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style="background-color: ${role.color}1a;">
              <i class="fas ${role.id === "super_admin" ? "fa-crown" : (role.id === "admin_divisi" ? "fa-user-shield" : "fa-user-edit")} text-xl" style="color: ${role.color};"></i>
            </div>
            <div>
              <p class="text-[11px] font-black text-gray-400 uppercase tracking-widest">${role.label}</p>
              <p id="stat-role-${role.id}" class="text-2xl font-extrabold font-outfit text-[#222831]">0</p>
            </div>
          `;
          row.appendChild(div);
        });
      }
    }

    const roles = ROLE_OPTIONS;
    roles.forEach((role) => {
      const el = document.getElementById(`stat-role-${role.id}`);
      if (el) {
        const count = _users.filter((u) => {
          if (Array.isArray(u.role_ids)) return u.role_ids.includes(role.id) || u.role_ids.includes(role.value);
          if (u.role_id === role.id || u.role_id === role.value) return true;
          // backward compat
          const matched = _getRoleByName(u.role || "");
          return (matched && matched.id === role.id) || String(u.role).toLowerCase() === role.value;
        }).length;
        el.textContent = count;
      }
    });
  }

  // ─── Render Table ─────────────────────────────────────────────────────────
  function _renderTable() {
    const tbody = document.getElementById("um-tbody");
    if (!tbody) return;

    let filtered = _users.filter((u) => {
      const hay = `${u.nama || ""} ${u.username || ""} ${u.email || ""} ${u.role || ""}`.toLowerCase();
      return hay.includes(_searchKeyword);
    });

    // Sort
    filtered.sort((a, b) => {
      const av = (a[_sortCol] || "").toString().toLowerCase();
      const bv = (b[_sortCol] || "").toString().toLowerCase();
      return _sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
    });

    // Counter
    const counterEl = document.getElementById("um-counter");
    if (counterEl) counterEl.textContent = `${filtered.length} user ditemukan`;

    // Pagination
    const totalPages = Math.max(1, Math.ceil(filtered.length / _rowsPerPage));
    if (_currentPage > totalPages) _currentPage = totalPages;
    const start = (_currentPage - 1) * _rowsPerPage;
    const pageData = filtered.slice(start, start + _rowsPerPage);

    // Empty state
    const emptyEl = document.getElementById("um-empty");
    if (emptyEl) emptyEl.classList.toggle("hidden", pageData.length > 0);

    tbody.innerHTML = "";

    pageData.forEach((u, idx) => {
      const roleObj = _getUserRole(u);
      const roleLabel = roleObj ? roleObj.label : (u.role || "—");
      const roleColor = roleObj ? roleObj.color : "#6b7280";
      const isSA = roleObj && roleObj.is_super_admin;
      const rowNum = u.row_number || u.id || (start + idx + 1);

      const tr = document.createElement("tr");
      tr.className = "hover:bg-gray-50/80 transition-colors border-b border-gray-50";
      tr.innerHTML = `
        <td class="px-5 py-4">
          <div class="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-white text-sm shadow-sm"
               style="background: linear-gradient(135deg, ${roleColor}, ${roleColor}99);">
            ${(u.nama || u.username || "?")[0].toUpperCase()}
          </div>
        </td>
        <td class="px-5 py-4">
          <p class="font-semibold text-[#222831] text-sm">${_esc(u.nama || "—")}</p>
          <p class="text-xs text-gray-400 font-medium">${_esc(u.email || "")}</p>
        </td>
        <td class="px-5 py-4">
          <code class="text-xs font-bold bg-gray-100 text-[#393E46] px-2 py-1 rounded-lg">${_esc(u.username || "—")}</code>
        </td>
        <td class="px-5 py-4">
          <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold text-white shadow-sm"
                style="background-color: ${roleColor};">
            ${isSA ? '<i class="fas fa-crown text-yellow-300 text-[10px]"></i>' : ''} ${_esc(roleLabel)}
          </span>
        </td>
        <td class="px-5 py-4 text-right">
          <div class="flex items-center justify-end gap-2">
            <button onclick="umEdit(this.dataset.user)" data-user="${_esc(JSON.stringify(u))}"
                    class="action-btn-edit px-3 py-1.5 text-xs rounded-lg font-semibold flex items-center gap-1.5"
                    title="Edit User">
              <i class="fas fa-edit"></i> Edit
            </button>
            ${!isSA ? `<button onclick="umDelete('${rowNum}', '${_esc(u.nama || u.username)}')"
                    class="action-btn-delete px-3 py-1.5 text-xs rounded-lg font-semibold flex items-center gap-1.5"
                    title="Hapus User">
              <i class="fas fa-trash"></i> Hapus
            </button>` : `<span class="text-xs text-gray-400 italic px-2">Protected</span>`}
          </div>
        </td>`;
      tbody.appendChild(tr);
    });

    _renderPagination(totalPages, filtered.length);
  }

  function _getUserRole(user) {
    if (Array.isArray(user.role_ids) && user.role_ids.length > 0) {
      return _getRoleById(user.role_ids[0]);
    }
    if (user.role_id) {
      return _getRoleById(user.role_id);
    }
    return _getRoleByName(user.role || "");
  }

  function _getRoleById(roleId) {
    let normalized = String(roleId || "").toLowerCase().replace(/[\s_-]+/g, "_");
    if (normalized === "role_admin" || normalized === "admin") {
      normalized = "admin_divisi";
    } else if (normalized === "role_super_admin") {
      normalized = "super_admin";
    } else if (normalized === "role_operator") {
      normalized = "operator";
    }
    return ROLE_OPTIONS.find((role) => role.id === normalized || role.value === normalized) || null;
  }

  function _getRoleByName(roleName) {
    let normalized = String(roleName || "").toLowerCase().replace(/[\s_-]+/g, "_");
    if (normalized === "admin") {
      normalized = "admin_divisi";
    }
    return ROLE_OPTIONS.find((role) => role.value === normalized || role.label.toLowerCase().replace(/[\s_-]+/g, "_") === normalized) || null;
  }

  function _renderPagination(totalPages, totalItems) {
    const el = document.getElementById("um-pagination");
    if (!el) return;
    if (totalPages <= 1) { el.innerHTML = ""; return; }

    let html = `<div class="flex items-center gap-2 flex-wrap justify-center">`;
    html += `<button onclick="umPage(${_currentPage - 1})" ${_currentPage === 1 ? "disabled" : ""}
              class="px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-200 hover:border-[#00ADB5] hover:text-[#00ADB5] transition-colors disabled:opacity-40">
              <i class="fas fa-chevron-left"></i></button>`;

    for (let i = 1; i <= totalPages; i++) {
      if (totalPages > 7 && Math.abs(i - _currentPage) > 2 && i !== 1 && i !== totalPages) {
        if (i === 2 || i === totalPages - 1) html += `<span class="px-1 text-gray-400">…</span>`;
        continue;
      }
      html += `<button onclick="umPage(${i})"
                class="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${i === _currentPage ? "bg-[#00ADB5] text-white shadow-sm" : "border border-gray-200 hover:border-[#00ADB5] hover:text-[#00ADB5]"}">
                ${i}</button>`;
    }

    html += `<button onclick="umPage(${_currentPage + 1})" ${_currentPage === totalPages ? "disabled" : ""}
              class="px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-200 hover:border-[#00ADB5] hover:text-[#00ADB5] transition-colors disabled:opacity-40">
              <i class="fas fa-chevron-right"></i></button>`;
    html += `</div>`;
    el.innerHTML = html;
  }

  function _esc(str) {
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // ─── Sort ─────────────────────────────────────────────────────────────────
  global.umSort = function (col) {
    if (_sortCol === col) _sortAsc = !_sortAsc;
    else { _sortCol = col; _sortAsc = true; }
    _renderTable();
  };

  global.umPage = function (page) {
    const totalPages = Math.ceil(_users.length / _rowsPerPage);
    if (page < 1 || page > totalPages) return;
    _currentPage = page;
    _renderTable();
  };

  // ─── Role Dropdown ────────────────────────────────────────────────────────
  function _populateRoleDropdown() {
    const sel = document.getElementById("um-form-role");
    if (!sel) return;
    const isSA = global.SisuratDivision ? global.SisuratDivision.isSuperAdmin() : false;
    const filteredRoles = ROLE_OPTIONS.filter((r) => {
      if (!isSA && r.id === "super_admin") return false;
      return true;
    });
    sel.innerHTML = filteredRoles
      .map((r) => `<option value="${r.id}">${r.label}</option>`)
      .join("");
  }

  // ─── Modal ────────────────────────────────────────────────────────────────
  global.umOpenModal = function (mode = "add") {
    _editingId = null;
    document.getElementById("um-modal-title").textContent = mode === "add" ? "Tambah User Baru" : "Edit User";
    document.getElementById("um-modal-icon").className = `fas ${mode === "add" ? "fa-user-plus" : "fa-user-edit"} text-[#00ADB5]`;
    document.getElementById("um-form").reset();
    document.getElementById("um-form-password-hint").textContent = mode === "edit" ? "Kosongkan jika tidak ingin mengubah password." : "";
    const pwdField = document.getElementById("um-form-password");
    if (pwdField) pwdField.required = mode === "add";
    _setModalAlert("");

    // Lock/Unlock division selection depending on role
    const divisiEl = document.getElementById("um-form-divisi");
    if (divisiEl) {
      const isSA = global.SisuratDivision ? global.SisuratDivision.isSuperAdmin() : false;
      if (!isSA) {
        divisiEl.value = _currentUser ? _currentUser.divisi_id || "" : "";
        divisiEl.disabled = true;
      } else {
        divisiEl.disabled = false;
      }
    }

    document.getElementById("um-modal").classList.remove("hidden");
    document.getElementById("um-form-nama").focus();
  };

  global.umCloseModal = function (e) {
    if (e && e.target !== e.currentTarget) return;
    global.umCloseModalDirect();
  };

  global.umCloseModalDirect = function () {
    document.getElementById("um-modal").classList.add("hidden");
    _editingId = null;
  };

  global.umEdit = function (jsonStr) {
    let u = {};
    try {
      u = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
    } catch(e) { console.error(e); }

    _editingId = u.row_number || u.id;
    global.umOpenModal("edit");
    document.getElementById("um-modal-title").textContent = "Edit User";
    document.getElementById("um-form-nama").value = u.nama || "";
    document.getElementById("um-form-username").value = u.username || "";
    document.getElementById("um-form-email").value = u.email || "";

    // Set role
    const roleEl = document.getElementById("um-form-role");
    const roleObj = _getUserRole(u);
    if (roleEl && roleObj) roleEl.value = roleObj.id;

    // Set division
    const divisiEl = document.getElementById("um-form-divisi");
    if (divisiEl) {
      const isSA = global.SisuratDivision ? global.SisuratDivision.isSuperAdmin() : false;
      if (isSA) {
        divisiEl.value = u.divisi_id || "";
        divisiEl.disabled = false;
      } else {
        divisiEl.value = _currentUser ? _currentUser.divisi_id || "" : "";
        divisiEl.disabled = true;
      }
    }
  };

  function _setModalAlert(msg, type = "error") {
    const el = document.getElementById("um-modal-alert");
    if (!el) return;
    if (!msg) { el.classList.add("hidden"); el.textContent = ""; return; }
    el.classList.remove("hidden", "bg-red-50", "text-red-600", "bg-green-50", "text-green-600");
    el.classList.add(type === "error" ? "bg-red-50" : "bg-green-50", type === "error" ? "text-red-600" : "text-green-600");
    el.innerHTML = `<i class="fas fa-${type === "error" ? "exclamation-triangle" : "check-circle"} mr-2"></i>${msg}`;
  }

  // ─── Save (Add/Edit) ──────────────────────────────────────────────────────
  global.umSimpan = async function () {
    const nama     = document.getElementById("um-form-nama").value.trim();
    const username = document.getElementById("um-form-username").value.trim();
    const email    = document.getElementById("um-form-email").value.trim();
    const password = document.getElementById("um-form-password").value.trim();
    const roleId   = document.getElementById("um-form-role").value;
    const roleObj  = _getRoleById(roleId);
    const divisiId = document.getElementById("um-form-divisi").value;

    if (!nama || !username) {
      _setModalAlert("Nama dan Username wajib diisi.");
      return;
    }
    if (!_editingId && !password) {
      _setModalAlert("Password wajib diisi untuk user baru.");
      return;
    }

    const submitBtn = document.getElementById("um-submit-btn");
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> Menyimpan...`;

    try {
      const isSA = global.SisuratDivision ? global.SisuratDivision.isSuperAdmin() : false;
      const isEdit  = !!_editingId;
      const payload = {
        sub_action : isEdit ? "update" : "create",
        nama,
        username,
        email,
        role    : roleObj ? roleObj.value : "admin_divisi",
        role_id : roleId,
        divisi_id: isSA ? divisiId : (_currentUser ? _currentUser.divisi_id : ""),
        scope: roleId === "super_admin" ? "global" : "divisi"
      };
      if (isEdit)   payload.row_number = _editingId;
      if (password) payload.password   = password;

      // Panggil action manage_user di backend (bukan saveRecord/updateRecord generik)
      const result = await SisuratApi.postAction("manage_user", payload);

      if (result && result.status === "success") {
        global.umCloseModalDirect();
        _showToast(result.message || (isEdit ? "User diperbarui." : "User ditambahkan."), "success");
        await _loadUsers();
      } else {
        _setModalAlert((result && result.message) || "Terjadi kesalahan.");
      }
    } catch (e) {
      _setModalAlert("Koneksi gagal. Periksa jaringan Anda.");
      console.error("[UserMgmt] umSimpan error:", e);
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<i class="fas fa-save"></i> Simpan`;
    }
  };

  // ─── Delete ───────────────────────────────────────────────────────────────
  global.umDelete = async function (rowNum, nama) {
    const confirmed = await SisuratUI.showConfirm({
      type: "danger",
      title: "Hapus User",
      message: `Hapus user "${nama}"? Tindakan ini tidak bisa diurungkan.`,
      confirmText: "Ya, Hapus",
      cancelText: "Batal",
    });
    if (!confirmed) return;
    try {
      const result = await SisuratApi.postAction("manage_user", {
        sub_action: "delete",
        row_number: rowNum,
      });
      if (result && result.status === "success") {
        _showToast(`User "${nama}" berhasil dihapus.`, "success");
        await _loadUsers();
      } else {
        _showToast((result && result.message) || "Gagal menghapus user.", "error");
      }
    } catch (e) {
      _showToast("Koneksi gagal.", "error");
    }
  };

  // ─── Reset Password ───────────────────────────────────────────────────────
  global.umResetPassword = async function (username, rowNum) {
    const newPass = await SisuratUI.showPrompt({
      type: "info",
      title: "Reset Password",
      message: `Masukkan password baru untuk "${username}":`,
      placeholder: "Password baru...",
      inputType: "password",
      confirmText: "Reset",
      cancelText: "Batal",
    });
    if (!newPass) return;
    try {
      const result = await SisuratApi.postAction("reset_password", {
        username,
        new_password: newPass,
        row_number: rowNum,
      });
      if (result && result.status === "success") {
        _showToast(`Password "${username}" berhasil direset.`, "success");
      } else {
        _showToast((result && result.message) || "Gagal reset password.", "error");
      }
    } catch (e) {
      _showToast("Koneksi gagal.", "error");
    }
  };

  // ─── Toast ────────────────────────────────────────────────────────────────
  function _showToast(msg, type = "success") {
    const container = document.getElementById("um-toast-container");
    if (!container) return;
    const id = `toast_${Date.now()}`;
    const div = document.createElement("div");
    div.id = id;
    div.className = `toast ${type === "success" ? "toast-success" : "toast-error"} flex items-center gap-3`;
    div.innerHTML = `<i class="fas fa-${type === "success" ? "check-circle" : "exclamation-circle"} text-lg"></i>
      <span class="flex-1 text-sm font-semibold">${msg}</span>
      <button onclick="document.getElementById('${id}').remove()" class="text-white/70 hover:text-white"><i class="fas fa-times"></i></button>`;
    container.appendChild(div);
    setTimeout(() => div.remove(), 5000);
  }

  // ─── Logout ───────────────────────────────────────────────────────────────
  global.logout = function () {
    SisuratAuth.logoutToHome();
  };

})(window);
