export const languages = [
  { code: "en", name: "English", flag: "🇺🇸" },
  { code: "ru", name: "Русский", flag: "🇷🇺" },
] as const;

export type LanguageCode = (typeof languages)[number]["code"];

export function normalizeLanguageCode(lang: string | undefined | null): LanguageCode {
  if (lang === "ru") return "ru";
  return "en";
}

let currentLang: LanguageCode = "en";

export function setLanguage(lang: LanguageCode) {
  currentLang = lang;
  if (typeof window !== "undefined") {
    localStorage.setItem("tunzone-lang", lang);
  }
}

export function getLanguage(): LanguageCode {
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem("tunzone-lang") || localStorage.getItem("furnishplan-lang");
    if (stored === "ru") return "ru";
  }
  return currentLang;
}

const plannerKeyMap: Record<string, string> = {
  "ai-room": "aiRoom",
  "room": "room",
  "kitchen": "kitchen",
  "kitchen-design": "kitchenDesign",
  "module-planner": "modulePlanner",
  "custom-design": "customDesign",
  "bathroom": "bathroom",
  "bedroom": "bedroom",
  "wardrobe": "wardrobe",
  "living-room": "livingRoom",
  "dining-room": "diningRoom",
  "office": "office",
  "children": "children",
  "hallway": "hallway",
};

export function plannerTranslationKey(plannerId: string): string {
  return plannerKeyMap[plannerId] || plannerId;
}

export const translations: Record<LanguageCode, Record<string, string>> = {
  en: {
    // Navbar
    "nav.catalog": "Catalog",
    "nav.planners": "Planners",
    "nav.features": "Features",
    "nav.howItWorks": "How It Works",
    "nav.browseCatalog": "Browse Catalog",

    // Hero
    "hero.badge": "EXPLORE OUR COLLECTION",
    "hero.title1": "Design furniture.",
    "hero.title2": "Build dreams.",
    "hero.subtitle": "Browse our furniture catalog, explore materials, and design your perfect rooms with interactive 3D planners.",
    "hero.tryPlanners": "Try Planners",
    "hero.trustedBy": "Trusted by",
    "hero.manufacturers": "manufacturers",
    "hero.roomPlanner": "3D Room Planner",
    "hero.roomPlannerDesc": "Drag, drop, and arrange furniture in real-time 3D",
    "hero.roomPreview": "3D Room Preview",
    "hero.realTimeRendering": "Real-time rendering",

    // Quick Access
    "quick.browseCatalog": "Browse Catalog",
    "quick.browseCatalogDesc": "Explore ready-made furniture with customization options.",
    "quick.buildModules": "Build with Modules",
    "quick.buildModulesDesc": "Combine modular units to build exactly what you need.",
    "quick.selectMaterials": "Select Materials",
    "quick.selectMaterialsDesc": "Choose colors, textures, and finishes for your furniture.",
    "quick.designPlanners": "Design Planners",
    "quick.designPlannersDesc": "Plan rooms with specialized 3D planners.",

    // Features
    "features.label": "Features",
    "features.title": "Everything you need",
    "features.subtitle": "Powerful tools for furniture manufacturers to create, showcase, and sell their products online.",
    "features.productCatalog": "Product Catalog",
    "features.productCatalogDesc": "Showcase your full furniture collection with beautiful imagery, pricing, and customization options.",
    "features.roomPlanner": "3D Room Planner",
    "features.roomPlannerDesc": "Let customers design rooms with your furniture in a realistic 3D environment with drag-and-drop.",
    "features.materialSelector": "Material Selector",
    "features.materialSelectorDesc": "Offer hundreds of materials, fabrics, and finishes so customers can personalize every piece.",
    "features.modularBuilder": "Modular Builder",
    "features.modularBuilderDesc": "Create modular furniture systems that customers can mix and match to fit their space perfectly.",
    "features.orderManagement": "Order Management",
    "features.orderManagementDesc": "Track orders from design to delivery with built-in order management and customer communications.",
    "features.analyticsDashboard": "Analytics Dashboard",
    "features.analyticsDashboardDesc": "Understand your customers with detailed analytics on popular products, materials, and room designs.",

    // How It Works
    "howItWorks.label": "How It Works",
    "howItWorks.title": "Get started in minutes",
    "howItWorks.subtitle": "Three simple steps to find and design your perfect furniture.",
    "howItWorks.step1Title": "Browse the Catalog",
    "howItWorks.step1Desc": "Explore our curated collection of furniture with detailed images, dimensions, and material options.",
    "howItWorks.step2Title": "Choose a Planner",
    "howItWorks.step2Desc": "Pick a room-specific planner to visualize furniture in your space with our interactive 3D tools.",
    "howItWorks.step3Title": "Design Your Room",
    "howItWorks.step3Desc": "Drag and drop furniture, choose materials, and create the perfect layout for your space.",

    // Testimonials
    "testimonials.label": "Testimonials",
    "testimonials.title": "Loved by manufacturers",
    "testimonials.subtitle": "See what furniture manufacturers are saying about Tunzone.",
    "testimonials.quote1": "Tunzone transformed how we sell furniture online. Our customers love designing their rooms before buying.",
    "testimonials.name1": "Sarah Johnson",
    "testimonials.role1": "CEO, Modern Living Co.",
    "testimonials.quote2": "The 3D room planner is incredible. We saw a 40% increase in online orders within the first month.",
    "testimonials.name2": "Michael Chen",
    "testimonials.role2": "Founder, Oak & Pine",
    "testimonials.quote3": "Setting up was a breeze. We had our entire catalog online with room planners in less than a week.",
    "testimonials.name3": "Emma Williams",
    "testimonials.role3": "Director, HomeStyle Ltd.",

    // CTA
    "cta.title": "Ready to design your space?",
    "cta.subtitle": "Explore our catalog and use our 3D planners to create the perfect room layout.",
    "cta.explorePlanners": "Explore Planners",

    // Footer
    "footer.tagline": "The all-in-one platform for furniture design and room planning.",
    "footer.explore": "Explore",
    "footer.roomPlanners": "Room Planners",
    "footer.materials": "Materials",
    "footer.moduleBuilder": "Module Builder",
    "footer.company": "Company",
    "footer.about": "About",
    "footer.blog": "Blog",
    "footer.careers": "Careers",
    "footer.contact": "Contact",
    "footer.legal": "Legal",
    "footer.privacy": "Privacy Policy",
    "footer.terms": "Terms of Service",
    "footer.cookies": "Cookie Policy",
    "footer.copyright": "© 2026 Tunzone. All rights reserved.",

    // Planners Hub
    "planners.title": "Design Planners",
    "planners.heroTitle": "Choose Your Planner",
    "planners.heroSubtitle": "Select a room-specific planner to get a curated catalog and optimized layout for your space, or use the full Room Planner for complete flexibility.",
    "planners.fullCatalog": "Full Catalog",
    "planners.copyright": "© 2026 Tunzone. All rights reserved.",

    // Planner names and descriptions
    "planner.aiRoom.name": "AI Room Planner",
    "planner.aiRoom.short": "AI Room",
    "planner.aiRoom.desc": "Submit one request with optional room or inspiration images, then get a rule-generated furniture plan with modules and estimated price.",
    "planner.room.name": "Room Planner",
    "planner.room.short": "Room",
    "planner.room.desc": "Design any room with our full furniture catalog. Drag, drop, and arrange everything in 3D.",
    "planner.kitchen.name": "Kitchen Planner",
    "planner.kitchen.short": "Kitchen",
    "planner.kitchen.desc": "Plan your dream kitchen layout. Place cabinets, appliances, countertops and more from the catalog in 3D.",
    "planner.kitchenDesign.name": "Kitchen Designer",
    "planner.kitchenDesign.short": "Kitchen+",
    "planner.kitchenDesign.desc": "Configure main wall and optional island runs, worktops, and materials (from your admin catalog when available). Semi-transparent blocks are layout aids only — not priced.",
    "planner.modulePlanner.name": "Module Planner",
    "planner.modulePlanner.short": "Modules",
    "planner.modulePlanner.desc": "Build named cabinet modules from your materials and dimensions. Save them on this device and use them in Kitchen Designer alongside your catalog — without touching the admin module list.",
    "planner.customDesign.name": "Custom planner",
    "planner.customDesign.short": "Custom",
    "planner.customDesign.desc": "Draw your own custom furniture in 2D, then view it in a 3D room. Switch between a drafting sheet and the room editor anytime.",
    "planner.bathroom.name": "Bathroom Planner",
    "planner.bathroom.short": "Bathroom",
    "planner.bathroom.desc": "Design your perfect bathroom with showers, bathtubs, vanities and storage solutions.",
    "planner.bedroom.name": "Bedroom Planner",
    "planner.bedroom.short": "Bedroom",
    "planner.bedroom.desc": "Create a cozy bedroom with beds, wardrobes, nightstands and ambient lighting.",
    "planner.wardrobe.name": "Wardrobe Planner",
    "planner.wardrobe.short": "Wardrobe",
    "planner.wardrobe.desc": "Design your perfect wardrobe unit. Choose frame size, add shelves, drawers, hanging rods, and doors — all in real-time 3D.",
    "planner.livingRoom.name": "Living Room Planner",
    "planner.livingRoom.short": "Living Room",
    "planner.livingRoom.desc": "Arrange sofas, entertainment centers, coffee tables and decor for the perfect living space.",
    "planner.diningRoom.name": "Dining Room Planner",
    "planner.diningRoom.short": "Dining",
    "planner.diningRoom.desc": "Set up your dining area with tables, chairs, lighting and storage for a great entertaining space.",
    "planner.office.name": "Office Planner",
    "planner.office.short": "Office",
    "planner.office.desc": "Design a productive workspace with desks, ergonomic chairs, monitors and storage.",
    "planner.children.name": "Children's Room Planner",
    "planner.children.short": "Kids",
    "planner.children.desc": "Create a fun and functional room for children with beds, play areas and clever storage.",
    "planner.hallway.name": "Hallway Planner",
    "planner.hallway.short": "Hallway",
    "planner.hallway.desc": "Organize your entryway with coat racks, shoe storage, benches and clever lighting.",

    // Catalog page
    "catalog.title": "Catalog",
    "catalog.ourCollection": "Our Collection",
    "catalog.piece": "piece",
    "catalog.pieces": "pieces",
    "catalog.ofFurniture": "of handcrafted furniture",
    "catalog.searchPlaceholder": "Search furniture...",
    "catalog.featured": "Featured",
    "catalog.priceLow": "Price: Low to High",
    "catalog.priceHigh": "Price: High to Low",
    "catalog.nameAZ": "Name: A → Z",
    "catalog.allItems": "All Items",
    "catalog.noItemsFound": "No items found",
    "catalog.noResults": "No results for \"{query}\". Try a different search term or adjust your filters.",
    "catalog.noItemsAvailable": "No items available in this category right now.",
    "catalog.resetFilters": "Reset All Filters",
    "catalog.viewDetails": "View Details",
    "catalog.addToCart": "Add to cart",
    "catalog.loading3d": "Loading 3D...",
    "catalog.delivery": "{days}d delivery",
    "catalog.grid": "Grid",
    "catalog.list": "List",
    "catalog.masonry": "Masonry",
    "catalog.magazine": "Magazine",
    "catalog.showcase": "Showcase",
    "catalog.reels": "Reels",
    "catalog.commerce": "Commerce",
    "catalog.gallery": "Gallery",
  },
  ru: {
    // Navbar
    "nav.catalog": "Каталог",
    "nav.planners": "Планировщики",
    "nav.features": "Возможности",
    "nav.howItWorks": "Как это работает",
    "nav.browseCatalog": "Открыть каталог",

    // Hero
    "hero.badge": "ОТКРОЙТЕ НАШУ КОЛЛЕКЦИЮ",
    "hero.title1": "Дизайн мебели.",
    "hero.title2": "Воплощайте мечты.",
    "hero.subtitle": "Просматривайте каталог мебели, изучайте материалы и проектируйте идеальные комнаты с помощью 3D-планировщиков.",
    "hero.tryPlanners": "Попробовать планировщики",
    "hero.trustedBy": "Доверяют",
    "hero.manufacturers": "производителей",
    "hero.roomPlanner": "3D-планировщик комнат",
    "hero.roomPlannerDesc": "Перетаскивайте мебель в 3D в реальном времени",
    "hero.roomPreview": "3D-просмотр комнаты",
    "hero.realTimeRendering": "Рендеринг в реальном времени",

    // Quick Access
    "quick.browseCatalog": "Каталог",
    "quick.browseCatalogDesc": "Готовая мебель с возможностью кастомизации.",
    "quick.buildModules": "Конструктор модулей",
    "quick.buildModulesDesc": "Комбинируйте модули для точной сборки.",
    "quick.selectMaterials": "Выбор материалов",
    "quick.selectMaterialsDesc": "Цвета, текстуры и отделка для вашей мебели.",
    "quick.designPlanners": "Планировщики",
    "quick.designPlannersDesc": "Проектируйте комнаты с 3D-планировщиками.",

    // Features
    "features.label": "Возможности",
    "features.title": "Всё, что нужно",
    "features.subtitle": "Мощные инструменты для производителей мебели: создание, презентация и продажа продукции онлайн.",
    "features.productCatalog": "Каталог продукции",
    "features.productCatalogDesc": "Витрина вашей коллекции с качественными изображениями, ценами и настройками.",
    "features.roomPlanner": "3D-планировщик комнат",
    "features.roomPlannerDesc": "Клиенты проектируют комнаты с вашей мебелью в реалистичном 3D с перетаскиванием.",
    "features.materialSelector": "Подбор материалов",
    "features.materialSelectorDesc": "Сотни материалов, тканей и отделок для персонализации каждого изделия.",
    "features.modularBuilder": "Модульный конструктор",
    "features.modularBuilderDesc": "Модульные системы мебели, которые клиенты комбинируют под свое пространство.",
    "features.orderManagement": "Управление заказами",
    "features.orderManagementDesc": "Отслеживание заказов от дизайна до доставки со встроенной коммуникацией.",
    "features.analyticsDashboard": "Аналитика",
    "features.analyticsDashboardDesc": "Анализ популярных товаров, материалов и дизайнов комнат.",

    // How It Works
    "howItWorks.label": "Как это работает",
    "howItWorks.title": "Начните за минуты",
    "howItWorks.subtitle": "Три простых шага к идеальной мебели.",
    "howItWorks.step1Title": "Откройте каталог",
    "howItWorks.step1Desc": "Изучите коллекцию мебели с фото, размерами и материалами.",
    "howItWorks.step2Title": "Выберите планировщик",
    "howItWorks.step2Desc": "Выберите планировщик для визуализации мебели в вашем пространстве.",
    "howItWorks.step3Title": "Спроектируйте комнату",
    "howItWorks.step3Desc": "Перетаскивайте мебель, выбирайте материалы и создавайте идеальную планировку.",

    // Testimonials
    "testimonials.label": "Отзывы",
    "testimonials.title": "Нас выбирают производители",
    "testimonials.subtitle": "Что говорят производители мебели о Tunzone.",
    "testimonials.quote1": "Tunzone изменил наш подход к онлайн-продажам. Клиенты обожают проектировать комнаты перед покупкой.",
    "testimonials.name1": "Сара Джонсон",
    "testimonials.role1": "CEO, Modern Living Co.",
    "testimonials.quote2": "3D-планировщик потрясающий. За первый месяц онлайн-заказы выросли на 40%.",
    "testimonials.name2": "Майкл Чен",
    "testimonials.role2": "Основатель, Oak & Pine",
    "testimonials.quote3": "Настройка заняла минимум времени. Весь каталог с планировщиками — менее чем за неделю.",
    "testimonials.name3": "Эмма Уильямс",
    "testimonials.role3": "Директор, HomeStyle Ltd.",

    // CTA
    "cta.title": "Готовы спроектировать пространство?",
    "cta.subtitle": "Откройте каталог и используйте 3D-планировщики для создания идеальной планировки.",
    "cta.explorePlanners": "Открыть планировщики",

    // Footer
    "footer.tagline": "Универсальная платформа для дизайна мебели и планирования комнат.",
    "footer.explore": "Навигация",
    "footer.roomPlanners": "Планировщики комнат",
    "footer.materials": "Материалы",
    "footer.moduleBuilder": "Конструктор модулей",
    "footer.company": "Компания",
    "footer.about": "О нас",
    "footer.blog": "Блог",
    "footer.careers": "Карьера",
    "footer.contact": "Контакты",
    "footer.legal": "Юридическое",
    "footer.privacy": "Политика конфиденциальности",
    "footer.terms": "Условия использования",
    "footer.cookies": "Политика cookies",
    "footer.copyright": "© 2026 Tunzone. Все права защищены.",

    // Planners Hub
    "planners.title": "Планировщики",
    "planners.heroTitle": "Выберите планировщик",
    "planners.heroSubtitle": "Выберите планировщик для конкретной комнаты с подобранным каталогом, или используйте общий планировщик для полной свободы.",
    "planners.fullCatalog": "Полный каталог",
    "planners.copyright": "© 2026 Tunzone. Все права защищены.",

    // Planner names and descriptions
    "planner.aiRoom.name": "AI-планировщик",
    "planner.aiRoom.short": "AI-комната",
    "planner.aiRoom.desc": "Отправьте один запрос с необязательными фото комнаты или вдохновения и получите план мебели, модули и ориентировочную цену.",
    "planner.room.name": "Планировщик комнат",
    "planner.room.short": "Комната",
    "planner.room.desc": "Проектируйте любую комнату с полным каталогом мебели. Перетаскивайте и размещайте всё в 3D.",
    "planner.kitchen.name": "Планировщик кухни",
    "planner.kitchen.short": "Кухня",
    "planner.kitchen.desc": "Спланируйте идеальную кухню. Размещайте шкафы, технику, столешницы и многое другое в 3D.",
    "planner.kitchenDesign.name": "Кухонный дизайнер",
    "planner.kitchenDesign.short": "Кухня+",
    "planner.kitchenDesign.desc": "Настройте основную стену и остров, столешницы и материалы (из каталога). Полупрозрачные блоки — для планировки.",
    "planner.modulePlanner.name": "Планировщик модулей",
    "planner.modulePlanner.short": "Модули",
    "planner.modulePlanner.desc": "Создавайте именованные модули из ваших материалов и размеров. Сохраняйте локально и используйте в дизайнере кухни.",
    "planner.customDesign.name": "Свой дизайн",
    "planner.customDesign.short": "Свой",
    "planner.customDesign.desc": "Нарисуйте мебель в 2D, затем просмотрите в 3D-комнате. Переключайтесь между чертежом и редактором.",
    "planner.bathroom.name": "Планировщик ванной",
    "planner.bathroom.short": "Ванная",
    "planner.bathroom.desc": "Спроектируйте идеальную ванную с душем, ванной, тумбами и системами хранения.",
    "planner.bedroom.name": "Планировщик спальни",
    "planner.bedroom.short": "Спальня",
    "planner.bedroom.desc": "Создайте уютную спальню с кроватями, шкафами, тумбочками и освещением.",
    "planner.wardrobe.name": "Планировщик шкафа",
    "planner.wardrobe.short": "Шкаф",
    "planner.wardrobe.desc": "Спроектируйте идеальный шкаф. Выберите каркас, полки, ящики, штанги и двери — всё в 3D.",
    "planner.livingRoom.name": "Планировщик гостиной",
    "planner.livingRoom.short": "Гостиная",
    "planner.livingRoom.desc": "Расставьте диваны, стенки, столики и декор для идеального пространства.",
    "planner.diningRoom.name": "Планировщик столовой",
    "planner.diningRoom.short": "Столовая",
    "planner.diningRoom.desc": "Обустройте столовую: столы, стулья, освещение и хранение.",
    "planner.office.name": "Планировщик офиса",
    "planner.office.short": "Офис",
    "planner.office.desc": "Создайте продуктивное рабочее пространство: столы, кресла, мониторы и хранение.",
    "planner.children.name": "Детская комната",
    "planner.children.short": "Детская",
    "planner.children.desc": "Весёлая и функциональная комната: кровати, игровые зоны и умное хранение.",
    "planner.hallway.name": "Планировщик прихожей",
    "planner.hallway.short": "Прихожая",
    "planner.hallway.desc": "Организуйте прихожую: вешалки, полки для обуви, банкетки и освещение.",

    // Catalog page
    "catalog.title": "Каталог",
    "catalog.ourCollection": "Наша коллекция",
    "catalog.piece": "единица",
    "catalog.pieces": "единиц",
    "catalog.ofFurniture": "мебели ручной работы",
    "catalog.searchPlaceholder": "Поиск мебели...",
    "catalog.featured": "Рекомендуемые",
    "catalog.priceLow": "Цена: по возрастанию",
    "catalog.priceHigh": "Цена: по убыванию",
    "catalog.nameAZ": "Название: А → Я",
    "catalog.allItems": "Все товары",
    "catalog.noItemsFound": "Ничего не найдено",
    "catalog.noResults": "По запросу «{query}» ничего не найдено. Попробуйте изменить запрос или фильтры.",
    "catalog.noItemsAvailable": "В этой категории пока нет товаров.",
    "catalog.resetFilters": "Сбросить фильтры",
    "catalog.viewDetails": "Подробнее",
    "catalog.addToCart": "В корзину",
    "catalog.loading3d": "Загрузка 3D...",
    "catalog.delivery": "{days} дн. доставка",
    "catalog.grid": "Сетка",
    "catalog.list": "Список",
    "catalog.masonry": "Мозаика",
    "catalog.magazine": "Журнал",
    "catalog.showcase": "Витрина",
    "catalog.reels": "Ролики",
    "catalog.commerce": "Магазин",
    "catalog.gallery": "Галерея",
  },
};

export function getTranslation(lang: LanguageCode | string, key: string): string {
  const code = normalizeLanguageCode(lang);
  return translations[code]?.[key] || translations.en[key] || key;
}
