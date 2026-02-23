const BASE_URL =
  "https://script.google.com/macros/s/AKfycbyey9N4Wcy1RsMAsxk0CxE_wNIaAAB9Ks1QHz6srF1i4qKQthyiHf2tRtAyE78Ygwjn/exec";

(function checkAuth() {
  if (window.location.pathname.includes("dashboard.html")) {
    const user = JSON.parse(localStorage.getItem("user"));
    if (!user) {
      window.location.href = "index.html";
    } else {
      document.getElementById("user-name").innerText = user.username || "User";
    }
  }
})();

async function fetchData(table) {
  try {
    const res = await fetch(`${BASE_URL}?action=get_data&table=${table}`);
    const result = await res.json();
    return result.data || [];
  } catch (error) {
    console.error(`Gagal mengambil data dari ${table}:`, error);
    return [];
  }
}

let chartInstance = null;

async function loadDashboard() {
  const [piagam, masuk, keluar] = await Promise.all([
    fetchData("db_piagam"),
    fetchData("db_surat_masuk"),
    fetchData("db_surat_keluar"),
  ]);

  document.getElementById("piagam").innerText = piagam.length;
  document.getElementById("masuk").innerText = masuk.length;
  document.getElementById("keluar").innerText = keluar.length;
  document.getElementById("total").innerText =
    piagam.length + masuk.length + keluar.length;

  updateChart(piagam.length, masuk.length, keluar.length);

  updateAktivitas([...piagam, ...masuk, ...keluar]);
}

function updateChart(piagamCount, masukCount, keluarCount) {
  const ctx = document.getElementById("suratChart").getContext("2d");

  if (chartInstance) {
    chartInstance.destroy();
  }

  chartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["Piagam", "Surat Masuk", "Surat Keluar"],
      datasets: [
        {
          label: "Jumlah",
          data: [piagamCount, masukCount, keluarCount],
          backgroundColor: ["#00ADB5", "#393E46", "#222831"],
          borderRadius: 8,
          barPercentage: 0.6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: "#EEEEEE" },
          ticks: { stepSize: 1, color: "#393E46" },
        },
        x: {
          ticks: { color: "#222831" },
        },
      },
    },
  });
}

function updateAktivitas(allData) {
  const container = document.getElementById("aktivitas-list");

  if (!allData || allData.length === 0) {
    container.innerHTML =
      '<div class="text-[#393E46] text-center py-4">Belum ada aktivitas</div>';
    return;
  }

  const sorted = [...allData].sort((a, b) => {
    const dateA = a.tanggal || a.created_at || 0;
    const dateB = b.tanggal || b.created_at || 0;
    return dateB - dateA;
  });

  const recent = sorted.slice(0, 5);

  container.innerHTML = recent
    .map((item) => {
      let type = "Dokumen";
      let icon = "📄";
      if (item.jenis) {
        if (item.jenis.toLowerCase().includes("masuk")) {
          type = "Surat Masuk";
          icon = "📥";
        } else if (item.jenis.toLowerCase().includes("keluar")) {
          type = "Surat Keluar";
          icon = "📤";
        } else if (item.jenis.toLowerCase().includes("piagam")) {
          type = "Piagam";
          icon = "🏆";
        }
      } else {
        type = item.nama || "Item";
      }

      let tanggalStr = "";
      if (item.tanggal) {
        tanggalStr = new Date(item.tanggal).toLocaleDateString("id-ID");
      } else if (item.created_at) {
        tanggalStr = new Date(item.created_at).toLocaleDateString("id-ID");
      } else {
        tanggalStr = "Tidak diketahui";
      }

      return `
          <div class="flex items-center justify-between p-3 bg-[#EEEEEE] rounded-lg hover:bg-gray-200 transition">
            <div class="flex items-center gap-3">
              <span class="text-xl">${icon}</span>
              <div>
                <p class="font-medium text-[#222831]">${item.nomor_surat || item.nama || "Tanpa nama"}</p>
                <p class="text-xs text-[#393E46]">${type} • ${tanggalStr}</p>
              </div>
            </div>
            <span class="text-xs bg-[#00ADB5] text-white px-2 py-1 rounded-full">baru</span>
          </div>
        `;
    })
    .join("");
}

function logout() {
  localStorage.removeItem("user");
  window.location.href = "index.html";
}

if (window.location.pathname.includes("dashboard.html")) {
  loadDashboard();
}
