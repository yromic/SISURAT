# Blueprint Refactor SISURAT (Tanpa Ubah UI)

## Tujuan
- Memecah logika JavaScript per domain agar mudah dirawat.
- Menyatukan `BASE_URL` dan aturan mapping tanggal agar konsisten.
- Mengurangi beban request halaman pencarian dengan cache + debounce.

## Struktur File
```text
SISURAT-1/
  index.html
  login.html
  dashboard.html
  cari.html
  piagam.html
  master.html         ← Master Data (Piagam | Surat Masuk | Surat Keluar)
  laporan.html        ← Laporan Rekapitulasi (CSV | PDF | Email)
  css/
    style.css
  js/
    api.js            ← BASE_URL, TABLE_CONFIG, CRUD, exportCsv, invalidateCache
    auth.js           ← requireAuth, isSuperAdmin, logoutToHome
    login.js
    dashboard.js
    search.js
    piagam.js
    master.js         ← DataTable + Modal Form + Canvas TTD
    laporan.js        ← Filter + Download CSV/PDF + Kirim Email
```

## Tanggung Jawab Modul

### `js/api.js`
- Satu-satunya sumber `BASE_URL`.
- Satu-satunya sumber mapping tabel dan field tanggal (`TABLE_CONFIG`).
- Fungsi akses data:
  - `fetchTable(table)`
  - `fetchAllTables()`
  - `login(username, password)`
  - `savePiagam(data)`
- Fungsi util tanggal:
  - `parseDate(value)`
  - `normalizeRecord(record, table)`

### `js/auth.js`
- Manajemen session user di `localStorage`.
- Guard halaman private:
  - `requireAuth()`
- Logout:
  - `logoutToHome()`

### `js/login.js`
- Proses login UI.
- Simpan user ke storage via `auth.js`.

### `js/dashboard.js`
- Load dan render metrik dashboard.
- Render chart utama + monthly chart.
- Render aktivitas terbaru.

### `js/search.js`
- Load data pencarian dari API modul.
- Cache in-memory dataset pencarian (TTL 2 menit).
- Debounce input keyword (300 ms).
- Filter + sort + render hasil pencarian.
- Detail modal preview.

### `js/piagam.js`
- Kontrol canvas tanda tangan.
- Validasi form.
- Submit piagam melalui API modul.

## Kontrak Data Normalisasi
Setiap data hasil API dinormalisasi ke bentuk:
- `jenis`: label dokumen (`Surat Masuk`, `Surat Keluar`, `Piagam`)
- `tanggal`: field tanggal terpilih berdasarkan mapping tabel
- `_table`: nama tabel asal data

## Pola Pengembangan Fitur Berikutnya
1. Tambah aksi API baru di `js/api.js` dulu.
2. Kalau butuh auth/role, tambah helper di `js/auth.js`.
3. Implementasi UI per halaman tetap di file page-specific (`js/*.js` sesuai halaman).
4. Hindari menulis ulang `BASE_URL` atau mapping tanggal di file lain.
5. Untuk fitur pencarian berat, gunakan cache yang sudah ada; tambah invalidasi cache jika ada fitur write/update/delete.

## Checklist Saat Menambah Fitur
- Tidak ada hardcode endpoint baru di HTML.
- Tidak ada duplikasi aturan tanggal antar halaman.
- Tidak ada event pencarian yang memanggil API per ketikan tanpa debounce.
- Handler inline (`onclick`) tetap mengarah ke fungsi global yang disiapkan file halaman.
