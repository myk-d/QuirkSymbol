# Фічі — відповідність Excalidraw / Excalidraw+

Джерела для порівняння: excalidraw.com (безкоштовний функціонал), plus.excalidraw.com/plus (таблиця
"Feature comparison" Free vs Plus, досліджено через Playwright 2026-09-15). Статус фіч цього проєкту:

| Фіча | Статус | Коментар |
|---|---|---|
| Rectangle / Ellipse / Diamond | ✅ Фаза 1 | `domain/board.ts` + `render/ElementShape.tsx` |
| Arrow / Line | ✅ Фаза 1 | Konva `Arrow`/`Line`, точки відносні до `x,y` |
| Freehand draw (pencil) | ✅ Фаза 1 | Konva `Line` з `tension`, без сирого джиттера — власний стиль |
| Text | ✅ Фаза 1 | HTML `<textarea>`-оверлей для редагування, Konva `Text` для рендеру |
| Eraser | ✅ Фаза 1 | Click/drag по фігурі → soft-delete |
| Pan / zoom | ✅ Фаза 1 | Коліщатко + інструмент "Панорама" (`H`), `domain/view.ts` |
| Multi-select (marquee, shift-click) | ✅ Фаза 1 | `BoardCanvas` |
| **Resize / rotate** | ✅ Фаза 1, розширено пізніше | Konva `Transformer` — усі типи фігур (спершу лише rectangle/ellipse/diamond, `text`/`line`/`arrow`/`draw` додано пізніше за скаргою користувача на відсутні ручки), і одиночне, і групове (multi-select) виділення. Текст масштабує розмір шрифту, лінії/стрілки/малювання — координати `points`. Кадр і текст без обертання (структурні/редагування-через-HTML-оверлей обмеження) |
| Undo / redo | ✅ Фаза 1 | `domain/history.ts`, commit-based стек |
| Стиль (колір/заповнення/товщина/прозорість) | ✅ Фаза 1 | `PropertiesPanel.tsx`, обмежена палітра свотчів |
| Duplicate / layering (наперед/назад) | ✅ Фаза 1 | — |
| "Sketchy" hand-drawn рендер (rough.js) | ❌ Поза скоупом | Свідомо: власний стиль замість імітації Excalidraw (рішення користувача) |
| **Дошка без входу (guest mode)** | ✅ Фаза 1 | Як excalidraw.com: `/` одразу відкриває канвас, зберігається в `localStorage` цього браузера (`useBoardStore.startGuestSession`, `services/localBoard.service.ts`) — без реєстрації |
| **Командна співпраця в реальному часі** | ✅ Фаза 1 | Excalidraw+ фіча, доступна після входу. Firestore `onSnapshot` на `projects/{id}/elements`, документ на фігуру |
| Доступ по email-запрошенню | ✅ Фаза 1 | Excalidraw+ фіча. `ProjectDoc.members` + Firestore rules |
| **Вхід поштою/паролем (не лише Google)** | ✅ Фаза 3 | На прохання користувача — робочі пошти не завжди Google (напр. Microsoft). Реєстрація/вхід/відновлення пароля на `/login` (`useAuthStore.ts`), обов'язкове підтвердження пошти листом (`VerifyEmailNotice.tsx` — Firestore rules вимагають `email_verified`), Google лишається основним варіантом |
| Плаваючий тулбар по центру зверху + хамбургер-меню | ✅ Фаза 1 | За зразком excalidraw.com (досліджено через Playwright): `Toolbar.tsx`, `HamburgerMenu.tsx` |
| PNG-експорт | ✅ Фаза 1 | Хамбургер-меню → "Експортувати як PNG", обрізає по bounding box фігур, `Konva.Stage.toDataURL` |
| Очистити полотно | ✅ Фаза 1 | Хамбургер-меню, з підтвердженням; скасовується через Ctrl+Z |
| Гарячі клавіші (довідка) | ✅ Фаза 1 | `?` або хамбургер-меню → `ShortcutsHelp.tsx` |
| **Коментарі на канвасі** | ✅ Фаза 2 | Excalidraw+ фіча — інструмент "Коментар" на тулбарі, пінки на канвасі, правий висувний сайдбар (`CommentsPanel.tsx`), треди з відповідями, resolve/reopen, лічильник невирішених у TopBar |
| Live-курсори учасників / presence | ✅ Фаза 2 | `projects/{id}/presence/{uid}`, throttled запис + heartbeat, застарілі (>10с) курсори приховуються; аватарки "хто зараз тут" у TopBar |
| **Перенесення гостьової дошки в проєкт після входу** | ✅ Фаза 3 | `GuestBoard` показує банер "Зберегти як проєкт", коли людина залогинена, а на гостьовій дошці є фігури (`MigrateGuestBanner.tsx`) — створює новий `cloud`-проєкт і копіює туди видимі фігури (`services/migrateGuestBoard.ts`), гостьову дошку не чіпає |
| **Вставка зображень** | ✅ Фаза 3 | Кнопка "Зображення" на тулбарі (файл з диска) + Ctrl+V (буфер обміну) — без Firebase Storage/Blaze-плану: стискається на клієнті (max 800px, JPEG, бюджет ~180КБ з агресивним фолбеком по якості/розміру, `utils/imageCompress.ts`) і йде як base64 просто в документ фігури у Firestore (елементи й так по документу на фігуру, тож 1 МБ ліміт документа не проблема) |
| **Frame tool** | ✅ Фаза 3 | Інструмент "Кадр" (F) — прямокутний контейнер з підписом (подвійний клік перейменовує), геометрично "діти" (фігури повністю всередині) рухаються разом з кадром при перетягуванні, але НЕ при resize; видалення кадру дітей не чіпає (без персистентного `frameId` — членство рахується на льоту з `rectContains`, `BoardCanvas.tsx frameChildren`) |
| **Web Embed** | ✅ Фаза 3 | Кнопка "Веб-вбудова" на тулбарі — діалог просить `http(s)` посилання (інші схеми, напр. `javascript:`, відхиляються ще до вставки), створює елемент `type: 'embed'` за замовчуванням 480×320. Konva малює лише заглушку з host-іменем; справжній `<iframe>` — HTML-оверлей поверх канвасу (`EmbedOverlays.tsx`), захований, поки елемент виділено (інакше він перекриває ручки Transformer'а), і неактивний для кліків (`pointer-events: none`), поки не активований подвійним кліком (вихід — Escape або клік по канвасу) |
| **Лазерна указка** | ✅ Фаза 3 | Інструмент "Лазерна указка" (K) — не малює фігур, лише тимчасовий згасаючий слід за курсором, поки затиснута миша. Власний слід рендериться миттєво локально; для інших учасників проєкту (Фаза 2 presence) — реконструюється на клієнті з потоку `cursorX/Y`+`updatedAt`, бо сам presence-документ тримає лише останню точку, а не історію (`LaserTrails.tsx`) |
| Bucket fill / Lasso selection | 🔜 Фаза 3+ | З "..." меню Excalidraw |
| **Групування фігур** | ✅ Фаза 3 | Ctrl+G/Ctrl+Shift+G, клік по фігурі в групі виділяє всю групу (`domain/board.ts groupMembers`, `BoardElement.groupId`) |
| **Вирівнювання / розподілення / snap-to-object** | ✅ Фаза 3 | `PropertiesPanel` — 6 кнопок вирівнювання відносно bbox виділення + розподілення (3+ фігур); під час перетягування магнітить до країв/центрів інших фігур з лінією-підказкою (`domain/geometry.ts`: `alignOffset`, `distributeOffsets`, `snapMove`) |
| **SVG-експорт** | ✅ Фаза 3 | Хамбургер-меню → "Експортувати як SVG" — власна серіалізація `BoardElement[]` у SVG-розмітку (`domain/svgExport.ts`), той самий візуальний стиль, що й Konva-рендер (заокруглені кути, вістря стрілок, згладжене "Малювання" через Катмул-Ром→Безьє), а не растровий знімок |
| Бібліотеки фігур / стемпів | 🔜 Фаза 3+ | Excalidraw+ фіча |
| AI-фічі (text-to-diagram, wireframe-to-code) | ❌ Поза скоупом | Свідомо: рішення користувача не додавати AI-функціонал |
| Необмежене сховище / адмінка команди | ❌ Поза скоупом | Excalidraw+ біллінг-фіча, нерелевантна для pet-проєкту на 1 Firebase-проєкті |

## Додатково знайдено на plus.excalidraw.com/plus (таблиця "Feature comparison")

Colonка "Create" (Presentations), "Collaborate" (View-only access, Voice hangout & screensharing),
"Teams" (Workspace Teams, Organize into collections), "Share" (Embeddable/Readonly links, PDF & PPTX
export), "Libraries" (Personal/Workspace library) — фічі, яких ще не було в чеклісті вище:

| Фіча (з plus.excalidraw.com) | Статус | Коментар |
|---|---|---|
| Presentations / Slide mode | 🤔 Під питанням | Прибрано з найближчого плану (`PHASES.md` Фаза 3e+) — лягає на Frame tool, якщо колись знадобиться |
| **View-only share-посилання** | ✅ Готово | `/view/:projectId` — публічний read-only маршрут без входу (`PublicView.tsx`, `ReadOnlyCanvas.tsx`: лише пан/зум, без Konva Transformer і без `useBoardStore`). Вмикає власник у `ShareDialog` (`ProjectDoc.publicViewEnabled`, вимкнено за замовчуванням), посилання з копіюванням. Firestore rules: анонімне читання проєкту й `elements` дозволене лише коли `publicViewEnabled == true`; коментарі/presence лишаються тільки для учасників |
| **JSON-експорт/імпорт сцени** | ✅ Готово | Хамбургер-меню → "Експортувати як JSON" / "Імпортувати з JSON". Свій формат (`domain/sceneFile.ts`, `{ type: 'quirksymbol/scene', version, elements }`), не excalidraw-сумісний — лише бекап/перенесення між власними дошками (guest ⇄ guest, проєкт ⇄ проєкт). Імпорт додає елементи як нові (нові id/z-index), не перезаписує наявні |
| Організація проєктів у колекції/теки | 🤔 Під питанням | Прибрано з найближчого плану (`PHASES.md` Фаза 3e+) — зараз пласкій список проєктів (`/projects`) без групування |
| Workspace Teams / централізоване керування командою | 🤔 Під питанням | У Excalidraw+ — окремі "робочі простори" з кількома проєктами й спільним списком учасників. У нас уже є доступ по email на рівні кожного проєкту (`ProjectDoc.members`) — це покриває більшість команд для pet-проєкту; повноцінні workspace-и це велика структурна зміна даних |
| Voice hangout & screensharing | 🤔 Під питанням | Потребує WebRTC-сигнальний сервер, дозволи на мікрофон/камеру — суттєво більша інфраструктурна складність, ніж решта фіч. Рекомендація: свідомо відкласти, поки не попросить користувач |
| PDF & PPTX-експорт | 🤔 Під питанням | Потребує окремої бібліотеки генерації PPTX і логіки пагінації — нижчий пріоритет за SVG/JSON; має сенс лише разом із Presentations |
| Quick dashboard access | ✅ Вже є | Це і є наша сторінка `/projects` — список дошок команди |
