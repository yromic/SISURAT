# PRD Frontend — SISURAT (Sistem Manajemen Surat)

> **Versi Dokumen:** 3.0
> **Tanggal:** 2026-04-14
> **Status:** Aktif
> **Penulis:** Dihasilkan oleh Analisis Kodebase SISURAT-1

---

## Changelog Versi

| Versi | Tanggal | Perubahan |
|-------|---------|-----------|
| 1.0 | 2026-03-26 | Dokumen awal — analisis kodebase pertama |
| 2.0 | 2026-04-13 | Penambahan `referensi.html`, modul `ref-crud.js`; API baru `fetchRef`, `invalidateRef`, `uploadFileChunked`, `compressImage`, `validateFileSize`; sentralisasi CSS ke `css/style.css` |
| 3.0 | 2026-04-14 | **Implementasi RBAC & Permission Shield** — modul `shield.store.js`, `shield.guard.js`, `shield.panel.js`, `user-management.js`; halaman baru `shield.html` & `user-management.html`; sidebar dinamis Super Admin; update `auth.js` untuk role_ids; update `kodeappscript.js` v3.0 (sheet `db_users`, action `manage_user`, `reset_password`); helper `sidebar-init.js` |

---

## 1. Ringkasan Eksekutif

SISURAT adalah platform manajemen surat digital berbasis web yang dirancang khusus untuk instansi pendidikan. Sistem ini menggantikan pencatatan manual (buku agenda kertas) dengan pengalaman antarmuka visual bertema *"Premium Aesthetic"*. Data disimpan di Google Sheets dan diakses melalui Google Apps Script API.

**Tagline:** *"Kelola Arsip, Lebih Estetik."*

---

## 2. Tujuan Produk

| # | Tujuan | Metrik Keberhasilan |
|---|--------|---------------------|
| 1 | Mendigitalisasi pencatatan surat masuk, surat keluar, dan piagam | 100% data tersimpan digital |
| 2 | Menyediakan pencarian dokumen yang cepat dan intuitif | Waktu temuan < 5 detik |
| 3 | Memberikan visualisasi data arsip secara real-time | Dashboard aktif dengan chart |
| 4 | Mengamankan data dengan sistem soft-delete (Recovery Bin) | Zero permanent data loss accident |
| 5 | Mendukung ekspor multi-format (CSV, PDF, Email) | Laporan bisa diunduh/dikirim |
| 6 | Menyediakan manajemen data referensi dropdown berbasis UI | Admin dapat CRUD sekolah/perlombaan/pengambilan tanpa menyentuh spreadsheet |
| 7 | **Kontrol akses granular per user berbasis role** ← **BARU v3.0** | Super Admin dapat assign role; UI otomatis menyesuaikan permission |

---

## 3. Pengguna (User Persona)

### 3.1 Super Admin ← **DIPERBARUI v3.0**
- **Peran:** Akses penuh ke semua fitur + manajemen user & role
- **Kemampuan eksklusif:**
  - Melihat & mengelola menu **Kelola User** dan **Permission Shield** di sidebar
  - CRUD akun user (tambah, edit, hapus, reset password)
  - Membuat, mengedit, menduplikasi, dan menghapus role
  - Menetapkan permission per role via UI checkbox grid
  - Export / Import konfigurasi role sebagai JSON
- **Identifikasi:** `role = "Super Admin"` (string) atau `role_ids[]` yang menunjuk role dengan `is_super_admin: true` di ShieldStore

### 3.2 Administrator / Admin
- **Peran:** Akses ke semua modul dokumen (CRUD, export, kelola referensi)
- **Kemampuan:** Sesuai permission yang di-assign Super Admin di Shield
- **Identifikasi:** Role `Admin` di ShieldStore tanpa `is_super_admin`

### 3.3 Operator
- **Peran:** Akses terbatas sesuai permission yang di-assign (contoh: hanya Read + Create)
- **Kemampuan:** Elemen UI yang tidak diizinkan otomatis disembunyikan/dinonaktifkan
- **Identifikasi:** Role `Operator` atau role custom lainnya

### 3.4 Pengirim Piagam (Publik / Tamu)
- **Peran:** Hanya dapat mengakses halaman `piagam.html` tanpa login
- **Kemampuan:** Upload piagam + tanda tangan digital via canvas

---

## 4. Arsitektur Halaman & Navigasi

### 4.1 Site Map ← **DIPERBARUI v3.0**

```
index.html              ← Landing Page (Publik)
├── login.html          ← Halaman Login (Publik)
├── piagam.html         ← Upload Piagam (Publik / Semi-Private)
│
└── [Protected - Butuh Auth]
    ├── dashboard.html        ← Overview & Analitik
    ├── cari.html             ← Pencarian Pintar
    ├── master.html           ← Master Data (CRUD Terpadu)
    ├── laporan.html          ← Ekspor & Laporan
    ├── referensi.html        ← Kelola Referensi Dropdown
    │
    └── [Super Admin Only]    ← [BARU v3.0]
        ├── user-management.html  ← CRUD User & Assign Role
        └── shield.html           ← Permission Shield (Role Manager)
```

### 4.2 Sidebar Navigasi ← **DIPERBARUI v3.0**

Sidebar global kini memiliki **5 item navigasi utama** + **section Super Admin** (muncul kondisional):

**Item Utama (semua user):**

| Ikon | Label | Halaman |
|------|-------|---------|
| `fa-chart-pie` | Overview | `dashboard.html` |
| `fa-search` | Pencarian Pintar | `cari.html` |
| `fa-database` | Master Data | `master.html` |
| `fa-file-export` | Ekspor & Laporan | `laporan.html` |
| `fa-sliders-h` | Kelola Referensi | `referensi.html` |

**Section Super Admin** (`id="sidebar-superadmin-section"`, hidden by default): ← **BARU v3.0**

| Ikon | Label | Halaman |
|------|-------|---------|
| `fa-users-cog` | Kelola User | `user-management.html` |
| `fa-shield-alt` | Permission Shield | `shield.html` |

Section ini ditampilkan secara dinamis oleh `sidebar-init.js` saat `ShieldGuard.isSuperAdmin()` mengembalikan `true`.

### 4.3 Alur Autentikasi ← **DIPERBARUI v3.0**

```
Kunjungi index.html
    └─ [User sudah login?] ──Yes──→ Redirect ke dashboard.html
            │
           No
            └─ Tampilkan Landing Page
                   └─ Klik "Login" ──→ login.html
                           └─ Submit Form ──→ API (Google Apps Script)
                                   ├─ Sukses → setStoredUser({ username, nama, role, email, role_id, role_ids })
                                   │           ShieldStore.init()
                                   │           ShieldGuard.init(ShieldStore)
                                   │           → dashboard.html
                                   └─ Gagal  → Tampilkan pesan error
```

### 4.4 Mekanisme Auth Guard ← **DIPERBARUI v3.0**

Setiap halaman protected memanggil `SisuratAuth.requireAuth()`. Halaman Super Admin tambahan juga memanggil `ShieldGuard.isSuperAdmin()` — jika `false`, banner "Akses Ditolak" ditampilkan dan konten utama disembunyikan.

---

## 5. Spesifikasi Per Halaman

### 5.1–5.7 (tidak berubah dari v2.0)

> Lihat dokumen v2.0 untuk detail `index.html`, `login.html`, `dashboard.html`, `cari.html`, `master.html`, `laporan.html`, `piagam.html`.

**Catatan perubahan minor di halaman existing (v3.0):**
- Semua halaman (cari, master, laporan, referensi, dashboard) kini menyertakan script:
  ```html
  <script src="js/shield.store.js"></script>
  <script src="js/shield.guard.js"></script>
  <script src="js/sidebar-init.js"></script>
  ```
- Semua sidebar kini memiliki `<div id="sidebar-superadmin-section" class="hidden">` yang ditampilkan kondisional

---

### 5.8 `referensi.html` — Kelola Referensi (tidak berubah dari v2.0)

---

### 5.9 `user-management.html` — Kelola User ← **HALAMAN BARU v3.0**

**Tujuan:** Antarmuka Super Admin untuk CRUD akun pengguna dan assignment role.

**Akses:** Super Admin only. Halaman menampilkan banner "Akses Ditolak" jika diakses oleh non-Super Admin.

| Komponen | Deskripsi |
|----------|-----------|
| Sidebar | Identik — section Super Admin aktif (badge pada menu "Kelola User") |
| No-Access Banner `#no-access-banner` | Tampil jika bukan Super Admin, sembunyikan konten utama |
| Stat Cards | Total User, jumlah user per role (dari ShieldStore) |
| Search Bar `#um-search` | Filter user by nama/username/email (client-side real-time) |
| Rows Selector `#um-rows-select` | Pilih jumlah baris per halaman (10/25/50/100) |
| Tombol Tambah User | Buka modal form untuk user baru |
| Tabel User `#um-tbody` | Kolom: Avatar, Nama+Email, Username, Role Badge, Aksi |
| Aksi per baris | Edit (✏️), Hapus (🗑️), Reset Password (🔑) — Hapus diblokir untuk Super Admin |
| Modal Form `#um-modal` | Tambah/Edit: Nama, Username, Email, Password, Role dropdown |
| Password hint | "Kosongkan jika tidak ingin mengubah password" (saat edit) |
| Pagination `#um-pagination` | Navigasi halaman, muncul jika data > rows per page |
| Toast Container `#um-toast-container` | Notifikasi sukses/error slide-in |

**Logika (`user-management.js`):**
```
DOMContentLoaded
    └─ requireAuth() → redirect jika tidak login
    └─ ShieldGuard.isSuperAdmin() → tampilkan/sembunyikan konten
    └─ ShieldGuard.applyDirectives()
    └─ _populateRoleDropdown() ← dari ShieldStore.getAllRoles()
    └─ _loadUsers() ← fetch GET ?action=get_data&table=db_users

umSimpan()
    └─ Validasi: nama + username wajib; password wajib saat create
    └─ POST { action: "manage_user", data: { sub_action, nama, username, ... } }
    └─ Sukses → closeModal() + toast + _loadUsers()

umDelete(rowNum, nama)
    └─ confirm() dialog
    └─ POST { action: "manage_user", data: { sub_action: "delete", row_number } }

umResetPassword(username, rowNum)
    └─ prompt() untuk password baru
    └─ POST { action: "reset_password", data: { username, new_password } }

umEdit(jsonStr)
    └─ Parse user object → pre-fill form → set _editingId
```

---

### 5.10 `shield.html` — Permission Shield ← **HALAMAN BARU v3.0**

**Tujuan:** Antarmuka Super Admin untuk mengelola role dan permission berbasis grid checkbox.

**Akses:** Super Admin only.

| Komponen | Deskripsi |
|----------|-----------|
| Header Banner | Gradient, badge "Permission Shield", H1 |
| Role List Panel (kiri) | Daftar semua role, klik untuk switch; tombol "+ Tambah Role" |
| Role active indicator | Role aktif ditandai highlight teal + border |
| Permission Grid Panel (kanan) | Grid Resources × Actions (Create/Read/Update/Delete) |
| Checkbox per cell | Centang = role memiliki permission tersebut |
| Select All per resource | Toggle satu baris sekaligus |
| Super Admin toggle | Switch is_super_admin pada role |
| Tombol Simpan Permission | Menyimpan konfigurasi ke ShieldStore (localStorage) |
| Duplikat Role | Salin role dengan nama baru |
| Hapus Role | Konfirmasi dialog → hapus dari store |
| Export JSON | Unduh seluruh konfigurasi sebagai `.json` |
| Import JSON | Load konfigurasi dari file `.json` |

**Logika (`shield.panel.js`):**
```
ShieldStore.init() → load dari localStorage["sisurat_shield"]
renderRoleList() → render panel kiri
renderPermissionGrid(roleId) → render grid checkbox kanan
savePermissions() → ShieldStore.updateRolePermissions(roleId, selectedPerms)
exportJSON() → JSON.stringify(ShieldStore.getAll()) → download
importJSON() → parse file → ShieldStore.importAll()
```

---

## 6. Spesifikasi Teknis Frontend

### 6.1 Stack Teknologi (tidak berubah dari v2.0)

### 6.2 Sistem Modul JavaScript ← **DIPERBARUI v3.0**

```
js/
├── api.js              → SisuratApi (namespace global)
│                         BASE_URL, TABLE_CONFIG, DRIVE_FOLDERS
│                         CRUD: fetchTable, fetchAllTables, saveRecord, updateRecord, deleteRecord
│                         Ref: fetchRef, invalidateRef
│                         Upload: validateFileSize, compressImage, uploadFileChunked
│                         Util: parseDate, normalizeRecord, exportCsv
│
├── auth.js             → SisuratAuth (namespace global)          ← DIPERBARUI v3.0
│                         Session: getStoredUser, setStoredUser, clearStoredUser
│                         Guard: requireAuth(options)
│                         Role: isSuperAdmin()  ← kini support role_ids[] via ShieldStore
│                         Logout: logoutToHome()
│
├── shield.store.js     → ShieldStore                             ← BARU v3.0
│                         State management RBAC di localStorage["sisurat_shield"]
│                         CRUD roles, permissions, resources
│                         getRoleById(), getRolesByIds(), getRoleByName()
│                         getAllRoles(), getAllPermissions()
│                         updateRolePermissions(), importAll(), getAll()
│
├── shield.guard.js     → ShieldGuard                             ← BARU v3.0
│                         init(store), can(perm), cannot(perm)
│                         isSuperAdmin()
│                         applyDirectives() → proses semua [data-shield] di DOM
│
├── shield.panel.js     → UI Panel Permission Shield              ← BARU v3.0
│                         renderRoleList(), renderPermissionGrid()
│                         savePermissions(), addRole(), deleteRole(), duplicateRole()
│                         exportJSON(), importJSON()
│
├── user-management.js  → CRUD user & role assignment             ← BARU v3.0
│                         _loadUsers(), _renderTable(), _renderPagination()
│                         umSimpan(), umDelete(), umResetPassword()
│                         umEdit(), umOpenModal(), umCloseModal()
│                         umSort(), umPage()
│
├── sidebar-init.js     → Helper inisialisasi sidebar SuperAdmin  ← BARU v3.0
│                         Dipanggil di semua halaman protected
│                         ShieldStore.init() + ShieldGuard.init() + tampilkan section SA
│
├── login.js            → Fungsi login()
├── dashboard.js        → Render metrik + charts + aktivitas log
├── search.js           → Cache, debounce, filter, paginasi, modal
├── master.js           → Tab, tabel dinamis, modal form, CRUD, trash, upload chunked
├── laporan.js          → Filter, render rekap, ekspor CSV/PDF/Email
├── piagam.js           → Canvas TTD, file upload, submit form
├── ref-crud.js         → CRUD referensi: sekolah, pengambilan, perlombaan
└── kodeappscript.js    → Google Apps Script backend (bukan frontend, referensi saja)
```

### 6.3 API Kontrak ← **DIPERBARUI v3.0**

**Endpoint:** `BASE_URL` (Google Apps Script v3.0)

| Action | Method | Payload | Keterangan |
|--------|--------|---------|------------|
| `login` | POST | `{ username, password }` | Return + `role_id`, `role_ids[]` sejak v3.0 |
| `get_data` | GET | `?action=get_data&table=<table>` | `db_users` kini diizinkan; kolom `password` otomatis di-strip |
| `simpan_record` | POST | `{ table, data }` | Diblokir untuk `db_users` — gunakan `manage_user` |
| `update_record` | POST | `{ table, id, data }` | Diblokir untuk `db_users` — gunakan `manage_user` |
| `hapus_record` | POST | `{ table, id }` | Diblokir untuk `db_users` — gunakan `manage_user` |
| `manage_user` | POST | `{ sub_action, ...userFields }` | **BARU v3.0** — sub: `create`, `update`, `delete` |
| `reset_password` | POST | `{ username, new_password }` | **BARU v3.0** — reset password tanpa expose data lain |
| `upload_chunk` | POST | `{ uploadId, chunkIndex, chunkBase64 }` | Chunked upload |
| `finalize_upload` | POST | `{ uploadId, totalChunks, fileName, mimeType, folderId }` | Merge chunks → Drive |

**Struktur Response Login (v3.0):**
```json
{
  "status": "success",
  "user": {
    "username": "budi.santoso",
    "nama": "Budi Santoso",
    "email": "budi@sekolah.sch.id",
    "role": "Admin",
    "role_id": "role_admin",
    "role_ids": ["role_admin"]
  }
}
```

### 6.4 ShieldStore — State Management RBAC ← **BARU v3.0**

```js
// Struktur data di localStorage["sisurat_shield"]
{
  resources: [
    { id: "surat_masuk", label: "Surat Masuk" },
    { id: "surat_keluar", label: "Surat Keluar" },
    { id: "piagam", label: "Piagam" },
    { id: "laporan", label: "Laporan" },
    { id: "referensi", label: "Referensi" },
    { id: "user", label: "User" }
  ],
  actions: ["create", "read", "update", "delete"],
  roles: [
    {
      id: "role_super_admin",
      name: "super_admin",
      label: "Super Admin",
      color: "#7c3aed",
      is_super_admin: true,
      permissions: []  // bypass — tidak perlu diisi
    },
    {
      id: "role_admin",
      name: "admin",
      label: "Admin",
      color: "#00ADB5",
      is_super_admin: false,
      permissions: ["create_surat_masuk", "read_surat_masuk", ...]
    }
  ]
}
```

**Permission naming:** `{action}_{resource_id}` — contoh: `create_surat_masuk`, `delete_piagam`

### 6.5 ShieldGuard — Directive & Policy ← **BARU v3.0**

```html
<!-- Sembunyikan elemen jika tidak punya permission -->
<button data-shield="create_surat_masuk">+ Tambah</button>

<!-- Disable elemen (tetap tampil) jika tidak punya permission -->
<button data-shield="delete_piagam" data-shield-mode="disable">Hapus</button>
```

```js
ShieldGuard.can("create_surat_masuk")  // → true/false
ShieldGuard.cannot("delete_user")      // → true/false
ShieldGuard.isSuperAdmin()             // → true/false
ShieldGuard.applyDirectives()          // → proses semua [data-shield] di DOM
```

### 6.6 Storage ← **DIPERBARUI v3.0**

| Storage | Key | Isi | Persistence |
|---------|-----|-----|-------------|
| `localStorage` | `"user"` | `{ nama, username, role, email, role_id, role_ids }` | Sampai logout/clear |
| `localStorage` | `"sisurat_shield"` | `{ resources, actions, roles }` | Permanen sampai Import ulang |
| `sessionStorage` | `"sisurat_ref_<tableName>"` | `{ data: [...], timestamp }` | TTL 10 menit, per-session |

### 6.7 Google Sheets — Tabel Baru (v3.0) ← **BARU v3.0**

| Tabel | Kolom | Keterangan |
|-------|-------|------------|
| `db_users` | `username`, `password`, `role`, `nama`, `email`, `role_id` | Tabel user untuk CRUD via `manage_user`. Dibuat otomatis oleh Apps Script jika belum ada. |

---

## 7. Desain Sistem (Design System)

### 7.1–7.5 (tidak berubah dari v2.0)

### 7.6 CSS Shield Classes ← **BARU v3.0**

Ditambahkan ke `css/style.css` (Section 22):

| Kelas | Deskripsi |
|-------|-----------|
| `.shield-disabled` | Opacity 0.4, cursor not-allowed, pointer-events none |
| `.shield-badge-*` | Badge warna per permission action (create/read/update/delete) |
| `.shield-toggle` | Toggle switch CSS untuk SuperAdmin flag di role panel |

---

## 8. Manajemen State ← **DIPERBARUI v3.0**

| State | Lokasi | Persistence |
|-------|--------|-------------|
| User session | `localStorage["user"]` | Sampai logout/clear |
| **RBAC config (roles, permissions)** | **`localStorage["sisurat_shield"]`** | **Permanen — BARU v3.0** |
| Cache data pencarian | In-memory (`search.js`) | TTL 2 menit |
| Cache data referensi | `sessionStorage["sisurat_ref_*"]` | TTL 10 menit |
| Tab aktif (master/referensi) | In-memory | Per-session |
| User list (user-management) | In-memory (`_users`) | Per-session |
| Role aktif dipilih (shield panel) | In-memory | Per-session |
| Sort state, kolom visible, view mode | In-memory | Per-session |

---

## 9. Penanganan Error ← **DIPERBARUI v3.0**

| Skenario | Penanganan |
|----------|------------|
| Login gagal | Tampilkan `#msg` inline |
| Akses halaman Super Admin oleh non-SA | Banner "Akses Ditolak", konten disembunyikan |
| `manage_user` duplikat username | Toast error dari backend: "Username sudah digunakan" |
| `reset_password` user tidak ditemukan | Toast error dari backend |
| ShieldStore tidak terinisialisasi | Guard fallback ke `SisuratAuth.isSuperAdmin()` (string-based) |
| localStorage Shield kosong/rusak | `ShieldStore.init()` load ulang default roles ke store |
| Fetch `db_users` gagal | Toast error + render empty state |

---

## 10. Aksesibilitas & SEO ← **DIPERBARUI v3.0**

### 10.2 SEO — Halaman Baru

| Halaman | `<title>` |
|---------|-----------|
| `user-management.html` | Kelola User \| SISURAT Admin |
| `shield.html` | Permission Shield \| SISURAT Admin |

---

## 11. Dependensi Eksternal ← **DIPERBARUI v3.0**

| Layanan | Fungsi | Catatan |
|---------|--------|---------|
| Google Apps Script | REST API backend v3.0 | Tambah action `manage_user` & `reset_password` |
| Google Sheets | Database + tabel `db_users` (baru) | Dibuat otomatis pertama kali oleh Apps Script |
| Google Drive | File dokumen & TTD | Tidak berubah |

---

## 12. Batasan & Risiko ← **DIPERBARUI v3.0**

| Batasan | Dampak | Status |
|---------|--------|--------|
| TailwindCSS via CDN | Bundle besar | Tetap — migrasikan ke Vite saat produksi |
| Auth hanya `localStorage` | Rentan XSS | Tetap — tambah server-side session |
| ~~CSS inline per halaman~~ | ~~Sulit maintenance~~ | ✅ **SELESAI** v2.0 |
| ~~Upload base64 batas 5MB~~ | ~~File besar gagal~~ | ✅ **SELESAI** v2.0 — chunked upload |
| **Guard RBAC hanya sisi client** | Bisa di-bypass DevTools | ⚠️ **Mitigasi:** Apps Script v3.0 block akses `db_users` direct; perlu validasi role di endpoint sensitif |
| **`localStorage["sisurat_shield"]` per browser** | Konfigurasi tidak sinkron antar device | ⚠️ Gunakan Export/Import JSON; roadmap: sync ke Google Sheets |
| Tidak ada audit log | Perubahan role tidak tercatat | 🟡 Roadmap v4.0 |

---

## 13. Roadmap Fitur Frontend ← **DIPERBARUI v3.0**

| Prioritas | Fitur | Status |
|-----------|-------|--------|
| ✅ Selesai | Sentralisasi CSS ke `css/style.css` | v2.0 |
| ✅ Selesai | Chunked file upload + kompresi gambar | v2.0 |
| ✅ Selesai | Halaman Kelola Referensi | v2.0 |
| ✅ Selesai | **RBAC: ShieldStore + ShieldGuard** | **v3.0** |
| ✅ Selesai | **RBAC: Role Manager UI (shield.html)** | **v3.0** |
| ✅ Selesai | **RBAC: User Management (user-management.html)** | **v3.0** |
| ✅ Selesai | **Sidebar Super Admin dinamis** | **v3.0** |
| ✅ Selesai | **Apps Script v3.0 (manage_user, reset_password)** | **v3.0** |
| 🔴 Tinggi | Backend enforcement RBAC di Apps Script per endpoint | Belum — roadmap v3.1 |
| 🔴 Tinggi | Sinkronisasi konfigurasi Shield ke Google Sheets | Belum — roadmap v4.0 |
| 🟠 Sedang | Audit Log perubahan role & user | Belum — roadmap v4.0 |
| 🟠 Sedang | Notifikasi push untuk surat masuk baru | Belum dimulai |
| 🟠 Sedang | Dark mode toggle | Belum dimulai |
| 🟡 Rendah | PWA (offline support) | Belum dimulai |

---

## 14. Checklist Kualitas Frontend ← **DIPERBARUI v3.0**

- [x] Semua halaman protected memanggil `requireAuth()` saat `DOMContentLoaded`
- [x] Tidak ada hardcode `BASE_URL` di luar `api.js`
- [x] Semua event pencarian menggunakan debounce (≥ 300ms)
- [x] Semua operasi write/delete diikuti `invalidateCache()` / `invalidateRef()`
- [x] Toast notification tampil pada setiap operasi C/U/D
- [x] Sidebar mobile dapat ditutup via overlay klik
- [x] Form tidak boleh submit ulang saat loading (disable tombol)
- [x] CSS disentralisasi ke `css/style.css`
- [x] Upload file besar menggunakan chunked upload
- [x] Data dropdown piagam diambil dari tabel referensi yang dapat dikelola admin
- [x] Navigasi sidebar semua halaman konsisten (5 menu utama + section SA)
- [x] **ShieldStore diinisialisasi sebelum ShieldGuard di setiap halaman**
- [x] **Sidebar Super Admin tersembunyi by default, tampil kondisional via `sidebar-init.js`**
- [x] **Halaman Super Admin menampilkan banner akses ditolak jika bukan SA**
- [x] **`umSimpan` memanggil `action: manage_user` (bukan `saveRecord` langsung)**
- [x] **Kolom password tidak pernah dikirim dari backend ke frontend**
- [ ] Backend validation RBAC di Apps Script per endpoint sensitif
- [ ] Sinkronisasi konfigurasi Shield ke Google Sheets

---

*Dokumen ini diperbarui berdasarkan analisis kodebase SISURAT-1 pada tanggal 2026-04-14.*
*Versi: v3.0 | Sebelumnya: v2.0 (2026-04-13), v1.0 (2026-03-26).*
