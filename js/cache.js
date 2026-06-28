(function initSisuratCache(global) {
  "use strict";

  const CACHE_VERSION = "sisurat-cache-v1";

  /**
   * Mengambil data dari cache jika ada dan belum expired.
   */
  function get(key) {
    try {
      const item = localStorage.getItem(key);
      if (!item) return null;

      const parsed = JSON.parse(item);
      if (parsed.version !== CACHE_VERSION) {
        localStorage.removeItem(key);
        return null;
      }

      if (Date.now() > parsed.expiresAt) {
        localStorage.removeItem(key);
        return null;
      }

      return parsed.value;
    } catch (error) {
      console.warn(`Gagal membaca cache untuk key: ${key}`, error);
      return null;
    }
  }

  /**
   * Menyimpan data ke cache dengan TTL tertentu.
   */
  function set(key, data, ttlMs) {
    try {
      const cacheObj = {
        value: data,
        expiresAt: Date.now() + ttlMs,
        savedAt: Date.now(),
        version: CACHE_VERSION
      };
      localStorage.setItem(key, JSON.stringify(cacheObj));
    } catch (error) {
      console.warn(`Gagal menulis cache untuk key: ${key} (localStorage mungkin penuh)`, error);
    }
  }

  /**
   * Menghapus cache dengan key tertentu.
   */
  function remove(key) {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.warn(`Gagal menghapus cache key: ${key}`, error);
    }
  }

  /**
   * Menghapus seluruh cache yang diawali dengan prefix 'sisurat:v1:'
   */
  function clear() {
    try {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("sisurat:v1:")) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
    } catch (error) {
      console.warn("Gagal membersihkan seluruh cache", error);
    }
  }

  /**
   * Menghapus cache yang diawali dengan prefix tertentu (contoh: 'sisurat:v1:summary:')
   */
  function clearByPrefix(prefix) {
    try {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(prefix)) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
    } catch (error) {
      console.warn(`Gagal membersihkan cache dengan prefix: ${prefix}`, error);
    }
  }

  /**
   * Mengambil data dari cache jika ada, jika tidak fetch baru dan simpan.
   */
  async function getOrFetch(key, ttlMs, fetcher) {
    const cached = get(key);
    if (cached !== null) {
      return cached;
    }
    const fresh = await fetcher();
    set(key, fresh, ttlMs);
    return fresh;
  }

  /**
   * staleWhileRevalidate:
   * 1. Jika data ada di cache (walaupun sudah expired), kembalikan data cache segera.
   * 2. Jalankan fetcher di background untuk mendapatkan data terbaru.
   * 3. Jika data terbaru berbeda dengan data cache, simpan ke cache dan panggil onFresh(freshData).
   * 4. Jika data tidak ada di cache sama sekali, fetch baru, simpan ke cache, lalu kembalikan data fresh.
   */
  async function staleWhileRevalidate(key, ttlMs, fetcher, onFresh) {
    const cachedItem = localStorage.getItem(key);
    let cachedValue = null;

    if (cachedItem) {
      try {
        const parsed = JSON.parse(cachedItem);
        if (parsed.version === CACHE_VERSION) {
          cachedValue = parsed.value;
        }
      } catch (_) {
        // Abaikan parser error
      }
    }

    if (cachedValue !== null) {
      // Background revalidation
      fetcher()
        .then((fresh) => {
          if (JSON.stringify(cachedValue) !== JSON.stringify(fresh)) {
            set(key, fresh, ttlMs);
            if (typeof onFresh === "function") {
              onFresh(fresh);
            }
          }
        })
        .catch((error) => {
          // Session error (ERR_401_SESSION / ERR_403_ORIGIN):
          // Interceptor di navigation.js sudah memanggil showError() dan
          // menjadwalkan toast + redirect via setTimeout SEBELUM throw.
          // Toast dan redirect berjalan independen dari Promise chain ini,
          // sehingga tidak perlu re-throw (hanya menambah Unhandled Rejection
          // tanpa nilai tambah). Cukup log singkat untuk debugging.
          if (
            (error && (error.code === "ERR_401_SESSION" || error.code === "ERR_403_ORIGIN")) ||
            (error && error.message && (
              error.message.includes("ERR_401_SESSION") ||
              error.message.includes("ERR_403_ORIGIN")
            ))
          ) {
            console.warn("[Cache SWR] Session expired during background revalidation — redirect sudah dijadwalkan.");
            return;
          }
          // Error lain (network, timeout) — log seperti biasa
          console.warn(`Background revalidation gagal untuk key: ${key}`, error);
        });

      // Tampilkan cache segera
      return cachedValue;
    } else {
      // Tidak ada cache, fetch langsung
      const fresh = await fetcher();
      set(key, fresh, ttlMs);
      return fresh;
    }
  }

  global.SisuratCache = {
    get,
    set,
    remove,
    clear,
    clearByPrefix,
    getOrFetch,
    staleWhileRevalidate
  };
})(window);
