/**
 * shield.store.js — State management untuk Role & Permission (SISURAT Shield)
 * Inspired by BezhanSalleh/filament-shield (Laravel)
 * Data disimpan di localStorage["sisurat_shield"]
 */
(function initShieldStore(global) {
  "use strict";

  const STORAGE_KEY = "sisurat_shield";

  // ─── Resources & Actions yang dikelola oleh Shield ─────────────────────────
  const SHIELD_RESOURCES = [
    { key: "surat", label: "Surat (Masuk & Keluar)", icon: "fa-envelope" },
    { key: "piagam", label: "Piagam", icon: "fa-award" },
    { key: "referensi", label: "Kelola Referensi", icon: "fa-sliders-h" },
    { key: "laporan", label: "Ekspor & Laporan", icon: "fa-file-export" },
    { key: "user", label: "Manajemen User", icon: "fa-users-cog" },
    { key: "shield", label: "Permission Shield", icon: "fa-shield-alt" },
  ];

  const SHIELD_ACTIONS = ["view", "create", "edit", "delete"];

  // Tambahan permission custom di luar CRUD standar
  const CUSTOM_PERMISSIONS = [
    { id: "perm_export_laporan", name: "export_laporan", resource: "laporan", action: "export" },
    { id: "perm_force_delete_surat", name: "force_delete_surat", resource: "surat", action: "force_delete" },
    { id: "perm_force_delete_piagam", name: "force_delete_piagam", resource: "piagam", action: "force_delete" },
  ];

  // ─── Default Data ───────────────────────────────────────────────────────────
  function _generateDefaultPermissions() {
    const perms = [];
    SHIELD_RESOURCES.forEach((res) => {
      SHIELD_ACTIONS.forEach((action) => {
        perms.push({
          id: `perm_${action}_${res.key}`,
          name: `${action}_${res.key}`,
          resource: res.key,
          action,
        });
      });
    });
    return [...perms, ...CUSTOM_PERMISSIONS];
  }

  function _getDefaultData() {
    const allPerms = _generateDefaultPermissions();

    // Default Admin: semua permission kecuali user & shield management
    const adminPerms = allPerms
      .filter((p) => !["user", "shield"].includes(p.resource))
      .map((p) => p.id);

    return {
      version: 1,
      roles: [
        {
          id: "role_superadmin",
          name: "super_admin",
          label: "Super Admin",
          is_super_admin: true,
          permissions: [],
          color: "#7c3aed",
          created_at: new Date().toISOString(),
        },
        {
          id: "role_admin",
          name: "admin",
          label: "Admin",
          is_super_admin: false,
          permissions: adminPerms,
          color: "#00ADB5",
          created_at: new Date().toISOString(),
        },
        {
          id: "role_operator",
          name: "operator",
          label: "Operator",
          is_super_admin: false,
          permissions: ["perm_view_surat", "perm_create_surat", "perm_view_piagam", "perm_create_piagam", "perm_view_referensi", "perm_view_laporan"],
          color: "#f59e0b",
          created_at: new Date().toISOString(),
        },
      ],
      permissions: allPerms,
    };
  }

  // ─── Persistence ────────────────────────────────────────────────────────────
  let _state = null;

  function _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Merge permissions baru jika ada resource baru
        const defaultPerms = _generateDefaultPermissions();
        const existingIds = new Set(parsed.permissions.map((p) => p.id));
        defaultPerms.forEach((p) => {
          if (!existingIds.has(p.id)) parsed.permissions.push(p);
        });
        return parsed;
      }
    } catch (e) {
      console.warn("[ShieldStore] Data localStorage corrupt, reset ke default.", e);
    }
    return _getDefaultData();
  }

  function _save() {
    try {
      // Tambahkan timestamp sinkronisasi (Known Limitation 2 mitigation)
      if (_state) {
        _state.last_updated = new Date().toISOString();
        _state.updated_by_ua = navigator.userAgent.slice(0, 64); // fingerprint ringan
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_state));
    } catch (e) {
      console.error("[ShieldStore] Gagal menyimpan ke localStorage:", e);
    }
  }

  function init() {
    _state = _load();
  }

  // ─── Getters ─────────────────────────────────────────────────────────────
  function getResources() {
    return SHIELD_RESOURCES;
  }

  function getAllPermissions() {
    return _state ? [..._state.permissions] : [];
  }

  function getPermissionsByResource(resourceKey) {
    return getAllPermissions().filter((p) => p.resource === resourceKey);
  }

  function getAllRoles() {
    return _state ? [..._state.roles] : [];
  }

  function getRoleById(id) {
    return _state ? _state.roles.find((r) => r.id === id) || null : null;
  }

  function getRoleByName(name) {
    if (!_state || typeof name !== "string" || !name.trim()) return null;
    const normalized = name.toLowerCase().replace(/[\s_-]+/g, "");
    return _state.roles.find((r) => r.name.replace(/[\s_-]+/g, "") === normalized) || null;
  }

  function getRolesByIds(ids) {
    if (!_state || !Array.isArray(ids)) return [];
    return _state.roles.filter((r) => ids.includes(r.id));
  }

  // Ambil role dari user yang sedang login (via SisuratAuth)
  function getCurrentUserRoles() {
    if (!global.SisuratAuth) return [];
    const user = global.SisuratAuth.getStoredUser();
    if (!user) return [];

    // User bisa punya role_ids (array) atau role_id (string) atau role (string, backward compat)
    if (Array.isArray(user.role_ids) && user.role_ids.length > 0) {
      return getRolesByIds(user.role_ids);
    }

    if (user.role_id) {
      const roleById = getRoleById(user.role_id);
      if (roleById) return [roleById];
    }

    // Backward compatibility: cocokkan role string ke role object
    if (user.role) {
      const matched = getRoleByName(user.role);
      return matched ? [matched] : [];
    }
    return [];
  }

  // ─── Setters / Mutations ──────────────────────────────────────────────────
  function saveRole(roleData) {
    if (!_state) return null;
    const idx = _state.roles.findIndex((r) => r.id === roleData.id);
    if (idx >= 0) {
      _state.roles[idx] = { ..._state.roles[idx], ...roleData };
    } else {
      _state.roles.push({ ...roleData, created_at: new Date().toISOString() });
    }
    _save();
    return roleData;
  }

  function deleteRole(roleId) {
    if (!_state) return false;
    const role = getRoleById(roleId);
    if (!role) return false;
    if (role.name === "super_admin") return false; // tidak boleh hapus Super Admin
    _state.roles = _state.roles.filter((r) => r.id !== roleId);
    _save();
    return true;
  }

  function duplicateRole(roleId) {
    const original = getRoleById(roleId);
    if (!original) return null;
    const copy = {
      ...original,
      id: `role_${Date.now()}`,
      name: `${original.name}_copy`,
      label: `${original.label} (Copy)`,
      is_super_admin: false,
      created_at: new Date().toISOString(),
    };
    _state.roles.push(copy);
    _save();
    return copy;
  }

  function generateNewRoleId() {
    return `role_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  }

  // ─── Export ───────────────────────────────────────────────────────────────
  function exportJson() {
    if (!_state) return;
    const blob = new Blob([JSON.stringify(_state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sisurat_shield_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importJson(json) {
    try {
      const data = typeof json === "string" ? JSON.parse(json) : json;
      if (!data.roles || !data.permissions) throw new Error("Format tidak valid");
      _state = data;
      _save();
      return true;
    } catch (e) {
      console.error("[ShieldStore] Import JSON gagal:", e);
      return false;
    }
  }

  function reset() {
    _state = _getDefaultData();
    _save();
  }

  /**
   * Kembalikan timestamp terakhir konfigurasi diubah.
   * @returns {string|null} ISO timestamp atau null
   */
  function getLastUpdated() {
    return _state ? (_state.last_updated || null) : null;
  }

  /**
   * Info sinkronisasi untuk ditampilkan di UI (Known Limitation 2 mitigation).
   * Karena localStorage bersifat per-browser, konfigurasi mungkin berbeda
   * di device/browser lain.
   * @returns {{ lastUpdated: string|null, isStale: boolean, warningMsg: string }}
   */
  function getSyncInfo() {
    const lastUpdated = getLastUpdated();
    const now = Date.now();
    const updatedMs = lastUpdated ? new Date(lastUpdated).getTime() : 0;
    const ageHours = (now - updatedMs) / 1000 / 3600;
    // Anggap "stale" jika belum pernah di-update atau lebih dari 72 jam
    const isStale = !lastUpdated || ageHours > 72;
    const warningMsg = isStale
      ? "⚠️ Konfigurasi Shield belum disinkronkan lebih dari 72 jam atau belum pernah diekspor. " +
        "Gunakan Export/Import JSON untuk sinkronkan antar device."
      : `✓ Konfigurasi terakhir diperbarui: ${new Date(lastUpdated).toLocaleString("id-ID")}. ` +
        "Gunakan Export/Import JSON untuk sinkronkan ke device lain.";
    return { lastUpdated, isStale, warningMsg };
  }

  // ─── Export Global ────────────────────────────────────────────────────────
  global.ShieldStore = {
    init,
    getResources,
    getAllPermissions,
    getPermissionsByResource,
    getAllRoles,
    getRoleById,
    getRoleByName,
    getRolesByIds,
    getCurrentUserRoles,
    saveRole,
    deleteRole,
    duplicateRole,
    generateNewRoleId,
    exportJson,
    importJson,
    reset,
    getLastUpdated,
    getSyncInfo,
    SHIELD_RESOURCES,
    SHIELD_ACTIONS,
  };
})(window);
