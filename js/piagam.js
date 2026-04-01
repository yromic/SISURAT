(function initPiagamPage(global) {
  "use strict";

  const { SisuratApi } = global;

  if (!SisuratApi) {
    console.error("Module API belum dimuat.");
    return;
  }

  let canvas = null;
  let ctx = null;
  let drawing = false;

  function resizeCanvas() {
    if (!canvas) {
      return;
    }
    const containerWidth = canvas.parentElement.clientWidth;
    canvas.width = containerWidth;
    canvas.height = 160;
  }

  function getCanvasCoordinates(event) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    let clientX;
    let clientY;

    if (event.touches && event.touches[0]) {
      clientX = event.touches[0].clientX;
      clientY = event.touches[0].clientY;
    } else {
      clientX = event.clientX;
      clientY = event.clientY;
    }

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }

  function startDrawing(event) {
    event.preventDefault();
    drawing = true;
    ctx.beginPath();
    const { x, y } = getCanvasCoordinates(event);
    ctx.moveTo(x, y);
  }

  function draw(event) {
    event.preventDefault();
    if (!drawing) {
      return;
    }

    const { x, y } = getCanvasCoordinates(event);
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#222831";
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function stopDrawing() {
    drawing = false;
    ctx.beginPath();
  }

  function clearCanvas() {
    if (!canvas || !ctx) {
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function showMessage(type, message) {
    const msgDiv = document.getElementById("msg");

    // Reset seluruh class untuk setup animasi
    msgDiv.className =
      "mt-6 p-5 rounded-2xl flex items-center gap-4 text-base font-bold transition-all duration-500 transform translate-y-4 opacity-0 border shadow-lg";

    // Hilangkan hidden agar elemen masuk ke dalam DOM
    msgDiv.classList.remove("hidden");

    // Trik trigger reflow agar animasi transisi CSS berjalan mulus
    void msgDiv.offsetWidth;

    if (type === "success") {
      msgDiv.classList.replace("translate-y-4", "translate-y-0");
      msgDiv.classList.replace("opacity-0", "opacity-100");
      msgDiv.classList.add(
        "bg-[#f0fdfa]",
        "text-[#0f766e]",
        "border-[#ccfbf1]",
      );
      msgDiv.innerHTML = `<i class="fas fa-check-circle text-2xl text-[#14b8a6]"></i><span>${message}</span>`;
    } else {
      msgDiv.classList.replace("translate-y-4", "translate-y-0");
      msgDiv.classList.replace("opacity-0", "opacity-100");
      msgDiv.classList.add(
        "bg-[#fef2f2]",
        "text-[#b91c1c]",
        "border-[#fee2e2]",
      );
      msgDiv.innerHTML = `<i class="fas fa-exclamation-circle text-2xl text-[#ef4444]"></i><span>${message}</span>`;
    }
  }

  function collectFormData() {
    return {
      nama_pengambil: document.getElementById("nama_pengambil").value,
      jabatan: document.getElementById("jabatan").value,
      unit_kerja: document.getElementById("unit_kerja").value,
      npsn: document.getElementById("npsn").value,
      pengambilan: document.getElementById("pengambilan").value,
      jenis_perlombaan: document.getElementById("jenis_perlombaan").value,
      tahun_perlombaan: document.getElementById("tahun_perlombaan").value,
      nama_siswa: document.getElementById("nama_siswa").value,
      asal_sekolah: document.getElementById("asal_sekolah").value,
      ttd_base64: canvas.toDataURL("image/png"),
    };
  }

  function isFormValid(data) {
    for (const key in data) {
      if (key === "ttd_base64") {
        continue;
      }
      if (!data[key]) {
        return false;
      }
    }
    return true;
  }

  async function submitData() {
    const submitBtn = document.getElementById("submitBtn");
    const data = collectFormData();

    if (!isFormValid(data)) {
      showMessage("error", "Mohon lengkapi semua isian formulir!");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML =
      '<i class="fas fa-spinner fa-spin text-xl"></i> MENGIRIM DATA...';

    try {
      const result = await SisuratApi.savePiagam(data);

      if (result.status === "success") {
        // 1. Tampilkan Banner Sukses
        showMessage("success", "Otentikasi Piagam Berhasil Disimpan!");
        document.getElementById("piagamForm").reset();
        clearCanvas();

        // 2. Kosongkan nilai pada Custom Dropdown
        if (document.getElementById("pengambilan_select")) {
          document.getElementById("pengambilan_select").value = "";
          document
            .getElementById("pengambilan_select")
            .removeAttribute("data-selected-value");
        }
        if (document.getElementById("jenis_perlombaan_select")) {
          document.getElementById("jenis_perlombaan_select").value = "";
          document
            .getElementById("jenis_perlombaan_select")
            .removeAttribute("data-selected-value");
        }
        if (document.getElementById("pengambilan_other_container"))
          document
            .getElementById("pengambilan_other_container")
            .classList.add("hidden");
        if (document.getElementById("jenis_perlombaan_other_container"))
          document
            .getElementById("jenis_perlombaan_other_container")
            .classList.add("hidden");

        // 3. Ubah Tombol Menjadi Status Berhasil (Hijau Premium)
        submitBtn.innerHTML =
          '<i class="fas fa-check-double text-xl"></i> BERHASIL DISIMPAN!';
        submitBtn.style.background =
          "linear-gradient(135deg, #10b981, #059669)";

        // 4. Sembunyikan pesan dan kembalikan tombol setelah 4 detik
        setTimeout(() => {
          const msgDiv = document.getElementById("msg");
          msgDiv.classList.replace("translate-y-0", "translate-y-4");
          msgDiv.classList.replace("opacity-100", "opacity-0");
          setTimeout(() => {
            msgDiv.classList.add("hidden");
          }, 500); // Waktu memudar sisa animasi

          // Kembalikan Tombol ke semula
          submitBtn.style.background = ""; // Reset inline CSS agar kembali ke style CSS bawaan Premium
          submitBtn.innerHTML =
            '<i class="fas fa-lock"></i> SIMPAN OTENTIKASI PIAGAM';
          submitBtn.disabled = false;
        }, 4000);
      } else {
        // Jika Server menolak/Gagal
        showMessage("error", result.message || "Gagal menyimpan data.");
        submitBtn.disabled = false;
        submitBtn.innerHTML =
          '<i class="fas fa-lock"></i> SIMPAN OTENTIKASI PIAGAM';
      }
    } catch (error) {
      // Jika terjadi masalah koneksi (Offline)
      console.error("Gagal menyimpan data piagam:", error);
      showMessage("error", "Terjadi kesalahan jaringan. Cek koneksi Anda.");
      submitBtn.disabled = false;
      submitBtn.innerHTML =
        '<i class="fas fa-lock"></i> SIMPAN OTENTIKASI PIAGAM';
    }
  }

  function bindCanvasEvents() {
    canvas.addEventListener("mousedown", startDrawing);
    canvas.addEventListener("mousemove", draw);
    canvas.addEventListener("mouseup", stopDrawing);
    canvas.addEventListener("mouseleave", stopDrawing);

    canvas.addEventListener("touchstart", startDrawing, { passive: false });
    canvas.addEventListener("touchmove", draw, { passive: false });
    canvas.addEventListener("touchend", stopDrawing);
    canvas.addEventListener("touchcancel", stopDrawing);
  }

  function bindFormEvents() {
    const inputs = document.querySelectorAll("input");
    inputs.forEach((input) => {
      input.addEventListener("input", () => {
        document.getElementById("msg").classList.add("hidden");
      });
    });
  }

  function init() {
    canvas = document.getElementById("canvas");
    if (!canvas) {
      return;
    }
    ctx = canvas.getContext("2d");
    resizeCanvas();
    bindCanvasEvents();
    bindFormEvents();

    // Panggil fungsi dropdown pencarian disini
    initSearchableDropdown();

    // Panggil Dropdown Custom baru:
    initCustomSelect(
      "pengambilan_select",
      "pengambilan_list",
      "pengambilan_icon",
      "pengambilan_other_container",
      "ref_pengambilan",
    );
    initCustomSelect(
      "jenis_perlombaan_select",
      "jenis_perlombaan_list",
      "jenis_perlombaan_icon",
      "jenis_perlombaan_other_container",
      "ref_jenis_perlombaan",
    );

    global.addEventListener("resize", resizeCanvas);
  }

  global.clearCanvas = clearCanvas;
  global.submitData = submitData;
  global.addEventListener("load", init);

  // Fungsi untuk menampilkan/menyembunyikan input manual
  global.toggleOtherInput = function (selectElem, containerId) {
    const container = document.getElementById(containerId);
    if (selectElem.value === "Other") {
      container.classList.remove("hidden");
    } else {
      container.classList.add("hidden");
    }
  };

  // Update fungsi collectFormData agar mengambil nilai dari select atau input manual
  function collectFormData() {
    // Ambil elemen
    const selectPengambilan = document.getElementById("pengambilan_select");
    const selectJenis = document.getElementById("jenis_perlombaan_select");

    // Ambil data-selected-value (contoh: "Piagam" atau "Other"). Jika kosong fallback ke .value
    let pengambilanVal =
      selectPengambilan.getAttribute("data-selected-value") ||
      selectPengambilan.value;
    if (pengambilanVal === "Other") {
      pengambilanVal = document.getElementById("pengambilan_other").value;
    }

    let jenisVal =
      selectJenis.getAttribute("data-selected-value") || selectJenis.value;
    if (jenisVal === "Other") {
      jenisVal = document.getElementById("jenis_perlombaan_other").value;
    }

    return {
      nama_pengambil: document.getElementById("nama_pengambil").value,
      jabatan: document.getElementById("jabatan").value,
      unit_kerja: document.getElementById("unit_kerja").value,
      npsn: document.getElementById("npsn").value,
      pengambilan: pengambilanVal,
      jenis_perlombaan: jenisVal,
      tahun_perlombaan: document.getElementById("tahun_perlombaan").value,
      nama_siswa: document.getElementById("nama_siswa").value,
      asal_sekolah: document.getElementById("asal_sekolah").value,
      ttd_base64: canvas.toDataURL("image/png"),
    };
  }

  // --- MULAI: Fungsi untuk Custom Searchable Dropdown Unit Kerja ---
  async function initSearchableDropdown() {
    const inputSekolah = document.getElementById("unit_kerja");
    const listSekolah = document.getElementById("unit_kerja_list");
    const iconSekolah = document.getElementById("unit_kerja_icon");

    // Jika elemen tidak ditemukan di halaman, hentikan fungsi
    if (!inputSekolah || !listSekolah) return;

    // Tampilkan loading state
    inputSekolah.placeholder = "Memuat daftar sekolah...";
    inputSekolah.disabled = true;

    // Fetch data dari API (dengan cache sessionStorage)
    const refData = await SisuratApi.fetchRef("ref_sekolah");
    const dataSekolah = refData.map((row) =>
      String(row.nama_sekolah || "").toUpperCase().trim()
    ).filter(Boolean);

    // Kembalikan input ke kondisi normal
    inputSekolah.disabled = false;
    inputSekolah.placeholder =
      dataSekolah.length > 0
        ? "Ketik untuk mencari sekolah..."
        : "Data sekolah tidak tersedia";

    function renderList(items) {
      listSekolah.innerHTML = "";
      if (items.length === 0) {
        listSekolah.innerHTML =
          '<li class="px-4 py-3 text-sm text-gray-500 text-center font-medium italic">Sekolah tidak ditemukan</li>';
        return;
      }

      items.forEach((item) => {
        const li = document.createElement("li");
        li.className =
          "px-4 py-3 text-sm text-[#334155] hover:bg-[#00ADB5] hover:text-white cursor-pointer transition-colors border-b border-gray-50 last:border-0 font-medium";
        li.textContent = item;

        li.addEventListener("mousedown", (e) => {
          e.preventDefault();
          inputSekolah.value = item;
          closeDropdown();
          inputSekolah.dispatchEvent(new Event("input"));
        });

        listSekolah.appendChild(li);
      });
    }

    function openDropdown() {
      listSekolah.classList.remove("hidden");
      if (iconSekolah) iconSekolah.style.transform = "rotate(180deg)";
    }

    function closeDropdown() {
      listSekolah.classList.add("hidden");
      if (iconSekolah) iconSekolah.style.transform = "rotate(0deg)";

      // Validasi: Kosongkan jika user ngetik asal dan klik keluar
      if (
        inputSekolah.value &&
        !dataSekolah.includes(inputSekolah.value.toUpperCase())
      ) {
        inputSekolah.value = "";
        inputSekolah.placeholder = "Silakan pilih dari daftar...";
      }
    }

    // Event Listeners
    inputSekolah.addEventListener("focus", () => {
      renderList(dataSekolah);
      openDropdown();
    });

    inputSekolah.addEventListener("input", (e) => {
      const keyword = e.target.value.toLowerCase();
      const filtered = dataSekolah.filter((s) =>
        s.toLowerCase().includes(keyword),
      );
      renderList(filtered);
      openDropdown();
    });

    inputSekolah.addEventListener("blur", () => {
      closeDropdown();
    });
  }
  // --- SELESAI: Fungsi Dropdown ---

  // --- MULAI: Fungsi untuk Custom Dropdown (Tanpa Search) ---
  /**
   * @param {string} inputId          - ID elemen input (readonly)
   * @param {string} listId           - ID elemen <ul> dropdown
   * @param {string} iconId           - ID elemen ikon chevron
   * @param {string} otherContainerId - ID container input manual "Other"
   * @param {string} refTable         - Nama tabel referensi ("ref_pengambilan" / "ref_jenis_perlombaan")
   */
  async function initCustomSelect(inputId, listId, iconId, otherContainerId, refTable) {
    const input = document.getElementById(inputId);
    const list = document.getElementById(listId);
    const icon = document.getElementById(iconId);
    const otherContainer = document.getElementById(otherContainerId);

    if (!input || !list) return;

    // Tampilkan loading state
    input.placeholder = "Memuat...";
    input.disabled = true;

    // Fetch data referensi dari API (dengan forceRefresh untuk pastikan data terbaru)
    const refData = await SisuratApi.fetchRef(refTable);

    // Kembalikan input ke kondisi normal
    input.disabled = false;
    input.placeholder = refData.length > 0 ? "Pilih jenis..." : "Data tidak tersedia";

    // Render item dari API ke dalam <ul>
    list.innerHTML = "";
    refData.forEach((row) => {
      const nama = String(row.nama || "").trim();
      if (!nama) return;
      const li = document.createElement("li");
      li.className =
        "px-4 py-3 text-sm text-[#334155] hover:bg-[#00ADB5] hover:text-white cursor-pointer transition-colors border-b border-gray-50 font-medium";
      li.setAttribute("data-value", nama);
      li.textContent = nama;
      list.appendChild(li);
    });

    // Selalu tambahkan pilihan "Lainnya (Isi Manual)" di paling bawah
    const liOther = document.createElement("li");
    liOther.className =
      "px-4 py-3 text-sm text-[#334155] hover:bg-[#00ADB5] hover:text-white cursor-pointer transition-colors font-medium";
    liOther.setAttribute("data-value", "Other");
    liOther.textContent = "Lainnya (Isi Manual)";
    list.appendChild(liOther);

    const items = list.querySelectorAll("li");

    function toggleDropdown() {
      const isHidden = list.classList.contains("hidden");

      // Tutup semua dropdown lain jika terbuka (opsional agar rapi)
      document
        .querySelectorAll('ul[id$="_list"]')
        .forEach((el) => el.classList.add("hidden"));
      document
        .querySelectorAll('div[id$="_icon"]')
        .forEach((el) => (el.style.transform = "rotate(0deg)"));

      if (isHidden) {
        list.classList.remove("hidden");
        icon.style.transform = "rotate(180deg)";
      }
    }

    function closeDropdown() {
      list.classList.add("hidden");
      icon.style.transform = "rotate(0deg)";
    }

    // Klik input untuk buka/tutup
    input.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleDropdown();
    });

    // Pilih item
    items.forEach((item) => {
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        const val = item.getAttribute("data-value"); // Ambil nilai asli (misal: "Other")
        const text = item.textContent; // Ambil teks tampilan (misal: "Lainnya (Isi Manual)")

        input.value = text;
        input.setAttribute("data-selected-value", val); // Simpan nilai asli di attribute

        closeDropdown();

        // Tampilkan atau sembunyikan input manual "Other"
        if (val === "Other") {
          otherContainer.classList.remove("hidden");
        } else {
          otherContainer.classList.add("hidden");
        }

        // Trigger validasi form
        input.dispatchEvent(new Event("input"));
      });
    });

    // Tutup jika klik di luar
    document.addEventListener("click", (e) => {
      if (!input.contains(e.target) && !list.contains(e.target)) {
        closeDropdown();
      }
    });
  }
  // --- SELESAI: Fungsi Custom Dropdown ---
})(window);
