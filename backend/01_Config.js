// ============================================================
// SISURAT — Google Apps Script Backend Configuration
// ============================================================

var ss = SpreadsheetApp.getActiveSpreadsheet();

var headerMap = {
    "timestamp": "timestamp",
    "email address": "email_address",
    "nama pengupload": "nama_pengupload",
    "nomor surat": "nomor_surat",
    "no surat": "nomor_surat",
    "tanggal surat": "tanggal_surat",
    "asal surat": "asal_surat",
    perihal: "perihal",
    "upload file": "upload_file",
    "tanggal surat diterima": "tanggal_diterima",
    "tanggal terima": "tanggal_diterima",
    "tanggal_terima": "tanggal_diterima",
    "tanggal surat di share": "tanggal_share",

    "nama pengambil": "nama_pengambil",
    jabatan: "jabatan",
    "unit kerja": "unit_kerja",
    npsn: "npsn",
    pengambilan: "pengambilan",
    "jenis perlombaan": "jenis_perlombaan",
    "tahun perlombaan": "tahun_perlombaan",
    "nama siswal": "nama_siswa",
    "asal sekolah": "asal_sekolah",
    "ttd pengambil": "ttd_pengambil",

    "nama sekolah": "nama_sekolah",
    nama: "nama",
    aktif: "aktif",
};

var DRIVE_FOLDERS = {
    db_surat_masuk: "18hTuZTOgGuB1bfaEq-5VK8n-7g04Ku6KwKEx5DZ5X5HPbGsexHgx-6Tu-Lj93jQKD6rMdYIO",
    db_surat_keluar: "1V190s7wG2iJE4v5JDe5uvhMkziYOnTzJRQlpY23VVr4GWA92RPwI21vp8E8m9znHsXD5qsXj",
    db_piagam_ttd: "1Mg8F5JDGfQmZvJORrlAEKPi-Y6BIlUBG",
};

var DRIVE_FOLDER_MAP = {
    db_surat_masuk: "18hTuZTOgGuB1bfaEq-5VK8n-7g04Ku6KwKEx5DZ5X5HPbGsexHgx-6Tu-Lj93jQKD6rMdYIO",
    db_surat_keluar: "1V190s7wG2iJE4v5JDe5uvhMkziYOnTzJRQlpY23VVr4GWA92RPwI21vp8E8m9znHsXD5qsXj",
    db_piagam_ttd: "1Mg8F5JDGfQmZvJORrlAEKPi-Y6BIlUBG",
};

// WAJIB: set ke true sebelum deploy production, false untuk dev lokal
var IS_PRODUCTION = true;

var ALLOWED_ORIGINS = IS_PRODUCTION
  ? [
      "https://sisuratpkl.vercel.app"
      // tambahkan custom domain lain jika ada
    ]
  : [
      "https://sisuratpkl.vercel.app",
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "http://localhost:3000",
      "http://127.0.0.1:3000"
    ];

var DRIVE_FOLDER_ID = "1Mg8F5JDGfQmZvJORrlAEKPi-Y6BIlUBG";

var SESSION_TTL_SECONDS = 2 * 60 * 60;
var LOGIN_FAIL_LIMIT = 5;
var LOGIN_BLOCK_SECONDS = 15 * 60;

var RBAC_RULES = {
    "get_data:db_surat_masuk":  ["super_admin", "admin_divisi", "admin", "operator"],
    "get_data:db_surat_keluar": ["super_admin", "admin_divisi", "admin", "operator"],
    "get_data:db_piagam":       ["super_admin", "admin_divisi", "admin", "operator"],
    "get_data:db_users":        ["super_admin", "admin_divisi", "admin"],
    "get_data:ref_sekolah":     ["super_admin", "admin_divisi", "admin", "operator"],
    "get_data:ref_pengambilan": ["super_admin", "admin_divisi", "admin", "operator"],
    "get_data:ref_jenis_perlombaan": ["super_admin", "admin_divisi", "admin", "operator"],
    "read:surat_masuk":         ["super_admin", "admin_divisi", "admin", "operator"],
    "read:surat_keluar":        ["super_admin", "admin_divisi", "admin", "operator"],
    "read:piagam":              ["super_admin", "admin_divisi", "admin", "operator"],
    "read:ref_pengambilan":     ["super_admin", "admin_divisi", "admin", "operator"],
    "read:ref_jenis":           ["super_admin", "admin_divisi", "admin", "operator"],
    "read:ref_sekolah":         ["super_admin", "admin_divisi", "admin", "operator"],
    "read:ref_jenis_perlombaan":["super_admin", "admin_divisi", "admin", "operator"],
    "read:db_users":            ["super_admin", "admin_divisi", "admin"],
    "read:db_summary":          ["super_admin", "admin_divisi", "admin", "operator"],
    "read:db_audit_log":        ["super_admin", "admin_divisi", "admin"],
    "create:surat_masuk":       ["super_admin", "admin_divisi", "admin", "operator"],
    "create:surat_keluar":      ["super_admin", "admin_divisi", "admin", "operator"],
    "create:piagam":            ["super_admin", "admin_divisi", "admin", "operator"],
    "create:ref_pengambilan":   ["super_admin", "admin_divisi", "admin", "operator"],
    "create:ref_jenis":         ["super_admin", "admin_divisi", "admin", "operator"],
    "create:ref_sekolah":       ["super_admin", "admin_divisi", "admin", "operator"],
    "update:surat_masuk":       ["super_admin", "admin_divisi", "admin"],
    "update:surat_keluar":      ["super_admin", "admin_divisi", "admin"],
    "update:piagam":            ["super_admin", "admin_divisi", "admin"],
    "update:ref_pengambilan":   ["super_admin", "admin_divisi", "admin"],
    "update:ref_jenis":         ["super_admin", "admin_divisi", "admin"],
    "update:ref_sekolah":       ["super_admin", "admin_divisi", "admin"],
    "delete:surat_masuk":       ["super_admin", "admin_divisi", "admin"],
    "delete:surat_keluar":      ["super_admin", "admin_divisi", "admin"],
    "delete:piagam":            ["super_admin", "admin_divisi", "admin"],
    "delete:ref_pengambilan":   ["super_admin", "admin_divisi", "admin"],
    "delete:ref_jenis":         ["super_admin", "admin_divisi", "admin"],
    "delete:ref_sekolah":       ["super_admin", "admin_divisi", "admin"],
    "manage_user:*":            ["super_admin", "admin_divisi", "admin"],
    "reset_password:*":         ["super_admin", "admin_divisi", "admin"],
    "init_divisi:db_divisi":    ["super_admin"],
    "retry_init_divisi:db_divisi": ["super_admin"],
    "cleanup_divisi:db_divisi": ["super_admin"],
    "deactivate_divisi:db_divisi": ["super_admin"],
    "hard_delete_divisi:db_divisi": ["super_admin"],
    "migrate_existing_records:db_divisi": ["super_admin"],
    "init_divisi:*":            ["super_admin"],
    "retry_init_divisi:*":      ["super_admin"],
    "cleanup_divisi:*":         ["super_admin"],
    "deactivate_divisi:*":      ["super_admin"],
    "hard_delete_divisi:*":      ["super_admin"],
    "migrate_existing_records:*": ["super_admin"],
};

var USER_TABLES = ["db_users", "users"];

var DB_DIVISI_HEADERS = ["id", "kode_divisi", "nama_divisi", "status", "drive_folder_id", "created_at", "created_by"];
var DB_USERS_HEADERS = [
    "username",
    "password",
    "role",
    "nama",
    "email",
    "role_id",
    "aktif",
    "divisi_id",
    "scope",
    "password_hash",
    "password_salt",
    "password_v",
];
var DB_AUDIT_LOG_HEADERS = ["timestamp", "actor", "role", "divisi_id", "action", "table_name", "record_id", "detail"];
var DB_SUMMARY_HEADERS = ["divisi_id", "total_surat_masuk", "total_surat_keluar", "total_piagam", "last_updated"];
var REF_SEKOLAH_HEADERS = ["id", "nama_sekolah", "npsn", "aktif"];
var SURAT_MASUK_HEADERS = ["id", "timestamp", "email_address", "nama_pengupload", "divisi_id", "asal_surat", "nomor_surat", "tanggal_surat", "perihal", "tanggal_diterima", "upload_file", "is_deleted", "deleted_at", "deleted_by"];
var SURAT_KELUAR_HEADERS = ["id", "timestamp", "email_address", "nama_pengupload", "divisi_id", "nomor_surat", "tanggal_surat", "perihal", "tanggal_share", "upload_file", "is_deleted", "deleted_at", "deleted_by"];
var PIAGAM_HEADERS = ["id", "timestamp", "email_address", "nama_pengupload", "divisi_id", "nama_pengambil", "jabatan", "unit_kerja", "npsn", "pengambilan", "jenis_perlombaan", "tahun_perlombaan", "nama_siswa", "asal_sekolah", "ttd_pengambil", "is_deleted", "deleted_at", "deleted_by"];
var REF_DIVISI_HEADERS = ["id", "nama", "aktif"];

var DIVISI_SHEET_HEADERS = {
    surat_masuk: SURAT_MASUK_HEADERS,
    surat_keluar: SURAT_KELUAR_HEADERS,
    piagam: PIAGAM_HEADERS,
    ref_pengambilan: REF_DIVISI_HEADERS,
    ref_jenis: REF_DIVISI_HEADERS,
};

var GLOBAL_SHEETS = {
    db_divisi: DB_DIVISI_HEADERS,
    db_users: DB_USERS_HEADERS,
    db_audit_log: DB_AUDIT_LOG_HEADERS,
    db_summary: DB_SUMMARY_HEADERS,
    ref_sekolah: REF_SEKOLAH_HEADERS,
    db_config: ["key", "value"],
};
