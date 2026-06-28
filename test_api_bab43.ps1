# =============================================================================
# SISURAT — Script Pengujian API Backend Otomatis
# Tujuan  : Bab 4.3 - Evaluasi Pengujian Fungsionalitas API & Validasi Keamanan
# Pengujian:
#   [TC-01] Login & Sesi: Login akun Operator Divisi A
#   [TC-02] Keamanan Antar-Divisi: Operator Divisi A akses data Divisi B -> ERR_403_DIVISI
#   [TC-03] Session Expire: Request tanpa token -> ERR_401_SESSION
#   [TC-04] Chunked Upload [Chunk 1]: Upload kepingan berkas Base64 ke cache
#   [TC-05] Chunked Upload [Chunk 2]: Upload kepingan kedua ke cache
#   [TC-06] Finalize Upload: Penyatuan chunk -> Google Drive (bukti anti-timeout)
# =============================================================================

# --- KONFIGURASI: GANTI NILAI INI SEBELUM DIJALANKAN -------------------------
$API_URL     ="https://script.google.com/macros/s/AKfycbz5Te6ausn2hmEF6qybuVppFQLUuuu5Vk8A3XCojzYfo-eDd-n4alxK8k9hZBBwNIo_uQ/exec";

# Contoh: "https://script.google.com/macros/s/AKfycbxXXX.../exec"

# Akun Operator Divisi A (misal: DIKDAS)
$USER_A_USERNAME = "miftah"
$USER_A_PASSWORD = "miftah"
$DIVISI_A        = "DIKDAS"

# Divisi B yang akan dicoba diserang oleh akun Divisi A
$DIVISI_B        = "PAUD2"
# ------------------------------------------------------------------------------

$OUTPUT_FILE = "$PSScriptRoot\laporan_pengujian_bab43.json"
$results     = @()
$TOKEN_A     = ""

function Invoke-API {
    param (
        [string]$TestId,
        [string]$Deskripsi,
        [hashtable]$Body
    )
    Write-Host "`n[$TestId] $Deskripsi ..." -ForegroundColor Cyan
    $bodyJson = $Body | ConvertTo-Json -Depth 10 -Compress
    try {
        $start    = Get-Date
        $response = Invoke-RestMethod -Uri $API_URL -Method POST `
                        -ContentType "application/json; charset=utf-8" `
                        -Body ([System.Text.Encoding]::UTF8.GetBytes($bodyJson)) `
                        -ErrorAction Stop
        $elapsed  = ((Get-Date) - $start).TotalMilliseconds
        $status   = if ($response.status -eq "success") { "LULUS" } else { "DITOLAK" }
        $color    = if ($status -eq "LULUS") { "Green" } else { "Yellow" }
        Write-Host "  Status  : $status ($($response.status))" -ForegroundColor $color
        Write-Host "  Kode    : $($response.code)" -ForegroundColor Gray
        Write-Host "  Waktu   : $([math]::Round($elapsed, 2)) ms" -ForegroundColor Gray
        return @{
            test_id     = $TestId
            deskripsi   = $Deskripsi
            hasil       = $status
            status_api  = $response.status
            kode_error  = $response.code
            pesan       = $response.message
            waktu_ms    = [math]::Round($elapsed, 2)
            timestamp   = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
        }
    } catch {
        Write-Host "  ERROR HTTP: $($_.Exception.Message)" -ForegroundColor Red
        return @{
            test_id     = $TestId
            deskripsi   = $Deskripsi
            hasil       = "GAGAL_HTTP"
            kode_error  = "HTTP_ERROR"
            pesan       = $_.Exception.Message
            waktu_ms    = 0
            timestamp   = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
        }
    }
}

Write-Host "============================================================" -ForegroundColor Magenta
Write-Host " SISURAT -- Pengujian API Backend (Bab 4.3)" -ForegroundColor Magenta
Write-Host " Target: $API_URL" -ForegroundColor Magenta
Write-Host " Waktu : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Magenta
Write-Host "============================================================" -ForegroundColor Magenta

# --- [TC-01] LOGIN OPERATOR DIVISI A ------------------------------------------
Write-Host "`n[TC-01] Login Operator Divisi A ($DIVISI_A)..." -ForegroundColor Cyan
$bodyJson = @{
    action = "login"
    data   = @{ username = $USER_A_USERNAME; password = $USER_A_PASSWORD }
} | ConvertTo-Json -Depth 5 -Compress

try {
    $start    = Get-Date
    $loginRes = Invoke-RestMethod -Uri $API_URL -Method POST `
                    -ContentType "application/json; charset=utf-8" `
                    -Body ([System.Text.Encoding]::UTF8.GetBytes($bodyJson))
    $elapsed  = ((Get-Date) - $start).TotalMilliseconds

    # API mengembalikan field 'session_token' (bukan 'token') dan data user di dalam objek 'user'
    if ($loginRes.status -eq "success" -and $loginRes.session_token) {
        $TOKEN_A = $loginRes.session_token
        $userObj = $loginRes.user
        Write-Host "  LULUS -- Token: $($TOKEN_A.Substring(0,8))..." -ForegroundColor Green
        Write-Host "  Role   : $($userObj.role)" -ForegroundColor Gray
        Write-Host "  Divisi : $($userObj.divisi_id)" -ForegroundColor Gray
        Write-Host "  Nama   : $($userObj.nama)" -ForegroundColor Gray
        $results += @{
            test_id    = "TC-01"
            deskripsi  = "Login Operator Divisi A ($DIVISI_A)"
            hasil      = "LULUS"
            status_api = $loginRes.status
            kode_error = ""
            pesan      = "Token berhasil diperoleh (session_token)"
            role       = $userObj.role
            divisi_id  = $userObj.divisi_id
            nama       = $userObj.nama
            token_preview = $TOKEN_A.Substring(0,8) + "..."
            waktu_ms   = [math]::Round($elapsed, 2)
            timestamp  = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
        }
    } else {
        Write-Host "  GAGAL -- $($loginRes.message)" -ForegroundColor Red
        $results += @{
            test_id    = "TC-01"
            deskripsi  = "Login Operator Divisi A ($DIVISI_A)"
            hasil      = "GAGAL"
            status_api = $loginRes.status
            pesan      = $loginRes.message
            waktu_ms   = [math]::Round($elapsed, 2)
            timestamp  = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
        }
        Write-Host "`n[PERHATIAN] TC-02 s.d. TC-06 membutuhkan token dari TC-01." -ForegroundColor Yellow
        Write-Host "Periksa username/password di bagian konfigurasi atas lalu coba lagi." -ForegroundColor Yellow
        $results | ConvertTo-Json -Depth 10 | Out-File -FilePath $OUTPUT_FILE -Encoding utf8
        exit
    }
} catch {
    Write-Host "  ERROR HTTP: $($_.Exception.Message)" -ForegroundColor Red
    exit
}

# --- [TC-02] VALIDASI KEAMANAN ANTAR-DIVISI -----------------------------------
# Operator A (DIKDAS) mencoba mengakses tabel milik Divisi B (PAUD)
# Harapan: sistem menolak dengan kode ERR_403_DIVISI
$results += Invoke-API -TestId "TC-02" `
    -Deskripsi "Serangan Lintas Divisi: Operator $DIVISI_A akses tabel ${DIVISI_B}_surat_masuk (harap: ERR_403_DIVISI)" `
    -Body @{
        action        = "get_data"
        session_token = $TOKEN_A
        data          = @{
            session_token = $TOKEN_A
            table         = "${DIVISI_B}_surat_masuk"
        }
    }

$tc02 = $results[-1]
if ($tc02.kode_error -eq "ERR_403_DIVISI") {
    Write-Host "  [VALIDASI OK] Sistem berhasil memblokir akses lintas divisi!" -ForegroundColor Green
} else {
    Write-Host "  [VALIDASI GAGAL] Sistem TIDAK memblokir akses lintas divisi!" -ForegroundColor Red
}

# --- [TC-03] VALIDASI SESI TANPA TOKEN ----------------------------------------
$results += Invoke-API -TestId "TC-03" `
    -Deskripsi "Akses tanpa Session Token sama sekali (harap: ERR_401_SESSION)" `
    -Body @{
        action = "get_data"
        data   = @{ table = "${DIVISI_A}_surat_masuk" }
    }

# PENTING: Chunk base64 TIDAK boleh berakhir dengan padding (==)
# karena server menggabungkan semua chunk menjadi satu string sebelum decode.
# "SGVsbG8g" = "Hello " dan "V29ybGQh" = "World!" — keduanya tanpa padding.
# Gabungan: "SGVsbG8gV29ybGQh" = "Hello World!" (valid base64)
$UPLOAD_ID           = [System.Guid]::NewGuid().ToString()
$DUMMY_BASE64_CHUNK0 = "SGVsbG8g"   # Decode: "Hello " — 6 bytes, tanpa padding
$DUMMY_BASE64_CHUNK1 = "V29ybGQh"   # Decode: "World!" — 6 bytes, tanpa padding

$results += Invoke-API -TestId "TC-04" `
    -Deskripsi "Chunked Upload -- Chunk-0 dikirim ke server CacheService" `
    -Body @{
        action        = "upload_chunk"
        session_token = $TOKEN_A
        data          = @{
            session_token = $TOKEN_A
            uploadId      = $UPLOAD_ID
            chunkIndex    = 0
            chunkBase64   = $DUMMY_BASE64_CHUNK0
        }
    }

# --- [TC-05] CHUNKED UPLOAD - CHUNK 1 -----------------------------------------
$results += Invoke-API -TestId "TC-05" `
    -Deskripsi "Chunked Upload -- Chunk-1 dikirim ke server CacheService" `
    -Body @{
        action        = "upload_chunk"
        session_token = $TOKEN_A
        data          = @{
            session_token = $TOKEN_A
            uploadId      = $UPLOAD_ID
            chunkIndex    = 1
            chunkBase64   = $DUMMY_BASE64_CHUNK1
        }
    }

# --- [TC-06] FINALIZE UPLOAD - PENYATUAN CHUNK --------------------------------
Write-Host "`n[TC-06] Finalize Upload -- Menyatukan 2 chunk ke Google Drive..." -ForegroundColor Cyan
$finalBody = @{
    action        = "finalize_upload"
    session_token = $TOKEN_A
    data          = @{
        session_token = $TOKEN_A
        uploadId      = $UPLOAD_ID
        totalChunks   = 2
        fileName      = "test_upload_bab43_$(Get-Date -Format 'yyyyMMdd_HHmmss').txt"
        mimeType      = "text/plain"
        # folderId eksplisit sebagai fallback jika drive_folder_id divisi belum dikonfigurasi
        # Ganti dengan Folder Drive ID yang bisa diakses oleh akun script ini jika perlu
        folderId      = "root"
    }
} | ConvertTo-Json -Depth 10 -Compress

try {
    $start    = Get-Date
    $finalRes = Invoke-RestMethod -Uri $API_URL -Method POST `
                    -ContentType "application/json; charset=utf-8" `
                    -Body ([System.Text.Encoding]::UTF8.GetBytes($finalBody))
    $elapsed  = ((Get-Date) - $start).TotalMilliseconds
    $status   = if ($finalRes.status -eq "success") { "LULUS" } else { "DITOLAK" }
    $color    = if ($status -eq "LULUS") { "Green" } else { "Red" }
    Write-Host "  Status : $status" -ForegroundColor $color
    Write-Host "  Waktu  : $([math]::Round($elapsed, 2)) ms (batas GAS = 360.000 ms)" -ForegroundColor Gray
    if ($finalRes.fileUrl) {
        Write-Host "  File URL: $($finalRes.fileUrl)" -ForegroundColor Cyan
    }
    $results += @{
        test_id             = "TC-06"
        deskripsi           = "Finalize Upload -- Gabungkan chunk + simpan ke Google Drive"
        hasil               = $status
        status_api          = $finalRes.status
        kode_error          = $finalRes.code
        pesan               = $finalRes.message
        file_url            = $finalRes.fileUrl
        waktu_ms            = [math]::Round($elapsed, 2)
        batas_gas_ms        = 360000
        persentase_dari_batas = "$([math]::Round(($elapsed / 360000) * 100, 4))% dari batas runtime GAS"
        timestamp           = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
    }
} catch {
    Write-Host "  ERROR HTTP: $($_.Exception.Message)" -ForegroundColor Red
    $results += @{
        test_id   = "TC-06"
        deskripsi = "Finalize Upload -- Gabungkan chunk + simpan ke Google Drive"
        hasil     = "GAGAL_HTTP"
        pesan     = $_.Exception.Message
        waktu_ms  = 0
        timestamp = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
    }
}

# --- RINGKASAN HASIL -----------------------------------------------------------
Write-Host "`n============================================================" -ForegroundColor Magenta
Write-Host " RINGKASAN HASIL PENGUJIAN" -ForegroundColor Magenta
Write-Host "============================================================" -ForegroundColor Magenta

$lulus   = @($results | Where-Object { $_.hasil -eq "LULUS" }).Count
$ditolak = @($results | Where-Object { $_.hasil -eq "DITOLAK" }).Count
$gagal   = @($results | Where-Object { $_.hasil -like "GAGAL*" }).Count

foreach ($r in $results) {
    $icon  = switch ($r.hasil) { "LULUS" { "[OK]" } "DITOLAK" { "[BLOK]" } default { "[X]" } }
    $color = switch ($r.hasil) { "LULUS" { "Green" } "DITOLAK" { "Yellow" } default { "Red" } }
    Write-Host "  $icon [$($r.test_id)] $($r.deskripsi.Substring(0, [Math]::Min(70, $r.deskripsi.Length)))..." -ForegroundColor $color
    if ($r.kode_error) {
        Write-Host "       Kode: $($r.kode_error)  |  Waktu: $($r.waktu_ms) ms" -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "  Total LULUS            : $lulus dari $($results.Count) test case" -ForegroundColor Green
Write-Host "  Total DITOLAK (sengaja): $ditolak (keamanan berfungsi)" -ForegroundColor Yellow
Write-Host "  Total GAGAL            : $gagal" -ForegroundColor Red

# --- EKSPOR LAPORAN JSON ------------------------------------------------------
$laporan = @{
    judul              = "Laporan Pengujian API Backend SISURAT -- Bab 4.3"
    waktu_uji          = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
    target_url         = $API_URL
    total_tc           = $results.Count
    lulus              = $lulus
    ditolak_terencana  = $ditolak
    gagal              = $gagal
    hasil_detail       = $results
}

$laporan | ConvertTo-Json -Depth 10 | Out-File -FilePath $OUTPUT_FILE -Encoding utf8
Write-Host "`n  Laporan JSON disimpan di: $OUTPUT_FILE" -ForegroundColor Cyan
Write-Host "============================================================`n" -ForegroundColor Magenta
