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
    msgDiv.classList.remove(
      "hidden",
      "bg-green-100",
      "text-green-700",
      "bg-red-100",
      "text-red-700",
    );
    if (type === "success") {
      msgDiv.classList.add("bg-green-100", "text-green-700");
      msgDiv.innerHTML = `<i class="fas fa-check-circle"></i><span>${message}</span>`;
      return;
    }

    msgDiv.classList.add("bg-red-100", "text-red-700");
    msgDiv.innerHTML = `<i class="fas fa-exclamation-circle"></i><span>${message}</span>`;
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
      showMessage("error", "Semua field harus diisi!");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';

    try {
      const result = await SisuratApi.savePiagam(data);

      if (result.status === "success") {
        showMessage("success", "Berhasil disimpan!");
        document.getElementById("piagamForm").reset();
        clearCanvas();
        setTimeout(() => {
          document.getElementById("msg").classList.add("hidden");
        }, 3000);
      } else {
        showMessage("error", result.message || "Gagal menyimpan.");
      }
    } catch (error) {
      console.error("Gagal menyimpan data piagam:", error);
      showMessage("error", "Terjadi kesalahan jaringan.");
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fas fa-save"></i> Simpan Piagam';
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
    global.addEventListener("resize", resizeCanvas);
  }

  global.clearCanvas = clearCanvas;
  global.submitData = submitData;
  global.addEventListener("load", init);
})(window);
