(function initDashboardPage(global) {
  "use strict";

  const { SisuratApi, SisuratAuth } = global;

  if (!SisuratApi || !SisuratAuth) {
    console.error("Module API/Auth belum dimuat.");
    return;
  }

  let chartSurat = null;
  let chartMonthly = null;
  let currentChartType = "bar";

  // Data cache
  let dbSummaryData = [];
  let dbDivisiData = [];
  let dbAuditLogs = [];

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
    currentChartType = type;
    const masuk = getElementValueAsInt("masuk");
    const keluar = getElementValueAsInt("keluar");
    const piagam = getElementValueAsInt("piagam");

    updateMainChart(masuk, keluar, piagam, type);
  }

  function updateMonthlyChartWithCounts(masuk, keluar, piagam) {
    const chartCanvas = document.getElementById("monthlyChart");
    if (!chartCanvas || !global.Chart) {
      return;
    }

    const total = masuk + keluar + piagam;
    const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun"];
    let dataPoints = [0, 0, 0, 0, 0, 0];
    if (total > 0) {
      dataPoints = [
        Math.round(total * 0.1),
        Math.round(total * 0.15),
        Math.round(total * 0.2),
        Math.round(total * 0.18),
        Math.round(total * 0.22),
        total - Math.round(total * 0.85)
      ];
      dataPoints = dataPoints.map(v => Math.max(0, v));
    }

    const ctx = chartCanvas.getContext("2d");
    if (chartMonthly) {
      chartMonthly.destroy();
    }

    chartMonthly = new global.Chart(ctx, {
      type: "line",
      data: {
        labels: months,
        datasets: [
          {
            label: "Estimasi Trafik",
            data: dataPoints,
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

  function populateAktivitasFromAuditLog(logs, currentDivisiId) {
    const container = document.getElementById("aktivitas-list");
    if (!container) return;

    if (!logs || logs.length === 0) {
      container.innerHTML =
        '<div class="text-center py-8 text-[#393E46]"><i class="fas fa-folder-open text-4xl mb-2 opacity-30"></i><p>Belum ada aktivitas</p></div>';
      return;
    }

    let filteredLogs = logs;
    if (currentDivisiId && currentDivisiId !== "all") {
      filteredLogs = logs.filter(log => String(log.divisi_id).toUpperCase() === String(currentDivisiId).toUpperCase());
    }

    const sorted = [...filteredLogs].sort((a, b) => {
      const dateA = new Date(a.timestamp);
      const dateB = new Date(b.timestamp);
      return dateB.getTime() - dateA.getTime();
    }).slice(0, 5);

    if (sorted.length === 0) {
      container.innerHTML =
        '<div class="text-center py-8 text-[#393E46]"><i class="fas fa-folder-open text-4xl mb-2 opacity-30"></i><p>Belum ada aktivitas divisi ini</p></div>';
      return;
    }

    container.innerHTML = sorted.map(log => {
      let icon = "fa-info-circle";
      if (log.action && log.action.includes("simpan")) icon = "fa-plus-circle";
      else if (log.action && log.action.includes("hapus")) icon = "fa-trash-alt";
      else if (log.action && log.action.includes("update")) icon = "fa-edit";
      else if (log.action && log.action.includes("login")) icon = "fa-sign-in-alt";

      let dateStr = "-";
      if (log.timestamp) {
        const d = new Date(log.timestamp);
        if (!isNaN(d.getTime())) {
          dateStr = d.toLocaleDateString("id-ID", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
          });
        }
      }

      const actorName = log.actor || "System";
      const actionText = log.detail || `${log.action} pada ${log.table_name || 'sistem'}`;

      return `
        <div class="flex items-start gap-3 p-3 bg-[#EEEEEE] rounded-lg hover:bg-gray-200 transition text-left">
          <div class="bg-[#00ADB5] bg-opacity-10 p-2 rounded-full flex-shrink-0">
            <i class="fas ${icon} text-[#00ADB5]"></i>
          </div>
          <div class="flex-1 min-w-0">
            <p class="font-medium text-[#222831] text-xs">${actionText}</p>
            <div class="flex items-center gap-2 text-[10px] text-[#393E46] mt-1">
              <span class="bg-white px-2 py-0.5 rounded-full font-semibold">${actorName}</span>
              <span><i class="far fa-calendar-alt mr-1"></i>${dateStr}</span>
            </div>
          </div>
        </div>
      `;
    }).join("");
  }

  function showOperatorPlaceholderAktivitas() {
    const container = document.getElementById("aktivitas-list");
    if (!container) return;
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center h-full text-gray-400 gap-3 py-8">
        <i class="fas fa-shield-alt text-3xl text-gray-300"></i>
        <span class="text-sm font-medium text-gray-500">Aktivitas log dibatasi untuk Operator</span>
      </div>
    `;
  }

  function renderRingkasanDivisiTable() {
    const tbody = document.getElementById("ringkasan-divisi-tbody");
    if (!tbody) return;

    if (dbDivisiData.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="px-5 py-4 text-center text-gray-400">Belum ada data divisi</td></tr>';
      return;
    }

    tbody.innerHTML = dbDivisiData.map(divisi => {
      const summary = dbSummaryData.find(s => String(s.divisi_id).toUpperCase() === String(divisi.kode_divisi).toUpperCase()) || {
        total_surat_masuk: 0,
        total_surat_keluar: 0,
        total_piagam: 0
      };

      const masuk = parseInt(summary.total_surat_masuk, 10) || 0;
      const keluar = parseInt(summary.total_surat_keluar, 10) || 0;
      const piagam = parseInt(summary.total_piagam, 10) || 0;
      const total = masuk + keluar + piagam;

      const statusBadge = divisi.status === "active" || divisi.status === "Aktif"
        ? '<span class="bg-green-100 text-green-800 text-xs font-semibold px-2.5 py-0.5 rounded-full">Aktif</span>'
        : `<span class="bg-amber-100 text-amber-800 text-xs font-semibold px-2.5 py-0.5 rounded-full">${divisi.status || 'Pending'}</span>`;

      return `
        <tr class="hover:bg-gray-50/50 transition-colors">
          <td class="px-5 py-4 font-semibold text-[#222831]">${divisi.kode_divisi}</td>
          <td class="px-5 py-4 text-[#393E46]">${divisi.nama_divisi}</td>
          <td class="px-5 py-4 text-center font-medium">${masuk}</td>
          <td class="px-5 py-4 text-center font-medium">${keluar}</td>
          <td class="px-5 py-4 text-center font-medium">${piagam}</td>
          <td class="px-5 py-4 text-center font-bold text-[#00ADB5]">${total}</td>
        </tr>
      `;
    }).join("");
  }

  function displayStats(selectedDivisiId) {
    let totalMasuk = 0;
    let totalKeluar = 0;
    let totalPiagam = 0;

    if (selectedDivisiId === "all") {
      // Sum all records in db_summary
      dbSummaryData.forEach(row => {
        // Skip aggregate rows if they exist in sheet
        if (row.divisi_id && row.divisi_id.toUpperCase() !== "ALL") {
          totalMasuk += parseInt(row.total_surat_masuk, 10) || 0;
          totalKeluar += parseInt(row.total_surat_keluar, 10) || 0;
          totalPiagam += parseInt(row.total_piagam, 10) || 0;
        }
      });
    } else {
      const match = dbSummaryData.find(row => String(row.divisi_id).toUpperCase() === String(selectedDivisiId).toUpperCase());
      if (match) {
        totalMasuk = parseInt(match.total_surat_masuk, 10) || 0;
        totalKeluar = parseInt(match.total_surat_keluar, 10) || 0;
        totalPiagam = parseInt(match.total_piagam, 10) || 0;
      }
    }

    const grandTotal = totalMasuk + totalKeluar + totalPiagam;

    document.getElementById("total").innerText = grandTotal;
    document.getElementById("masuk").innerText = totalMasuk;
    document.getElementById("keluar").innerText = totalKeluar;
    document.getElementById("piagam").innerText = totalPiagam;

    updateMainChart(totalMasuk, totalKeluar, totalPiagam, currentChartType);
    updateMonthlyChartWithCounts(totalMasuk, totalKeluar, totalPiagam);

    if (SisuratAuth.isSuperAdmin()) {
      populateAktivitasFromAuditLog(dbAuditLogs, selectedDivisiId);
    }
  }

  async function loadDashboard() {
    try {
      const isSuperAdmin = SisuratAuth.isSuperAdmin();

      if (isSuperAdmin) {
        // Fetch summaries and divisions
        const [summaryRes, divisiRes, auditRes] = await Promise.all([
          SisuratApi.getData("db_summary"),
          SisuratApi.getData("db_divisi"),
          SisuratApi.getData("db_audit_log").catch(err => {
            console.warn("Gagal fetch audit log:", err);
            return { data: [] };
          })
        ]);

        dbSummaryData = Array.isArray(summaryRes.data) ? summaryRes.data : [];
        dbDivisiData = Array.isArray(divisiRes.data) ? divisiRes.data : [];
        dbAuditLogs = Array.isArray(auditRes.data) ? auditRes.data : [];

        // Show switcher
        const switcherContainer = document.getElementById("divisi-switcher-container");
        const switcherSelect = document.getElementById("divisi-switcher");
        if (switcherContainer && switcherSelect) {
          switcherContainer.classList.remove("hidden");
          
          // Clear current options except "Semua Divisi"
          switcherSelect.innerHTML = '<option value="all" class="text-[#222831] bg-white font-semibold">Semua Divisi</option>';
          
          dbDivisiData.forEach(divisi => {
            if (divisi.status === "active" || divisi.status === "Aktif") {
              const opt = document.createElement("option");
              opt.value = divisi.kode_divisi;
              opt.className = "text-[#222831] bg-white";
              opt.innerText = `${divisi.kode_divisi} - ${divisi.nama_divisi}`;
              switcherSelect.appendChild(opt);
            }
          });

          // Add change listener
          switcherSelect.onchange = function() {
            displayStats(this.value);
          };
        }

        // Show and populate division summary section
        const ringkasanSection = document.getElementById("ringkasan-divisi-section");
        if (ringkasanSection) {
          ringkasanSection.classList.remove("hidden");
          renderRingkasanDivisiTable();
        }

        displayStats("all");

      } else {
        // Non-super admin (division level)
        const summaryRes = await SisuratApi.getData("db_summary");
        dbSummaryData = Array.isArray(summaryRes.data) ? summaryRes.data : [];
        
        // Hide switcher and table
        const switcherContainer = document.getElementById("divisi-switcher-container");
        if (switcherContainer) switcherContainer.classList.add("hidden");

        const ringkasanSection = document.getElementById("ringkasan-divisi-section");
        if (ringkasanSection) ringkasanSection.classList.add("hidden");

        // Try getting audit log (only admin_divisi has access, operator will fail)
        try {
          const auditRes = await SisuratApi.getData("db_audit_log");
          if (auditRes && auditRes.status === "success" && Array.isArray(auditRes.data)) {
            dbAuditLogs = auditRes.data;
            const user = SisuratAuth.getStoredUser();
            const userDivId = user ? user.divisi_id : "";
            populateAktivitasFromAuditLog(dbAuditLogs, userDivId);
          } else {
            showOperatorPlaceholderAktivitas();
          }
        } catch (_) {
          showOperatorPlaceholderAktivitas();
        }

        const user = SisuratAuth.getStoredUser();
        const userDivId = user ? user.divisi_id : "";
        displayStats(userDivId);
      }

    } catch (error) {
      console.error("Gagal memuat dashboard:", error);
    }
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
