(function initSisuratSync(global) {
  "use strict";

  const QUEUE_KEY = "sisurat:v1:sync-queue";
  let isProcessing = false;

  // Mendapatkan antrean dari localStorage
  function getQueue() {
    try {
      const queue = localStorage.getItem(QUEUE_KEY);
      return queue ? JSON.parse(queue) : [];
    } catch (e) {
      console.warn("Gagal membaca antrean sync dari localStorage", e);
      return [];
    }
  }

  // Menyimpan antrean ke localStorage
  function saveQueue(queue) {
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    } catch (e) {
      console.error("Gagal menyimpan antrean sync ke localStorage", e);
    }
  }

  // Memasukkan aksi ke antrean
  function enqueue(action, data) {
    const queue = getQueue();
    const syncId = `sync_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    
    queue.push({
      id: syncId,
      action,
      data,
      timestamp: Date.now()
    });
    
    saveQueue(queue);
    console.log(`[Sync] Aksi enqueued: ${action}`, data);
    
    // Coba proses antrean jika online
    if (navigator.onLine) {
      processQueue();
    }
    
    return syncId;
  }

  // Memproses antrean offline
  async function processQueue() {
    if (isProcessing) return;
    if (!navigator.onLine) return;

    const queue = getQueue();
    if (queue.length === 0) return;

    isProcessing = true;
    console.log(`[Sync] Memulai pemrosesan antrean (${queue.length} item)...`);

    let remainingQueue = [...queue];

    for (const item of queue) {
      if (!navigator.onLine) {
        console.warn("[Sync] Koneksi terputus saat memproses antrean. Menghentikan.");
        break;
      }

      try {
        console.log(`[Sync] Memproses item ${item.id}: ${item.action}`);
        const res = await global.SisuratApi.postActionRaw(item.action, item.data);
        
        if (res && res.status === "success") {
          console.log(`[Sync] Item ${item.id} berhasil disinkronkan.`);
          remainingQueue = remainingQueue.filter(q => q.id !== item.id);
          saveQueue(remainingQueue);

          // Pemicu invalidasi cache lokal setelah sinkronisasi sukses
          if (global.SisuratApi && typeof global.SisuratApi.invalidateCache === "function") {
            global.SisuratApi.invalidateCache();
          }
        } else {
          console.error(`[Sync] Server merespon dengan error untuk item ${item.id}:`, res);
          // Jika error adalah validasi/aplikasi (bukan error jaringan), kita buang agar tidak menyumbat antrean
          if (res && res.code && res.code !== "ERR_500_SERVER") {
            remainingQueue = remainingQueue.filter(q => q.id !== item.id);
            saveQueue(remainingQueue);
            if (global.SisuratUI && typeof global.SisuratUI.showError === "function") {
              global.SisuratUI.showError(res.code || "Gagal sinkronisasi data.");
            }
          } else {
            // Error jaringan/server 500, hentikan antrean dan coba lagi nanti
            break;
          }
        }
      } catch (err) {
        console.error(`[Sync] Gagal memproses item ${item.id} karena masalah jaringan/koneksi`, err);
        // Hentikan pemrosesan, coba lagi saat koneksi pulih/stabil
        break;
      }
    }

    isProcessing = false;
    console.log("[Sync] Pemrosesan antrean selesai.");
    
    // Notify UI to refresh data if queue became empty
    if (getQueue().length === 0) {
      const event = new CustomEvent("sisurat-sync-completed");
      global.dispatchEvent(event);
    }
  }

  // Pasang event listener ketika koneksi kembali online
  global.addEventListener("online", () => {
    console.log("[Sync] Browser mendeteksi koneksi online. Memulai sinkronisasi...");
    processQueue();
  });

  global.SisuratSync = {
    enqueue,
    getQueue,
    processQueue,
    isProcessing: () => isProcessing
  };

  // Coba jalankan saat pertama kali dimuat jika online
  global.addEventListener("load", () => {
    if (navigator.onLine) {
      processQueue();
    }
  });

})(window);
