"""Translation catalogue.

Arabic is the primary locale and is complete. English exists so the direction
and locale plumbing is exercised by real content rather than being theoretical;
it falls back to Arabic for any key it does not define, so adding a locale is
purely additive.
"""

from __future__ import annotations

DEFAULT_LOCALE = "ar"
LOCALES = ("ar", "en")
RTL_LOCALES = ("ar",)

AR: dict[str, str] = {
    # --- Chrome ---
    "site.name": "منصة السلام للمعلومات الطارئة",
    "site.short": "منصة السلام",
    "site.tagline": "غرفة معلومات هادئة تصلك بالمصادر الرسمية",
    "nav.home": "الرئيسية",
    "nav.updates": "التحديثات الرسمية",
    "nav.rumors": "التحقق من الشائعات",
    "nav.assistant": "المساعد الذكي",
    "nav.services": "أرقام الطوارئ",
    "nav.guidance": "إرشادات السلامة",
    "nav.faq": "الأسئلة الشائعة",
    "nav.report": "الإبلاغ عن مشكلة",
    "nav.sources": "المصادر الرسمية",
    "nav.about": "عن المنصة",
    "nav.dashboard": "لوحة التحكم",
    "nav.skip": "تخطَّ إلى المحتوى الرئيسي",
    "nav.menu": "القائمة",
    "footer.rights": "منصة معلومات عامة. المعلومات الرسمية تعود لمصادرها.",
    "footer.governance": "الحوكمة",
    "footer.privacy": "الخصوصية",
    "footer.terms": "شروط الاستخدام",
    "footer.accessibility": "إمكانية الوصول",
    "footer.lowdata": "الوضع الخفيف",
    "footer.lowdata.on": "تشغيل الوضع الخفيف",
    "footer.lowdata.off": "إيقاف الوضع الخفيف",
    "lang.switch": "English",

    # --- Demo / governance banners ---
    "demo.banner": "بيانات توضيحية",
    "demo.explain": "هذه بيانات عرض توضيحي وليست معلومات حكومية حقيقية.",
    "demo.number": "رقم توضيحي — ليس رقماً حقيقياً",

    # --- Crisis status ---
    "crisis.none": "لا توجد حالة طارئة نشطة حالياً",
    "crisis.none.body": "المنصة جاهزة. عند بدء أي حالة طارئة ستظهر التفاصيل هنا.",
    "crisis.severity": "مستوى الخطورة",
    "crisis.severity.low": "منخفض",
    "crisis.severity.medium": "متوسط",
    "crisis.severity.high": "مرتفع",
    "crisis.status": "الحالة",
    "crisis.status.ongoing": "مستمرة",
    "crisis.status.under_control": "تحت السيطرة",
    "crisis.status.ended": "منتهية",
    "crisis.updated": "آخر تحديث",
    "crisis.calm": "نوفّر المعلومات الرسمية فور توفرها. يرجى اتباع التوجيهات الرسمية وتجنب تداول المعلومات غير المؤكدة.",

    # --- Emergency mode ---
    "emergency.active": "وضع الطوارئ مفعّل",

    # --- Home quick actions ---
    "home.actions": "ماذا تريد أن تفعل؟",
    "action.updates": "آخر التحديثات الرسمية",
    "action.updates.desc": "بيانات وتحديثات من الجهات الرسمية",
    "action.verify": "تحقق من شائعة",
    "action.verify.desc": "أرسل ما سمعته ليتم التحقق منه",
    "action.services": "أرقام الطوارئ والمساعدة",
    "action.services.desc": "اتصال مباشر بالجهات المختصة",
    "action.faq": "الأسئلة الشائعة",
    "action.faq.desc": "إجابات سريعة لأكثر الأسئلة تكراراً",
    "action.assistant": "اسأل المساعد الذكي",
    "action.assistant.desc": "إجابات من المصادر الرسمية مع ذكر المصدر",
    "action.report": "الإبلاغ عن مشكلة",
    "action.report.desc": "أبلغ عن مشكلة أو حاجة",
    "home.trending": "شائعات قيد المتابعة",
    "home.sources": "مصادر رسمية موثوقة",
    "home.search": "ابحث عن معلومة",
    "home.search.placeholder": "مثال: هل المدارس مغلقة؟",
    "home.search.button": "بحث",
    "home.latest": "أحدث التحديثات",

    # --- Updates ---
    "updates.title": "التحديثات الرسمية",
    "updates.intro": "بيانات صادرة عن جهات رسمية، مرتبة من الأحدث.",
    "updates.filter.category": "التصنيف",
    "updates.filter.importance": "الأهمية",
    "updates.filter.all": "الكل",
    "updates.search": "ابحث في التحديثات",
    "updates.verified": "موثّق رسمياً",
    "updates.source": "المصدر",
    "updates.source_link": "الرابط الرسمي",
    "updates.original": "النص الرسمي الأصلي",
    "updates.simplified": "ملخص مبسّط",
    "updates.simplified.note": "ملخص مبسّط راجعه واعتمده مختص. النص الرسمي الكامل مرفق أدناه.",
    "updates.empty": "لا توجد تحديثات منشورة بعد.",
    "updates.back": "العودة إلى التحديثات",
    "category.transport": "المواصلات والطرق",
    "category.education": "التعليم",
    "category.public_services": "الخدمات العامة",
    "category.health_safety": "الصحة والسلامة",
    "category.general": "إرشادات عامة",
    "importance.normal": "عادي",
    "importance.important": "مهم",
    "importance.critical": "عاجل",

    # --- Rumors ---
    "rumors.title": "التحقق من الشائعات",
    "rumors.intro": "نتائج التحقق التي اعتمدها مراجع بشري.",
    "rumors.submit.title": "أرسل شائعة للتحقق",
    "rumors.submit.claim": "ما هو الادعاء أو الخبر؟",
    "rumors.submit.claim.help": "اكتب ما سمعته أو قرأته كما هو قدر الإمكان.",
    "rumors.submit.platform": "أين رأيته؟",
    "rumors.submit.platform.help": "مثال: واتساب، فيسبوك، من أحد المعارف.",
    "rumors.submit.related": "هل يتعلق بالحالة الطارئة الحالية؟",
    "rumors.submit.button": "إرسال للتحقق",
    "rumors.submit.received": "تم استلام طلبك",
    "rumors.submit.received.body": "سيراجع فريق مختص هذا الادعاء مقابل المصادر الرسمية. لا تُنشر أي نتيجة قبل اعتماد مراجع بشري.",
    "rumors.submit.duplicate": "تم استلام هذا الادعاء من أشخاص آخرين أيضاً، وأضفنا بلاغك إليه.",
    "rumors.status": "النتيجة",
    "rumors.status.unverified": "غير مؤكد",
    "rumors.status.under_review": "قيد المراجعة",
    "rumors.status.verified": "صحيح",
    "rumors.status.misleading": "مضلل",
    "rumors.status.false": "غير صحيح",
    "rumors.status.resolved": "منتهٍ",
    "rumors.claim": "الادعاء المتداول",
    "rumors.correction": "التصحيح الرسمي",
    "rumors.explanation": "التفسير",
    "rumors.checked_at": "تاريخ التحقق",
    "rumors.spread": "مستوى الانتشار",
    "rumors.spread.note": "يعكس عدد البلاغات التي وصلتنا، وليس الانتشار الفعلي على المنصات.",
    "rumors.source": "المصدر الرسمي",
    "rumors.share": "بطاقة قابلة للمشاركة",
    "rumors.empty": "لا توجد نتائج تحقق منشورة بعد.",
    "rumors.governance": "كل نتيجة هنا راجعها واعتمدها مختص بشري قبل النشر.",

    # --- Assistant ---
    "assistant.title": "المساعد الذكي",
    "assistant.intro": "يجيب من المصادر الرسمية المعتمدة فقط، ويذكر المصدر مع كل إجابة.",
    "assistant.placeholder": "اكتب سؤالك هنا",
    "assistant.ask": "اسأل",
    "assistant.thinking": "جارٍ البحث في المصادر الرسمية…",
    "assistant.answer": "الإجابة",
    "assistant.sources": "المصادر",
    "assistant.confidence": "مستوى الثقة",
    "assistant.confidence.high": "مرتفع",
    "assistant.confidence.medium": "متوسط",
    "assistant.confidence.low": "منخفض",
    "assistant.disclaimer": "هذه إجابة آلية مبنية على المصادر الرسمية المذكورة. للحالات العاجلة اتصل بالجهات المختصة مباشرة.",
    "assistant.suggested": "أسئلة مقترحة",
    "assistant.feedback": "هل كانت هذه الإجابة مفيدة؟",
    "assistant.feedback.yes": "نعم",
    "assistant.feedback.no": "لا",
    "assistant.feedback.thanks": "شكراً لملاحظتك.",
    "assistant.conflict": "المصادر الرسمية تختلف حول هذه النقطة. راجع المصادر أدناه، والمنصة أحالت الأمر إلى مراجعة بشرية.",
    "assistant.insufficient": "لا تتوفر حالياً معلومات رسمية موثقة كافية للإجابة على هذا السؤال.",
    "assistant.insufficient.next": "يمكنك مراجعة التحديثات الرسمية، أو الاتصال بالجهة المختصة.",
    "assistant.blocked": "لا يمكن عرض إجابة على هذا السؤال. يرجى الرجوع إلى الجهة الرسمية المختصة.",
    "assistant.too_short": "يرجى كتابة سؤال أوضح قليلاً.",
    "assistant.disabled": "المساعد الذكي متوقف مؤقتاً. التحديثات الرسمية والأرقام متاحة كالمعتاد.",
    "assistant.unavailable": "تعذّر الوصول إلى خدمة الإجابة حالياً. المعلومات الرسمية متاحة في صفحة التحديثات.",
    "assistant.emergency_directory": "للحالات العاجلة، اتصل مباشرة بالجهات التالية:",
    "assistant.restricted.medical_treatment": "لا نقدّم إرشادات علاجية أو جرعات دوائية. يرجى التواصل مع جهة طبية مختصة.",
    "assistant.restricted.legal_advice": "لا نقدّم استشارات قانونية. يرجى مراجعة الجهة القانونية المختصة.",
    "assistant.restricted.casualty_figures": "أعداد الإصابات والوفيات تصدر حصراً عن الجهات الرسمية. راجع التحديثات الرسمية.",
    "assistant.suggest.updates": "ما آخر التحديثات؟",
    "assistant.suggest.what_to_do": "ماذا يجب أن أفعل الآن؟",
    "assistant.suggest.emergency": "ما هو رقم الطوارئ؟",
    "assistant.suggest.verify": "كيف أتحقق من شائعة؟",
    "assistant.suggest.roads": "هل الطرق مفتوحة؟",
    "assistant.suggest.schools": "هل المدارس تعمل؟",

    # --- Services ---
    "services.title": "أرقام الطوارئ والمساعدة",
    "services.intro": "أرقام الجهات الرسمية. اضغط على الرقم للاتصال مباشرة من الهاتف.",
    "services.call": "اتصال",
    "services.hours": "أوقات العمل",
    "services.website": "الموقع الرسمي",
    "services.location": "الموقع",
    "services.status.active": "يعمل",
    "services.status.degraded": "ضغط عالٍ",
    "services.status.inactive": "متوقف",
    "services.empty": "لا توجد جهات مسجلة حالياً.",
    "service_type.general_emergency": "الطوارئ العامة",
    "service_type.civil_defense": "الدفاع المدني",
    "service_type.ambulance": "الإسعاف",
    "service_type.police": "الشرطة",
    "service_type.electricity": "الكهرباء",
    "service_type.water": "المياه",
    "service_type.municipality": "البلدية",
    "service_type.government_call_center": "مركز الاتصال الحكومي",
    "service_type.hospital": "المستشفيات",
    "service_type.shelter": "مراكز الإيواء",

    # --- Guidance ---
    "guidance.title": "إرشادات السلامة",
    "guidance.intro": "إرشادات عملية قبل الحالة الطارئة وأثناءها وبعدها.",
    "guidance.phase.before": "قبل",
    "guidance.phase.during": "أثناء",
    "guidance.phase.after": "بعد",
    "guidance.audience.general": "إرشادات عامة",
    "guidance.audience.elderly": "كبار السن",
    "guidance.audience.children": "الأطفال",
    "guidance.audience.disabilities": "ذوو الإعاقة",
    "guidance.audience.vulnerable": "الفئات الأكثر احتياجاً",
    "guidance.kind.do": "افعل",
    "guidance.kind.dont": "تجنّب",
    "guidance.empty": "لا توجد إرشادات منشورة بعد.",

    # --- FAQ ---
    "faq.title": "الأسئلة الشائعة",
    "faq.intro": "إجابات معتمدة على الأسئلة الأكثر تكراراً.",
    "faq.search": "ابحث في الأسئلة",
    "faq.popular": "الأكثر سؤالاً",
    "faq.empty": "لا توجد أسئلة منشورة بعد.",
    "faq.category.education": "التعليم",
    "faq.category.roads": "الطرق",
    "faq.category.public_services": "الخدمات العامة",
    "faq.category.health": "الصحة",
    "faq.category.assistance": "المساعدة",
    "faq.category.general": "عام",

    # --- Report ---
    "report.title": "الإبلاغ عن مشكلة أو حاجة",
    "report.warning": "هذه المنصة لا تغني عن خدمات الطوارئ. إذا كنت في خطر مباشر اتصل بالطوارئ الآن.",
    "report.type": "نوع البلاغ",
    "report.type.emergency": "حالة طارئة",
    "report.type.service_issue": "مشكلة في خدمة",
    "report.type.rumor": "شائعة أو معلومة مشكوك فيها",
    "report.type.information_request": "طلب معلومة",
    "report.type.other": "أخرى",
    "report.description": "وصف الحالة",
    "report.location": "الموقع التقريبي",
    "report.location.help": "اختياري. حي أو منطقة يكفي.",
    "report.is_emergency": "هذه حالة عاجلة",
    "report.contact": "وسيلة تواصل",
    "report.contact.help": "اختياري. يمكنك تركه فارغاً.",
    "report.submit": "إرسال البلاغ",
    "report.received": "تم استلام بلاغك",
    "report.no_dispatch": "تنبيه مهم: هذه المنصة لا ترسل البلاغات تلقائياً إلى أي جهة. المعلومات أدناه توضح الجهة التي ينبغي التواصل معها.",
    "report.route.emergency": "حالتك تتطلب اتصالاً مباشراً بخدمات الطوارئ الآن.",
    "report.route.service": "يُنصح بالتواصل مع مركز الاتصال الحكومي أو الجهة المزوّدة للخدمة.",
    "report.route.rumor": "أُحيل بلاغك إلى مسار التحقق من الشائعات.",
    "report.route.information": "يمكنك متابعة التحديثات الرسمية أو سؤال المساعد الذكي.",

    # --- Sources ---
    "sources.title": "المصادر الرسمية",
    "sources.intro": "الجهات التي تعتمد عليها المنصة، وسبب اعتمادها.",
    "sources.trust": "مستوى الموثوقية",
    "sources.why": "لماذا نعتمد هذا المصدر",
    "sources.visit": "زيارة الموقع الرسمي",
    "sources.verified": "موثّق",

    # --- About ---
    "about.title": "عن المنصة",
    "about.mission": "الرسالة",
    "about.what": "ماذا تفعل المنصة",
    "about.what_not": "ما لا تفعله المنصة",
    "about.verification": "منهجية التحقق",
    "about.ai": "كيف نستخدم الذكاء الاصطناعي",
    "about.oversight": "الإشراف البشري",
    "about.data": "التعامل مع البيانات",
    "about.governance": "نموذج الحوكمة",
    "about.privacy": "سياسة الخصوصية",
    "about.terms": "شروط الاستخدام",
    "about.disclaimer": "إخلاء مسؤولية",

    # --- Shared UI ---
    "ui.loading": "جارٍ التحميل…",
    "ui.error": "تعذّر إتمام العملية. يرجى المحاولة مرة أخرى.",
    "ui.error.offline": "يبدو أن الاتصال بالإنترنت منقطع. المعلومات المعروضة قد لا تكون محدّثة.",
    "ui.retry": "إعادة المحاولة",
    "ui.empty": "لا توجد عناصر لعرضها.",
    "ui.required": "مطلوب",
    "ui.optional": "اختياري",
    "ui.yes": "نعم",
    "ui.no": "لا",
    "ui.close": "إغلاق",
    "ui.more": "التفاصيل",
    "ui.back": "رجوع",
    "ui.forbidden": "لا تملك صلاحية الوصول إلى هذه الصفحة.",
    "ui.notfound": "الصفحة غير موجودة.",
    "ui.ratelimited": "عدد المحاولات كبير. يرجى الانتظار قليلاً ثم المحاولة مجدداً.",
    "ui.servererror": "حدث خلل مؤقت. فريقنا يعمل على معالجته.",
    "ui.justnow": "الآن",
    "ui.minutes_ago": "قبل {n} دقيقة",
    "ui.hours_ago": "قبل {n} ساعة",
    "ui.days_ago": "قبل {n} يوم",

    # --- Dashboard ---
    "dash.login": "تسجيل الدخول",
    "dash.email": "البريد الإلكتروني",
    "dash.password": "كلمة المرور",
    "dash.logout": "تسجيل الخروج",
    "dash.login.error": "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
    "dash.overview": "نظرة عامة",
    "dash.updates": "التحديثات",
    "dash.rumors": "الشائعات",
    "dash.faqs": "الأسئلة",
    "dash.services": "الجهات",
    "dash.alerts": "التنبيهات",
    "dash.reports": "البلاغات",
    "dash.sources": "المصادر",
    "dash.knowledge": "قاعدة المعرفة",
    "dash.ai": "إعدادات الذكاء الاصطناعي",
    "dash.quality": "جودة الإجابات",
    "dash.users": "المستخدمون",
    "dash.audit": "سجل التدقيق",
    "dash.crisis": "الحالة الطارئة",
}

EN: dict[str, str] = {
    "site.name": "Peace Emergency Information Platform",
    "site.short": "Peace Platform",
    "site.tagline": "A calm information room connecting you to official sources",
    "nav.home": "Home",
    "nav.updates": "Official updates",
    "nav.rumors": "Rumor verification",
    "nav.assistant": "AI assistant",
    "nav.services": "Emergency numbers",
    "nav.guidance": "Safety guidance",
    "nav.faq": "FAQ",
    "nav.report": "Report a problem",
    "nav.sources": "Official sources",
    "nav.about": "About",
    "nav.dashboard": "Dashboard",
    "nav.skip": "Skip to main content",
    "nav.menu": "Menu",
    "footer.rights": "A public information platform. Official information belongs to its sources.",
    "footer.lowdata.on": "Enable low-data mode",
    "footer.lowdata.off": "Disable low-data mode",
    "lang.switch": "العربية",
    "demo.banner": "DEMONSTRATION DATA",
    "demo.explain": "This is demonstration data, not real government information.",
    "demo.number": "Demo number — not a real service",
    "crisis.none": "No active emergency",
    "crisis.calm": "We publish official information as it becomes available. Please follow official guidance and avoid sharing unverified information.",
    "crisis.severity.low": "Low",
    "crisis.severity.medium": "Medium",
    "crisis.severity.high": "High",
    "crisis.status.ongoing": "Ongoing",
    "crisis.status.under_control": "Under control",
    "crisis.status.ended": "Ended",
    "assistant.insufficient": "There is currently not enough verified official information to answer this question.",
    "assistant.blocked": "An answer cannot be shown for this question. Please contact the relevant official body.",
    "assistant.disclaimer": "This is an automated answer based on the official sources cited. In an emergency, contact the relevant service directly.",
    "assistant.emergency_directory": "For urgent situations, contact these services directly:",
    "report.warning": "This platform does not replace emergency services. If you are in immediate danger, call emergency services now.",
    "report.no_dispatch": "Important: this platform does not forward reports to any authority automatically. The guidance below tells you who to contact.",
    "ui.error": "Something went wrong. Please try again.",
    "ui.ratelimited": "Too many attempts. Please wait a moment and try again.",
    "ui.servererror": "A temporary problem occurred. Our team is looking into it.",
}

CATALOGUES: dict[str, dict[str, str]] = {"ar": AR, "en": EN}


def normalize_locale(value: str | None) -> str:
    if value and value.lower()[:2] in LOCALES:
        return value.lower()[:2]
    return DEFAULT_LOCALE


def direction(locale: str) -> str:
    return "rtl" if locale in RTL_LOCALES else "ltr"


def translate(key: str, locale: str = DEFAULT_LOCALE, **kwargs) -> str:
    """Look up ``key``, falling back to Arabic and then to the key itself.

    Returning the key rather than an empty string makes a missing translation
    obvious in the UI instead of silently producing a blank label.
    """
    catalogue = CATALOGUES.get(locale, AR)
    text = catalogue.get(key) or AR.get(key) or key
    if kwargs:
        try:
            return text.format(**kwargs)
        except (KeyError, IndexError):
            return text
    return text
