# SISURAT Multi-Divisi — Dokumen Desain Final

> **Versi:** 2.0
> **Status:** Pre-implementasi — siap untuk development
> **Terakhir diperbarui:** Sesi desain lengkap multi-divisi + form input custom
> **Sistem:** Google Apps Script · Google Sheets · Google Drive · Frontend HTML/CSS/JS statis
> **Hosting:** Vercel (frontend) · Google Account Kedinasan tunggal (semua backend)

---

## Daftar Isi

1. [Konteks & Tujuan](#1-konteks--tujuan)
2. [Keputusan Arsitektur](#2-keputusan-arsitektur)
3. [Skema Database Final](#3-skema-database-final)
4. [Arsitektur Session & Auth](#4-arsitektur-session--auth)
5. [Sistem RBAC Multi-Divisi](#5-sistem-rbac-multi-divisi)
6. [Konsep Form Input Surat](#6-konsep-form-input-surat)
7. [Flow Lengkap Sistem](#7-flow-lengkap-sistem)
8. [Audit Celah Lengkap (29 Lubang)](#8-audit-celah-lengkap-29-lubang)
9. [Urutan Implementasi](#9-urutan-implementasi)
10. [Perubahan Per File](#10-perubahan-per-file)
11. [Keputusan yang Sudah Final](#11-keputusan-yang-sudah-final)
12. [Keputusan yang Harus Diambil Sebelum Implementasi](#12-keputusan-yang-harus-diambil-sebelum-implementasi)

---

## 1. Konteks & Tujuan

### 1.1 Kondisi sistem saat ini (SISURAT v3.1)

SISURAT adalah sistem arsip surat dan piagam untuk Disdikbudpora Kabupaten Semarang, berbasis Google ekosistem (zero-budget):

| Komponen | Teknologi |
|---|---|
| Frontend | HTML/CSS/JS statis, di-host di Vercel (`sisuratpkl.vercel.app`) |
| Backend API | Google Apps Script (GAS) — satu file `code.gs` |
| Database | Google Sheets — satu Spreadsheet, beberapa sheet |
| File storage | Google Drive — folder per tipe dokumen |
| Auth | Session token di `localStorage`, validasi via GAS |
| Akun Google | Satu akun kedinasan untuk semua: Drive, Sheets, GAS, Forms |

**Sistem saat ini bersifat single-tenant** — satu deployment untuk satu instansi, semua divisi tercampur.

### 1.2 Fitur yang sudah ada

- Login dan manajemen session
- Dashboard ringkasan (chart bar/line/pie, tren bulanan, aktivitas terbaru)
- Master data CRUD: surat masuk, surat keluar, piagam
- Pencarian arsip full-text dengan filter jenis dan tanggal
- Laporan dan ekspor (CSV, PDF via jsPDF, draft email Gmail)
- Form piagam dengan tanda tangan canvas
- Manajemen referensi (sekolah, pengambilan, jenis perlombaan)
- User management (hanya super admin)
- Audit log server-side
- RBAC server-side via `_checkRole()`
- Chunked file upload
- Soft delete dengan recovery bin

### 1.3 Permintaan klien

Integrasi ke **lebih dari 10 divisi** di Disdikbudpora Kabupaten Semarang. Setiap divisi harus:

- Memiliki data yang terisolasi (divisi lain tidak bisa melihat atau mengubah)
- Memiliki admin divisi dan operator sendiri
- Bisa dikelola terpusat oleh Super Admin Pusat
- Tetap menggunakan infrastruktur zero-budget yang sama

### 1.4 Yang dihapus dari scope

**Permission Shield** dihapus sepenuhnya. File yang dihapus:
- `shield.html`
- `js/shield.store.js`
- `js/shield.guard.js`
- `js/shield.panel.js`

Alasan: RBAC sudah ditangani server-side melalui `_checkRole()`. Shield adalah duplikasi client-side yang tidak menambah keamanan nyata dan menambah kompleksitas maintenance.

**Google Forms untuk input surat masuk dan keluar** digantikan dengan form custom di dalam SISURAT. Alasan: maintainability lebih baik, kontrol penuh atas field dan validasi, integrasi langsung dengan pipeline RBAC dan audit log, serta tetap mendukung foto kamera dan upload file (JPG/PNG/PDF).

---

## 2. Keputusan Arsitektur

### 2.1 Pendekatan: Satu GAS, Sheet Per Divisi

Tiga opsi dievaluasi:

| Aspek | Opsi A: Shared sheet + kolom divisi | **Opsi B: Satu GAS, sheet per divisi ✓** | Opsi C: GAS per divisi |
|---|---|---|---|
| Isolasi data | ✗ Tidak ada | ✓ Ya | ✓ Ya (total) |
| Deploy & maintenance | ✓ Sangat mudah | ✓ Mudah | ✗ Sulit (10+ deployment) |
| RBAC | ✗ Kompleks, rawan | ✓ Sedang, terkontrol | ~ Terpisah per instance |
| GAS quota | ✗ Bergabung tanpa kontrol | ~ Bergabung, perlu monitoring | ✓ Terpisah |
| Zero-budget viable | ✓ Ya | ✓ Ya | ✗ Tidak |
| Satu akun Google | ✓ | ✓ | ✗ Butuh multi-akun |

**Keputusan: Opsi B.** Satu GAS deployment, satu Spreadsheet, sheet terpisah per divisi dengan prefix `{KODE_DIVISI}_`.

### 2.2 Konvensi penamaan sheet

```
── GLOBAL (shared, satu untuk semua) ──────────────────────────
  db_divisi              Master data divisi terdaftar
  db_users               Semua user lintas divisi
  db_audit_log           Audit trail semua aksi
  db_summary             Counter agregat untuk dashboard
  ref_sekolah            Referensi sekolah (NPSN nasional)

── PER DIVISI (prefix kode divisi) ─────────────────────────────
  {KODE}_surat_masuk     contoh: DIKDAS_surat_masuk
  {KODE}_surat_keluar    contoh: DIKDAS_surat_keluar
  {KODE}_piagam          contoh: DIKDAS_piagam
  {KODE}_ref_pengambilan contoh: DIKDAS_ref_pengambilan
  {KODE}_ref_jenis       contoh: DIKDAS_ref_jenis
```

### 2.3 Konvensi kode divisi

- Selalu uppercase: `DIKDAS`, `DIKMEN`, `PAUD`, `GTK`
- Tanpa spasi, tanpa karakter khusus
- Maksimal 10 karakter
- Harus unik di seluruh sistem
- Di-normalize otomatis: `toUpperCase().replace(/[^A-Z0-9]/g, '')`

### 2.4 Keputusan referensi: global vs per-divisi

| Tabel | Keputusan | Alasan |
|---|---|---|
| `ref_sekolah` | **Global** | NPSN bersifat nasional, tidak berubah per divisi |
| `{KODE}_ref_pengambilan` | **Per divisi** | Jenis pengambilan berbeda per kebijakan divisi |
| `{KODE}_ref_jenis` | **Per divisi** | Jenis perlombaan berbeda antar Dikdas, Dikmen, dll. |

### 2.5 Keputusan input surat

**Input surat masuk dan keluar menggunakan form custom SISURAT**, bukan Google Forms. Alasan lengkap di Bagian 6. Google Forms tidak lagi digunakan untuk alur ini.

### 2.6 Keputusan upload file

- Format yang diterima: **JPG, PNG, PDF**
- Ukuran per file: maksimal **10 MB**
- Total semua lampiran per surat: maksimal **30 MB**
- Jumlah lampiran per surat: maksimal **5 file**
- Multiple lampiran per surat: **Ya**
- Disimpan sebagai: JSON array of Drive URLs di kolom `upload_file`
- Metode upload: chunked upload existing di GAS, dipanggil serial per file

---

## 3. Skema Database Final

> Semua sheet menggunakan baris pertama sebagai header.
> Kolom yang diawali `auto` diisi oleh sistem, bukan oleh user.
> UUID digunakan sebagai ID stabil di semua tabel.

---

### 3.1 `db_divisi` — Master divisi

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | STRING | UUID, primary key |
| `kode_divisi` | STRING | Uppercase unik, max 10 karakter (contoh: `DIKDAS`) |
| `nama_divisi` | STRING | Nama lengkap divisi |
| `status` | STRING | `pending` · `active` · `inactive` |
| `drive_folder_id` | STRING | Google Drive Folder ID untuk semua file divisi ini |
| `created_at` | DATETIME | Timestamp inisialisasi |
| `created_by` | STRING | Username Super Admin yang membuat |

**Catatan penting:**
- `kode_divisi` di-enforce unique oleh `initDivisi()` sebelum apapun dibuat
- Status `pending` = proses init belum selesai, bisa di-retry
- Status `inactive` = divisi dinonaktifkan, data tetap ada tapi tidak bisa diakses operator

---

### 3.2 `db_users` — Semua user sistem

| Kolom | Tipe | Keterangan |
|---|---|---|
| `username` | STRING | Unik, primary key untuk login |
| `password_hash` | STRING | SHA-256(password + salt) — tidak pernah plaintext |
| `password_salt` | STRING | Random UUID per user, di-generate saat create/reset |
| `password_v` | INTEGER | `1` = plaintext legacy (auto-upgrade), `2` = SHA-256 |
| `role` | STRING | `super_admin` · `admin_divisi` · `operator` |
| `nama` | STRING | Nama lengkap, ditampilkan di UI dan form |
| `email` | STRING | Email (untuk referensi, bukan untuk login) |
| `divisi_id` | STRING | Kode divisi (FK ke `db_divisi.kode_divisi`), kosong jika `scope=all` |
| `scope` | STRING | `divisi` = hanya divisi sendiri · `all` = semua divisi |
| `aktif` | BOOLEAN | `true`/`false` — nonaktif tanpa hapus akun |
| `created_at` | DATETIME | Timestamp pembuatan akun |
| `created_by` | STRING | Username yang membuat akun ini |

**Aturan konsistensi:**
- `scope=all` hanya valid untuk `role=super_admin`
- `scope=divisi` wajib punya `divisi_id` yang valid
- User dengan `aktif=false` tidak bisa login, session yang sedang aktif segera diinvalidasi

---

### 3.3 `db_audit_log` — Audit trail semua aksi

| Kolom | Tipe | Keterangan |
|---|---|---|
| `timestamp` | DATETIME | Waktu kejadian |
| `actor` | STRING | Username yang melakukan aksi |
| `role` | STRING | Role actor saat aksi terjadi |
| `divisi_id` | STRING | Kode divisi konteks aksi (kosong jika aksi sistem) |
| `action` | STRING | Aksi: `create` · `update` · `delete` · `login` · `logout` · `DENIED:*` · `SERVER_ERROR` |
| `table_name` | STRING | Sheet target aksi |
| `record_id` | STRING | UUID record yang diaksi, atau `-` jika tidak ada |
| `detail` | STRING | Keterangan bebas, termasuk stack trace untuk `SERVER_ERROR` |

**Catatan:** Kolom `divisi_id` adalah **penambahan baru** dari versi sebelumnya. Semua pemanggilan `writeAuditLog()` harus diupdate.

---

### 3.4 `db_summary` — Counter agregat dashboard

| Kolom | Tipe | Keterangan |
|---|---|---|
| `divisi_id` | STRING | Kode divisi, atau `ALL` untuk total keseluruhan |
| `total_surat_masuk` | INTEGER | Jumlah record aktif (is_deleted=false) |
| `total_surat_keluar` | INTEGER | Jumlah record aktif |
| `total_piagam` | INTEGER | Jumlah record aktif |
| `last_updated` | DATETIME | Timestamp update terakhir |

**Cara kerja:** Diupdate setiap kali ada write ke tabel manapun via `updateSummary()` yang dipanggil dari `simpanRecord()`, `updateRecord()`, dan `hapusRecord()`. Baris `ALL` di-recompute dari sum semua baris divisi.

Dashboard super admin baca dari sheet ini saja — tidak perlu query 10+ sheet bersamaan.

---

### 3.5 `ref_sekolah` — Referensi sekolah (global)

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | STRING | UUID |
| `nama_sekolah` | STRING | Nama sekolah lengkap |
| `npsn` | STRING | Nomor Pokok Sekolah Nasional |
| `aktif` | BOOLEAN | `true`/`false` |

---

### 3.6 `{KODE}_surat_masuk` — Surat masuk per divisi

| Kolom | Tipe | Sumber | Keterangan |
|---|---|---|---|
| `id` | STRING | auto | UUID, di-generate saat insert |
| `timestamp` | DATETIME | auto | Waktu input, dari server |
| `email_address` | STRING | auto | Email dari session login |
| `nama_pengupload` | STRING | auto | `session.nama` dari akun login |
| `divisi_id` | STRING | auto | `session.divisi_id` dari session login |
| `asal_surat` | STRING | user | Asal instansi surat |
| `nomor_surat` | STRING | user | Nomor surat resmi |
| `tanggal_surat` | DATE | user | Tanggal tertera di surat |
| `perihal` | STRING | user | Perihal surat |
| `tanggal_diterima` | DATE | user | Tanggal surat diterima (default: hari ini) |
| `upload_file` | STRING | auto | JSON array of Drive URLs: `["url1","url2"]` |
| `is_deleted` | BOOLEAN | auto | Default `false`. Soft delete flag |
| `deleted_at` | DATETIME | auto | Timestamp soft delete, kosong jika aktif |
| `deleted_by` | STRING | auto | Username yang menghapus, kosong jika aktif |

---

### 3.7 `{KODE}_surat_keluar` — Surat keluar per divisi

| Kolom | Tipe | Sumber | Keterangan |
|---|---|---|---|
| `id` | STRING | auto | UUID |
| `timestamp` | DATETIME | auto | Waktu input |
| `email_address` | STRING | auto | Email dari session |
| `nama_pengupload` | STRING | auto | `session.nama` |
| `divisi_id` | STRING | auto | `session.divisi_id` |
| `nomor_surat` | STRING | user | Nomor surat keluar |
| `tanggal_surat` | DATE | user | Tanggal surat |
| `perihal` | STRING | user | Perihal surat |
| `tanggal_share` | DATE | user | Tanggal surat dikirim/dibagikan (default: hari ini) |
| `upload_file` | STRING | auto | JSON array of Drive URLs |
| `is_deleted` | BOOLEAN | auto | Default `false` |
| `deleted_at` | DATETIME | auto | |
| `deleted_by` | STRING | auto | |

---

### 3.8 `{KODE}_piagam` — Data piagam per divisi

| Kolom | Tipe | Sumber | Keterangan |
|---|---|---|---|
| `id` | STRING | auto | UUID |
| `timestamp` | DATETIME | auto | Waktu input |
| `email_address` | STRING | auto | Email dari session |
| `nama_pengupload` | STRING | auto | `session.nama` |
| `divisi_id` | STRING | auto | `session.divisi_id` |
| `nama_pengambil` | STRING | user | |
| `jabatan` | STRING | user | |
| `unit_kerja` | STRING | user | |
| `npsn` | STRING | user | |
| `pengambilan` | STRING | user | Dari dropdown `{KODE}_ref_pengambilan` |
| `jenis_perlombaan` | STRING | user | Dari dropdown `{KODE}_ref_jenis` |
| `tahun_perlombaan` | STRING | user | |
| `nama_siswa` | STRING | user | |
| `asal_sekolah` | STRING | user | Dari dropdown `ref_sekolah` |
| `ttd_pengambil` | STRING | auto | Drive URL file PNG tanda tangan canvas |
| `is_deleted` | BOOLEAN | auto | Default `false` |
| `deleted_at` | DATETIME | auto | |
| `deleted_by` | STRING | auto | |

---

### 3.9 `{KODE}_ref_pengambilan` — Referensi cara pengambilan (per divisi)

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | STRING | UUID |
| `nama` | STRING | Nama cara pengambilan |
| `aktif` | BOOLEAN | `true`/`false` |

---

### 3.10 `{KODE}_ref_jenis` — Referensi jenis perlombaan (per divisi)

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | STRING | UUID |
| `nama` | STRING | Nama jenis perlombaan |
| `aktif` | BOOLEAN | `true`/`false` |

---

### 3.11 Ringkasan sheet yang dibuat per divisi baru

Setiap kali `initDivisi()` dijalankan, 5 sheet berikut dibuat otomatis:

```
{KODE}_surat_masuk
{KODE}_surat_keluar
{KODE}_piagam
{KODE}_ref_pengambilan
{KODE}_ref_jenis
```

Plus satu folder Google Drive: `Arsip Surat - {NAMA_DIVISI}`.

---

## 4. Arsitektur Session & Auth

### 4.1 Masalah dengan sistem lama

| Masalah | Dampak |
|---|---|
| Session data (role, nama) disimpan di `localStorage` | Bisa dimanipulasi via browser DevTools |
| `actor` diambil dari request body | Client bisa kirim actor milik orang lain |
| `verify_session` tidak return `divisi_id` | Frontend tidak punya referensi divisi yang otoritatif |
| Password plaintext di sheet | Siapapun yang bisa buka Spreadsheet bisa lihat semua password |
| `doGet` menerima request data tanpa auth | Data bisa dibaca tanpa login |

### 4.2 Sistem baru: Server-side session token

**Prinsip:** Server adalah satu-satunya sumber kebenaran. Client hanya boleh menyimpan token opaque — tidak ada data sensitif di localStorage.

**Saat login berhasil, server:**

1. Verifikasi username dan password (dengan hash check)
2. Jika `password_v = 1` (plaintext legacy): verifikasi plaintext, lalu otomatis hash dan upgrade ke v2 secara transparan — user tidak perlu ganti password
3. Generate session token: `Utilities.getUuid()` (random UUID, tidak bisa ditebak)
4. Simpan di dua tempat sebagai backup:
   - `CacheService.getScriptCache()`: key `session_{token}` → JSON string, TTL 21600 detik (6 jam, limit CacheService)
   - `PropertiesService.getScriptProperties()`: key `session_{token}` → JSON string yang sama (backup jika cache miss)
5. Return ke frontend: `{ token, user: { nama, role, divisi_id, scope } }`

**Yang disimpan di localStorage (frontend):**

```javascript
localStorage.setItem('session_token', token);      // hanya token opaque
localStorage.setItem('user_nama', nama);            // hanya untuk tampilan UI
localStorage.setItem('user_role', role);            // hanya untuk UI gating
localStorage.setItem('user_divisi_id', divisi_id); // hanya untuk tampilan
localStorage.setItem('user_scope', scope);          // hanya untuk tampilan
```

Semua data dari localStorage hanya untuk keperluan tampilan UI. Server tidak pernah mempercayai nilai ini — server selalu baca dari session token.

**Setiap request POST ke server:**

1. Baca `params.session_token` dari body request
2. Lookup `CacheService.get("session_" + token)` → jika tidak ada, coba `PropertiesService.get("session_" + token)`
3. Jika tidak ditemukan di keduanya → return `ERR_401_SESSION`
4. Parse session JSON → `{ username, role, divisi_id, scope, expires }`
5. Cek expires — jika sudah lewat → hapus dari storage, return `ERR_401_SESSION`
6. Perpanjang TTL (sliding expiry): update timestamp expires, simpan ulang ke CacheService
7. Gunakan `session.username` sebagai `actor` — tidak dari body
8. Lanjut ke `_checkRole()`

### 4.3 Flow login lengkap

```
Frontend                                    GAS Server
   │                                             │
   │── POST { action:"login",                   │
   │          username, password } ─────────────▶│
   │                                    hash check password
   │                                    jika v1: upgrade ke v2 diam-diam
   │                                    generate UUID token
   │                                    simpan session ke Cache + Properties
   │                                    writeAuditLog("login")
   │◀── { status:"success",                      │
   │      token,                                 │
   │      user: { nama, role,                    │
   │              divisi_id, scope } } ──────────│
   │                                             │
   │ simpan token ke localStorage                │
   │ simpan user display data ke localStorage    │
   │ redirect ke dashboard                       │
   │                                             │
   │── POST { action:"get_data",                │
   │          session_token: token,              │
   │          table: "DIKDAS_surat_masuk" } ────▶│
   │                              lookup session dari cache
   │                              extract actor dari session
   │                              _checkRole(session, "read", table)
   │                              validasi namespace divisi
   │                              baca sheet
   │◀── { status:"success", data: [...] } ───────│
```

### 4.4 Logout

```
Frontend                                    GAS Server
   │                                             │
   │── POST { action:"logout",                  │
   │          session_token: token } ───────────▶│
   │                              hapus dari CacheService
   │                              hapus dari PropertiesService
   │                              writeAuditLog("logout")
   │◀── { status:"success" } ────────────────────│
   │                                             │
   │ hapus semua item dari localStorage          │
   │ redirect ke login                           │
```

### 4.5 Rate limiting login

```javascript
// Di cekLogin(), sebelum cek password:
var cache = CacheService.getScriptCache();
var failKey = "login_fail_" + data.username;
var fails = parseInt(cache.get(failKey) || "0");
if (fails >= 5) {
  return responseJSON({
    status: "error",
    message: "Terlalu banyak percobaan login. Coba lagi dalam 15 menit."
  });
}
// Setelah password salah:
cache.put(failKey, fails + 1, 900); // 900 detik = 15 menit
// Setelah berhasil login:
cache.remove(failKey);
```

---

## 5. Sistem RBAC Multi-Divisi

### 5.1 Hierarki role

| Role | Scope | Kemampuan |
|---|---|---|
| `super_admin` | `all` | Semua aksi di semua divisi. Bisa `init_divisi`, manage semua user, lihat audit log lintas divisi, akses `db_summary` |
| `admin_divisi` | `divisi` | CRUD semua data di divisinya. Manage user dalam divisinya sendiri. Lihat laporan dan summary divisinya |
| `operator` | `divisi` | Create dan read data di divisinya. Tidak bisa update, delete, atau manage user |

### 5.2 Logika `_checkRole()` yang diperbarui

```
1. Panggil _getSession(session_token)
   → Jika tidak ada / expired: return { allowed: false, error: "ERR_401_SESSION" }

2. Cek user.aktif
   → Jika false: return { allowed: false, error: "ERR_401_SESSION" }

3. Cek user.scope:
   a. scope = "all" → skip validasi divisi, lanjut ke langkah 4
   b. scope = "divisi":
      - Ekstrak prefix divisi dari tableName
        (ambil substring sebelum "_" pertama, atau nama table itu sendiri jika global)
      - Bandingkan dengan session.divisi_id
      - Jika tidak cocok → return { allowed: false, error: "ERR_403_DIVISI" }

4. Cek RBAC_RULES untuk kombinasi action + tableSuffix
   → Jika role tidak ada di allowed list: return { allowed: false, error: "ERR_403_ROLE" }

5. Return { allowed: true, role, divisi_id, username }
```

### 5.3 Helper: Ekstraksi namespace divisi dari tableName

```javascript
function _extractDivisiFromTable(tableName) {
  // Tabel global tidak punya prefix divisi
  var GLOBAL_TABLES = ["db_divisi","db_users","db_audit_log","db_summary","ref_sekolah"];
  if (GLOBAL_TABLES.indexOf(tableName) !== -1) return "GLOBAL";

  // Tabel per divisi: ambil bagian sebelum "_" pertama
  var underscoreIdx = tableName.indexOf("_");
  if (underscoreIdx === -1) return null; // format tidak valid
  return tableName.substring(0, underscoreIdx);
}
```

### 5.4 RBAC_RULES

```javascript
var RBAC_RULES = {
  // ── Surat masuk ─────────────────────────────────────────────
  "read:surat_masuk":         ["super_admin", "admin_divisi", "operator"],
  "create:surat_masuk":       ["super_admin", "admin_divisi", "operator"],
  "update:surat_masuk":       ["super_admin", "admin_divisi"],
  "delete:surat_masuk":       ["super_admin", "admin_divisi"],

  // ── Surat keluar ────────────────────────────────────────────
  "read:surat_keluar":        ["super_admin", "admin_divisi", "operator"],
  "create:surat_keluar":      ["super_admin", "admin_divisi", "operator"],
  "update:surat_keluar":      ["super_admin", "admin_divisi"],
  "delete:surat_keluar":      ["super_admin", "admin_divisi"],

  // ── Piagam ──────────────────────────────────────────────────
  "read:piagam":              ["super_admin", "admin_divisi", "operator"],
  "create:piagam":            ["super_admin", "admin_divisi", "operator"],
  "update:piagam":            ["super_admin", "admin_divisi"],
  "delete:piagam":            ["super_admin", "admin_divisi"],

  // ── Referensi per divisi ─────────────────────────────────────
  "read:ref_pengambilan":     ["super_admin", "admin_divisi", "operator"],
  "create:ref_pengambilan":   ["super_admin", "admin_divisi"],
  "update:ref_pengambilan":   ["super_admin", "admin_divisi"],
  "delete:ref_pengambilan":   ["super_admin", "admin_divisi"],

  "read:ref_jenis":           ["super_admin", "admin_divisi", "operator"],
  "create:ref_jenis":         ["super_admin", "admin_divisi"],
  "update:ref_jenis":         ["super_admin", "admin_divisi"],
  "delete:ref_jenis":         ["super_admin", "admin_divisi"],

  // ── Referensi global ─────────────────────────────────────────
  "read:ref_sekolah":         ["super_admin", "admin_divisi", "operator"],
  "create:ref_sekolah":       ["super_admin"],
  "update:ref_sekolah":       ["super_admin"],
  "delete:ref_sekolah":       ["super_admin"],

  // ── User management ──────────────────────────────────────────
  "manage_user:db_users":     ["super_admin", "admin_divisi"],
  "reset_password:db_users":  ["super_admin", "admin_divisi"],

  // ── Admin sistem ─────────────────────────────────────────────
  "init_divisi:db_divisi":    ["super_admin"],
  "read:db_audit_log":        ["super_admin"],
  "read:db_summary":          ["super_admin", "admin_divisi"],
};

// Catatan: _checkRole() mengekstrak suffix tabel (bagian setelah prefix divisi)
// lalu mencocokkan dengan key di RBAC_RULES.
// Contoh: tableName "DIKDAS_surat_masuk" → suffix "surat_masuk" → cek "read:surat_masuk"
```

### 5.5 Error codes

| Kode | Kondisi | Pesan ke user |
|---|---|---|
| `ERR_401_SESSION` | Token tidak ada, expired, atau user nonaktif | "Sesi habis. Silakan login kembali." |
| `ERR_403_ROLE` | Role tidak punya permission untuk aksi ini | "Fitur ini hanya untuk admin divisi. Hubungi adminmu." |
| `ERR_403_DIVISI` | User mencoba akses data divisi lain | "Kamu tidak memiliki akses ke data divisi lain." |
| `ERR_403_SCOPE` | Aksi butuh super admin | "Fitur ini hanya untuk administrator pusat." |
| `ERR_409_DIVISI` | Kode divisi sudah ada di `db_divisi` | "Kode divisi sudah digunakan. Pilih kode lain." |
| `ERR_400_TABLE` | `tableName` format tidak valid atau tidak diizinkan | "Permintaan tidak valid." |
| `ERR_413_FILE` | File melebihi batas ukuran | "Ukuran file melebihi batas 10 MB per file." |
| `ERR_500_SERVER` | Exception tidak tertangani di GAS | "Terjadi kesalahan sistem. Hubungi administrator." |

### 5.6 Pembatasan tambahan di `manageUser()`

```javascript
// Setelah RBAC check — tambahan untuk admin_divisi:
if (session.role === "admin_divisi") {
  // Admin divisi hanya bisa manage user di divisinya sendiri
  if (data.divisi_id !== session.divisi_id) {
    return responseJSON({ status: "error", message: "ERR_403_DIVISI" });
  }
  // Admin divisi tidak bisa membuat super_admin
  if (data.role === "super_admin") {
    return responseJSON({ status: "error", message: "ERR_403_SCOPE" });
  }
}
```

---

## 6. Konsep Form Input Surat

### 6.1 Latar belakang keputusan

Google Forms sebelumnya digunakan untuk input surat masuk dan keluar. Alasan utama mempertahankan Forms adalah fitur kamera native di mobile. Keputusan berganti ke form custom SISURAT diambil berdasarkan:

- **Maintainability:** Perubahan field memerlukan update di dua tempat (Forms + sheet), dengan form custom hanya satu tempat
- **Kontrol penuh:** Validasi, RBAC, audit log, UUID generation, dan namespace divisi bisa langsung diintegrasikan
- **Kamera tetap tersedia:** `<input type="file" accept="image/*" capture="environment">` membuka kamera native di Android dan iOS
- **Multiple file:** Forms hanya support satu file per pertanyaan, form custom bisa multiple lampiran
- **Pipeline terpadu:** Data langsung masuk via `simpanRecord()` dengan session auth — tidak ada bypass

### 6.2 Field form surat masuk

| No | Field | Tipe UI | Wajib | Sumber |
|---|---|---|---|---|
| — | Header: Nama pengupload | Tampilan saja | — | `session.nama` (auto) |
| — | Header: Divisi | Tampilan saja | — | `session.divisi_id` nama (auto) |
| — | Header: Tanggal input | Tampilan saja | — | Hari ini (auto) |
| 1 | Asal Surat | Text field | Ya | User input |
| 2 | Nomor Surat | Text field | Ya | User input |
| 3 | Tanggal Surat | Date picker | Ya | User input |
| 4 | Perihal | Textarea (3 baris) | Ya | User input |
| 5 | Tanggal Diterima | Date picker | Ya | Default hari ini, bisa diubah |
| 6 | Lampiran | Kamera / file picker | Ya (min. 1) | User input |

### 6.3 Field form surat keluar

| No | Field | Tipe UI | Wajib | Sumber |
|---|---|---|---|---|
| — | Header: Nama pengupload | Tampilan saja | — | `session.nama` (auto) |
| — | Header: Divisi | Tampilan saja | — | `session.divisi_id` nama (auto) |
| — | Header: Tanggal input | Tampilan saja | — | Hari ini (auto) |
| 1 | Nomor Surat | Text field | Ya | User input |
| 2 | Tanggal Surat | Date picker | Ya | User input |
| 3 | Perihal | Textarea (3 baris) | Ya | User input |
| 4 | Tanggal Di-share | Date picker | Ya | Default hari ini, bisa diubah |
| 5 | Lampiran | Kamera / file picker | Ya (min. 1) | User input |

### 6.4 Desain UI form

#### Header form — konteks selalu terlihat

```
┌─────────────────────────────────────────┐
│  ←  Tambah Surat Masuk                  │
│                                         │
│  📁 Bidang Pendidikan Dasar             │
│  👤 Budi Santoso  ·  📅 14 Jan 2025     │
└─────────────────────────────────────────┘
```

Nama divisi, nama pengupload, dan tanggal hari ini ditampilkan sebagai informasi read-only di header. User tidak bisa mengubahnya — datang dari session server.

#### Section identitas surat

```
Asal Surat *
┌─────────────────────────────────────────┐
│  Contoh: Dinas Pendidikan Provinsi...   │
└─────────────────────────────────────────┘

Nomor Surat *
┌─────────────────────────────────────────┐
│  Contoh: 421/001/2025                   │
└─────────────────────────────────────────┘

Perihal *
┌─────────────────────────────────────────┐
│                                         │
│                                         │
└─────────────────────────────────────────┘
```

#### Section tanggal (responsive)

```
[Mobile — ditumpuk]         [Desktop — berdampingan]

Tanggal Surat *             Tanggal Surat *    Tanggal Diterima *
┌───────────────┐           ┌─────────────┐    ┌──────────────┐
│ 📅  DD/MM/YY  │           │ 📅 DD/MM/YY │    │ 📅 DD/MM/YY  │
└───────────────┘           └─────────────┘    └──────────────┘

Tanggal Diterima *
┌───────────────┐
│ 📅  DD/MM/YY  │   ← default hari ini
└───────────────┘
```

#### Section lampiran — zona upload

```
Lampiran Surat *

┌─────────────────────────────────────────┐
│                                         │
│   📷 Ambil Foto          📁 Upload File  │
│      dari Kamera           PDF/JPG/PNG  │
│                                         │
│         atau seret file ke sini         │
│                                         │
└─────────────────────────────────────────┘

Maks. 5 file · JPG, PNG, PDF · 10 MB per file
```

- **Tombol kamera:** `<input type="file" accept="image/*" capture="environment">` — membuka kamera langsung di mobile, file picker di desktop
- **Tombol upload:** `<input type="file" accept=".pdf,.jpg,.jpeg,.png" multiple>` — untuk file yang sudah ada
- Keduanya bisa dipakai dalam satu submission (foto 2 halaman + PDF lampiran = 3 file)

#### Preview lampiran setelah dipilih

```
Lampiran (3 file)

┌──────────┐  ┌──────────┐  ┌──────────┐
│  [thumb] │  │  [thumb] │  │    📄    │
│          │  │          │  │          │
│ foto1.jpg│  │ foto2.jpg│  │surat.pdf │
│  1.2 MB  │  │  890 KB  │  │  2.1 MB  │
│    ✕     │  │    ✕     │  │    ✕     │
└──────────┘  └──────────┘  └──────────┘

              + Tambah file lagi
```

Tiap file bisa dihapus individual via tombol ✕. Thumbnail ditampilkan untuk JPG/PNG, ikon PDF untuk file PDF.

#### Validasi frontend (sebelum submit)

| Validasi | Aturan | Pesan error |
|---|---|---|
| Field wajib kosong | Semua field wajib harus terisi | "Field ini wajib diisi" |
| Tidak ada lampiran | Min. 1 file harus dipilih | "Tambahkan minimal 1 lampiran" |
| Format file | Hanya JPG, PNG, PDF | "Format file tidak didukung. Gunakan JPG, PNG, atau PDF" |
| Ukuran per file | Maks. 10 MB | "File [nama] terlalu besar (maks. 10 MB)" |
| Total ukuran | Maks. 30 MB | "Total lampiran terlalu besar (maks. 30 MB)" |
| Jumlah file | Maks. 5 | "Maksimal 5 lampiran per surat" |

#### Ringkasan sebelum submit

```
┌──────────────────────────────────────────┐
│  Ringkasan                               │
│                                          │
│  Dari        Dinas Pendidikan Provinsi   │
│  Nomor       421/001/2025                │
│  Perihal     Undangan Rapat Koordinasi   │
│  Tgl Surat   12 Januari 2025             │
│  Tgl Terima  14 Januari 2025             │
│  Lampiran    3 file (4.2 MB)             │
└──────────────────────────────────────────┘

          [  Simpan Surat Masuk  ]         ← disabled jika ada field kosong
```

#### Progress upload

Upload dilakukan serial per file (bukan paralel) untuk menghindari quota GAS habis bersamaan:

```
Menyimpan surat masuk...

foto1.jpg    ████████████████  100% ✓
foto2.jpg    ████████░░░░░░░░   52%
surat.pdf    ░░░░░░░░░░░░░░░░    0%

Jangan tutup halaman ini (2 dari 3 file)
```

#### State setelah berhasil

```
✓  Surat masuk berhasil disimpan!

   [ Lihat Data Surat ]    [ Tambah Surat Lagi ]
```

---

## 7. Flow Lengkap Sistem

### 7.1 Flow login

```
User buka halaman login
        │
        ▼
Isi username + password → klik Login
        │
        ▼
Frontend POST { action:"login", username, password }
        │
        ▼
GAS: cekLogin()
  ├── Cek rate limit (max 5 gagal dalam 15 menit)
  │     └── Jika limit: return ERR_429 → Frontend: "Terlalu banyak percobaan"
  ├── Lookup user di db_users
  │     └── Jika tidak ada: increment fail counter → return error
  ├── Cek user.aktif
  │     └── Jika false: return error "Akun nonaktif"
  ├── Cek password_v:
  │   ├── v1 (plaintext): bandingkan langsung → jika cocok, upgrade ke v2 diam-diam
  │   └── v2 (hash): SHA-256(input+salt) bandingkan dengan hash tersimpan
  │         └── Jika salah: increment fail counter → return error
  ├── Generate UUID session token
  ├── Simpan session ke CacheService + PropertiesService (6 jam)
  ├── Reset fail counter
  ├── writeAuditLog(username, role, divisi_id, "login", ...)
  └── Return { token, user: { nama, role, divisi_id, scope } }
        │
        ▼
Frontend simpan token + user display ke localStorage
        │
        ▼
Redirect ke dashboard
```

### 7.2 Flow setiap request yang butuh auth

```
Frontend kirim POST { action, session_token, ...params }
        │
        ▼
GAS doPost():
  ├── _getSession(session_token)
  │   ├── Cari di CacheService
  │   ├── Jika miss: cari di PropertiesService (backup)
  │   ├── Jika tidak ada: return ERR_401_SESSION
  │   └── Cek expires → jika lewat: hapus, return ERR_401_SESSION
  │         Jika valid: perpanjang TTL (sliding expiry)
  ├── _checkRole(session, action, tableName)
  │   ├── Cek session.aktif
  │   ├── Jika scope="all": skip cek divisi
  │   ├── Jika scope="divisi": ekstrak prefix tableName, bandingkan dengan session.divisi_id
  │   │     └── Tidak cocok: writeAuditLog("DENIED:...") → return ERR_403_DIVISI
  │   ├── Cek RBAC_RULES[action:tableSuffix]
  │   │     └── Role tidak ada: writeAuditLog("DENIED:...") → return ERR_403_ROLE
  │   └── Return { allowed:true, ... }
  ├── Validasi tableName (whitelist namespace)
  ├── Jalankan operasi (CRUD / upload / dsb.)
  ├── LockService.getScriptLock() untuk operasi write
  ├── writeAuditLog(actor dari session, ...)
  ├── updateSummary() untuk operasi write
  └── Return response
```

### 7.3 Flow input surat masuk baru

```
User di halaman input surat masuk
        │
        ▼
Header otomatis tampil: nama, divisi, tanggal hari ini (dari localStorage display)
        │
        ▼
User isi form:
  ├── Asal Surat (text)
  ├── Nomor Surat (text)
  ├── Tanggal Surat (date picker)
  ├── Perihal (textarea)
  ├── Tanggal Diterima (date picker, default hari ini)
  └── Lampiran: pilih kamera atau upload file
        │
        ▼
Validasi frontend:
  ├── Semua field wajib terisi
  ├── Min. 1 file dipilih
  ├── Format file: JPG/PNG/PDF saja
  ├── Ukuran per file: maks. 10 MB
  ├── Total ukuran: maks. 30 MB
  └── Jumlah file: maks. 5
        │
        ├── Ada error? → Tampilkan pesan di bawah field terkait, jangan submit
        │
        ▼
Tampilkan ringkasan data → user konfirmasi
        │
        ▼
Klik "Simpan Surat Masuk"
        │
        ▼
Frontend: Upload file serial (satu per satu via chunked upload):
  ├── File 1: upload_chunk (n chunk) → finalize_upload → dapat Drive URL #1
  ├── File 2: upload_chunk (n chunk) → finalize_upload → dapat Drive URL #2
  └── File N: ... → dapat Drive URL #N
        │
        ▼
Frontend: POST { action:"simpan_record",
                 session_token,
                 table: "DIKDAS_surat_masuk",
                 data: {
                   asal_surat, nomor_surat, tanggal_surat,
                   perihal, tanggal_diterima,
                   upload_file: JSON.stringify(["url1","url2",...])
                 }}
        │
        ▼
GAS simpanRecord():
  ├── _getSession() → extract actor, nama, divisi_id dari session
  ├── _checkRole(session, "create", "DIKDAS_surat_masuk")
  ├── LockService.getScriptLock()
  ├── Generate UUID untuk kolom id
  ├── appendRow([uuid, now, email, nama, divisi_id,
  │             asal_surat, nomor_surat, tanggal_surat,
  │             perihal, tanggal_diterima, upload_file_json,
  │             false, "", ""])
  ├── LockService.releaseLock()
  ├── writeAuditLog(...)
  ├── updateSummary(divisi_id, "surat_masuk", +1)
  └── Return { status:"success", id: uuid }
        │
        ▼
Frontend tampilkan: "✓ Surat masuk berhasil disimpan!"
Tombol: Lihat Data | Tambah Surat Lagi
```

### 7.4 Flow inisialisasi divisi baru

```
Super Admin buka halaman Manajemen Divisi
        │
        ▼
Klik "Tambah Divisi Baru"
        │
        ▼
Isi form: Kode Divisi + Nama Divisi
        │
        ▼
POST { action:"init_divisi", session_token, kode, nama }
        │
        ▼
GAS initDivisi():
  ├── _checkRole(session, "init_divisi", "db_divisi") → hanya super_admin
  ├── Normalisasi kode: toUpperCase().replace(/[^A-Z0-9]/g,'')
  ├── Cek uniqueness kode di db_divisi → jika ada: return ERR_409_DIVISI
  ├── Generate UUID untuk id divisi
  ├── Tulis ke db_divisi dengan status="pending" ← PERTAMA (atomic marker)
  │
  ├── Buat sheet {KODE}_surat_masuk dengan header yang benar
  ├── Buat sheet {KODE}_surat_keluar dengan header yang benar
  ├── Buat sheet {KODE}_piagam dengan header yang benar
  ├── Buat sheet {KODE}_ref_pengambilan dengan header yang benar
  ├── Buat sheet {KODE}_ref_jenis dengan header yang benar
  ├── Buat folder Drive: "Arsip Surat - {NAMA_DIVISI}"
  │
  ├── Update db_divisi: status="active", drive_folder_id=folderId
  ├── Tambah baris ke db_summary untuk divisi baru (semua counter = 0)
  ├── writeAuditLog(actor, "init_divisi", ...)
  └── Return { status:"success", divisi_id: kode }
        │
        ▼
Frontend tampilkan: "✓ Divisi [NAMA] berhasil didaftarkan"
```

**Jika GAS timeout di tengah proses:** Status tetap `pending` di db_divisi. Super Admin bisa lihat divisi dengan status `pending` dan pilih:
- **Retry:** action `retry_init_divisi` → lanjutkan dari step yang belum selesai (cek sheet mana yang belum ada)
- **Cleanup:** action `cleanup_divisi` → hapus semua sheet yang sudah terbuat dan hapus baris dari db_divisi

### 7.5 Flow soft delete & recovery bin

```
User klik Hapus pada record
        │
        ▼
Konfirmasi dialog: "Hapus record ini? Data bisa dipulihkan dari Recovery Bin."
        │
        ▼
POST { action:"hapus_record", session_token, table, id }
        │
        ▼
GAS hapusRecord():
  ├── _checkRole(session, "delete", tableName) → min. admin_divisi
  ├── Cari row by UUID (getSheetRow by id, bukan row_number)
  ├── Validasi kepemilikan file Drive (file berada di folder divisi user)
  ├── LockService
  ├── Set is_deleted=true, deleted_at=now(), deleted_by=session.username
  ├── (File di Drive TIDAK dihapus — tetap bisa diakses dari recovery bin)
  ├── writeAuditLog(...)
  └── updateSummary(divisi_id, "surat_masuk", -1)
        │
        ▼
getData() secara default filter is_deleted=false
Recovery bin: getData() dengan flag include_deleted=true (hanya admin_divisi ke atas)
```

### 7.6 Flow divisi switcher (Super Admin)

```
Super Admin sedang di konteks Divisi A
        │
        ▼
Klik dropdown divisi di sidebar → pilih Divisi B
        │
        ▼
Frontend cek: ada form yang sedang diisi? (isDirty check)
  ├── isDirty=true: tampilkan dialog "Perubahan akan hilang. Lanjutkan pindah divisi?"
  │   ├── Batal: tetap di Divisi A
  │   └── Lanjutkan: proceed
  └── isDirty=false: proceed langsung
        │
        ▼
Update localStorage: user_divisi_id = kode Divisi B
Invalidate semua cache lokal (data surat, referensi, dll.)
Reload data dari server dengan konteks Divisi B
Update breadcrumb dan judul halaman: "Dashboard — Bidang Dikmen"
```

---

## 8. Audit Celah Lengkap (29 Lubang)

> Semua lubang berikut harus diselesaikan sebelum satu divisi pun diaktifkan.
> Status fix dirujuk ke Bagian 9 (urutan implementasi).

---

### 🔴 Fatal / Blocker (4)

**F-1 — `getData()` tidak punya auth check sama sekali**

- **Lokasi:** `doGet()` → `getData(e.parameter.table)`
- **Masalah:** Siapapun yang tahu URL endpoint GAS bisa `GET ?action=get_data&table=DIKDAS_surat_masuk` dan membaca seluruh data tanpa login.
- **Implikasi multi-divisi:** Semua 50+ sheet bisa dibaca bebas.
- **Fix:** Semua operasi yang butuh auth dipindah ke `doPost`. Token dikirim di body, bukan URL. `doGet` hanya untuk health check atau resource benar-benar publik. Lihat Fase 0.3.

**F-2 — `verify_session` tidak return `divisi_id`**

- **Lokasi:** `doGet()` action `verify_session`
- **Masalah:** Server tidak pernah mengirim `divisi_id` otoritatif ke frontend. Frontend terpaksa bergantung pada `localStorage` yang bisa dimanipulasi.
- **Fix:** Extend response `cekLogin` dan `verify_session` untuk sertakan `divisi_id` dan `scope`. Lihat Fase 1.4.

**F-3 — `upload_chunk` dan `finalize_upload` tidak ada RBAC check**

- **Lokasi:** `handleUploadChunk()`, `finalizeUpload()`
- **Masalah:** `folderId` dikirim dari client dan langsung dipercaya via `DriveApp.getFolderById(folderId)`. Tidak ada auth check sama sekali.
- **Dampak:** Attacker bisa upload file ke folder Drive manapun yang ID-nya diketahui. Tidak ada audit trail siapa upload ke divisi mana.
- **Fix:** Hapus `folderId` dari parameter client. Server tentukan folder dari `db_divisi.drive_folder_id` berdasarkan `session.divisi_id`. Tambah `_checkRole()` di awal kedua fungsi. Lihat Fase 3.4.

**F-4 — GAS quota tidak cukup untuk 10+ divisi aktif bersamaan**

- **Lokasi:** Seluruh backend GAS
- **Masalah:**
  - Execution time limit: 6 menit per request
  - CacheService: total 1 MB, 100 KB per item. Chunked upload pakai cache — 10 divisi upload bersamaan = collision
  - Concurrent write tanpa LockService = data corrupt atau `Service invoked too many times`
- **Fix:** `LockService.getScriptLock()` untuk semua write. Chunk key dengan prefix divisi. `db_summary` untuk menghindari multi-sheet read. Lihat Fase 3.8.

---

### 🟠 Celah Keamanan (6)

**S-1 — Password disimpan dan dibandingkan plaintext**

- **Lokasi:** `cekLogin()`
- **Masalah:** `dbPass == data.password` langsung. Siapapun yang bisa buka Spreadsheet bisa lihat semua password.
- **Fix:** Kolom `password_hash`, `password_salt`, `password_v`. Auto-upgrade v1→v2 saat login pertama. Lihat Fase 1.3.

**S-2 — `actor` di-trust dari request body**

- **Masalah:** `var actor = dataInput.actor || dataInput.email_address` — client bisa kirim actor milik siapapun. Audit log bisa dipalsukan. RBAC berjalan atas nama orang lain.
- **Fix:** Actor SELALU dari `_getSession()`. Hapus field `actor` dari semua body parameter. Lihat Fase 1.2.

**S-3 — `tableName` tidak divalidasi — sheet injection lintas divisi**

- **Masalah:** `ss.getSheetByName(tableName)` langsung percaya string dari client. User divisi A bisa kirim `tableName = "DIKMEN_surat_masuk"`.
- **Fix:** Setelah auth, validasi prefix `tableName` cocok dengan `session.divisi_id`. Tolak semua yang tidak match. Lihat Fase 3.2.

**S-4 — `PUBLIC_TABLES` akan konflik dengan referensi per-divisi**

- **Masalah:** `ref_pengambilan` dan `ref_jenis_perlombaan` saat ini ada di `PUBLIC_TABLES` (tanpa auth). Setelah split ke per-divisi, pola ini bocorkan data divisi.
- **Fix:** Hanya `ref_sekolah` yang tetap di `PUBLIC_TABLES`. Ref per-divisi butuh auth. Lihat Fase 4.7.

**S-5 — Tidak ada rate limiting — brute force login terbuka**

- **Fix:** Counter failed attempt di CacheService per username. Max 5 gagal dalam 15 menit. Lihat Fase 0.4.

**S-6 — File Drive di-set `ANYONE_WITH_LINK` tanpa expiry**

- **Masalah:** Surat dinas bisa diakses siapapun yang punya link. Tidak ada revoke saat user dihapus.
- **Fix jangka pendek:** `DriveApp.Access.DOMAIN_WITH_LINK` untuk file internal.
- **Fix jangka panjang:** Proxy endpoint di GAS yang serve file hanya untuk session valid. Lihat Fase 5.3.

---

### 🟡 Logic / Data Bug (7)

**L-1 — `row_number` sebagai ID adalah bom waktu**

- **Masalah:** ID berupa posisi baris. Concurrent insert/delete menggeser baris — frontend yang cache `row_number` lama akan update/delete baris yang salah.
- **Fix:** Kolom `id` berisi UUID di semua tabel. `getSheetRow()` cari by UUID. Lihat Fase 2.3.

**L-2 — `simpanPiagam()` adalah jalur bypass RBAC yang terlupakan**

- **Masalah:** Action `simpan_piagam` di `doPost` langsung memanggil `simpanPiagam()` tanpa `_checkRole()`, tanpa audit log, tanpa validasi divisi. Siapapun yang tahu endpoint bisa inject data piagam.
- **Fix:** Tambahkan blok auth di awal `simpanPiagam()` sebelum logika TTD berjalan. Jangan dipindah ke `simpanRecord()` — flow TTD (upload canvas PNG) berbeda dan harus dipertahankan. Lihat Fase 0.6.

**L-3 — `manageUser()` tidak punya scope divisi**

- **Masalah:** Hanya cek `super_admin`. Admin divisi yang diberi akses bisa buat user untuk divisi lain.
- **Fix:** Validasi tambahan untuk `admin_divisi` — `data.divisi_id` harus sama dengan `session.divisi_id`. Lihat Fase 3.6.

**L-4 — Status referensi global vs per-divisi** *(Sudah diselesaikan)*

- **Keputusan:** `ref_sekolah` global, `ref_pengambilan` dan `ref_jenis` per-divisi. Lihat Bagian 2.4.

**L-5 — Tidak ada mekanisme provisioning sheet baru otomatis**

- **Fix:** Fungsi `initDivisi()` dengan pattern atomic (status `pending` ditulis dulu). Lihat Bagian 7.4 dan Fase 2.4.

**L-6 — Audit log tidak capture `divisi_id`**

- **Fix:** Tambah parameter `divisi_id` ke `writeAuditLog()` dan kolom `Divisi` di `db_audit_log`. Semua pemanggilan harus diupdate. Lihat Fase 2.5.

**L-7 — Tidak ada enforcement uniqueness `kode_divisi`**

- **Fix:** `initDivisi()` cek uniqueness sebelum apapun dibuat. Normalize kode: `toUpperCase().replace(/[^A-Z0-9]/g,'')`. Lihat Fase 2.4.

---

### 🟣 UX / Anomali User (5)

**UX-1 — Divisi switcher tidak punya state management**

- **Masalah:** Super Admin ganti divisi saat form sedang diisi → data form hilang tanpa peringatan.
- **Fix:** `isDirty` state di setiap form. Confirm dialog sebelum switch. Force reload data setelah switch. Update breadcrumb. Lihat Fase 4.2.

**UX-2 — Pesan error RBAC tidak ramah user**

- **Fix:** Sistem error codes yang di-translate frontend ke bahasa Indonesia yang jelas. Lihat Bagian 5.5 dan Fase 4.3.

**UX-3 — Onboarding divisi baru tanpa feedback progres**

- **Masalah:** `initDivisi()` bisa makan 5–15 detik. Tanpa feedback, admin klik berkali-kali → duplicate.
- **Fix:** Modal progress selama proses berlangsung. Pattern atomic dengan status `pending` mencegah duplikasi. Lihat Fase 4.4.

**UX-4 — Laporan agregat lintas divisi belum ada**

- **Fix:** `db_summary` diupdate setiap write. Dashboard super admin baca dari sini — satu sheet, bukan query 10+ sheet. Lihat Bagian 3.4 dan Fase 2.6.

**UX-5 — Recovery bin tidak didefinisikan untuk multi-divisi**

- **Fix:** Recovery bin per-divisi via kolom `is_deleted`. Admin divisi hanya bisa lihat bin divisinya. Super Admin bisa lihat semua tapi tetap dalam konteks divisi yang di-switch. Lihat Fase 4.6.

---

### ➕ Celah Tambahan — ditemukan dari elaborasi (7)

**T-1 — `deleteFileFromDrive()` tidak cek kepemilikan file**

- **Masalah:** `DriveApp.getFileById(fileId).setTrashed(true)` langsung jalan. User dengan file ID milik divisi lain bisa menghapusnya.
- **Fix:** Sebelum hapus, verifikasi file berada di dalam `db_divisi.drive_folder_id` milik divisi user. Lihat Fase 3.7.

**T-2 — Tidak ada validasi ukuran file di `finalizeUpload()`**

- **Masalah:** Client bisa kirim `totalChunks = 1000` dengan chunk 500 KB masing-masing → crash GAS karena memory limit ~50 MB.
- **Fix:**
  ```javascript
  var estimatedSize = totalChunks * 250 * 1024; // estimasi bytes
  if (estimatedSize > 10 * 1024 * 1024) {
    return responseJSON({ status:"error", message:"ERR_413_FILE" });
  }
  ```
  Lihat Fase 3.5.

**T-3 — CacheService chunk key tidak ada prefix divisi — collision**

- **Masalah:** Key `"chunk_"+uploadId+"_"+chunkIndex` bisa collision jika dua user dari divisi berbeda punya `uploadId` yang sama (misal sama-sama pakai timestamp).
- **Fix:** Key menjadi `"chunk_"+session.divisi_id+"_"+uploadId+"_"+chunkIndex`. Lihat Fase 3.4.

**T-4 — `verify_session` bisa di-enumerate username**

- **Masalah:** Response berbeda antara user ada vs tidak ada → oracle untuk enumerasi username sebelum brute force.
- **Fix:** Response selalu identik bentuknya untuk user tidak ditemukan vs token tidak valid. Lihat Fase 0.5.

**T-5 — `doPost` catch block membocorkan stack trace ke client**

- **Masalah:** `message: "Error Server: " + error.toString()` bisa menyertakan nama fungsi, nomor baris, nama sheet — peta internal sistem.
- **Fix:**
  ```javascript
  } catch (error) {
    writeAuditLog("system","-","-","SERVER_ERROR","-","-", error.toString());
    return responseJSON({ status:"error", message:"ERR_500_SERVER" });
  }
  ```
  Lihat Fase 0.2.

**T-6 — Fix S-1 butuh migration strategy yang tidak mematikan user lama**

- **Masalah:** Kalau SHA-256 langsung diterapkan, semua user dengan `password_v=1` gagal login.
- **Fix:** Kolom `password_v`. Saat login: cek versi dulu. v1 → verifikasi plaintext → jika cocok, hash dan update ke v2 secara transparan. User tidak perlu ganti password manual. Lihat Fase 1.3.

**T-7 — `initDivisi()` tidak atomic — partial state jika GAS timeout**

- **Masalah:** Timeout setelah buat 3 dari 5 sheet → state tidak konsisten, tidak bisa dideteksi.
- **Fix:** Status `pending` di `db_divisi` ditulis sebelum proses apapun. Jika gagal di tengah, tetap `pending`. Super Admin bisa retry atau cleanup. Lihat Bagian 7.4.

---

## 9. Urutan Implementasi

> **Aturan utama:** Fase 0 dan 1 harus 100% selesai sebelum Fase 2 dimulai. Tidak ada divisi yang boleh diaktifkan sebelum Fase 3 selesai.

---

### Fase 0 — Pra-syarat keamanan (1 minggu)

*Tidak ada fitur baru. Hanya menutup lubang yang sudah ada di sistem single-tenant saat ini.*

| Step | Task | Referensi celah |
|---|---|---|
| 0.1 | Hapus semua file Permission Shield dan referensinya dari HTML | — |
| 0.2 | Fix `doPost` catch block — return pesan generik, log detail ke audit log | T-5 |
| 0.3 | Pindah `get_data` dari `doGet` ke `doPost`. Update `api.js` | F-1 |
| 0.4 | Implementasi rate limiting login di `cekLogin()` | S-5 |
| 0.5 | Normalisasi response error `verify_session` — tidak bisa enumerate username | T-4 |
| 0.6 | Tambahkan auth check di awal `simpanPiagam()` | L-2 |

---

### Fase 1 — Fondasi session & auth baru (1 minggu)

*Fondasi dari hampir semua fix lain. Harus selesai sebelum Fase 2.*

| Step | Task | Referensi celah |
|---|---|---|
| 1.1 | Implementasi session token: generate UUID saat login, simpan ke CacheService + PropertiesService, buat `_getSession()` | S-2, F-2 |
| 1.2 | Semua fungsi CRUD ambil actor dari `_getSession()`, bukan dari body. Hapus field `actor` dari semua request | S-2 |
| 1.3 | Implementasi hash password: tambah kolom `password_hash`, `password_salt`, `password_v`. Update `cekLogin()` dengan auto-upgrade v1→v2 | S-1, T-6 |
| 1.4 | Update `_lookupUser()`, `cekLogin()`, `verify_session` untuk return `divisi_id` dan `scope` | F-2 |
| 1.5 | Update frontend `auth.js`: simpan token (bukan full user object), terima `divisi_id` + `scope` dari server | F-2 |
| 1.6 | Implementasi logout endpoint: hapus token dari CacheService + PropertiesService | — |

---

### Fase 2 — Skema database multi-divisi (1 minggu)

| Step | Task | Referensi celah |
|---|---|---|
| 2.1 | Buat sheet `db_divisi` dengan kolom sesuai Bagian 3.1 | — |
| 2.2 | Buat sheet `db_summary` dengan kolom sesuai Bagian 3.4 | UX-4 |
| 2.3 | Update sheet `db_users`: tambah kolom `divisi_id`, `scope`, `password_hash`, `password_salt`, `password_v`, `aktif`, `created_by` | S-1, F-2 |
| 2.4 | Update sheet `db_audit_log`: tambah kolom `divisi_id` | L-6 |
| 2.5 | Update semua pemanggilan `writeAuditLog()` untuk sertakan `divisi_id` | L-6 |
| 2.6 | Implementasi `updateSummary(divisi_id, tipe, delta)` — dipanggil dari semua write operation | UX-4 |
| 2.7 | Migrasi data existing: tambah kolom `id` (UUID), `is_deleted`, `deleted_at`, `deleted_by` ke sheet surat masuk/keluar/piagam yang ada. Populate UUID untuk semua record | L-1 |
| 2.8 | Update `getData()` untuk filter `is_deleted=false` by default | UX-5 |
| 2.9 | Update `getSheetRow()` untuk selalu cari by UUID, bukan row_number | L-1 |
| 2.10 | Implementasi `initDivisi()` dengan pattern atomic (Bagian 7.4) + action `retry_init_divisi` + action `cleanup_divisi` | L-5, L-7, T-7 |

---

### Fase 3 — RBAC multi-divisi (1 minggu)

*Ini titik terpenting. Setelah fase ini selesai, isolasi data antar divisi bekerja.*

| Step | Task | Referensi celah |
|---|---|---|
| 3.1 | Update `_checkRole()` dengan logika namespace divisi (Bagian 5.2) | F-1, S-3 |
| 3.2 | Implementasi helper `_extractDivisiFromTable()` (Bagian 5.3) | S-3 |
| 3.3 | Update `RBAC_RULES` sesuai Bagian 5.4 | — |
| 3.4 | Implementasi error codes (Bagian 5.5). Update `api.js` untuk translate ke pesan Indonesia | UX-2 |
| 3.5 | Fix upload: hapus `folderId` dari client, server tentukan dari `db_divisi`. Tambah `_checkRole()` di `handleUploadChunk()` dan `finalizeUpload()`. Fix chunk key dengan prefix divisi | F-3, T-3 |
| 3.6 | Validasi ukuran file di `finalizeUpload()` | T-2 |
| 3.7 | Tambah scope divisi di `manageUser()` | L-3 |
| 3.8 | Validasi kepemilikan file di `deleteFileFromDrive()` | T-1 |
| 3.9 | Implementasi `LockService.getScriptLock()` untuk semua write operation | F-4 |
| 3.10 | Security test: coba akses data divisi lain dari akun divisi A. Semua harus return ERR_403_DIVISI | — |

---

### Fase 4 — Frontend multi-divisi & form surat (2 minggu)

| Step | Task | Referensi |
|---|---|---|
| 4.1 | Update `api.js`: semua request POST include `session_token`. Handle error codes baru | Fase 1 |
| 4.2 | Buat halaman/modal `input-surat-masuk` sesuai konsep Bagian 6 | Bagian 6 |
| 4.3 | Buat halaman/modal `input-surat-keluar` sesuai konsep Bagian 6 | Bagian 6 |
| 4.4 | Implementasi chunked upload serial (bukan paralel) dengan progress bar per file | Bagian 6.4 |
| 4.5 | Upload file: simpan sebagai JSON array of URLs di kolom `upload_file` | Bagian 2.6 |
| 4.6 | Divisi switcher di sidebar untuk Super Admin: dropdown + `isDirty` check + reload | UX-1 |
| 4.7 | Breadcrumb/judul halaman selalu tampilkan nama divisi aktif | UX-1 |
| 4.8 | Translate error codes ke pesan Indonesia di frontend | UX-2 |
| 4.9 | UI onboarding divisi baru di halaman admin: form + status pending + feedback | UX-3 |
| 4.10 | Dashboard agregat untuk Super Admin baca dari `db_summary` | UX-4 |
| 4.11 | Recovery bin per-divisi: toggle "tampilkan yang dihapus" untuk admin_divisi ke atas | UX-5 |
| 4.12 | Update `PUBLIC_TABLES`: hanya `ref_sekolah`. Ref per-divisi butuh auth | S-4 |

---

### Fase 5 — Onboarding divisi & stabilisasi (ongoing)

| Step | Task |
|---|---|
| 5.1 | Pilot satu divisi: jalankan `initDivisi()`, test semua flow end-to-end |
| 5.2 | Security test pilot: login sebagai user divisi A, coba akses URL/data divisi B — semua harus ditolak |
| 5.3 | Onboard divisi secara bertahap: batch 2–3 divisi per minggu. Monitor GAS quota setelah setiap batch |
| 5.4 | Evaluasi akses file Drive: migrasi ke `DOMAIN_WITH_LINK` jika semua divisi sudah pakai akun Google kedinasan |
| 5.5 | Setup monitoring quota: sheet `db_quota_log` yang catat request count per jam, tampilkan di dashboard super admin |

---

## 10. Perubahan Per File

### `code.gs`

| Fungsi/Variabel | Jenis perubahan | Detail |
|---|---|---|
| `DRIVE_FOLDER_ID` | Hapus/refactor | Tidak lagi hardcoded — folder dibaca dari `db_divisi.drive_folder_id` berdasarkan session |
| `RBAC_RULES` | Update | Sesuai Bagian 5.4 |
| `PUBLIC_TABLES` | Update | Hanya `ref_sekolah` |
| `doGet()` | Revisi | Hanya untuk health check dan resource benar-benar publik. Semua data endpoint pindah ke `doPost` |
| `doPost()` | Revisi | Tambah action: `get_data`, `logout`, `init_divisi`, `retry_init_divisi`, `cleanup_divisi`. Fix catch block |
| `cekLogin()` | Revisi besar | Rate limiting, hash check, auto-upgrade v1→v2, generate + simpan session token, return `divisi_id` + `scope` |
| `_lookupUser()` | Revisi | Baca kolom `divisi_id`, `scope`, `aktif`, `password_hash`, `password_salt`, `password_v` |
| `_getSession(token)` | **Baru** | Lookup session dari CacheService, fallback PropertiesService. Sliding expiry |
| `_checkRole()` | Revisi besar | Ambil actor dari session (bukan body). Tambah validasi namespace divisi. Tambah error codes |
| `_extractDivisiFromTable(tableName)` | **Baru** | Ekstrak prefix divisi dari nama tabel |
| `writeAuditLog()` | Revisi | Tambah parameter `divisi_id`. Update semua pemanggilan |
| `updateSummary(divisi_id, tipe, delta)` | **Baru** | Update counter di `db_summary` |
| `getData()` | Revisi | Pindah ke POST. Tambah auth. Filter `is_deleted=false` by default. Support flag `include_deleted` |
| `getSheetRow()` | Revisi | Cari by UUID, bukan row_number |
| `simpanRecord()` | Revisi | Ambil actor dari session. Generate UUID untuk kolom `id`. Panggil `updateSummary()` |
| `updateRecord()` | Revisi | Ambil actor dari session. Panggil `updateSummary()` jika ada perubahan status |
| `hapusRecord()` | Revisi | Ambil actor dari session. Validasi kepemilikan file. Soft delete. Panggil `updateSummary()` |
| `simpanPiagam()` | Revisi | Tambah auth check di awal. Ambil actor dari session. Pertahankan logika TTD canvas |
| `manageUser()` | Revisi | Tambah scope divisi check untuk admin_divisi |
| `handleUploadChunk()` | Revisi | Tambah auth. Fix chunk key dengan prefix divisi |
| `finalizeUpload()` | Revisi | Tambah auth. Hapus folderId dari client. Tentukan folder dari session divisi. Validasi ukuran |
| `deleteFileFromDrive()` | Revisi | Validasi file berada di folder divisi user sebelum hapus |
| `initDivisi(kode, nama)` | **Baru** | Provisioning divisi baru — atomic pattern |
| `retryInitDivisi(kode)` | **Baru** | Retry inisialisasi yang gagal di tengah |
| `cleanupDivisi(kode)` | **Baru** | Hapus partial state dari inisialisasi yang gagal |

---

### `js/api.js`

- Semua request POST include `session_token` dari localStorage
- `get_data` pindah dari GET ke POST
- Tambah fungsi `translateError(code)` → pesan Indonesia
- Upload multiple file: panggil chunked upload serial, kumpulkan array URL, baru kirim ke `simpanRecord`
- Handle response `upload_file` sebagai JSON array

### `js/auth.js`

- Simpan hanya `session_token` dan data display (nama, role, divisi_id, scope) dari response login
- Fungsi `getActor()` tidak lagi dari localStorage — token dikirim ke server, server yang return actor
- Tambah fungsi `logout()`: POST ke server, baru hapus localStorage
- Tambah fungsi `getActiveDivisi()` untuk divisi switcher

### `js/sidebar-init.js`

- Render divisi switcher dropdown hanya jika `localStorage.user_scope === "all"`
- Tambah breadcrumb nama divisi aktif di header semua halaman
- Implementasi `isDirty` global state yang di-check sebelum navigasi atau switch divisi

### `js/master.js`

- Update untuk handle `upload_file` sebagai JSON array (tampilkan multiple file/thumbnail)
- Toggle "Tampilkan data terhapus" untuk recovery bin

### `js/laporan.js`, `js/search.js`, `js/dashboard.js`

- Update endpoint request ke POST dengan session token
- Dashboard super admin: tambah panel agregat dari `db_summary`

### File baru yang perlu dibuat

- `js/surat-masuk-form.js` — logika form input surat masuk (validasi, upload serial, submit)
- `js/surat-keluar-form.js` — logika form input surat keluar
- `surat-masuk.html` atau modal di `master.html` — UI form surat masuk
- `surat-keluar.html` atau modal di `master.html` — UI form surat keluar

### File yang dihapus

- `shield.html`
- `js/shield.store.js`
- `js/shield.guard.js`
- `js/shield.panel.js`

---

## 11. Keputusan yang Sudah Final

Semua keputusan berikut sudah diambil dan tidak perlu didiskusikan ulang:

| Keputusan | Pilihan yang diambil |
|---|---|
| Pendekatan arsitektur | Opsi B: satu GAS, sheet per divisi dengan prefix kode |
| `ref_sekolah` | Global, satu untuk semua divisi |
| `ref_pengambilan` dan `ref_jenis` | Per divisi |
| Permission Shield | Dihapus sepenuhnya |
| Input surat masuk dan keluar | Form custom SISURAT, bukan Google Forms |
| Format file yang diterima | JPG, PNG, PDF |
| Ukuran file | Maks. 10 MB per file, 30 MB total, 5 file per surat |
| Multiple lampiran per surat | Ya, disimpan sebagai JSON array di kolom `upload_file` |
| Google Account | Satu akun kedinasan untuk semua: GAS, Sheets, Drive |
| Session management | Server-side token via CacheService + PropertiesService backup |
| Password storage | SHA-256 + salt, dengan auto-upgrade dari plaintext legacy |
| Actor sumber | Selalu dari session server, tidak pernah dari request body |
| Recovery bin | Per divisi, via kolom `is_deleted` di setiap tabel |
| ID record | UUID stabil, bukan row_number |

---

## 12. Keputusan yang Harus Diambil Sebelum Implementasi

**Keputusan 1 — Apakah admin divisi boleh lihat laporan divisi lain secara read-only?**

Contoh: Kepala Dinas bukan Super Admin tapi perlu lihat laporan semua divisi. Jika ya, perlu role `viewer_all` dengan `scope=all` tapi hanya permission `read`. Ini perlu ditambahkan ke `RBAC_RULES` dan hierarki role sebelum Fase 3.

**Keputusan 2 — Apakah form piagam bisa diakses publik (tanpa login)?**

Saat ini `simpanPiagam` dipakai dari form yang bisa diakses tamu (orang tua/guru mengambil piagam tanpa akun SISURAT). Dengan fix L-2, form ini akan butuh login. Dua opsi:
- (a) Login wajib sebelum submit form piagam — berarti semua pengambil piagam harus punya akun
- (b) Buat endpoint terpisah `simpanPiagam_public()` dengan CAPTCHA/token form sekali pakai sebagai pengganti auth — tanpa RBAC tapi dengan proteksi spam

**Keputusan 3 — Berapa jumlah divisi awal yang akan diaktifkan?**

Ini menentukan apakah perlu migrasi data dari sheet Google Forms lama ke sheet baru dengan format yang sudah direvisi (kolom `id`, `divisi_id`, `is_deleted`, dst.), atau mulai dari clean slate.

**Keputusan 4 — Siapa yang akan jadi Super Admin Pusat dan berapa orangnya?**

Super Admin Pusat punya akses ke semua data semua divisi. Perlu ditetapkan sebelum Fase 5 agar proses onboarding divisi bisa dilakukan oleh orang yang tepat.

---

*Dokumen ini adalah sumber kebenaran tunggal untuk pengembangan SISURAT versi multi-divisi. Setiap perubahan keputusan arsitektur harus diupdate di dokumen ini sebelum diimplementasikan.*

*Versi 2.0 — mencakup: arsitektur multi-divisi, skema database final, sistem auth baru, RBAC lengkap, konsep form input surat custom, flow sistem end-to-end, audit 29 celah beserta fix, roadmap implementasi 5 fase, peta perubahan per file, dan keputusan yang sudah final.*
