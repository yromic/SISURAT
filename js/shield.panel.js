/**
 * shield.panel.js — UI Panel untuk Role Manager (Permission Shield)
 * Superadmin dapat CRUD role, assign permission via checkbox grid.
 * Terinspirasi tampilan BezhanSalleh/filament-shield.
 */
(function initShieldPanel(global) {
  "use strict";

  let _activeRoleId = null;
  let _pendingPermissions = new Set(); // ID permissions yang di-check

  // ─── Init ─────────────────────────────────────────────────────────────────
  document.addEventListener("DOMContentLoaded", function () {
    const user = SisuratAuth.requireAuth({ redirectTo: "index.html" });
    if (!user) return;

    // Sync user name mobile
    const nm = document.getElementById("user-name");
    const nmm = document.getElementById("user-name-mobile");
    if (nm && nmm) {
      const obs = new MutationObserver(() => { nmm.textContent = nm.textContent; });
      obs.observe(nm, { childList: true, characterData: true, subtree: true });
    }

    ShieldStore.init();
    ShieldGuard.init(ShieldStore);

    if (!ShieldGuard.isSuperAdmin()) {
      document.getElementById("no-access-banner").classList.remove("hidden");
      document.getElementById("shield-main-content").classList.add("hidden");
      return;
    }

    ShieldGuard.applyDirectives();

    _renderRoleList();
    _updateStats();
    _renderSyncBanner(); // Known Limitation 2 mitigation

    // Pilih role pertama secara default
    const roles = ShieldStore.getAllRoles();
    if (roles.length > 0) global.shieldSelectRole(roles[0].id);
  });

  // ─── Sync Info Banner (Known Limitation 2 mitigation) ───────────────────
  function _renderSyncBanner() {
    const banner = document.getElementById("shield-sync-banner");
    if (!banner) return; // banner element mungkin belum ada di HTML lama

    const { isStale, warningMsg, lastUpdated } = ShieldStore.getSyncInfo();
    const isTampered = ShieldGuard.detectTamper && ShieldGuard.detectTamper();

    let html = "";

    if (isTampered) {
      html = `
        <div class="flex items-start gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
          <i class="fas fa-shield-virus text-red-500 text-sm mt-0.5 shrink-0"></i>
          <div>
            <p class="font-bold">⚠️ Perubahan Konfigurasi Terdeteksi</p>
            <p class="opacity-80 mt-0.5">Konfigurasi role berubah sejak halaman dimuat. Kemungkinan dimodifikasi via DevTools.
               Lakukan reload untuk memuat ulang konfigurasi.</p>
          </div>
          <button onclick="location.reload()" class="ml-auto shrink-0 text-red-500 hover:text-red-700 font-bold text-xs underline">Reload</button>
        </div>`;
    } else if (isStale) {
      html = `
        <div class="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-xs">
          <i class="fas fa-exclamation-triangle text-amber-500 text-sm mt-0.5 shrink-0"></i>
          <div>
            <p class="font-bold">Konfigurasi belum disinkronkan antar-device</p>
            <p class="opacity-80 mt-0.5">${warningMsg}</p>
          </div>
          <button onclick="shieldExportJson()" class="ml-auto shrink-0 bg-amber-500 hover:bg-amber-600 text-white px-3 py-1 rounded-lg font-semibold transition">
            <i class="fas fa-file-export mr-1"></i>Export
          </button>
        </div>`;
    } else {
      const lastUpdatedFmt = lastUpdated
        ? new Date(lastUpdated).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })
        : "—";
      html = `
        <div class="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs">
          <i class="fas fa-check-circle text-emerald-500 text-sm shrink-0"></i>
          <span>Terakhir diperbarui: <strong>${lastUpdatedFmt}</strong> — Sinkronkan ke device lain via Export/Import JSON.</span>
          <button onclick="shieldExportJson()" class="ml-auto shrink-0 text-emerald-600 hover:text-emerald-800 font-semibold underline transition">Export</button>
        </div>`;
    }

    banner.innerHTML = html;
  }

  // ─── Render Role List (sidebar kiri) ─────────────────────────────────────
  function _renderRoleList() {
    const list = document.getElementById("shield-role-list");
    if (!list) return;
    const roles = ShieldStore.getAllRoles();

    list.innerHTML = roles.map((role) => `
      <button id="role-btn-${role.id}"
              onclick="shieldSelectRole('${role.id}')"
              class="role-list-item w-full text-left px-4 py-3.5 rounded-2xl transition-all duration-200 flex items-center gap-3 group ${_activeRoleId === role.id ? "bg-gradient-to-r from-[#00ADB5] to-[#00939c] text-white shadow-lg shadow-[#00ADB5]/30" : "hover:bg-gray-50 text-[#222831]"}">
        <div class="w-9 h-9 rounded-xl flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm"
             style="background-color: ${role.color || "#6b7280"};">
          ${role.is_super_admin ? '<i class="fas fa-crown text-yellow-300"></i>' : role.label[0]}
        </div>
        <div class="flex-1 min-w-0">
          <p class="font-bold text-sm truncate">${_esc(role.label)}</p>
          <p class="text-xs opacity-60 truncate">${role.is_super_admin ? "Akses Penuh" : role.permissions.length + " izin"}</p>
        </div>
        ${role.name === "super_admin" ? '<i class="fas fa-lock text-[10px] opacity-50"></i>' : ''}
      </button>`).join("");
  }

  function _updateStats() {
    const roles = ShieldStore.getAllRoles();
    const el = document.getElementById("shield-stat-roles");
    if (el) el.textContent = roles.length;
    const perms = ShieldStore.getAllPermissions();
    const el2 = document.getElementById("shield-stat-perms");
    if (el2) el2.textContent = perms.length;
  }

  // ─── Select Role → Load Permission Panel ─────────────────────────────────
  global.shieldSelectRole = function (roleId) {
    _activeRoleId = roleId;
    const role = ShieldStore.getRoleById(roleId);
    if (!role) return;

    _pendingPermissions = new Set(role.permissions || []);

    // Update role list UI
    _renderRoleList();

    // Update role detail panel
    const nameEl = document.getElementById("shield-role-name");
    if (nameEl) nameEl.textContent = role.label;
    const badgeEl = document.getElementById("shield-role-badge");
    if (badgeEl) {
      badgeEl.textContent = role.is_super_admin ? "Super Admin" : "Role Biasa";
      badgeEl.className = `px-3 py-1 rounded-full text-xs font-bold text-white ${role.is_super_admin ? "bg-purple-500" : "bg-[#00ADB5]"}`;
    }

    // Super Admin toggle
    const saToggle = document.getElementById("shield-sa-toggle");
    if (saToggle) {
      saToggle.checked = role.is_super_admin;
      saToggle.disabled = role.name === "super_admin";
    }

    // Lock/unlock buttons
    const isLocked = role.name === "super_admin";
    const deleteBtn = document.getElementById("shield-delete-btn");
    if (deleteBtn) deleteBtn.disabled = isLocked;

    // Render permission cards
    _renderPermissionCards(role);

    // Tampilkan panel
    document.getElementById("shield-empty-state").classList.add("hidden");
    document.getElementById("shield-role-panel").classList.remove("hidden");
  };

  // ─── Render Permission Cards (grid per resource) ──────────────────────────
  function _renderPermissionCards(role) {
    const container = document.getElementById("shield-perm-cards");
    if (!container) return;

    const resources = ShieldStore.getResources();
    const isSuperAdmin = role.is_super_admin;

    container.innerHTML = resources.map((res) => {
      const perms = ShieldStore.getPermissionsByResource(res.key);
      if (perms.length === 0) return "";

      const allChecked = perms.every((p) => isSuperAdmin || _pendingPermissions.has(p.id));
      const someChecked = !allChecked && perms.some((p) => isSuperAdmin || _pendingPermissions.has(p.id));

      return `
        <div class="bg-gray-50 rounded-2xl p-5 border border-gray-100 hover:border-[#00ADB5]/30 transition-colors group" data-resource="${res.key}">
          <div class="flex items-center justify-between mb-4">
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-lg bg-[#00ADB5]/10 flex items-center justify-center">
                <i class="fas ${res.icon} text-[#00ADB5] text-sm"></i>
              </div>
              <span class="text-sm font-bold text-[#222831]">${_esc(res.label)}</span>
            </div>
            <label class="flex items-center gap-2 cursor-pointer" title="Pilih semua ${res.label}">
              <span class="text-[10px] font-bold text-gray-400 uppercase tracking-widest">All</span>
              <input type="checkbox" data-res="${res.key}" data-action="select-all"
                     ${allChecked ? "checked" : ""} ${someChecked ? "indeterminate" : ""} ${isSuperAdmin ? "disabled" : ""}
                     onchange="shieldToggleAll('${res.key}', this.checked)"
                     class="w-4 h-4 accent-[#00ADB5] rounded cursor-pointer">
            </label>
          </div>
          <div class="flex flex-wrap gap-2">
            ${perms.map((p) => {
              const checked = isSuperAdmin || _pendingPermissions.has(p.id);
              const actionLabel = { view: "Lihat", create: "Buat", edit: "Edit", delete: "Hapus", export: "Ekspor", force_delete: "Force Del" }[p.action] || p.action;
              const actionColor = { view: "blue", create: "green", edit: "yellow", delete: "red", export: "purple", force_delete: "rose" }[p.action] || "gray";
              return `
                <label class="flex items-center gap-1.5 px-3 py-2 rounded-xl cursor-pointer border-2 transition-all duration-150 text-xs font-bold
                              ${checked ? `border-[#00ADB5] bg-[#00ADB5]/10 text-[#00ADB5]` : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"}">
                  <input type="checkbox" value="${p.id}" ${checked ? "checked" : ""} ${isSuperAdmin ? "disabled" : ""}
                         class="hidden perm-checkbox" data-perm-id="${p.id}"
                         onchange="shieldTogglePerm('${p.id}', this)">
                  <i class="fas fa-${checked ? "check-circle" : "circle"} text-current perm-icon"></i>
                  ${actionLabel}
                </label>`;
            }).join("")}
          </div>
        </div>`;
    }).join("");

    // Set indeterminate state
    container.querySelectorAll("[data-action='select-all']").forEach((cb) => {
      const resKey = cb.dataset.res;
      const perms = ShieldStore.getPermissionsByResource(resKey);
      const checkedCount = perms.filter((p) => isSuperAdmin || _pendingPermissions.has(p.id)).length;
      cb.indeterminate = checkedCount > 0 && checkedCount < perms.length;
    });
  }

  // ─── Toggle Permission ────────────────────────────────────────────────────
  global.shieldTogglePerm = function (permId, checkboxEl) {
    const labelEl = checkboxEl.closest("label");
    const icon = labelEl.querySelector(".perm-icon");

    if (!checkboxEl.checked) {
      _pendingPermissions.delete(permId);
      labelEl.classList.remove("border-[#00ADB5]", "bg-[#00ADB5]/10", "text-[#00ADB5]");
      labelEl.classList.add("border-gray-200", "bg-white", "text-gray-500");
      if (icon) icon.className = "fas fa-circle text-current perm-icon";
    } else {
      _pendingPermissions.add(permId);
      labelEl.classList.add("border-[#00ADB5]", "bg-[#00ADB5]/10", "text-[#00ADB5]");
      labelEl.classList.remove("border-gray-200", "bg-white", "text-gray-500");
      if (icon) icon.className = "fas fa-check-circle text-current perm-icon";
    }
    _updateSelectAllState(labelEl.closest("[data-resource]")?.dataset.resource);
  };

  global.shieldToggleAll = function (resKey, checked) {
    const perms = ShieldStore.getPermissionsByResource(resKey);
    perms.forEach((p) => {
      if (checked) _pendingPermissions.add(p.id);
      else _pendingPermissions.delete(p.id);
    });
    // Re-render cards
    const role = ShieldStore.getRoleById(_activeRoleId);
    if (role) _renderPermissionCards(role);
  };

  global.shieldToggleGlobalAll = function (checked) {
    if (checked) {
      ShieldStore.getAllPermissions().forEach((p) => _pendingPermissions.add(p.id));
    } else {
      _pendingPermissions.clear();
    }
    const role = ShieldStore.getRoleById(_activeRoleId);
    if (role) _renderPermissionCards(role);
  };

  function _updateSelectAllState(resKey) {
    if (!resKey) return;
    const perms = ShieldStore.getPermissionsByResource(resKey);
    const checkedCount = perms.filter((p) => _pendingPermissions.has(p.id)).length;
    const allCb = document.querySelector(`[data-res="${resKey}"][data-action="select-all"]`);
    if (allCb) {
      allCb.checked = checkedCount === perms.length;
      allCb.indeterminate = checkedCount > 0 && checkedCount < perms.length;
    }
  }

  // ─── Super Admin Toggle ───────────────────────────────────────────────────
  global.shieldToggleSuperAdmin = function (checked) {
    const role = ShieldStore.getRoleById(_activeRoleId);
    if (!role) return;
    const badgeEl = document.getElementById("shield-role-badge");
    if (badgeEl) {
      badgeEl.textContent = checked ? "Super Admin" : "Role Biasa";
      badgeEl.className = `px-3 py-1 rounded-full text-xs font-bold text-white ${checked ? "bg-purple-500" : "bg-[#00ADB5]"}`;
    }
    // Re-render cards for visual state
    const fakeRole = { ...role, is_super_admin: checked };
    _renderPermissionCards(fakeRole);
  };

  // ─── Save Role ────────────────────────────────────────────────────────────
  global.shieldSaveRole = function () {
    const role = ShieldStore.getRoleById(_activeRoleId);
    if (!role) return;

    const saToggle = document.getElementById("shield-sa-toggle");
    const isSA = saToggle ? saToggle.checked : role.is_super_admin;

    const updated = {
      ...role,
      is_super_admin: isSA,
      permissions: [..._pendingPermissions],
    };

    ShieldStore.saveRole(updated);
    _showToast(`Role "${role.label}" berhasil disimpan.`, "success");
    _renderRoleList();
    _updateStats();
  };

  // ─── Create New Role Modal ────────────────────────────────────────────────
  global.shieldOpenNewRole = function () {
    document.getElementById("nr-form").reset();
    _setNewRoleAlert("");
    document.getElementById("nr-modal").classList.remove("hidden");
    document.getElementById("nr-nama").focus();
  };

  global.shieldCloseNewRole = function (e) {
    if (e && e.target !== e.currentTarget) return;
    global.shieldCloseNewRoleDirect();
  };

  global.shieldCloseNewRoleDirect = function () {
    document.getElementById("nr-modal").classList.add("hidden");
  };

  global.shieldCreateRole = function () {
    const nama = document.getElementById("nr-nama").value.trim();
    const color = document.getElementById("nr-color").value;
    if (!nama) { _setNewRoleAlert("Nama role wajib diisi."); return; }

    const nameSlug = nama.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    const existing = ShieldStore.getRoleByName(nameSlug);
    if (existing) { _setNewRoleAlert(`Role "${nameSlug}" sudah ada.`); return; }

    const newRole = {
      id: ShieldStore.generateNewRoleId(),
      name: nameSlug,
      label: nama,
      is_super_admin: false,
      permissions: [],
      color,
      created_at: new Date().toISOString(),
    };

    ShieldStore.saveRole(newRole);
    global.shieldCloseNewRoleDirect();
    _renderRoleList();
    _updateStats();
    global.shieldSelectRole(newRole.id);
    _showToast(`Role "${nama}" berhasil dibuat.`, "success");
  };

  function _setNewRoleAlert(msg) {
    const el = document.getElementById("nr-alert");
    if (!el) return;
    if (!msg) { el.classList.add("hidden"); return; }
    el.classList.remove("hidden");
    el.textContent = msg;
  }

  // ─── Duplicate Role ───────────────────────────────────────────────────────
  global.shieldDuplicateRole = function () {
    const copy = ShieldStore.duplicateRole(_activeRoleId);
    if (!copy) return;
    _renderRoleList();
    _updateStats();
    global.shieldSelectRole(copy.id);
    _showToast(`Role diduplikasi menjadi "${copy.label}".`, "success");
  };

  // ─── Delete Role ──────────────────────────────────────────────────────────
  global.shieldDeleteRole = function () {
    const role = ShieldStore.getRoleById(_activeRoleId);
    if (!role || role.name === "super_admin") return;
    if (!confirm(`Hapus role "${role.label}"? Tindakan ini tidak dapat diurungkan.`)) return;
    const ok = ShieldStore.deleteRole(_activeRoleId);
    if (ok) {
      _showToast(`Role "${role.label}" dihapus.`, "success");
      document.getElementById("shield-role-panel").classList.add("hidden");
      document.getElementById("shield-empty-state").classList.remove("hidden");
      _activeRoleId = null;
      _renderRoleList();
      _updateStats();
    }
  };

  // ─── Rename Role ──────────────────────────────────────────────────────────
  global.shieldRenameRole = function () {
    const role = ShieldStore.getRoleById(_activeRoleId);
    if (!role || role.name === "super_admin") return;
    const newLabel = prompt("Nama baru untuk role ini:", role.label);
    if (!newLabel || !newLabel.trim()) return;
    ShieldStore.saveRole({ ...role, label: newLabel.trim() });
    _renderRoleList();
    document.getElementById("shield-role-name").textContent = newLabel.trim();
    _showToast("Nama role diperbarui.", "success");
  };

  // ─── Export ───────────────────────────────────────────────────────────────
  global.shieldExportJson = function () {
    ShieldStore.exportJson();
    _renderSyncBanner(); // refresh banner setelah export
    _showToast("Konfigurasi Shield berhasil diekspor ke JSON.", "success");
  };

  global.shieldResetDefault = function () {
    if (!confirm("Reset semua konfigurasi Shield ke default? Semua perubahan custom akan hilang.")) return;
    ShieldStore.reset();
    _renderRoleList();
    _updateStats();
    const roles = ShieldStore.getAllRoles();
    if (roles.length > 0) global.shieldSelectRole(roles[0].id);
    _showToast("Konfigurasi Shield direset ke default.", "success");
  };

  // ─── Toast ────────────────────────────────────────────────────────────────
  function _showToast(msg, type = "success") {
    const container = document.getElementById("shield-toast-container");
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

  function _esc(str) {
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // ─── Sidebar / Logout ─────────────────────────────────────────────────────
  global.logout = function () {
    SisuratAuth.logoutToHome();
  };

})(window);
