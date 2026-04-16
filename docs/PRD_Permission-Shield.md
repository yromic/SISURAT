# 🛡️ Permission Shield
### Product Requirements Document (PRD)

| Field | Detail |
|-------|--------|
| **Versi** | 2.0.0 |
| **Tanggal** | 2026-04-14 |
| **Status** | **Implemented** ✅ |
| **Stack** | HTML · CSS · Vanilla JavaScript |
| **Referensi** | BezhanSalleh/filament-shield (Laravel/Filament) |

---

## Changelog

| Versi | Tanggal | Status | Perubahan |
|-------|---------|--------|-----------|
| 1.0.0 | 2026-04-13 | Draft | Dokumen PRD awal — spesifikasi & desain |
| 2.0.0 | 2026-04-14 | **Implemented** | Semua modul selesai diimplementasikan; docs diperbarui sesuai kodebase aktual |

---

## 1. Ringkasan Proyek

**Permission Shield** adalah modul manajemen **Role & Permission** berbasis web yang terinspirasi dari package [BezhanSalleh/filament-shield](https://github.com/bezhanSalleh/filament-shield) untuk ekosistem Laravel. Modul ini menghadirkan konsep RBAC (Role-Based Access Control) ke dalam proyek **SISURAT** yang berbasis HTML, CSS, dan Vanilla JavaScript tanpa framework backend.

### Status Implementasi

| Modul | File | Status |
|-------|------|--------|
| State Management | `js/shield.store.js` | ✅ Selesai |
| Policy Guard | `js/shield.guard.js` | ✅ Selesai |
| Role Manager UI | `js/shield.panel.js` | ✅ Selesai |
| User Management | `js/user-management.js` | ✅ Selesai |
| Sidebar Helper | `js/sidebar-init.js` | ✅ Selesai |
| Halaman Shield | `shield.html` | ✅ Selesai |
| Halaman User Mgmt | `user-management.html` | ✅ Selesai |
| Backend Apps Script | `js/kodeappscript.js` v3.0 | ✅ Selesai |
| CSS Shield Classes | `css/style.css` (Section 22) | ✅ Selesai |
| Sidebar Dinamis SA | Semua halaman | ✅ Selesai |

---

## 2. Konsep Utama yang Diadopsi

| Konsep | Deskripsi | Status |
|--------|-----------|--------|
| **Super Admin** | Role tertinggi dengan semua permission secara implisit tanpa assignment manual | ✅ Implemented |
| **Auto-generate Permission** | Permission di-generate otomatis dari daftar resource × actions | ✅ Implemented |
| **Policy-based Guard** | `ShieldGuard.can()` / `cannot()` diperiksa sebelum render elemen | ✅ Implemented |
| **HTML Directive** | `data-shield="perm_name"` pada elemen untuk hide/disable otomatis | ✅ Implemented |
| **Role Panel** | UI panel CRUD role + checkbox grid permission | ✅ Implemented |
| **User Management** | CRUD user + assign role dari UI tanpa akses Google Sheets langsung | ✅ Implemented |

---

## 3. Arsitektur Data

### 3.1 Struktur JSON di `localStorage["sisurat_shield"]`

```json
{
  "resources": [
    { "id": "surat_masuk",  "label": "Surat Masuk" },
    { "id": "surat_keluar", "label": "Surat Keluar" },
    { "id": "piagam",       "label": "Piagam" },
    { "id": "laporan",      "label": "Laporan" },
    { "id": "referensi",    "label": "Referensi" },
    { "id": "user",         "label": "User" }
  ],

  "actions": ["create", "read", "update", "delete"],

  "roles": [
    {
      "id": "role_super_admin",
      "name": "super_admin",
      "label": "Super Admin",
      "color": "#7c3aed",
      "is_super_admin": true,
      "permissions": []
    },
    {
      "id": "role_admin",
      "name": "admin",
      "label": "Admin",
      "color": "#00ADB5",
      "is_super_admin": false,
      "permissions": [
        "create_surat_masuk", "read_surat_masuk", "update_surat_masuk",
        "create_surat_keluar", "read_surat_keluar",
        "read_laporan"
      ]
    },
    {
      "id": "role_operator",
      "name": "operator",
      "label": "Operator",
      "color": "#f59e0b",
      "is_super_admin": false,
      "permissions": ["read_surat_masuk", "create_surat_masuk"]
    }
  ]
}
```

### 3.2 Tabel `db_users` di Google Sheets (v3.0)

```
| username | password | role | nama | email | role_id |
|----------|----------|------|------|-------|---------|
```

- **`role`** — label teks role (untuk backward compat & display)
- **`role_id`** — ID unik yang merujuk ke role di ShieldStore (contoh: `role_admin`)
- **`password`** — TIDAK pernah dikirim ke frontend (di-strip otomatis oleh Apps Script)

### 3.3 Permission Naming Convention

Format: `{action}_{resource_id}` (semua lowercase, underscore)

| Action | Contoh Permission |
|--------|-------------------|
| `create` | `create_surat_masuk` |
| `read` | `read_piagam` |
| `update` | `update_surat_keluar` |
| `delete` | `delete_laporan` |

---

## 4. Implementasi Modul

### 4.1 `shield.store.js` — State Management

**Namespace global:** `ShieldStore`

**Inisialisasi:** Load dari `localStorage["sisurat_shield"]`. Jika belum ada, buat 3 role default (Super Admin, Admin, Operator) + perms auto-generated dari 6 resources × 4 actions.

**API Publik:**

```js
ShieldStore.init()                          // Load/init state
ShieldStore.getAllRoles()                   // → Role[]
ShieldStore.getRoleById(id)                // → Role | null
ShieldStore.getRolesByIds(ids[])           // → Role[]
ShieldStore.getRoleByName(name)            // → Role | null (case-insensitive)
ShieldStore.getAllPermissions()            // → Permission[]
ShieldStore.getAllResources()              // → Resource[]
ShieldStore.updateRolePermissions(id, []) // Simpan permissions ke role
ShieldStore.addRole(roleData)             // Tambah role baru
ShieldStore.deleteRole(id)                // Hapus role
ShieldStore.getAll()                       // → seluruh state
ShieldStore.importAll(data)               // Timpa state dengan data import
```

### 4.2 `shield.guard.js` — Policy Enforcement

**Namespace global:** `ShieldGuard`

**Cara kerja:**
1. Ambil user dari `localStorage["user"]`
2. Jika user punya `role_ids[]`, lookup roles di ShieldStore
3. Jika ada role dengan `is_super_admin: true` → return `true` untuk semua `can()`
4. Jika tidak, kumpulkan union permission dari semua role → cek apakah permission ada

**API Publik:**

```js
ShieldGuard.init(store)          // Inisialisasi dengan ShieldStore instance
ShieldGuard.can("create_surat_masuk")   // → boolean
ShieldGuard.cannot("delete_piagam")     // → boolean
ShieldGuard.isSuperAdmin()              // → boolean
ShieldGuard.applyDirectives()           // Proses semua [data-shield] di DOM
```

**Directive HTML:**

```html
<!-- Hide jika tidak punya permission (default) -->
<button data-shield="create_surat_masuk">+ Tambah</button>

<!-- Disable jika tidak punya permission -->
<button data-shield="delete_piagam" data-shield-mode="disable">Hapus</button>
```

**Fallback:** Jika ShieldStore tidak tersedia, `isSuperAdmin()` fallback ke `SisuratAuth.isSuperAdmin()` (string-based).

### 4.3 `shield.panel.js` — Role Manager UI

Dipanggil dari `shield.html`. Mengelola seluruh interaksi panel Role Manager.

**Fitur yang diimplementasikan:**
- ✅ Render daftar role di panel kiri — klik untuk switch active role
- ✅ Render grid permission (Resources × Actions) di panel kanan
- ✅ Checkbox per cell dengan state tersimpan
- ✅ Tombol "Select All" per resource (baris)
- ✅ Toggle Super Admin pada role
- ✅ Tombol simpan permission ke ShieldStore + localStorage
- ✅ Tambah role baru (modal nama + warna)
- ✅ Hapus role dengan konfirmasi
- ✅ Duplikasi role dengan nama baru
- ✅ Export JSON (download file)
- ✅ Import JSON (file input → parse → importAll)

### 4.4 `user-management.js` — CRUD User

Dipanggil dari `user-management.html`.

**Fitur yang diimplementasikan:**
- ✅ Load user dari `GET ?action=get_data&table=db_users`
- ✅ Render tabel dengan avatar color dari role, badge role
- ✅ Sort kolom (nama, username, email, role)
- ✅ Search client-side (nama/username/email/role)
- ✅ Pagination client-side
- ✅ Modal tambah user (POST `manage_user` sub: `create`)
- ✅ Modal edit user (POST `manage_user` sub: `update`)
- ✅ Hapus user dengan confirm (POST `manage_user` sub: `delete`)
- ✅ Reset password via prompt (POST `reset_password`)
- ✅ Proteksi: tombol Hapus tidak tampil untuk role Super Admin

### 4.5 `sidebar-init.js` — Helper Global

Dipanggil di semua halaman protected setelah `shield.guard.js`.

```js
// Otomatis saat DOMContentLoaded:
ShieldStore.init();
ShieldGuard.init(ShieldStore);
if (ShieldGuard.isSuperAdmin()) {
  document.getElementById("sidebar-superadmin-section").classList.remove("hidden");
}
ShieldGuard.applyDirectives();
```

---

## 5. Backend — Google Apps Script v3.0

### 5.1 Action Baru

| Action | Sub-action | Fungsi |
|--------|-----------|--------|
| `manage_user` | `create` | Tambah user baru ke `db_users` (cek duplikat username) |
| `manage_user` | `update` | Update data user (password opsional — kosong = tidak berubah) |
| `manage_user` | `delete` | Hapus baris user dari `db_users` |
| `reset_password` | — | Reset password user by username |

### 5.2 Perubahan `cekLogin`

Login kini mengembalikan `role_id` dan `role_ids[]`:

```json
{
  "user": {
    "username": "...", "nama": "...", "email": "...",
    "role": "Admin",
    "role_id": "role_admin",
    "role_ids": ["role_admin"]
  }
}
```

Fallback ke sheet `users` (legacy) jika sheet `db_users` belum ada.

### 5.3 Keamanan Backend

| Endpoint | Proteksi |
|----------|---------|
| `getData("users")` | ❌ Diblokir (legacy sheet) |
| `getData("db_users")` | ✅ Diizinkan — kolom `password` otomatis di-strip |
| `simpanRecord("db_users", ...)` | ❌ Diblokir — gunakan `manage_user` |
| `updateRecord("db_users", ...)` | ❌ Diblokir — gunakan `manage_user` |
| `hapusRecord("db_users", ...)` | ❌ Diblokir — gunakan `manage_user` |

> ⚠️ **Catatan:** Validasi role di sisi backend belum diterapkan untuk endpoint CRUD dokumen (surat masuk/keluar/piagam). Ini adalah item roadmap v3.1.

---

## 6. Alur Penggunaan (User Flow)

```
[Super Admin Login]
      │
      ▼ (sidebar-init.js membuka section SA)
[Sidebar → Permission Shield]
      │
      ├── Buat role "Operator TU"
      ├── Centang permission: create_surat_masuk, read_surat_masuk
      └── Klik Simpan → localStorage["sisurat_shield"] diperbarui
      │
[Sidebar → Kelola User]
      │
      ├── Klik "+ Tambah User"
      ├── Isi: Budi Santoso | budi | budi123 | Role: Operator TU
      └── Simpan → POST manage_user create → db_users di Sheets
      │
[Logout → Login sebagai Budi]
      │
      ├── role_ids: ["role_operator_tu"]
      ├── ShieldGuard.can("delete_surat_masuk") → false
      ├── Tombol Hapus di master.html disembunyikan
      └── Akses shield.html → Banner "Akses Ditolak"
```

---

## 7. Acceptance Criteria — Status

| ID | Kriteria | Status |
|----|----------|--------|
| AC-01 | Resource menghasilkan permission CRUD otomatis | ✅ Selesai |
| AC-02 | Super Admin bypass semua guard | ✅ Selesai |
| AC-03 | Role CRUD + konfirmasi hapus | ✅ Selesai |
| AC-04 | Permission tersimpan setelah refresh | ✅ Selesai (localStorage) |
| AC-05 | `data-shield` hide elemen | ✅ Selesai |
| AC-06 | `data-shield-mode="disable"` disable elemen | ✅ Selesai |
| AC-07 | Multi-role union permission | ✅ Selesai (via `role_ids[]`) |
| AC-08 | Persistence konfigurasi | ✅ Selesai (localStorage) |
| AC-09 | Export JSON | ✅ Selesai |
| **AC-10** | **Import JSON** | ✅ **Selesai (baru)** |
| **AC-11** | **CRUD User dari UI** | ✅ **Selesai (baru)** |
| **AC-12** | **Reset Password dari UI** | ✅ **Selesai (baru)** |
| **AC-13** | **Sidebar SA dinamis** | ✅ **Selesai (baru)** |
| **AC-14** | **Password tidak dikirim ke frontend** | ✅ **Selesai (baru)** |

---

## 8. Batasan & Risiko

| Risiko | Dampak | Status Mitigasi |
|--------|--------|-----------------|
| Guard hanya sisi client | 🔴 Tinggi | ⚠️ Partial — Apps Script blokir akses `db_users` langsung; perlu validasi role per endpoint dokumen (roadmap v3.1) |
| `localStorage` bisa dihapus user | 🟡 Sedang | ✅ Mitigasi: Export/Import JSON tersedia |
| Konfigurasi Shield tidak sync antar device/browser | 🟡 Sedang | ⚠️ Roadmap: sync ke Google Sheets (v4.0) |
| Tidak ada audit log | 🟡 Sedang | 📋 Roadmap v4.0 |
| Collision nama permission | 🟢 Rendah | ✅ Format `{action}_{resource_id}` konsisten |

---

## 9. Roadmap

| Versi | Fitur | Status |
|-------|-------|--------|
| v2.0.0 | Implementasi penuh ShieldStore, ShieldGuard, Panel, User Mgmt | ✅ **Selesai** |
| v3.1 | Backend enforcement RBAC per endpoint Apps Script | 🔴 Next Priority |
| v4.0 | Sync konfigurasi Shield ke Google Sheets (multi-device) | 🟠 Planned |
| v4.0 | Audit Log — catat perubahan role & user | 🟠 Planned |
| v5.0 | Multi-tenancy | 🟡 Backlog |

---

## 10. Referensi

- [BezhanSalleh/filament-shield](https://github.com/bezhanSalleh/filament-shield)
- [Filament PHP](https://filamentphp.com)
- RBAC (Role-Based Access Control) — NIST SP 800-192
- [MDN — Custom Data Attributes (`data-*`)](https://developer.mozilla.org/en-US/docs/Learn/HTML/Howto/Use_data_attributes)
- Kodebase SISURAT-1: `js/shield.store.js`, `js/shield.guard.js`, `js/shield.panel.js`, `js/user-management.js`

---

> 📌 **Catatan:** Dokumen ini adalah *living document*. Setiap perubahan scope harus disetujui product owner dan dicatat pada tabel Changelog di header.
>
> **Status per 2026-04-14:** Semua fitur MVP sudah terimplementasi. Fase berikutnya fokus pada backend enforcement dan sinkronisasi multi-device.
