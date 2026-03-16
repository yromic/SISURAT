var ss = SpreadsheetApp.getActiveSpreadsheet();

var headerMap = {
  "nomor surat": "nomor_surat",
  "no surat": "nomor_surat",
  "tanggal surat": "tanggal_surat",
  "asal surat": "asal_surat",
  perihal: "perihal",
  "upload file": "upload_file",
  "tanggal surat diterima": "tanggal_terima",
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
};

function doGet(e) {
  var action = e.parameter.action;

  if (action == "get_data") {
    return getData(e.parameter.table);
  }

  return ContentService.createTextOutput("API Arsip Kursis Online").setMimeType(
    ContentService.MimeType.TEXT,
  );
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return responseJSON({ status: "error", message: "Data post kosong" });
    }

    var params = JSON.parse(e.postData.contents);
    var action = params.action;

    if (action == "simpan_piagam") {
      return simpanPiagam(params.data);
    } else if (action == "login") {
      return cekLogin(params.data);
    }

    return responseJSON({ status: "error", message: "Action tidak dikenal" });
  } catch (error) {
    return responseJSON({
      status: "error",
      message: "Error Server: " + error.toString(),
    });
  }
}

function cekLogin(data) {
  var sheet = ss.getSheetByName("users");
  var dataUsers = sheet.getDataRange().getDisplayValues();

  for (var i = 1; i < dataUsers.length; i++) {
    var row = dataUsers[i];
    var dbUser = row[0];
    var dbPass = row[1];
    var dbNama = row[3];

    if (dbUser == data.username && dbPass == data.password) {
      return responseJSON({
        status: "success",
        message: "Login Berhasil",
        user: {
          username: dbUser,
          nama: dbNama,
          role: row[2],
        },
      });
    }
  }

  return responseJSON({
    status: "error",
    message: "Username atau Password salah!",
  });
}

function normalizeHeader(header) {
  return header
    .toLowerCase()
    .trim()
    .replace(/\(.*?\)/g, "")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getData(tableName) {
  if (tableName == "users") {
    return responseJSON({ status: "error", message: "Akses ditolak" });
  }

  var sheet = ss.getSheetByName(tableName);
  if (!sheet) {
    return responseJSON({
      status: "error",
      message: "Tabel tidak ditemukan: " + tableName,
    });
  }

  var data = sheet.getDataRange().getDisplayValues();
  if (data.length <= 1) {
    return responseJSON({ status: "success", data: [] });
  }

  var headers = data[0];
  var rows = data.slice(1);

  var result = rows.map(function (row) {
    var obj = {};
    headers.forEach(function (header, index) {
      var clean = normalizeHeader(header);

      var finalKey = headerMap[clean]
        ? headerMap[clean]
        : clean.replace(/\s+/g, "_");

      if (obj[finalKey]) {
        obj[finalKey + "_2"] = row[index];
      } else {
        obj[finalKey] = row[index];
      }
    });
    return obj;
  });

  return responseJSON({ status: "success", data: result });
}

function responseJSON(object) {
  return ContentService.createTextOutput(JSON.stringify(object)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

function simpanPiagam(dataInput) {
  if (!dataInput) {
    return responseJSON({
      status: "error",
      message: "Data Input tidak diterima oleh fungsi simpanPiagam.",
    });
  }

  var sheet = ss.getSheetByName("db_piagam");

  var linkTTD = "";

  if (dataInput.ttd_base64 && dataInput.ttd_base64.includes("base64,")) {
    try {
      var splitBase64 = dataInput.ttd_base64.split(",");
      var imageBlob = Utilities.newBlob(
        Utilities.base64Decode(splitBase64[1]),
        "image/png",
        "ttd_" + Date.now() + ".png",
      );

      var folderId = "1GlZK0frL6oZwmcP_Pqta3zFwrggK5Mng";
      var folder = DriveApp.getFolderById(folderId);

      var file = folder.createFile(imageBlob);
      file.setSharing(
        DriveApp.Access.ANYONE_WITH_LINK,
        DriveApp.Permission.VIEW,
      );
      var fileId = file.getId();
      linkTTD = "https://drive.google.com/uc?export=download&id=" + fileId;
    } catch (err) {
      return responseJSON({
        status: "error",
        message: "Gagal Upload TTD: " + err.toString(),
      });
    }
  }

  var newRow = [
    Utilities.getUuid(),
    dataInput.nama_pengambil || "-",
    dataInput.jabatan || "-",
    dataInput.unit_kerja || "-",
    "'" + (dataInput.npsn || "-"),
    dataInput.pengambilan || "-",
    dataInput.jenis_perlombaan || "-",
    dataInput.tahun_perlombaan || "-",
    dataInput.nama_siswa || "-",
    dataInput.asal_sekolah || "-",
    linkTTD,
  ];

  sheet.appendRow(newRow);

  return responseJSON({
    status: "success",
    message: "Data Berhasil Disimpan!",
  });
}

function pancingIzin() {
  var folder = DriveApp.getRootFolder();
  folder.createFile("pancingan.txt", "Tes Izin", MimeType.PLAIN_TEXT);
  console.log("✅ Izin CREATE FILE berhasil didapatkan!");
}
