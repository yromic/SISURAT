# Setup Panduan Pengembangan SISURAT

Langkah-langkah berikut wajib dijalankan setelah melakukan clone repositori untuk pertama kalinya.

## Setup (Wajib setelah clone)

1. Pastikan Node.js sudah terinstal di sistem Anda.
2. Jalankan instalasi dependensi:
   ```bash
   npm install
   ```
3. Lakukan build CSS pertama kali:
   ```bash
   npm run build:css
   ```

## Pengembangan (Development)

Untuk mendeteksi perubahan kelas utilitas Tailwind secara dinamis saat melakukan pengcodingan, jalankan watcher:
```bash
npm run watch:css
```
Proses ini akan memperbarui berkas `css/output.css` secara otomatis setiap kali Anda menyimpan berkas HTML atau JS.
