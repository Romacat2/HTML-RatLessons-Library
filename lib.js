// Спільна логіка бібліотеки уроків (lessons/ і spelling/).
// Дублює невелику частину LessonsStore з основного застосунку
// (encodeLessonForUrl, isImage) навмисно — бібліотека є окремим
// репозиторієм і не повинна залежати від коду іншого репо.

const LibraryShared = (() => {
  function isImage(value) {
    return typeof value === "string" && /^https?:\/\//i.test(value.trim());
  }

  function tr(key, params) {
    // i18n.js може бути не підключений на якихось сторінках —
    // тоді просто показуємо сам ключ, аби не впасти з помилкою.
    return window.I18N ? window.I18N.t(key, params) : key;
  }

  function base64UrlEncode(bytes) {
    let binary = "";
    bytes.forEach((b) => (binary += String.fromCharCode(b)));
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  async function encodeLessonForUrl(lessonWithType) {
    const json = JSON.stringify(lessonWithType);
    const bytes = new TextEncoder().encode(json);
    if (typeof CompressionStream === "function") {
      try {
        const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
        const compressed = await new Response(stream).arrayBuffer();
        return base64UrlEncode(new Uint8Array(compressed));
      } catch {
        // якщо стиснення чомусь не вдалось - падаємо на нестиснутий варіант нижче
      }
    }
    return base64UrlEncode(bytes);
  }

  // Детермінований вибір прев'ю-картинки уроку: перша вправа з
  // question-URL картинки (lessons), або null для spelling (там
  // картинок немає за дизайном - картка показує олівець-заглушку).
  function pickPreviewImage(lesson) {
    if (!Array.isArray(lesson.exercises)) return null;
    const withImage = lesson.exercises.find((ex) => isImage(ex.question));
    return withImage ? withImage.question : null;
  }

  function slugifyTitle(title) {
    return (title || "bez-nazvy")
      .toLowerCase()
      .replace(/[^a-zа-яіїєґ0-9]+/giu, "-")
      .replace(/^-+|-+$/g, "") || "bez-nazvy";
  }

  function showToast(message) {
    let toast = document.querySelector(".library-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "library-toast";
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => toast.classList.remove("show"), 2200);
  }

  // Мовна тека: baseDir — спільний корінь ("data"), фактичні
  // уроки лежать в baseDir/<lang>/. Мова береться з I18N.getLang(),
  // якщо i18n.js підключений; інакше — фолбек "uk" (стара поведінка).
  function resolveDataDir(baseDir) {
    const lang = window.I18N ? window.I18N.getLang() : "uk";
    return `${baseDir}/${lang}`;
  }

  // Завантажує manifest.json (список імен файлів) і кожен урок
  // з поточної мовної теки baseDir/<lang>/.
  async function loadLessons(baseDir) {
    const dataDir = resolveDataDir(baseDir);
    const manifestRes = await fetch(`${dataDir}/manifest.json`);
    if (!manifestRes.ok) {
      throw new Error(`Не вдалося завантажити manifest.json (${manifestRes.status})`);
    }
    const fileNames = await manifestRes.json();

    const lessons = await Promise.all(
      fileNames.map(async (name) => {
        try {
          const res = await fetch(`${dataDir}/${name}`);
          if (!res.ok) return null;
          const data = await res.json();
          data.__file = name;
          return data;
        } catch {
          return null;
        }
      }),
    );
    return lessons.filter(Boolean);
  }

  // Перемальовує сітку карток уроків у gridEl для поточної мови.
  // Викликається і при першому завантаженні сторінки, і повторно —
  // щоразу, коли I18N.onChange() повідомляє про зміну мови.
  //
  // baseDir — спільний корінь даних ("data"), саме той, що й
  // передається в loadLessons(). renderPreview(lesson) повертає
  // innerHTML прев'ю-блоку картки (своя для lessons/ і spelling/).
  //
  // Повертає проміс, який виконується після завершення перемальовки
  // (зручно, якщо виклику потрібно знати, що рендер закінчився).
  async function renderLibraryGrid({ baseDir, gridEl, emptyEl, renderPreview, onError }) {
    gridEl.innerHTML = "";
    emptyEl.style.display = "none";

    try {
      const lessons = await loadLessons(baseDir);
      if (lessons.length === 0) {
        emptyEl.style.display = "block";
        return;
      }
      lessons.forEach((lesson) => {
        gridEl.appendChild(renderLessonCard(lesson, renderPreview));
      });
    } catch (err) {
      console.warn("Не вдалося завантажити бібліотеку уроків:", err);
      if (typeof onError === "function") {
        onError(err);
      } else {
        emptyEl.textContent = tr("library.lessons.loadError");
        emptyEl.style.display = "block";
      }
    }
  }

  // Підписує сторінку на зміну мови: при I18N.onChange() перемальовує
  // сітку карток заново з мовної теки нового I18N.getLang(). Викликати
  // один раз на сторінці, одразу після першого renderLibraryGrid().
  // Повертає функцію відписки від I18N.onChange (може знадобитись,
  // хоча на цих сторінках сторінка просто живе, поки підписка жива).
  function watchLanguageChanges(options) {
    if (!window.I18N) return () => {};
    return window.I18N.onChange(() => {
      renderLibraryGrid(options);
    });
  }

  // Будує одну картку уроку. renderPreview(lesson) повертає innerHTML
  // прев'ю-блоку (картинка або заглушка) — різне для lessons/spelling.
  function renderLessonCard(lesson, renderPreview) {
    const card = document.createElement("div");
    card.className = "lesson-card";

    const previewHtml = renderPreview(lesson);
    const fileName = `lesson-${slugifyTitle(lesson.title)}.json`;

    card.innerHTML = `
      ${previewHtml}
      <div class="lesson-card-body">
        <div class="lesson-card-title">${escapeHtml(lesson.title || tr("library.card.untitled"))}</div>
        <div class="lesson-card-actions">
          <a href="#" class="csharp-btn" style="background:#607d8b" data-action="file">${tr("library.card.asFile")}</a>
          <a href="#" class="csharp-btn" style="background:#009688" data-action="link">${tr("library.card.asLink")}</a>
        </div>
      </div>
    `;

    card.querySelector('[data-action="file"]').addEventListener("click", (e) => {
      e.preventDefault();
      downloadLessonFile(lesson, fileName);
    });

    card.querySelector('[data-action="link"]').addEventListener("click", async (e) => {
      e.preventDefault();
      await shareLessonLink(lesson);
    });

    return card;
  }

  function downloadLessonFile(lesson, fileName) {
    const { __file, ...clean } = lesson;
    const json = JSON.stringify(clean, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function shareLessonLink(lesson) {
      const { __file, id, ...rest } = lesson;
      const encoded = await encodeLessonForUrl(rest);
      const shareUrl = `ratlessons://import?data=${encoded}`;

      const link = document.createElement("a");
      link.href = shareUrl;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      link.remove();

      setTimeout(() => {
          showShareFallback(shareUrl, lesson.title);
      }, 700);
  }

  function showShareFallback(shareUrl, title) {
      const box = document.createElement("div");
      box.className = "share-link-box";
      box.innerHTML = `
          <p class="share-link-hint">${tr("library.card.shareFallbackHint")}</p>
          <div class="share-link-text">${escapeHtml(shareUrl)}</div>
          <div class="lesson-card-actions">
              <a href="#" class="csharp-btn" style="background:#4caf50" id="fallbackCopyBtn">${tr("library.card.copy")}</a>
              ${navigator.share ? `<a href="#" class="csharp-btn" style="background:#009688" id="fallbackShareBtn">${tr("library.card.share")}</a>` : ""}
          </div>
      `;
      document.body.appendChild(box);

      box.querySelector("#fallbackCopyBtn").addEventListener("click", async (e) => {
          e.preventDefault();
          try {
              await navigator.clipboard.writeText(shareUrl);
              showToast(tr("library.card.linkCopied"));
          } catch {
              prompt(tr("library.card.copyManually"), shareUrl);
          }
          box.remove();
      });

      const shareBtn = box.querySelector("#fallbackShareBtn");
      if (shareBtn) {
          shareBtn.addEventListener("click", async (e) => {
              e.preventDefault();
              try {
                  await navigator.share({ title, url: shareUrl });
              } catch {}
              box.remove();
          });
      }

      setTimeout(() => box.remove(), 8000);
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
  }

  return {
    isImage,
    pickPreviewImage,
    loadLessons,
    renderLessonCard,
    renderLibraryGrid,
    watchLanguageChanges,
    showToast,
    escapeHtml,
  };
})();
