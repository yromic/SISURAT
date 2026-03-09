(function initSearchPage(global) {
  "use strict";

  const { SisuratApi, SisuratAuth } = global;

  if (!SisuratApi || !SisuratAuth) {
    console.error("Module API/Auth belum dimuat.");
    return;
  }

  const CACHE_TTL_MS = 2 * 60 * 1000;
  const state = {
    cacheData: null,
    cacheFetchedAt: 0,
    cachePromise: null,
    // Pagination
    allResults: [],
    currentPage: 1,
    pageSize: 12,
    viewMode: 'grid', // 'grid' | 'list'
  };

  function debounce(fn, waitMs) {
    let timer = null;
    return function debounced(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), waitMs);
    };
  }

  async function getCachedAllData(forceRefresh = false) {
    const now = Date.now();
    const cacheAge = now - state.cacheFetchedAt;
    const cacheValid =
      state.cacheData && state.cacheFetchedAt > 0 && cacheAge < CACHE_TTL_MS;

    if (!forceRefresh && cacheValid) {
      return state.cacheData;
    }

    if (!state.cachePromise) {
      state.cachePromise = SisuratApi.fetchAllTables()
        .then((result) => {
          state.cacheData = result.all || [];
          state.cacheFetchedAt = Date.now();
          return state.cacheData;
        })
        .finally(() => {
          state.cachePromise = null;
        });
    }

    return state.cachePromise;
  }

  function getTypeByTable(table) {
    const config = SisuratApi.TABLE_CONFIG[table];
    return config ? config.label : "";
  }

  function render(data) {
    // Simpan semua hasil untuk paginasi
    state.allResults = data;
    state.currentPage = 1;
    _renderPage();
  }

  function _renderPage() {
    const container = document.getElementById("result");
    const countSpan = document.getElementById("result-count");
    const data = state.allResults;
    countSpan.innerText = data.length;

    if (data.length === 0) {
      container.className = "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5";
      container.innerHTML = `
          <div class="col-span-full text-center py-12">
            <i class="fas fa-folder-open text-5xl text-[#00ADB5] opacity-30 mb-3"></i>
            <p class="text-[#393E46] text-lg">Tidak ada data ditemukan</p>
          </div>
        `;
      const pager = document.getElementById("search-pagination");
      if (pager) pager.style.display = "none";
      return;
    }

    // Pagination
    const total = data.length;
    const pageSize = state.pageSize;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(state.currentPage, totalPages);
    state.currentPage = page;
    const start = (page - 1) * pageSize;
    const end = Math.min(start + pageSize, total);
    const pageData = data.slice(start, end);

    // Set layout class berdasar view mode
    if (state.viewMode === 'list') {
      container.className = "flex flex-col gap-3";
    } else {
      container.className = "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5";
    }

    container.innerHTML = pageData
      .map((item) => {
        let icon = "fa-file";
        if (item.jenis === "Surat Masuk") icon = "fa-inbox";
        else if (item.jenis === "Surat Keluar") icon = "fa-paper-plane";
        else if (item.jenis === "Piagam") icon = "fa-award";

        const judul = item.perihal || item.jenis_perlombaan || item.nama || "-";
        const nomor = item.nomor_surat || "-";
        const tanggal = item.tanggal || "-";

        if (state.viewMode === 'list') {
          return `
          <div class="bg-white rounded-xl shadow-sm hover:shadow-md transition p-4 border-l-4 border-[#00ADB5] flex items-center gap-4">
            <div class="bg-[#00ADB5] bg-opacity-10 p-2.5 rounded-full flex-shrink-0">
              <i class="fas ${icon} text-[#00ADB5] text-lg"></i>
            </div>
            <div class="flex-1 min-w-0">
              <span class="text-xs font-medium px-2 py-0.5 bg-[#393E46] text-white rounded-full">${item.jenis}</span>
              <h3 class="font-bold text-[#222831] mt-1 truncate">${judul}</h3>
              <p class="text-xs text-[#393E46] mt-0.5">
                <i class="fas fa-hashtag w-3 text-[#00ADB5]"></i> ${nomor} &nbsp;
                <i class="fas fa-calendar-alt w-3 text-[#00ADB5]"></i> ${tanggal}
              </p>
            </div>
            <div class="flex gap-2 flex-shrink-0">
              <button onclick='showDetail(${JSON.stringify(item).replace(/'/g, "\\'")})'
                class="bg-[#00ADB5] hover:bg-[#00939c] text-white px-3 py-1.5 rounded-lg text-xs transition flex items-center gap-1">
                <i class="fas fa-eye"></i> Detail
              </button>
              <a href="${item.upload_file || item.ttd_pengambil || "#"}" target="_blank"
                class="bg-[#393E46] hover:bg-[#4a525c] text-white px-3 py-1.5 rounded-lg text-xs transition flex items-center gap-1">
                <i class="fas fa-download"></i>
              </a>
            </div>
          </div>`;
        }

        return `
          <div class="bg-white rounded-xl shadow-md hover:shadow-lg transition p-5 border-l-4 border-[#00ADB5] flex flex-col">
            <div class="flex items-start gap-3 mb-3">
              <div class="bg-[#00ADB5] bg-opacity-10 p-3 rounded-full">
                <i class="fas ${icon} text-[#00ADB5] text-xl"></i>
              </div>
              <div class="flex-1">
                <span class="text-xs font-medium px-2 py-1 bg-[#393E46] text-white rounded-full">${item.jenis}</span>
                <h3 class="font-bold text-[#222831] mt-2 line-clamp-2">${judul}</h3>
              </div>
            </div>
            <div class="text-sm text-[#393E46] space-y-1 mb-4">
              <p><i class="fas fa-hashtag w-4 text-[#00ADB5]"></i> ${nomor}</p>
              <p><i class="fas fa-calendar-alt w-4 text-[#00ADB5]"></i> ${tanggal}</p>
            </div>
            <div class="flex gap-2 mt-auto">
              <button onclick='showDetail(${JSON.stringify(item).replace(/'/g, "\\'")})'
                class="flex-1 bg-[#00ADB5] hover:bg-[#00939c] text-white px-3 py-2 rounded-lg text-sm transition flex items-center justify-center gap-1">
                <i class="fas fa-eye"></i> Detail
              </button>
              <a href="${item.upload_file || item.ttd_pengambil || "#"}" target="_blank"
                class="flex-1 bg-[#393E46] hover:bg-[#4a525c] text-white px-3 py-2 rounded-lg text-sm transition flex items-center justify-center gap-1">
                <i class="fas fa-download"></i> Unduh
              </a>
            </div>
          </div>
        `;
      })
      .join("");

    // Update pagination
    const pager = document.getElementById("search-pagination");
    if (pager) {
      pager.style.display = totalPages > 1 ? "flex" : "none";
      const infoEl = document.getElementById("search-page-info");
      if (infoEl) infoEl.textContent = `${start + 1}–${end} dari ${total} hasil`;
      document.getElementById("search-btn-prev").disabled = page <= 1;
      document.getElementById("search-btn-next").disabled = page >= totalPages;
      const numbersEl = document.getElementById("search-page-numbers");
      if (numbersEl) {
        let html = "";
        const delta = 2;
        let pages = new Set([1, totalPages]);
        for (let i = Math.max(1, page - delta); i <= Math.min(totalPages, page + delta); i++) pages.add(i);
        [...pages].sort((a, b) => a - b).forEach((p, i, arr) => {
          if (i > 0 && p - arr[i - 1] > 1) html += `<span class="text-gray-400 text-xs px-1">…</span>`;
          const active = p === page;
          html += `<button onclick="goSearchPage(${p})"
            class="w-7 h-7 rounded-xl text-xs font-semibold shadow-sm transition ${active
              ? 'bg-[#00ADB5] text-white'
              : 'bg-white border border-gray-200 text-[#393E46] hover:bg-[#00ADB5] hover:text-white'
            }">${p}</button>`;
        });
        numbersEl.innerHTML = html;
      }
    }
  }

  // Pagination controls
  function prevSearchPage() {
    if (state.currentPage > 1) { state.currentPage--; _renderPage(); }
  }

  function nextSearchPage() {
    const totalPages = Math.ceil(state.allResults.length / state.pageSize);
    if (state.currentPage < totalPages) { state.currentPage++; _renderPage(); }
  }

  function goSearchPage(p) {
    state.currentPage = p;
    _renderPage();
  }

  function setSearchPageSize(size) {
    state.pageSize = Number(size);
    state.currentPage = 1;
    _renderPage();
  }

  function setView(mode) {
    state.viewMode = mode;
    // Update tombol aktif
    const gridBtn = document.getElementById("btn-view-grid");
    const listBtn = document.getElementById("btn-view-list");
    if (gridBtn && listBtn) {
      gridBtn.className = `w-8 h-8 rounded flex items-center justify-center transition ${mode === 'grid' ? 'bg-[#00ADB5] text-white' : 'bg-white text-[#393E46] hover:bg-[#EEEEEE]'
        }`;
      listBtn.className = `w-8 h-8 rounded flex items-center justify-center transition ${mode === 'list' ? 'bg-[#00ADB5] text-white' : 'bg-white text-[#393E46] hover:bg-[#EEEEEE]'
        }`;
    }
    _renderPage();
  }

  async function runSearch(forceRefresh = false) {
    let data = await getCachedAllData(forceRefresh);

    const keyword = document.getElementById("search").value.toLowerCase();
    const jenis = document.getElementById("jenis").value;
    const from = document.getElementById("from").value;
    const to = document.getElementById("to").value;

    if (jenis) {
      const selectedType = getTypeByTable(jenis);
      data = data.filter((item) => item.jenis === selectedType);
    }

    if (from) {
      const fromDate = SisuratApi.parseDate(from);
      data = data.filter((item) => {
        const itemDate = SisuratApi.parseDate(item.tanggal);
        return itemDate && fromDate && itemDate >= fromDate;
      });
    }

    if (to) {
      const toDate = SisuratApi.parseDate(to);
      data = data.filter((item) => {
        const itemDate = SisuratApi.parseDate(item.tanggal);
        return itemDate && toDate && itemDate <= toDate;
      });
    }

    if (keyword) {
      data = data.filter((item) =>
        JSON.stringify(item).toLowerCase().includes(keyword),
      );
    }

    const sorted = [...data].sort((a, b) => {
      const dateA = SisuratApi.parseDate(a.tanggal);
      const dateB = SisuratApi.parseDate(b.tanggal);
      return (dateB ? dateB.getTime() : 0) - (dateA ? dateA.getTime() : 0);
    });

    render(sorted);
  }

  function showDetail(data) {
    const detail = document.getElementById("detail");
    const preview = document.getElementById("preview");
    const downloadLink = document.getElementById("download-link");

    let html = "";
    for (const key in data) {
      if (
        key === "jenis" ||
        key === "tanggal" ||
        key === "_table" ||
        key === "upload_file" ||
        key === "ttd_pengambil"
      ) {
        continue;
      }
      html += `
          <div class="flex border-b border-gray-200 py-2">
            <span class="w-1/3 font-medium text-[#393E46]">${key}</span>
            <span class="w-2/3 text-[#222831]">${data[key] || "-"}</span>
          </div>
        `;
    }
    detail.innerHTML = html;

    const fileUrl = data.upload_file || data.ttd_pengambil || "";
    downloadLink.href = fileUrl;

    if (fileUrl) {
      // Ekstrak File ID dari berbagai format URL Google Drive:
      // 1. https://drive.google.com/uc?export=view&id=FILE_ID
      // 2. https://drive.google.com/file/d/FILE_ID/view
      // 3. https://drive.google.com/d/FILE_ID
      const matchId =
        fileUrl.match(/[?&]id=([a-zA-Z0-9-_]+)/) ||
        fileUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);

      if (matchId && matchId[1]) {
        const fileId = matchId[1];
        preview.src = `https://drive.google.com/file/d/${fileId}/preview`;
      } else {
        preview.src = fileUrl;
      }
    } else {
      preview.src = "";
    }

    document.getElementById("modal").classList.remove("hidden");
  }

  function closeModal() {
    document.getElementById("modal").classList.add("hidden");
  }

  function toggleFilter() {
    document.getElementById("filterPanel").classList.toggle("hidden");
  }

  function resetFilter() {
    document.getElementById("search").value = "";
    document.getElementById("jenis").value = "";
    document.getElementById("from").value = "";
    document.getElementById("to").value = "";
    runSearch();
  }

  function logout() {
    SisuratAuth.logoutToHome();
  }

  function bindEvents() {
    const debouncedSearch = debounce(() => runSearch(), 300);
    document.getElementById("search").addEventListener("input", debouncedSearch);
    document.getElementById("jenis").addEventListener("change", () => runSearch());
    document.getElementById("from").addEventListener("change", () => runSearch());
    document.getElementById("to").addEventListener("change", () => runSearch());
  }

  function init() {
    const user = SisuratAuth.requireAuth();
    if (!user) {
      return;
    }

    const userNameEl = document.getElementById("user-name");
    if (userNameEl) userNameEl.textContent = user.username || "User";

    bindEvents();
    runSearch();
  }

  global.runSearch = runSearch;
  global.showDetail = showDetail;
  global.closeModal = closeModal;
  global.toggleFilter = toggleFilter;
  global.resetFilter = resetFilter;
  global.logout = logout;
  global.prevSearchPage = prevSearchPage;
  global.nextSearchPage = nextSearchPage;
  global.goSearchPage = goSearchPage;
  global.setSearchPageSize = setSearchPageSize;
  global.setView = setView;
  global.addEventListener("load", init);
})(window);
