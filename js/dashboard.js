(function initDashboardPage(global) {
  "use strict";

  const { SisuratApi, SisuratAuth } = global;

  if (!SisuratApi || !SisuratAuth) {
    console.error("Module API/Auth belum dimuat.");
    return;
  }

  let chartSurat = null;
  let chartMonthly = null;

  function getElementValueAsInt(id) {
    const value = parseInt(document.getElementById(id).innerText, 10);
    return Number.isNaN(value) ? 0 : value;
  }

  function buildMainChartConfig(type, masuk, keluar, piagam) {
    const config = {
      type,
      data: {
        labels: ["Surat Masuk", "Surat Keluar", "Piagam"],
        datasets: [
          {
            label: "Jumlah",
            data: [masuk, keluar, piagam],
            backgroundColor: ["#00ADB5", "#393E46", "#222831"],
            borderColor: "#00ADB5",
            borderWidth: type === "line" ? 2 : 0,
            tension: 0.1,
            borderRadius: type === "bar" ? 8 : 0,
            barPercentage: type === "bar" ? 0.6 : undefined,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: type === "pie",
            position: "bottom",
          },
        },
      },
    };

    if (type !== "pie") {
      config.options.scales = {
        y: {
          beginAtZero: true,
          grid: { color: "#EEEEEE" },
          ticks: { stepSize: 1, color: "#393E46" },
        },
        x: { ticks: { color: "#222831" } },
      };
      config.options.plugins.legend.display = false;
    }

    return config;
  }

  function updateMainChart(masuk, keluar, piagam, chartType = "bar") {
    const chartCanvas = document.getElementById("suratChart");
    if (!chartCanvas || !global.Chart) {
      return;
    }

    const ctx = chartCanvas.getContext("2d");
    if (chartSurat) {
      chartSurat.destroy();
    }

    chartSurat = new global.Chart(
      ctx,
      buildMainChartConfig(chartType, masuk, keluar, piagam),
    );
  }

  function changeChartType(type) {
    const masuk = getElementValueAsInt("masuk");
    const keluar = getElementValueAsInt("keluar");
    const piagam = getElementValueAsInt("piagam");

    updateMainChart(masuk, keluar, piagam, type);
  }

  function updateMonthlyChart(allData) {
    const withDate = allData
      .map((item) => ({
        ...item,
        _parsedDate: SisuratApi.parseDate(item.tanggal),
      }))
      .filter((item) => item._parsedDate);

    const monthCounter = {};
    withDate.forEach((item) => {
      const date = item._parsedDate;
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      monthCounter[monthKey] = (monthCounter[monthKey] || 0) + 1;
    });

    const sortedMonths = Object.keys(monthCounter).sort();
    const monthLabels = sortedMonths.map((month) => {
      const [year, mon] = month.split("-");
      return `${mon}/${year}`;
    });
    const monthData = sortedMonths.map((month) => monthCounter[month]);

    const chartCanvas = document.getElementById("monthlyChart");
    if (!chartCanvas || !global.Chart) {
      return;
    }

    const ctx = chartCanvas.getContext("2d");
    if (chartMonthly) {
      chartMonthly.destroy();
    }

    chartMonthly = new global.Chart(ctx, {
      type: "line",
      data: {
        labels: monthLabels,
        datasets: [
          {
            label: "Jumlah Surat",
            data: monthData,
            borderColor: "#00ADB5",
            backgroundColor: "rgba(0, 173, 181, 0.1)",
            tension: 0.3,
            fill: true,
            pointBackgroundColor: "#393E46",
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
          y: { beginAtZero: true, grid: { color: "#EEEEEE" } },
          x: { grid: { display: false } },
        },
      },
    });
  }

  function updateAktivitas(allData) {
    const container = document.getElementById("aktivitas-list");
    if (!container) {
      return;
    }

    if (!allData || allData.length === 0) {
      container.innerHTML =
        '<div class="text-center py-8 text-[#393E46]"><i class="fas fa-folder-open text-4xl mb-2 opacity-30"></i><p>Belum ada data</p></div>';
      return;
    }

    const sorted = [...allData]
      .sort((a, b) => {
        const dateA = SisuratApi.parseDate(a.tanggal);
        const dateB = SisuratApi.parseDate(b.tanggal);
        return (dateB ? dateB.getTime() : 0) - (dateA ? dateA.getTime() : 0);
      })
      .slice(0, 5);

    container.innerHTML = sorted
      .map((item) => {
        let icon = "fa-file";
        if (item.jenis === "Surat Masuk") icon = "fa-inbox";
        else if (item.jenis === "Surat Keluar") icon = "fa-paper-plane";
        else if (item.jenis === "Piagam") icon = "fa-award";

        let tanggalStr = "-";
        const parsedDate = SisuratApi.parseDate(item.tanggal);
        if (parsedDate) {
          tanggalStr = parsedDate.toLocaleDateString("id-ID", {
            day: "numeric",
            month: "short",
            year: "numeric",
          });
        }

        const judul = item.perihal || item.jenis_perlombaan || item.nama || "-";

        return `
          <div class="flex items-start gap-3 p-3 bg-[#EEEEEE] rounded-lg hover:bg-gray-200 transition">
            <div class="bg-[#00ADB5] bg-opacity-10 p-2 rounded-full">
              <i class="fas ${icon} text-[#00ADB5]"></i>
            </div>
            <div class="flex-1 min-w-0">
              <p class="font-medium text-[#222831] truncate">${judul}</p>
              <div class="flex items-center gap-2 text-xs text-[#393E46] mt-1">
                <span class="bg-white px-2 py-0.5 rounded-full">${item.jenis}</span>
                <span><i class="far fa-calendar-alt mr-1"></i>${tanggalStr}</span>
              </div>
            </div>
          </div>
        `;
      })
      .join("");
  }

  async function loadDashboard() {
    const data = await SisuratApi.fetchAllTables();
    const masuk = data.byTable.db_surat_masuk || [];
    const keluar = data.byTable.db_surat_keluar || [];
    const piagam = data.byTable.db_piagam || [];

    document.getElementById("total").innerText = data.all.length;
    document.getElementById("masuk").innerText = masuk.length;
    document.getElementById("keluar").innerText = keluar.length;
    document.getElementById("piagam").innerText = piagam.length;

    updateMainChart(masuk.length, keluar.length, piagam.length, "bar");
    updateMonthlyChart(data.all);
    updateAktivitas(data.all);
  }

  function logout() {
    SisuratAuth.logoutToHome();
  }

  function init() {
    const user = SisuratAuth.requireAuth();
    if (!user) {
      return;
    }
    loadDashboard();
  }

  global.changeChartType = changeChartType;
  global.logout = logout;
  global.addEventListener("load", init);
})(window);
