/**
 * i18n.js — простий офлайн-модуль локалізації.
 *
 * Пріоритет визначення мови:
 *   1. Мова, яку користувач уже обрав вручну раніше (localStorage).
 *   2. Системна мова Android/браузера (navigator.language).
 *   3. Фолбек (FALLBACK_LANG), якщо системна мова не підтримується.
 *
 * Словники НЕ завантажуються через fetch() — на file:// (відкриття
 * сторінки подвійним кліком, без сервера) fetch до локальних файлів
 * блокується CORS-політикою браузера. Замість цього кожен словник —
 * звичайний JS-файл, що просто присвоює об'єкт window.I18N_DICT_<LANG>:
 *
 *   locales/uk.js  ->  window.I18N_DICT_UK = { ... };
 *   locales/en.js  ->  window.I18N_DICT_EN = { ... };
 *   locales/de.js  ->  window.I18N_DICT_DE = { ... };
 *
 * Усі три підключаються звичайними <script> тегами до i18n.js —
 * це працює однаково на file://, на http(s):// і в Android WebView
 * (file:///android_asset/), бо браузер не накладає CORS-обмежень
 * на виконання підключеного через <script src="..."> файлу.
 *
 * Використання на сторінці:
 *   <script src="../locales/uk.js"></script>
 *   <script src="../locales/en.js"></script>
 *   <script src="../locales/de.js"></script>
 *   <script src="../i18n.js"></script>
 *   ...
 *   <script>
 *     I18N.init();
 *     // applyTranslations() I18N.init() вже викликав сама
 *   </script>
 *
 * Розмітка:
 *   <h1 data-i18n="editor.title">Текст-заглушка на випадок помилки</h1>
 *   <input data-i18n-placeholder="editor.titlePlaceholder" placeholder="...">
 *
 * Динамічний текст (складається з даних + перекладу, не покривається
 * статичним data-i18n, напр. "🐀 Табличка множення" чи "✖️ Множення · Легкий"):
 * підпишіться на зміну мови через I18N.onChange(fn) і перерахуйте текст
 * у callback-у. fn викликається і одразу після setLang(), і після init()/
 * detectAndLoad(), якщо на той момент вже є підписники.
 *
 *   I18N.onChange(() => {
 *     titleEl.textContent = I18N.t(isDiv ? "x.title.div" : "x.title.mul");
 *   });
 */
(function (global) {
	"use strict";

	const SUPPORTED_LANGS = ["uk", "en", "de"];
	const FALLBACK_LANG = "en";
	const STORAGE_KEY = "appLang";

	// Відповідність мова -> глобальна змінна зі словником,
	// яку мають виставити locales/<lang>.js файли.
	const DICT_GLOBALS = {
		uk: "I18N_DICT_UK",
		en: "I18N_DICT_EN",
		de: "I18N_DICT_DE",
	};

	let translations = {};
	let currentLang = FALLBACK_LANG;
	let initialized = false;
	const changeListeners = [];

	/**
	 * Визначає, яку мову використати при старті сторінки.
	 */
	function detectInitialLang() {
		const saved = global.localStorage.getItem(STORAGE_KEY);
		if (saved && SUPPORTED_LANGS.includes(saved)) {
			return saved;
		}

		const sysLang = (global.navigator.language || "").slice(0, 2).toLowerCase();
		if (SUPPORTED_LANGS.includes(sysLang)) {
			return sysLang;
		}

		return FALLBACK_LANG;
	}

	/**
	 * Бере словник для вказаної мови з window.I18N_DICT_<LANG>.
	 * Якщо словник не підключений (забули <script> на сторінці,
	 * чи сталась помилка в самому locales/<lang>.js) — переходить
	 * на фолбек-мову, щоб сторінка не лишилась без перекладів.
	 */
	function loadLang(lang) {
		const globalName = DICT_GLOBALS[lang];
		const dict = globalName ? global[globalName] : null;

		if (dict) {
			translations = dict;
			currentLang = lang;
			global.document.documentElement.lang = currentLang;
			return;
		}

		console.error(`[i18n] Словник для мови "${lang}" не знайдено (window.${globalName} відсутній). Перевір, чи підключений locales/${lang}.js.`);

		if (lang !== FALLBACK_LANG) {
			loadLang(FALLBACK_LANG);
			return;
		}

		// Навіть фолбек не підключений - працюємо з порожнім словником,
		// t() буде повертати самі ключі, щоб хоч якийсь текст лишався видимим.
		translations = {};
		currentLang = FALLBACK_LANG;
		global.document.documentElement.lang = currentLang;
	}

	/**
	 * Повертає переклад за ключем. Якщо ключа немає в словнику —
	 * повертає сам ключ (видно в інтерфейсі, легко знайти, що бракує).
	 * params дозволяє підставити значення у вигляді {n} всередині рядка,
	 * напр. t("validation.needQuestion", { n: 2 }).
	 */
	function t(key, params) {
		let str = Object.prototype.hasOwnProperty.call(translations, key)
			? translations[key]
			: key;
		if (params) {
			Object.keys(params).forEach((paramKey) => {
				str = str.replace(`{${paramKey}}`, params[paramKey]);
			});
		}
		return str;
	}

	/**
	 * Проходить по всій сторінці й підставляє переклади в елементи
	 * з атрибутами data-i18n / data-i18n-placeholder / data-i18n-aria-label.
	 * Викликається автоматично після I18N.init(), а також варто
	 * викликати повторно після динамічного рендеру нового DOM
	 * (наприклад, після renderExercises() в редакторі уроку).
	 */
	function applyTranslations(root) {
		const scope = root || global.document;

		scope.querySelectorAll("[data-i18n]").forEach((el) => {
			el.textContent = t(el.dataset.i18n);
		});
		scope.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
			el.placeholder = t(el.dataset.i18nPlaceholder);
		});
		scope.querySelectorAll("[data-i18n-aria-label]").forEach((el) => {
			el.setAttribute("aria-label", t(el.dataset.i18nAriaLabel));
		});
		scope.querySelectorAll("[data-i18n-title]").forEach((el) => {
			el.title = t(el.dataset.i18nTitle);
		});
	}

	/**
	 * Підписка на зміну мови — для динамічних текстів, які неможливо
	 * покрити статичним data-i18n (бо вони залежать ще й від даних:
	 * вибраної операції, рівня, і т.п.). callback викликається одразу
	 * після setLang(), ПІСЛЯ applyTranslations(). Повертає функцію
	 * відписки (unsubscribe), на випадок якщо колись знадобиться.
	 */
	function onChange(callback) {
		if (typeof callback !== "function") return () => {};
		changeListeners.push(callback);
		return () => {
			const idx = changeListeners.indexOf(callback);
			if (idx !== -1) changeListeners.splice(idx, 1);
		};
	}

	function notifyChange() {
		changeListeners.forEach((fn) => {
			try {
				fn(currentLang);
			} catch (err) {
				console.error("[i18n] Помилка в onChange-підписнику:", err);
			}
		});
	}

	/**
	 * Визначає мову й завантажує словник, БЕЗ застосування перекладів
	 * до DOM. Призначена для виклику рано, у <head> — одразу після
	 * підключення locales/*.js та i18n.js, до того, як браузер почне
	 * будувати <body>. Це потрібно, щоб кастомні елементи на зразок
	 * <app-nav> (чий connectedCallback спрацьовує в момент парсингу
	 * <body>, тобто раніше за звичайний <script> в кінці сторінки)
	 * бачили вже правильну currentLang через I18N.getLang(), а не
	 * тимчасовий FALLBACK_LANG.
	 *
	 * Приклад підключення:
	 *   <script src="locales/uk.js"></script>
	 *   <script src="locales/en.js"></script>
	 *   <script src="locales/de.js"></script>
	 *   <script src="i18n.js"></script>
	 *   <script>I18N.detectAndLoad();</script>   <- ще в <head>
	 *   ...
	 *   <app-nav></app-nav>                       <- вже бачить правильну мову
	 *   ...
	 *   <script>I18N.applyTranslations();</script> <- в кінці <body>, коли DOM готовий
	 */
	function detectAndLoad() {
		const lang = detectInitialLang();
		loadLang(lang);
		return currentLang;
	}

	/**
	 * Повна ініціалізація сторінки: визначає мову, бере відповідний
	 * словник, одразу застосовує переклади до наявного DOM. Викликати
	 * в кінці <body> (чи на DOMContentLoaded), коли розмітка вже є.
	 *
	 * Якщо на сторінці ВЖЕ викликався detectAndLoad() раніше (в <head>,
	 * перед кастомними елементами на зразок <app-nav>) — init() просто
	 * повторно застосує переклади з уже завантаженого словника, мову
	 * заново не перевизначає.
	 */
	function init() {
		if (!initialized) {
			detectAndLoad();
			initialized = true;
		}
		applyTranslations();
		return currentLang;
	}

	/**
	 * Змінює мову вручну (для перемикача мови в nav). Зберігає вибір
	 * в localStorage - відтепер він має пріоритет над системною мовою.
	 * Після застосування статичних перекладів (applyTranslations)
	 * сповіщає підписників onChange(), щоб вони перерахували власні
	 * динамічні тексти.
	 */
	function setLang(lang) {
		if (!SUPPORTED_LANGS.includes(lang)) {
			console.error(`[i18n] Непідтримувана мова: "${lang}"`);
			return currentLang;
		}
		global.localStorage.setItem(STORAGE_KEY, lang);
		loadLang(lang);
		initialized = true;
		applyTranslations();
		notifyChange();
		return currentLang;
	}

	function getLang() {
		return currentLang;
	}

	global.I18N = {
		SUPPORTED_LANGS,
		FALLBACK_LANG,
		detectAndLoad,
		init,
		setLang,
		getLang,
		t,
		applyTranslations,
		onChange,
	};
})(window);
