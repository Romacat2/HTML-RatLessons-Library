// Спільна логіка бібліотеки уроків (lessons/ і spelling/).
// Дублює невелику частину LessonsStore з основного застосунку
// (encodeLessonForUrl, isImage) навмисно — бібліотека є окремим
// репозиторієм і не повинна залежати від коду іншого репо.

const LibraryShared = (() => {
  function isImage(value) {
    return typeof value === "string" && /^https?:\/\//i.test(value.trim());
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

  // Завантажує manifest.json (список імен файлів) і кожен урок з data/.
  async function loadLessons(dataDir) {
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

  // Будує одну картку уроку. renderPreview(lesson) повертає innerHTML
  // прев'ю-блоку (картинка або заглушка) — різне для lessons/spelling.
  function renderLessonCard(lesson, dataDir, renderPreview) {
    const card = document.createElement("div");
    card.className = "lesson-card";

    const previewHtml = renderPreview(lesson);
    const fileName = `lesson-${slugifyTitle(lesson.title)}.json`;

    card.innerHTML = `
      ${previewHtml}
      <div class="lesson-card-body">
        <div class="lesson-card-title">${escapeHtml(lesson.title || "Без назви")}</div>
        <div class="lesson-card-actions">
          <a href="#" class="csharp-btn" style="background:#607d8b" data-action="file">📄 Як файл</a>
          <a href="#" class="csharp-btn" style="background:#009688" data-action="link">🔗 Як посилання</a>
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
          <p style="margin:0; font-size:0.85rem; opacity:0.8;">
              Якщо застосунок не відкрився автоматично — скопіюй посилання і встав його в адресний рядок браузера на телефоні:
          </p>
          <div class="share-link-text">${escapeHtml(shareUrl)}</div>
          <div class="lesson-card-actions">
              <a href="#" class="csharp-btn" style="background:#4caf50" id="fallbackCopyBtn">📋 Копіювати</a>
              ${navigator.share ? '<a href="#" class="csharp-btn" style="background:#009688" id="fallbackShareBtn">📤 Поділитись</a>' : ""}
          </div>
      `;
      document.body.appendChild(box);
      box.style.position = "fixed";
      box.style.bottom = "1rem";
      box.style.left = "50%";
      box.style.transform = "translateX(-50%)";
      box.style.zIndex = "300";
      box.style.maxWidth = "90vw";
      box.style.width = "360px";

      box.querySelector("#fallbackCopyBtn").addEventListener("click", async (e) => {
          e.preventDefault();
          try {
              await navigator.clipboard.writeText(shareUrl);
              showToast("Посилання скопійовано!");
          } catch {
              prompt("Скопіюй посилання вручну:", shareUrl);
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
    showToast,
    escapeHtml,
  };
})();
