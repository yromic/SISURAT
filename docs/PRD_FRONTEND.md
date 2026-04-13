# PRD Frontend — SISURAT (Sistem Manajemen Surat)

> **Versi Dokumen:** 2.0
> **Tanggal:** 2026-04-13
> **Status:** Aktif
> **Penulis:** Dihasilkan oleh Analisis Kodebase SISURAT-1

---

## Changelog Versi

| Versi | Tanggal | Perubahan |
|-------|---------|-----------|
| 1.0 | 2026-03-26 | Dokumen awal — analisis kodebase pertama |
| 2.0 | 2026-04-13 | Penambahan halaman `referensi.html`, modul `ref-crud.js`; API baru `fetchRef`, `invalidateRef`, `uploadFileChunked`, `compressImage`, `validateFileSize`; sentralisasi CSS ke `css/style.css`; pembaruan Site Map & Navigasi |

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

---

## 3. Pengguna (User Persona)

### 3.1 Administrator / Super Admin
- **Peran:** Akses penuh ke semua fitur (CRUD, hapus permanen, ekspor, kelola referensi)
- **Kemampuan tambahan:** Dapat melihat panel Sampah (Trash), melakukan *force delete*, dan mengelola data referensi dropdown
- **Identifikasi:** `role = "Super Admin"` di `localStorage`

### 3.2 Staf / Operator
- **Peran:** Akses terbatas (tambah data, edit, soft-delete)
- **Kemampuan:** Tidak dapat melakukan Force Delete; akses ke halaman Referensi masih bisa (auth check via `requireAuth`)
- **Identifikasi:** `role` bukan Super Admin

### 3.3 Pengirim Piagam (Publik / Tamu)
- **Peran:** Hanya dapat mengakses halaman `piagam.html` tanpa login
- **Kemampuan:** Upload piagam + tanda tangan digital via canvas; data dropdown (sekolah, perlombaan, pengambilan) diambil dari referensi yang dikelola admin

---

## 4. Arsitektur Halaman & Navigasi

### 4.1 Site Map

```
index.html          ← Landing Page (Publik)
├── login.html      ← Halaman Login (Publik)
├── piagam.html     ← Upload Piagam (Publik / Semi-Private)
│
└── [Protected - Butuh Auth]
    ├── dashboard.html    ← Overview & Analitik
    ├── cari.html         ← Pencarian Pintar
    ├── master.html       ← Master Data (CRUD Terpadu)
    ├── laporan.html      ← Ekspor & Laporan
    └── referensi.html    ← Kelola Referensi Dropdown  ← [BARU v2.0]
```

### 4.2 Sidebar Navigasi (5 Item)

Sidebar global kini memiliki **5 item navigasi** (sebelumnya 4):

| Ikon | Label | Halaman |
|------|-------|---------|
| `fa-chart-pie` | Overview | `dashboard.html` |
| `fa-search` | Pencarian Pintar | `cari.html` |
| `fa-database` | Master Data | `master.html` |
| `fa-file-export` | Ekspor & Laporan | `laporan.html` |
| `fa-sliders-h` | Kelola Referensi | `referensi.html` ← **BARU** |

### 4.3 Alur Autentikasi

```
Kunjungi index.html
    └─ [User sudah login?] ──Yes──→ Redirect ke dashboard.html
            │
           No
            └─ Tampilkan Landing Page
                   └─ Klik "Login" ──→ login.html
                           └─ Submit Form ──→ API (Google Apps Script)
                                   ├─ Sukses → Simpan user ke localStorage → dashboard.html
                                   └─ Gagal  → Tampilkan pesan error
```

### 4.4 Mekanisme Auth Guard

Setiap halaman protected memanggil `SisuratAuth.requireAuth()`. Jika session tidak ada, otomatis redirect ke `index.html`.

---

## 5. Spesifikasi Per Halaman

### 5.1 `index.html` — Landing Page

**Tujuan:** Wajah depan sistem. Menarik pengguna masuk & menjelaskan fitur.

| Komponen | Deskripsi |
|----------|-----------|
| Navbar | Glassmorphism sticky, logo + link navigasi + tombol Login dan Upload Piagam |
| Mobile Menu | Dropdown hamburger, animasi max-height |
| Hero Section | Headline besar, deskripsi, dua CTA (Masuk Ruang Kerja / Upload Piagam), statistik angka |
| Hero Illustration | Card glassmorphism animatif yang mensimulasikan tampilan dashboard |
| Fitur Section | 6 kartu fitur (Pencarian Pintar, Dashboard Analitik, Master Data, Recovery Bin, Ekspor Laporan, Tanda Tangan Digital) |
| Tentang Section | Narasi produk + visual kartu animatif + 2 metrik (Digitalisasi 100%, 24/7) |
| Footer | Logo + copyright |
| Background | Dua blob animasi floating dengan blur |
| Script | Auto-redirect ke dashboard jika user sudah login |

**State Spesial:**
- Jika `localStorage.user` ada → redirect otomatis ke `dashboard.html`

---

### 5.2 `login.html` — Halaman Login

**Tujuan:** Autentikasi pengguna internal.

| Komponen | Deskripsi |
|----------|-----------|
| Layout | Split-panel: kiri (branding) + kanan (form) |
| Panel Kiri | Logo, tagline, social proof (avatar + pengguna aktif) |
| Panel Kanan | Form username + password, error container `#msg`, tombol Sign In |
| Background | Animated mesh gradient (radial) + decorative blur elements |
| Animasi | Hover flip pada tombol (scaleX transform), input focus glow |

**Logika (`login.js`):**
1. Submit form → `SisuratApi.login(username, password)`
2. Respons sukses → `SisuratAuth.setStoredUser(user)` → redirect ke `dashboard.html`
3. Respons gagal → tampilkan elemen `#msg` dengan teks error

**Validasi:**
- Kedua field `required`
- Error ditampilkan inline (tidak alert browser)

---

### 5.3 `dashboard.html` — Overview & Analitik

**Tujuan:** Pusat kendali visual dengan statistik dan grafik real-time.

| Komponen | Deskripsi |
|----------|-----------|
| Sidebar | Glassmorphism dark (#222831), sticky, navigasi **5 menu**, user info, tombol Logout |
| Mobile Header | Sticky top, hamburger menu, nama user truncated |
| Header Banner | Gradient dark→teal, badge label, H1, tombol shortcut Form Masuk & Keluar (Google Forms) |
| Stat Cards (4) | Total Rekap, Surat Masuk, Surat Keluar, Piagam — masing-masing dengan warna aksen unik |
| Chart Distribusi | `Chart.js` canvas (`#suratChart`), toggle Bar/Line/Pie |
| Aktivitas Log | Panel dengan scroll, list aktivitas terbaru, link ke `cari.html` |
| Tren Bulanan | Chart area (`#monthlyChart`) untuk trafik per bulan |

**Data Flow:**
```
DOMContentLoaded
    └─ requireAuth()
    └─ fetchAllTables() via SisuratApi
        └─ Render stat cards (total, masuk, keluar, piagam)
        └─ Render suratChart (distribusi)
        └─ Render monthlyChart (tren)
        └─ Render aktivitas log (10 terbaru)
```

**Interaktivitas:**
- Toggle tipe chart (Bar ↔ Line ↔ Pie) tanpa reload data
- Sidebar overlay untuk mobile (slide-in + backdrop blur)

---

### 5.4 `cari.html` — Pencarian Pintar

**Tujuan:** Penelusuran dokumen lintas kategori dengan filter canggih dan pratinjau dokumen.

| Komponen | Deskripsi |
|----------|-----------|
| Sidebar | Identik dengan dashboard (5 menu) |
| Header Banner | Gradient, label "Pencarian Pintar" |
| Search Bar Giant | Input besar + tombol "Opsi Filter" |
| Filter Panel `#filterPanel` | Collapsible: dropdown Kategori (Masuk/Keluar/Piagam), Date Range (dari/sampai), tombol Reset & Cari |
| Controls Row | Jumlah hasil (`#result-count`), selector per-halaman, toggle view (Grid/List) |
| Hasil (`#result`) | Grid cards atau List rows — dirender oleh `search.js` |
| Paginasi | Prev/Next + nomor halaman |
| Modal Pratinjau | Full-screen modal: panel detail kiri (metadata) + panel iframe preview PDF kanan |

**Logika (`search.js`):**
- **Cache in-memory** dengan TTL 2 menit untuk menghindari repeat fetch
- **Debounce** input 300ms
- Filter: kata kunci (semua field teks) + kategori + rentang tanggal
- Detail modal: dibuka klik card, menampilkan semua field + iframe preview Google Drive

**Fitur Lanjutan:**
- Toggle tampilan Grid (kartu) vs List (baris tabel)
- Paginasi client-side (default 12 per halaman)
- Highlight kata kunci pada hasil (opsional)

---

### 5.5 `master.html` — Master Data

**Tujuan:** Antarmuka CRUD terpadu untuk semua kategori dokumen dalam satu halaman.

| Komponen | Deskripsi |
|----------|-----------|
| Sidebar | Identik, tab Master Data aktif |
| Header Banner | Gradient, label "Sentral Master Data", tombol "Panduan Sistem" |
| Info Accordion `#infoMaster` | Collapsible: 3 kartu panduan (Pengajuan Terpusat, Tabel Dinamis, Aman Berjaga) |
| Tab Navigasi | 3 tab: Piagam \| Surat Masuk \| Surat Keluar (instan, tanpa reload) |
| Toolbar | Search lokal (`#master-search`), selector rows-per-page, dropdown toggle kolom |
| Tabel Data | Header sortable (klik kolom), baris dengan hover effect, badge status |
| Tombol Aksi | Edit (teal), Delete/soft-delete (merah) per baris |
| Modal Form | Slide-in modal untuk Tambah/Edit record dengan input dinamis berdasarkan tab aktif |
| Panel Sampah | Expandable trash panel (hanya Super Admin), tombol Restore dan Force Delete |
| Toast Notification | Slide-in dari kanan: sukses (teal) / error (merah), dengan tombol Undo |

**Logika (`master.js`):**
```
switchTab(tab)
    └─ Fetch data tabel aktif dari SisuratApi.fetchTable(table)
    └─ Render tabel dengan kolom dinamis
    └─ Sortable header

openModal(mode, id?)
    └─ mode = 'add' | 'edit'
    └─ Render form fields berdasarkan schema tabel
    └─ Pre-fill data jika edit

saveRecord()
    └─ Validasi form
    └─ Upload file via uploadFileChunked() jika ada file input  ← [BARU v2.0]
    └─ Progress bar upload real-time                             ← [BARU v2.0]
    └─ SisuratApi.saveRecord() atau updateRecord()
    └─ Invalidate cache → refresh tabel

softDelete(id) → SisuratApi.deleteRecord() (soft)
restoreRecord(id) → SisuratApi.updateRecord() (hapus flag trashed)
forceDelete(id) → SisuratApi.deleteRecord() (permanent) [Super Admin Only]
```

**Kolom per Tab:**

| Tab | Kolom Utama |
|-----|-------------|
| Piagam | Nama, Jenis Lomba, Tingkat, Tahun, Pengambilan, File Piagam, TTD |
| Surat Masuk | No. Surat, Tanggal, Perihal, Pengirim, Tujuan, File |
| Surat Keluar | No. Surat, Tanggal, Perihal, Rujukan, Tujuan, File |

---

### 5.6 `laporan.html` — Ekspor & Laporan

**Tujuan:** Rekapitulasi dan ekstraksi data ke berbagai format.

| Komponen | Deskripsi |
|----------|-----------|
| Sidebar | Identik, tab Ekspor & Laporan aktif |
| Filter Periode | Date range (dari/sampai tanggal), pilihan kategori |
| Preview Rekap | Tabel preview data yang akan diekspor |
| Tombol Ekspor | Unduh CSV, Unduh PDF (auto format), Kirim Email |
| Ringkasan Statistik | Jumlah per kategori dalam periode yang dipilih |

**Logika (`laporan.js`):**
- Filter data berdasarkan tanggal dan kategori
- Generate CSV via `SisuratApi.exportCsv()`
- Generate PDF via browser print / library PDF
- Kirim email melalui API endpoint Google Apps Script

---

### 5.7 `piagam.html` — Upload Piagam (Publik)

**Tujuan:** Halaman publik untuk penerima piagam mengisi data dan menandatangani secara digital.

| Komponen | Deskripsi |
|----------|-----------|
| Form Piagam | Nama, Jenis Lomba, Tingkat, Tahun Perlombaan, Jadwal Pengambilan |
| Dropdown Dinamis | Sekolah, Jenis Perlombaan, Jenis Pengambilan — diisi dari `SisuratApi.fetchRef()` ← [BARU v2.0] |
| Upload File | Input file piagam (PDF/gambar), konversi ke Base64 |
| Canvas Tanda Tangan | Area menggambar tanda tangan (`<canvas>`), tombol Bersihkan |
| Tombol Submit | Kirim semua data + file + TTD ke API |

**Logika (`piagam.js`):**
- Canvas signature via `mousedown/mousemove/mouseup` + touch events
- **Dropdown diisi dari `SisuratApi.fetchRef(tableName)`** — data di-cache sessionStorage 10 menit ← [BARU v2.0]
- File → FileReader → Base64 encoding
- Submit → `SisuratApi.savePiagam(data)`
- Validasi: semua field wajib diisi, file harus dipilih, TTD tidak boleh kosong

---

### 5.8 `referensi.html` — Kelola Referensi ← [HALAMAN BARU v2.0]

**Tujuan:** Antarmuka admin untuk mengelola data referensi yang memengaruhi dropdown di `piagam.html`.

| Komponen | Deskripsi |
|----------|-----------|
| Sidebar | Identik — tab "Kelola Referensi" aktif (gradient teal) |
| Mobile Header | Sticky top, hamburger, nama user |
| Header Banner | Gradient dark→teal, badge "Manajemen Referensi", H1 |
| Info Cards (3) | Kartu ringkasan: **Nama Sekolah**, **Jenis Pengambilan**, **Jenis Perlombaan** — klik card untuk switch tab. Masing-masing menampilkan counter `X aktif / Y total` |
| CRUD Panel `#panel-referensi` | Panel utama berisi tab selector + tabel data + tombol Tambah Data |
| Tab Selector | 3 tab: Nama Sekolah \| Jenis Pengambilan \| Jenis Perlombaan |
| Search Bar | `#ref-search` — filter client-side real-time tanpa fetch ulang |
| Tabel Data | Kolom: #, Nama, Status (badge Aktif/Non-aktif), Aksi (Edit/Hapus) |
| Loading State | Spinner teal saat fetch |
| Empty State | Ikon inbox + pesan saat data kosong |
| Counter | `X data · Y aktif` di bawah tabel |
| Modal CRUD | Full modal backdrop blur: form input nama + radio status (Aktif/Non-aktif) + alert inline |

**Logika (`ref-crud.js`):**
```
IIFE — (function initRefCrud(global))

TAB_CONFIG = {
  sekolah:     { table: "ref_sekolah",            namaKey: "nama_sekolah" }
  pengambilan: { table: "ref_pengambilan",         namaKey: "nama" }
  perlombaan:  { table: "ref_jenis_perlombaan",    namaKey: "nama" }
}

refSwitchTab(tab)
    └─ Update active tab button + info card highlight border
    └─ loadTabData()

loadTabData()
    └─ setLoading(true)
    └─ fetch SisuratApi.BASE_URL?action=get_data&table=<cfg.table>
    └─ renderTable(data)

loadAllCounts()
    └─ Fetch semua 3 tabel → update counter di info cards

refFilterTable(keyword)
    └─ Filter client-side dari currentData (tanpa fetch ulang)
    └─ renderTable(filteredData)

refTambah() → buka modal mode Tambah
refEdit(rowNum, nama, aktif) → buka modal mode Edit (pre-fill data)

refSimpan()
    └─ isEdit? SisuratApi.updateRecord() : SisuratApi.saveRecord()
    └─ Sukses → SisuratApi.invalidateRef(cfg.table)
    └─ Refresh tabel + counter

refHapus(rowNum, nama)
    └─ window.confirm() → SisuratApi.deleteRecord()
    └─ SisuratApi.invalidateRef() → refresh tabel + counter
```

**Tabel Referensi di Google Sheets:**

| Tabel | Kolom Key | Keterangan |
|-------|-----------|------------|
| `ref_sekolah` | `nama_sekolah`, `aktif` | Daftar sekolah untuk dropdown Piagam |
| `ref_pengambilan` | `nama`, `aktif` | Jenis pengambilan piagam |
| `ref_jenis_perlombaan` | `nama`, `aktif` | Jenis kompetisi/perlombaan |

**SEO:** `<title>Kelola Referensi | SISURAT Premium</title>`

---

## 6. Spesifikasi Teknis Frontend

### 6.1 Stack Teknologi

| Teknologi | Penggunaan | Versi / CDN |
|-----------|------------|-------------|
| HTML5 | Struktur semua halaman | — |
| TailwindCSS | Utility classes styling | CDN (cdn.tailwindcss.com) |
| Vanilla CSS | Custom classes, animasi, komponen global | **`css/style.css`** (sentralisasi sejak v2.0) |
| JavaScript (ES6+) | Semua logika frontend | Modular via file `.js` |
| Font Awesome | Ikon UI | v6.0.0-beta3 CDN |
| Google Fonts | Tipografi | Outfit + Inter |
| Chart.js | Grafik dashboard | v4.4.0 CDN |
| Google Apps Script | Backend/API | Custom deployment URL |

### 6.2 Sistem Modul JavaScript

```
js/
├── api.js       → SisuratApi  (namespace global)
│                  BASE_URL, TABLE_CONFIG, DRIVE_FOLDERS
│                  CRUD: fetchTable, fetchAllTables, saveRecord, updateRecord, deleteRecord
│                  Ref: fetchRef, invalidateRef                      ← [BARU v2.0]
│                  Upload: validateFileSize, compressImage, uploadFileChunked  ← [BARU v2.0]
│                  Util: parseDate, normalizeRecord, exportCsv
│                  Events: onCacheInvalidate, invalidateCache
│
├── auth.js      → SisuratAuth (namespace global)
│                  Session: getStoredUser, setStoredUser, clearStoredUser
│                  Guard: requireAuth(options)
│                  Role: isSuperAdmin()
│                  Logout: logoutToHome()
│
├── login.js     → Fungsi login() — dipanggil dari form
├── dashboard.js → Render metrik + charts + aktivitas log
├── search.js    → Cache, debounce, filter, paginasi, modal
├── master.js    → Tab, tabel dinamis, modal form, CRUD, trash, upload chunked
├── laporan.js   → Filter, render rekap, ekspor CSV/PDF/Email
├── piagam.js    → Canvas TTD, file upload, submit form, populate dropdowns dari fetchRef
├── ref-crud.js  → CRUD referensi: sekolah, pengambilan, perlombaan  ← [BARU v2.0]
└── js.js        → Google Apps Script backend (server-side, bukan frontend)
```

### 6.3 API Baru di `SisuratApi` (v2.0)

#### `fetchRef(tableName, forceRefresh?)`
```js
// Ambil data tabel referensi dengan cache sessionStorage TTL 10 menit
// Hanya mengembalikan baris dengan aktif = "TRUE"
SisuratApi.fetchRef("ref_sekolah")       // → Array<{ nama_sekolah, aktif, ... }>
SisuratApi.fetchRef("ref_pengambilan")   // → Array<{ nama, aktif, ... }>
SisuratApi.fetchRef("ref_jenis_perlombaan") // → Array<{ nama, aktif, ... }>
```

#### `invalidateRef(tableName)`
```js
// Hapus cache sessionStorage tabel referensi tertentu
// Dipanggil setelah admin create/update/delete di referensi.html
SisuratApi.invalidateRef("ref_sekolah");
```

#### `uploadFileChunked(file, folderId, onProgress?)`
```js
// Upload file ke Google Drive via chunked approach (max 20MB)
// - Otomatis kompres gambar > 1MB via compressImage()
// - Chunk size: 350 KB → Base64 ~467 KB (aman di bawah limit GAS 500 KB)
// - Callback progress: 0–100%
// - actions: upload_chunk → finalize_upload
const fileUrl = await SisuratApi.uploadFileChunked(file, folderId, (pct) => {
  progressBar.style.width = pct + "%";
});
```

#### `compressImage(file, quality?, maxDimension?)`
```js
// Kompres gambar via Canvas API jika file > 1MB
// Default: quality=0.82, maxDimension=1920px
// Fallback ke file asli jika kompresi justru lebih besar
```

#### `validateFileSize(file)`
```js
// Periksa apakah file ≤ 20MB
// Returns: { valid: boolean, message?: string }
```

### 6.4 Kontrak Data API

**Endpoint:** `BASE_URL` (Google Apps Script)

| Action | Method | Payload |
|--------|--------|---------|
| `login` | POST | `{ username, password }` |
| `get_data` | GET | `?action=get_data&table=<table>` |
| `simpan_record` | POST | `{ table, data: { ...fields, file_base64?, folder_id? } }` |
| `update_record` | POST | `{ table, id, data: { ...fields } }` |
| `hapus_record` | POST | `{ table, id }` |
| `simpan_piagam` | POST | `{ nama, jenis_lomba, ..., file_base64, ttd_base64, folder_id, ttd_folder_id }` |
| `upload_chunk` | POST | `{ uploadId, chunkIndex, totalChunks, chunkBase64 }` ← **BARU** |
| `finalize_upload` | POST | `{ uploadId, totalChunks, fileName, mimeType, folderId }` ← **BARU** |

**Struktur Data Normal (hasil `normalizeRecord`):**
```js
{
  ...originalFields,  // semua field dari Google Sheets
  jenis: "Surat Masuk" | "Surat Keluar" | "Piagam",
  tanggal: "...",     // dipilih dari dateFields config
  _table: "db_surat_masuk" | "db_surat_keluar" | "db_piagam"
}
```

### 6.5 Konstanta Upload File

| Konstanta | Nilai | Keterangan |
|-----------|-------|------------|
| `MAX_FILE_SIZE_BYTES` | 20 MB | Batas maksimal file upload |
| `IMAGE_COMPRESS_THRESHOLD` | 1 MB | Ukuran di atas ini gambar dikompres |
| `CHUNK_SIZE_BYTES` | 350 KB | Ukuran per chunk (Base64 ≈ 467 KB) |

### 6.6 Storage

| Storage | Key | Isi | Persistence |
|---------|-----|-----|-------------|
| `localStorage` | `"user"` | `{ nama, username, role, email }` | Sampai logout/clear |
| `sessionStorage` | `"sisurat_ref_<tableName>"` | `{ data: [...], timestamp }` | TTL 10 menit, per-session |

---

## 7. Desain Sistem (Design System)

### 7.1 Palet Warna

| Token | Nilai Hex | Penggunaan |
|-------|-----------|------------|
| `--color-primary` | `#00ADB5` | Aksen utama, CTA, active state |
| `--color-primary-dark` | `#00939C` | Hover primary |
| `--color-dark-1` | `#222831` | Background sidebar, heading gelap |
| `--color-dark-2` | `#393E46` | Teks sekunder gelap, hover sidebar |
| `--color-light` | `#EEEEEE` | Background halaman utama |
| `--color-white` | `#FFFFFF` | Card, modal, form background |
| `--color-danger` | `#EF4444` | Delete button, error state |
| `--color-success` | `#16A34A` | Restore button, success toast |

### 7.2 Tipografi

| Kelas Font | Font Family | Bobot | Elemen |
|------------|-------------|-------|--------|
| Body default | Inter | 400/500/600 | `<p>`, `<span>`, input, label |
| Heading / Brand | Outfit | 700/800 | `<h1>`–`<h6>`, nama brand, tab |

### 7.3 Komponen Reusable (CSS — `css/style.css`)

CSS telah **disentralisasi** ke `css/style.css` (sejak v2.0), menggantikan `<style>` inline per halaman.

| Kelas | Deskripsi |
|-------|-----------|
| `.glass-sidebar` | Dark sidebar (rgba 34,40,49 + backdrop-blur) |
| `.glass-panel` | Konten putih transparan (rgba 255,255,255,0.7 + blur) |
| `.glass-modal` | Modal backdrop (rgba 255,255,255,0.85 + blur kuat) |
| `.glass-nav` | Navbar transparan (rgba 255,255,255,0.75 + blur) |
| `.tab-active` | Tab aktif: gradient teal + shadow teal |
| `.tab-inactive` | Tab tidak aktif: putih + border abu |
| `.action-btn-edit` | Tombol edit: teal subtle, hover full teal |
| `.action-btn-delete` | Tombol hapus: merah subtle, hover full merah |
| `.action-btn-restore` | Tombol restore: hijau subtle, hover full hijau |
| `.action-btn-force-delete` | Tombol force delete: rose, hover full rose |
| `.toast` | Notifikasi slide-in kanan bawah (min-width 300px) |
| `.toast-success` | Toast sukses: gradient teal |
| `.toast-error` | Toast error: gradient merah |
| `.toast-undo-btn` | Tombol Undo di dalam toast |
| `.form-input` | Input form: bg abu-50, focus border teal + ring |
| `.badge-trashed` | Badge merah pill untuk data terhapus |
| `.tr-trashed` | Baris sampah: garis diagonal merah + strikethrough |
| `.stat-card` | Stat card dengan efek radial gradient overlay |
| `.rows-select` | Dropdown rows-per-page (custom appearance) |
| `.filter-input` | Input filter laporan: glassmorphism, focus lift |
| `.btn-export` | Base export button: uppercase, hover lift |
| `.btn-csv` | Hijau emerald |
| `.btn-pdf` | Merah |
| `.btn-email` | Ungu violet |
| `.hover-scale` | Micro-animation hover lift + scale |
| `.float-card` | Card hover dengan drop-shadow |
| `.col-toggle-dropdown` | Dropdown toggle kolom master (absolute positioning) |

### 7.4 Responsivitas (Breakpoints)

| Breakpoint | Perilaku |
|------------|----------|
| `< 768px` (mobile) | Sidebar tersembunyi, tampil via hamburger + overlay |
| `768px–1023px` (tablet) | Sidebar masih tersembunyi, layout 2-kolom sebagian |
| `≥ 1024px` (desktop) | Sidebar selalu tampil di kiri, konten melebar |

### 7.5 Animasi & Transisi

| Animasi | Elemen | Durasi |
|---------|--------|--------|
| Sidebar slide | `translateX(-100%) → translateX(0)` | 0.4s cubic |
| Card hover lift | `translateY(-4px) + scale(1.02)` | 0.3s cubic |
| Toast slide-in | `translateX(100px) → translateX(0)` | 0.5s cubic |
| Modal scale-in | `scale(0.95) → scale(1)` | 0.3s ease |
| Background blob | `float` keyframe (translateY + scale) | 10s infinite |
| Mesh background | `breath` keyframe (background-position) | 15s infinite |
| Chart skeleton | `animate-pulse` (Tailwind) | — |
| Dropdown scale-in | `scaleIn` keyframe | 0.2s cubic |
| Alert slide-down | `slideDown` keyframe | 0.3s cubic |

---

## 8. Manajemen State

| State | Lokasi | Persistence |
|-------|--------|-------------|
| User session | `localStorage["user"]` | Sampai logout/clear |
| Cache data pencarian | In-memory (variabel `search.js`) | TTL 2 menit |
| Cache data referensi | `sessionStorage["sisurat_ref_*"]` | TTL 10 menit ← **BARU** |
| Tab aktif (master) | In-memory | Per-session |
| Tab aktif (referensi) | In-memory (`currentTab`) | Per-session ← **BARU** |
| Data referensi saat ini | In-memory (`currentData`, `filteredData`) | Per-session ← **BARU** |
| Sort state (kolom) | In-memory (per tab) | Per-session |
| Kolom visible | In-memory | Per-session |
| View mode (grid/list) | In-memory | Per-session |
| Filter panel state | CSS class `hidden` | Per-session |

---

## 9. Penanganan Error

| Skenario | Penanganan |
|----------|------------|
| Login gagal | Tampilkan `#msg` dengan teks error dari API |
| Fetch API gagal | Console error, render empty state dengan pesan informatif |
| Upload file > 20MB | Toast error + reset form upload (via `validateFileSize`) |
| Upload chunk gagal | Throw error dengan pesan chunk ke-N — ditangkap caller |
| Upload file gagal | Toast error + reset form upload |
| No data (pencarian) | Render empty state card dengan ilustrasi |
| No data (referensi) | `#ref-empty` — ikon inbox + pesan "Belum ada data" |
| Loading state | Spinner `fa-circle-notch fa-spin` di container hasil |
| localStorage corrupt | `try/catch` di `getStoredUser()`, return null & redirect |
| sessionStorage penuh | `try/catch` dalam `fetchRef()` — abaikan penyimpanan cache |

---

## 10. Aksesibilitas & SEO

### 10.1 Praktik Aksesibilitas
- `lang="id"` pada semua halaman
- `alt` text pada semua gambar/logo
- `aria-label` pada tombol hamburger menu
- `required` attribute pada form login dan piagam
- Focus styles: `focus:border-[#00ADB5] focus:ring-4`

### 10.2 SEO
| Halaman | `<title>` |
|---------|-----------|
| index.html | SISURAT - Platform Manajemen Modern |
| login.html | Login \| Edisi Premium SISURAT |
| dashboard.html | Dashboard \| SISURAT Premium |
| cari.html | Pencarian \| SISURAT Premium |
| master.html | Master Data \| SISURAT Premium |
| laporan.html | Ekspor & Laporan \| SISURAT Premium |
| piagam.html | Upload Piagam \| SISURAT |
| referensi.html | Kelola Referensi \| SISURAT Premium ← **BARU** |

---

## 11. Dependensi Eksternal

| Layanan | Fungsi | Catatan |
|---------|--------|---------|
| Google Apps Script | REST API backend | Single endpoint URL di `api.js` |
| Google Drive | Penyimpanan file dokumen & TTD | 3 Folder ID berbeda (masuk/keluar/piagam-ttd) |
| Google Sheets | Database dokumen, user, & referensi | Diakses via Apps Script; tabel baru: `ref_sekolah`, `ref_pengambilan`, `ref_jenis_perlombaan` |
| Google Forms | Input surat masuk/keluar eksternal | Link langsung dari Dashboard |
| TailwindCSS CDN | Styling framework | Tidak tree-shaken |
| Font Awesome CDN | Icon library | v6.0.0-beta3 |
| Google Fonts CDN | Tipografi | Outfit + Inter |
| Chart.js CDN | Visualisasi data | v4.4.0 |

---

## 12. Batasan & Risiko Saat Ini

| Batasan | Dampak | Status / Rekomendasi |
|---------|--------|----------------------|
| TailwindCSS via CDN (tidak build) | Bundle besar, semua class dimuat | Tetap — gunakan Vite + Tailwind CLI saat siap produksi |
| Auth hanya berbasis `localStorage` | Rentan XSS jika ada script injection | Tetap — tambahkan server-side session validasi |
| Tidak ada pagination server-side | Semua data di-fetch sekaligus | Tetap — pertimbangkan cursor-based pagination |
| ~~CSS tersebar di `<style>` inline per halaman~~ | ~~Sulit maintenance konsistensi~~ | ✅ **SELESAI** — Dikerjakan di v2.0, CSS dipusatkan ke `css/style.css` |
| ~~File di-encode Base64 via JS (batas ~5MB)~~ | ~~Upload file besar gagal~~ | ✅ **SELESAI** — Chunked upload + kompresi gambar diimplementasi di `api.js` |
| GAS Actions `upload_chunk` & `finalize_upload` bergantung PropertiesService | Batas 500 KB per properti | Chunk 350 KB → Base64 ≈ 467 KB, aman di bawah limit |
| Tidak ada service worker / offline mode | Butuh koneksi internet terus | Pertimbangkan PWA untuk masa depan |

---

## 13. Roadmap Fitur Frontend

| Prioritas | Fitur | Status |
|-----------|-------|--------|
| ✅ Selesai | Sentralisasi CSS ke `css/style.css` | v2.0 |
| ✅ Selesai | Chunked file upload (bypass batas 5MB) + kompresi gambar | v2.0 |
| ✅ Selesai | Halaman Kelola Referensi (`referensi.html` + `ref-crud.js`) | v2.0 |
| ✅ Selesai | Cache referensi via `sessionStorage` dengan TTL 10 menit | v2.0 |
| 🔴 Tinggi | Notifikasi push untuk surat masuk baru | Belum dimulai |
| 🔴 Tinggi | Dark mode toggle | Belum dimulai |
| 🟠 Sedang | Advanced filter & sorting di halaman Cari | Belum dimulai |
| 🟠 Sedang | Print preview & cetak dokumen langsung | Belum dimulai |
| 🟡 Rendah | PWA (offline support) | Belum dimulai |
| 🟡 Rendah | Animasi page transition | Belum dimulai |

---

## 14. Checklist Kualitas Frontend

- [x] Semua halaman protected memanggil `requireAuth()` saat `DOMContentLoaded`
- [x] Tidak ada hardcode `BASE_URL` di luar `api.js`
- [x] Semua event pencarian menggunakan debounce (≥ 300ms)
- [x] Semua operasi write/delete diikuti `invalidateCache()` / `invalidateRef()`
- [x] Toast notification tampil pada setiap operasi C/U/D
- [x] Sidebar mobile dapat ditutup via overlay klik
- [x] Form tidak boleh submit ulang saat loading (disable tombol)
- [x] Empty state ditampilkan saat data kosong (`#ref-empty`, empty state cards)
- [x] Semua gambar/file memiliki `alt` attribute
- [x] Responsive diuji di 375px, 768px, dan 1280px
- [x] CSS disentralisasi ke `css/style.css` (tidak ada `<style>` duplikat per halaman)
- [x] Upload file besar menggunakan chunked upload (tidak lagi Base64 langsung) untuk menghindari batas ukuran
- [x] Data dropdown piagam diambil dari tabel referensi yang dapat dikelola admin
- [ ] Navigasi sidebar semua halaman sudah konsisten mencantumkan item "Kelola Referensi"

---

*Dokumen ini diperbarui berdasarkan analisis lengkap kodebase SISURAT-1 pada tanggal 2026-04-13.*
*Versi sebelumnya: v1.0 (2026-03-26).*
*Untuk pembaruan, perbarui versi dokumen, tanggal, dan tabel Changelog di bagian header.*
