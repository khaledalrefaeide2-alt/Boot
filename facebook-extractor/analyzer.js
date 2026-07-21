'use strict';

/*
 * FBX Analyzer — محرّك تحليل وتصنيف منشورات فيسبوك
 * ------------------------------------------------
 * محرّك عربي قائم على القواعد (rule-based) ينفّذ التصنيف الهرمي الكامل:
 *   المشاعر الأساسية → المشاعر الدقيقة → النية → المجال → شدة المخالفة
 *   → رفع العلم حسب السياسات → التوصية الإجرائية.
 *
 * يُستدعى عبر:  FBXAnalyzer.analyze(post)   حيث post = { text, author, likes, comments, shares, url }
 * ويعيد كائن تحليل كامل. كما يوفّر دوال عرض:
 *   FBXAnalyzer.badges(analysis)   → شارات مضغوطة (HTML)
 *   FBXAnalyzer.panel(analysis)    → لوحة التحليل الكاملة (HTML)
 *   FBXAnalyzer.injectStyles()     → يحقن CSS الخاص بعناصر التحليل
 *
 * لا يرسل المحرّك أي بيانات إلى الخارج — كل التحليل يجري محلياً في المتصفح.
 */

(function (global) {

  /* ============================================================
   * 1) تطبيع النص العربي
   * ============================================================ */
  function normalize(str) {
    return String(str || '')
      .replace(/[ً-ْٰـ]/g, '')      // إزالة التشكيل والتطويل
      .replace(/[إأآا]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ؤ/g, 'و')
      .replace(/ئ/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/\s+/g, ' ')
      .toLowerCase();
  }

  const has = (norm, words) => words.some(w => norm.includes(normalize(w)));
  const countHits = (norm, words) => words.reduce((n, w) => n + (norm.includes(normalize(w)) ? 1 : 0), 0);

  /* ============================================================
   * 2) المعاجم (Lexicons)
   * ============================================================ */

  // ---- فئات المخالفات السلبية، لكل فئة نطاق شدة ودلالات ----
  const NEGATIVE_CATEGORIES = [
    {
      id: 'INCITEMENT_VIOLENCE',
      label: 'تحريض على العنف',
      min: 8, max: 10,
      emotion: 'ANGER_INCITEMENT',
      intent: 'DIRECT_INCITEMENT',
      domain: 'SECURITY',
      flags: ['خطاب عنف ودعوة صريحة للقتل (سياسات ميتا/X)', 'الدعوة للقتل خارج القضاء (حقوق الإنسان)'],
      words: ['اقتلوا', 'اقتلوهم', 'نقتل', 'اذبحوا', 'الذبح', 'اذبحوهم', 'فجروا', 'فجّر', 'احرقوا', 'حرق بيوت',
              'دمروا', 'صفّوا', 'التصفية الجسدية', 'انتقموا', 'خذوا بالثأر', 'ثأر', 'اسحقوهم', 'اقضوا عليهم',
              'حان وقت السلاح', 'احملوا السلاح', 'هجوم مسلح', 'اغتيال', 'اغتالوا', 'دم بدم', 'موت لهم', 'اعدموهم']
    },
    {
      id: 'TERROR_SUPPORT',
      label: 'دعم تنظيمات إرهابية/متطرفة',
      min: 9, max: 10,
      emotion: 'ANGER_INCITEMENT',
      intent: 'EXPLICIT_SUPPORT',
      domain: 'SECURITY',
      flags: ['دعم منظمات خطرة أو إرهابية (سياسات ميتا/X)', 'تهديد مباشر للأمن القومي'],
      words: ['داعش', 'تنظيم الدولة', 'الخلافة الاسلامية', 'دولة الخلافة', 'البغدادي', 'الجولاني كافر',
              'غزوة', 'استشهادي', 'العمليات الاستشهادية', 'المجاهدون في', 'الدولة الاسلامية', 'بايعوا',
              'مبايعة', 'ننصر التنظيم', 'عائدون ايها', 'قسد الارهابيه']
    },
    {
      id: 'SECTARIAN_HATRED',
      label: 'كراهية وتحريض طائفي/عرقي',
      min: 7, max: 10,
      emotion: 'HATRED_DISCRIMINATION',
      intent: 'IMPLICIT_INCITEMENT',
      domain: 'HUMAN_RIGHTS',
      flags: ['خطاب كراهية على أساس ديني/عرقي (سياسات ميتا/X)', 'التحريض على الفتنة الطائفية (السلم الأهلي)'],
      words: ['نصيري', 'النصيريه', 'مجوس', 'رافضه', 'الروافض', 'خونه الطائفه', 'حثاله المجتمع', 'ينجّس',
              'تطهير طائفي', 'اباده', 'العلويون خونه', 'السنه ارهابيون', 'الاكراد انفصاليون', 'الشيعه اعداء',
              'اطردوهم من', 'لا مكان لهم بيننا', 'عرق نجس', 'حثاله', 'جرذان', 'صراصير', 'شيطنه',
              'الاقليه الحاقده', 'كفار', 'مرتدون']
    },
    {
      id: 'STATE_ATTACK',
      label: 'استهداف الدولة ومؤسساتها',
      min: 6, max: 8,
      emotion: 'DOUBT_CONSPIRACY',
      intent: 'DESTRUCTIVE_CRITICISM',
      domain: 'POLITICAL',
      flags: ['التشكيك الممنهج في شرعية الدولة', 'الدعوة للعصيان المدني المُدمّر'],
      words: ['اسقطوا الحكومه', 'اسقاط النظام الجديد', 'حكومه غير شرعيه', 'سلطه غير شرعيه', 'عصابه حاكمه',
              'انزلوا الشوارع لاسقاط', 'العصيان المدني', 'فلتسقط الدوله', 'دوله فاشله', 'حكومه العملاء',
              'حكم العصابه', 'لا شرعيه لهذه', 'مؤامره لاسقاط الوطن', 'افشلوا مشاريعهم', 'قوضوا مؤسسات']
    },
    {
      id: 'ECONOMIC_PANIC',
      label: 'ذعر اقتصادي ممنهج',
      min: 5, max: 7,
      emotion: 'ECONOMIC_PANIC',
      intent: 'MISINFORMATION',
      domain: 'ECONOMIC',
      flags: ['نشر الذعر الاقتصادي الكاذب', 'التلاعب والتحريض ضد العملة الوطنية'],
      words: ['انهيار اللير', 'اسحبوا اموالكم', 'اسحبوا ودائعكم', 'اللير الي الهاويه', 'المجاعه قادمه',
              'الدولار سيصل الي', 'خزنوا الطعام', 'قاطعوا الليره', 'حولوا اموالكم للخارج', 'تهريب الاموال',
              'الاقتصاد ينهار', 'افلاس الدوله قريب', 'احتكروا', 'لا تودعوا في المصارف']
    },
    {
      id: 'CYBERCRIME',
      label: 'جرائم إلكترونية (تشهير/ابتزاز/خصوصية)',
      min: 6, max: 8,
      emotion: 'HATRED_DISCRIMINATION',
      intent: 'DESTRUCTIVE_CRITICISM',
      domain: 'CYBERCRIME',
      flags: ['تشهير/ابتزاز رقمي (قانون الجرائم الإلكترونية)', 'كشف بيانات خاصة دون إذن (خصوصية)'],
      words: ['ساقضحك', 'ساقضح', 'سانشر صورك', 'سانشر محادثاتك', 'املك معلوماتك', 'عنوانه هو', 'رقمه هو',
              'هذا رقم هاتفه', 'ساكشف هويته', 'اخترقت حسابه', 'ابتزاز', 'سادمر سمعتك', 'ساشهر بك',
              'صور فاضحه', 'سربوا بياناته']
    },
    {
      id: 'HARASSMENT',
      label: 'تنمّر وتحرّش وإهانة',
      min: 4, max: 6,
      emotion: 'HATRED_DISCRIMINATION',
      intent: 'TOXIC_SARCASM',
      domain: 'SOCIAL',
      flags: ['تحرّش وتنمّر ممنهج (سياسات ميتا/X)', 'تصفية معنوية وإهانة'],
      words: ['يا غبي', 'يا حقير', 'يا قذر', 'يا كلب', 'يا حمار', 'يا تافه', 'يا قبيح', 'حقير', 'قذر',
              'وسخ', 'يا جبان', 'يا فاشل', 'اخرس', 'اسكت ايها', 'عديم الاخلاق', 'يا خنزير']
    },
    {
      id: 'MISINFORMATION',
      label: 'تضليل وأخبار كاذبة',
      min: 4, max: 6,
      emotion: 'DOUBT_CONSPIRACY',
      intent: 'MISINFORMATION',
      domain: 'MEDIA_ETHICS',
      flags: ['نشر أخبار غير مؤكدة/تضليل (مدونة السلوك الإعلامي)', 'غياب المصادر الموثوقة والتهويل'],
      words: ['مصدر خاص لم يذكر', 'مصادر مجهوله', 'تسريب خطير', 'فضيحه مدويه', 'الفيديو المفبرك', 'خبر عاجل جدا',
              'حصري ولن تصدقوا', 'تناقلت مواقع', 'يقال ان', 'بحسب ما تردد', 'مؤامره كبري', 'الحقيقه المخفيه',
              'ما لا يريدون ان تعرفوه', 'كذبه كبري', 'خدعوكم']
    },
    {
      id: 'GRAPHIC_VIOLENCE',
      label: 'محتوى عنيف/دموي',
      min: 5, max: 7,
      emotion: 'FEAR_DESPAIR',
      intent: 'DESTRUCTIVE_CRITICISM',
      domain: 'SECURITY',
      flags: ['محتوى عنيف أو دموي (سياسات ميتا/X)'],
      words: ['اشلاء', 'جثث مقطعه', 'مذبحه', 'دماء تسيل', 'رؤوس مقطوعه', 'مجزره دمويه', 'صور القتلي']
    }
  ];

  // ---- فئات إيجابية ----
  const POSITIVE_CATEGORIES = [
    {
      id: 'STATE_BUILDING',
      label: 'دعم بناء الدولة',
      emotion: 'STATE_BUILDING',
      intent: 'EXPLICIT_SUPPORT',
      domain: 'POLITICAL',
      words: ['بناء الدوله', 'مؤسسات الدوله', 'اعاده الاعمار', 'التعافي الاقتصادي', 'الاستثمار في سوريا',
              'سياده القانون', 'استقلال القضاء', 'مكافحه الفساد', 'الوحده الوطنيه', 'السلم الاهلي',
              'المصالحه الوطنيه', 'التماسك الاجتماعي', 'المشاركه المدنيه', 'دوله المؤسسات', 'الشفافيه',
              'العداله الانتقاليه', 'دوله القانون', 'اصلاح', 'التنميه']
    },
    {
      id: 'NATIONAL_PRIDE',
      label: 'فخر وطني',
      emotion: 'NATIONAL_PRIDE',
      intent: 'EXPLICIT_SUPPORT',
      domain: 'SOCIAL',
      words: ['سوريا الحبيبه', 'عاشت سوريا', 'سوريا الجديده', 'فخر', 'نفتخر', 'علم سوريا', 'الهويه السوريه',
              'سوريا الحره', 'ابناء الوطن', 'وحده الاراضي', 'سياده الوطن', 'الرموز الوطنيه', 'سوريا تنهض',
              'عزتنا', 'كرامه الوطن', 'الوطن الغالي']
    },
    {
      id: 'HOPE',
      label: 'أمل وتفاؤل',
      emotion: 'HOPE',
      intent: 'IMPLICIT_SUPPORT',
      domain: 'SOCIAL',
      words: ['غد افضل', 'مستقبل مشرق', 'الامل', 'بالامل', 'تفاؤل', 'سننهض', 'الفجر قادم', 'بخير',
              'اجمل ايامنا قادمه', 'نستطيع', 'معا نبني', 'ثقه بالمستقبل']
    },
    {
      id: 'SOLIDARITY',
      label: 'تضامن اجتماعي',
      emotion: 'SOLIDARITY',
      intent: 'IMPLICIT_SUPPORT',
      domain: 'SOCIAL',
      words: ['تكاتف', 'تضامن', 'يد واحده', 'معا', 'التكافل', 'نقف معا', 'دعم المحتاجين', 'مبادره خيريه',
              'اغاثه', 'التطوع', 'تعاون', 'اخوه']
    },
    {
      id: 'TRUST',
      label: 'ثقة بالمؤسسات',
      emotion: 'TRUST',
      intent: 'EXPLICIT_SUPPORT',
      domain: 'POLITICAL',
      words: ['نثق ب', 'الثقه بالمؤسسات', 'خطوه ايجابيه', 'قرار حكيم', 'انجاز', 'نبارك', 'نشكر الجهود',
              'عمل مؤسساتي', 'شفافيه القرار']
    }
  ];

  // ---- المجالات (Domains) ----
  const DOMAIN_LEX = [
    ['POLITICAL', 'سياسي', ['الحكومه', 'الرئيس', 'الوزار', 'البرلمان', 'سياس', 'الدستور', 'انتخاب', 'الدوله',
                             'شرعيه', 'السلطه', 'المعارضه', 'الحكم']],
    ['ECONOMIC', 'اقتصادي', ['اللير', 'الدولار', 'الاقتصاد', 'الاسعار', 'التضخم', 'استثمار', 'المصرف', 'الرواتب',
                              'البطاله', 'السوق', 'الوقود', 'الفوره', 'تجاره']],
    ['SECURITY', 'أمني', ['الامن', 'الجيش', 'السلاح', 'عسكري', 'ارهاب', 'تفجير', 'اشتباك', 'الشرطه', 'مسلح',
                          'عمليه امنيه', 'استخبارات']],
    ['SOCIAL', 'اجتماعي', ['المجتمع', 'العائل', 'الشباب', 'التعليم', 'الصحه', 'المرا', 'الاطفال', 'الطائف',
                           'العشائر', 'المكونات', 'النسيج الاجتماعي']],
    ['MEDIA_ETHICS', 'إعلامي/أخلاقي', ['اعلام', 'صحاف', 'خبر', 'شائعه', 'وسائل التواصل', 'الصفحه', 'الناشط',
                                        'تقرير', 'قناه', 'مصدر']],
    ['CYBERCRIME', 'قانوني/جرائم إلكترونية', ['اختراق', 'ابتزاز', 'تشهير', 'خصوصيه', 'قرصنه', 'احتيال الكتروني',
                                               'بيانات شخصيه', 'الجرائم الالكترونيه']],
    ['HUMAN_RIGHTS', 'حقوق إنسان', ['حقوق الانسان', 'الحريات', 'الاعتقال', 'التعذيب', 'الاختفاء القسري', 'التمييز',
                                     'الاقليات', 'حريه التعبير', 'المعتقلين']],
    ['PLATFORM_POLICIES', 'منصات التواصل', ['فيسبوك', 'ميتا', 'تويتر', 'حظر الحساب', 'المحتوي', 'الخوارزميه', 'الابلاغ']]
  ];

  // ---- علامات النية الإضافية ----
  const CONSTRUCTIVE_MARKERS = ['نقترح', 'نطالب باصلاح', 'نامل ان', 'من الافضل', 'يجب تحسين', 'ملاحظه بناءه',
                                 'ندعو الي معالجه', 'حل مقترح', 'بشكل بناء', 'باحترام'];
  const SARCASM_MARKERS = ['ما شاء الله عليكم', 'برافو عليكم', 'يا سلام', 'احسنتم صنعا', 'شكرا جزيلا يا',
                            'طبعا طبعا', 'كالعاده', 'مبروك علينا', '🙄', '😏', '🤡', 'ياريت', 'يعني بجد',
                            'اي والله', 'تصدقون'];
  const QUESTION_MARKERS = ['؟', 'هل ', 'متي ', 'اين ', 'كيف ', 'لماذا ', 'ما هو', 'ما هي', 'من هو', 'كم ', 'ماذا'];
  const STATS_MARKERS = ['%', 'بالمئه', 'احصائ', 'بلغ عدد', 'نسبه', 'ارتفع بنسبه', 'انخفض بنسبه', 'وفق تقرير',
                          'مؤشر', 'اجمالي', 'معدل'];

  /* ============================================================
   * 3) التصنيفات المرجعية (للعرض)
   * ============================================================ */
  const SENTIMENTS = {
    POSITIVE: { label: 'إيجابي', color: 'pos', icon: '🟢' },
    NEGATIVE: { label: 'سلبي', color: 'neg', icon: '🔴' },
    NEUTRAL: { label: 'محايد', color: 'neu', icon: '⚪' }
  };
  const EMOTIONS = {
    NATIONAL_PRIDE: 'فخر وطني', HOPE: 'أمل وتفاؤل', SOLIDARITY: 'تضامن اجتماعي',
    TRUST: 'ثقة بالمؤسسات', STATE_BUILDING: 'دعم بناء الدولة',
    ANGER_INCITEMENT: 'غضب وتحريض', FEAR_DESPAIR: 'خوف ويأس', HATRED_DISCRIMINATION: 'كراهية وتمييز',
    DOUBT_CONSPIRACY: 'تشكيك وتآمر', ECONOMIC_PANIC: 'تخويف اقتصادي',
    INQUIRY: 'استفسار', PURE_INFORMATION: 'إعلام بحت', STATISTICS_REPORT: 'إحصاء/تقرير',
    OBJECTIVE_DEBATE: 'نقاش موضوعي'
  };
  const INTENTS = {
    EXPLICIT_SUPPORT: 'دعم صريح', IMPLICIT_SUPPORT: 'دعم ضمني', CONSTRUCTIVE_CRITICISM: 'نقد بنّاء',
    DESTRUCTIVE_CRITICISM: 'نقد هادم', DIRECT_INCITEMENT: 'تحريض مباشر', IMPLICIT_INCITEMENT: 'تحريض ضمني',
    MISINFORMATION: 'تضليل وتشويه', TOXIC_SARCASM: 'سخرية سامة', HARMLESS_SARCASM: 'سخرية بنّاءة',
    NEUTRAL_REPORTING: 'إعلام محايد'
  };
  const DOMAINS = {
    POLITICAL: 'سياسي', ECONOMIC: 'اقتصادي', SECURITY: 'أمني', SOCIAL: 'اجتماعي',
    MEDIA_ETHICS: 'إعلامي/أخلاقي', CYBERCRIME: 'قانوني/جرائم إلكترونية', HUMAN_RIGHTS: 'حقوق إنسان',
    PLATFORM_POLICIES: 'منصات التواصل'
  };
  // درجة الشدة → التسمية والإجراء
  function severityInfo(score) {
    if (score <= 2) return { name: 'ضئيلة', action: 'MONITOR', actionLabel: 'مراقبة', level: 'sev-min' };
    if (score <= 4) return { name: 'خفيفة', action: 'MONITOR', actionLabel: 'مراقبة + تسجيل', level: 'sev-low' };
    if (score <= 6) return { name: 'متوسطة', action: 'FLAG', actionLabel: 'تعليق مؤقت + تحذير', level: 'sev-mid' };
    if (score <= 8) return { name: 'خطيرة', action: 'REMOVE', actionLabel: 'إزالة فورية + إنذار', level: 'sev-high' };
    return { name: 'حرجة', action: 'ESCALATE', actionLabel: 'حظر + إحالة قانونية', level: 'sev-crit' };
  }
  const ACTION_ICON = { MONITOR: '👁️', FLAG: '⚠️', REMOVE: '⛔', ESCALATE: '🚨' };

  /* ============================================================
   * 4) التحليل الأساسي
   * ============================================================ */
  function analyze(post) {
    const rawText = (post && (post.text || post.message)) || '';
    const norm = normalize(rawText);
    const words = norm.split(' ').filter(Boolean);
    const emojiSarcasm = /[🙄😏🤡]/.test(rawText);

    // --- كشف الفئات السلبية ---
    const negMatched = [];
    for (const c of NEGATIVE_CATEGORIES) {
      const hits = countHits(norm, c.words);
      if (hits > 0) negMatched.push({ cat: c, hits });
    }
    // --- كشف الفئات الإيجابية ---
    const posMatched = [];
    for (const c of POSITIVE_CATEGORIES) {
      const hits = countHits(norm, c.words);
      if (hits > 0) posMatched.push({ cat: c, hits });
    }

    const isQuestion = QUESTION_MARKERS.some(m => norm.includes(normalize(m)));
    const isStats = STATS_MARKERS.some(m => norm.includes(normalize(m)));
    const isConstructive = CONSTRUCTIVE_MARKERS.some(m => norm.includes(normalize(m)));
    const sarcasm = emojiSarcasm || SARCASM_MARKERS.some(m => norm.includes(normalize(m)));

    let sentiment, emotion, intent, domain, severity, flags = [], reasons = [];

    if (negMatched.length) {
      // رتّب حسب أعلى شدة قصوى ثم عدد الإصابات
      negMatched.sort((a, b) => (b.cat.max - a.cat.max) || (b.hits - a.hits));
      const top = negMatched[0].cat;
      sentiment = 'NEGATIVE';
      emotion = top.emotion;
      intent = top.intent;
      domain = top.domain;

      // حساب الشدة: أعلى قاعدة + زيادات لتعدد الفئات وكثرة الإصابات
      let base = top.max;
      const extraCats = negMatched.length - 1;
      const totalHits = negMatched.reduce((n, m) => n + m.hits, 0);
      severity = Math.min(10, base + Math.min(2, extraCats) + (totalHits > 3 ? 1 : 0));
      severity = Math.max(top.min, severity);

      // النية: إذا كان بنّاءً نُخفّف، وإذا كانت سخرية سامة
      if (isConstructive && severity <= 5) { intent = 'CONSTRUCTIVE_CRITICISM'; }
      if (sarcasm && (top.id === 'HARASSMENT' || top.id === 'MISINFORMATION')) { intent = 'TOXIC_SARCASM'; }

      // جمع الأعلام والأسباب من كل الفئات المطابقة
      const seen = new Set();
      for (const m of negMatched) {
        for (const f of m.cat.flags) { if (!seen.has(f)) { seen.add(f); flags.push(f); } }
        reasons.push(`طابق فئة «${m.cat.label}» (${m.hits} مؤشر)`);
      }
    } else if (posMatched.length) {
      posMatched.sort((a, b) => b.hits - a.hits);
      const top = posMatched[0].cat;
      sentiment = 'POSITIVE';
      emotion = top.emotion;
      intent = sarcasm ? 'HARMLESS_SARCASM' : top.intent;
      domain = top.domain;
      severity = 1;
      reasons.push(`طابق معايير التصنيف الإيجابي: «${top.label}»`);
      if (posMatched.length > 1) reasons.push(`تعزيز إيجابي إضافي من: ${posMatched.slice(1).map(m => m.cat.label).join('، ')}`);
    } else {
      // محايد
      sentiment = 'NEUTRAL';
      severity = isStats ? 1 : 2;
      if (isQuestion) { emotion = 'INQUIRY'; intent = 'NEUTRAL_REPORTING'; reasons.push('نص استفساري (يتضمن سؤالاً).'); }
      else if (isStats) { emotion = 'STATISTICS_REPORT'; intent = 'NEUTRAL_REPORTING'; reasons.push('محتوى إحصائي/تقريري.'); }
      else if (sarcasm) { emotion = 'PURE_INFORMATION'; intent = 'HARMLESS_SARCASM'; reasons.push('نبرة ساخرة خفيفة دون مخالفة.'); }
      else { emotion = 'PURE_INFORMATION'; intent = 'NEUTRAL_REPORTING'; reasons.push('محتوى إعلامي/عام لا يحمل شحنة سلبية أو إيجابية واضحة.'); }
    }

    // --- تحديد المجال بدقة أكبر من معجم المجالات إن وُجد ---
    const domainScore = {};
    for (const [id, , kw] of DOMAIN_LEX) {
      const hits = countHits(norm, kw);
      if (hits) domainScore[id] = hits;
    }
    const domById = Object.keys(domainScore).sort((a, b) => domainScore[b] - domainScore[a]);
    if (domById.length) domain = domById[0];
    if (!domain) domain = 'SOCIAL';

    // --- النبرة ---
    let tone;
    if (sentiment === 'NEGATIVE') tone = severity >= 7 ? 'عدائية/تحريضية حادة' : (sarcasm ? 'ساخرة سلبية' : 'سلبية/انتقادية');
    else if (sentiment === 'POSITIVE') tone = 'إيجابية/داعمة';
    else tone = isQuestion ? 'استفهامية محايدة' : 'محايدة/موضوعية';

    // --- المعنى الضمني ---
    let implicit = '';
    if (sentiment === 'NEGATIVE') {
      if (intent === 'IMPLICIT_INCITEMENT') implicit = 'يحمل تحريضاً غير مباشر قد يُقرأ كدعوة للفعل رغم غياب الأمر الصريح.';
      else if (intent === 'MISINFORMATION') implicit = 'يوحي بمصداقية زائفة عبر لغة مثيرة دون مصادر موثوقة.';
      else if (sarcasm) implicit = 'يستخدم السخرية لتمرير موقف سلبي/هجومي بصيغة غير مباشرة.';
      else implicit = 'المضمون الظاهر يتوافق مع نية سلبية واضحة.';
    } else if (sentiment === 'POSITIVE') {
      implicit = 'يعزّز خطاباً داعماً للاستقرار وبناء الدولة والوحدة الوطنية.';
    } else {
      implicit = 'لا يظهر معنى ضمني سلبي؛ المحتوى إخباري/استفساري.';
    }

    // --- تحليل المصدر ---
    const source = analyzeSource(post);

    // --- التوصية الإجرائية ---
    const sev = severityInfo(severity);
    const recommendation = buildRecommendation(sentiment, sev, flags, domain);

    // --- ملخص ---
    const summary = buildSummary(sentiment, emotion, intent, domain, severity, sev, sarcasm);

    return {
      sentiment,
      sentimentLabel: SENTIMENTS[sentiment].label,
      emotion, emotionLabel: EMOTIONS[emotion] || '—',
      intent, intentLabel: INTENTS[intent] || '—',
      domain, domainLabel: DOMAINS[domain] || '—',
      severity,
      severityName: sev.name,
      severityLevel: sev.level,
      action: sev.action,
      actionLabel: sev.actionLabel,
      actionIcon: ACTION_ICON[sev.action],
      flags,
      flagged: flags.length > 0,
      reasons,
      tone,
      sarcasm,
      implicit,
      source,
      recommendation,
      summary,
      analyzedAt: Date.now()
    };
  }

  function analyzeSource(post) {
    const author = (post && post.author) || 'مصدر غير معروف';
    const eng = (Number(post && post.likes) || 0) + (Number(post && post.comments) || 0) + (Number(post && post.shares) || 0);
    let credibility, credClass;
    if (eng >= 5000) { credibility = 'حساب واسع الانتشار — تأثيره مرتفع'; credClass = 'high'; }
    else if (eng >= 500) { credibility = 'حساب متوسط التأثير'; credClass = 'mid'; }
    else if (eng > 0) { credibility = 'حساب محدود التفاعل'; credClass = 'low'; }
    else { credibility = 'تفاعل غير معروف/منخفض'; credClass = 'low'; }
    const type = /news|media|official|gov|رسمي|اخبار|قناه|وكاله/i.test(author) ? 'صفحة إعلامية/رسمية (مرجّح)' : 'صفحة/حساب عام';
    return {
      account: author,
      type,
      credibility,
      credClass,
      engagement: eng,
      note: 'تقييم أولي مبني على بيانات المنشور المتاحة؛ يتطلب تدقيق تاريخ الحساب الكامل لتأكيد المصداقية.'
    };
  }

  function buildRecommendation(sentiment, sev, flags, domain) {
    if (sentiment === 'POSITIVE') return 'محتوى داعم وإيجابي — يُنصح بإبرازه/تعزيزه ضمن الخطاب الوطني. لا إجراء تقييدي.';
    if (sentiment === 'NEUTRAL') return 'محتوى محايد — أرشفة ومراقبة روتينية دون إجراء.';
    switch (sev.action) {
      case 'MONITOR': return 'مراقبة وتسجيل المنشور ضمن السجل دون تدخل، مع متابعة تطوّر الحساب.';
      case 'FLAG': return 'رفع علم على المنشور، تعليقه مؤقتاً وإرسال تحذير للناشر، وتوثيق المخالفة.' + (flags.length ? ' مخالفة سياسات: ' + flags[0] : '');
      case 'REMOVE': return 'إزالة المنشور فوراً وتوجيه إنذار رسمي للحساب، مع حفظ الأدلة (لقطة/رابط) للرجوع القانوني.';
      case 'ESCALATE': return 'حظر الحساب وإحالة الحالة إلى الجهات القانونية المختصة فوراً — تهديد مباشر للأمن القومي/السلم الأهلي. حفظ كامل الأدلة.';
      default: return 'مراجعة يدوية.';
    }
  }

  function buildSummary(sentiment, emotion, intent, domain, severity, sev, sarcasm) {
    const s = SENTIMENTS[sentiment].label;
    const parts = [`تصنيف أساسي: ${s}`, `شعور دقيق: ${EMOTIONS[emotion] || '—'}`, `نية: ${INTENTS[intent] || '—'}`,
                   `مجال: ${DOMAINS[domain] || '—'}`];
    if (sentiment === 'NEGATIVE') parts.push(`شدة المخالفة ${severity}/10 (${sev.name}) → ${sev.actionLabel}`);
    if (sarcasm) parts.push('يتضمن أسلوباً ساخراً');
    return parts.join(' · ');
  }

  /* ============================================================
   * 5) دوال العرض (HTML)
   * ============================================================ */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // شارات مضغوطة تُعرض على بطاقة المنشور
  function badges(a) {
    if (!a) return '';
    const sev = a.sentiment === 'NEGATIVE'
      ? `<span class="fbx-badge ${a.severityLevel}">${a.severity}/10 · ${esc(a.severityName)}</span>`
      : '';
    const flag = a.flagged ? `<span class="fbx-badge fbx-flag">${a.actionIcon} ${esc(a.actionLabel)}</span>` : '';
    return `<div class="fbx-badges">
      <span class="fbx-badge fbx-${SENTIMENTS[a.sentiment].color}">${SENTIMENTS[a.sentiment].icon} ${esc(a.sentimentLabel)}</span>
      <span class="fbx-badge fbx-soft">${esc(a.emotionLabel)}</span>
      <span class="fbx-badge fbx-soft">🎯 ${esc(a.intentLabel)}</span>
      <span class="fbx-badge fbx-soft">🏷️ ${esc(a.domainLabel)}</span>
      ${sev}${flag}
    </div>`;
  }

  // لوحة التحليل الكاملة (قابلة للطي)
  function panel(a) {
    if (!a) return '';
    const flagsHtml = a.flags.length
      ? `<ul class="fbx-flags">${a.flags.map(f => `<li>🚩 ${esc(f)}</li>`).join('')}</ul>`
      : '<div class="fbx-noflag">✅ لا مخالفات مرصودة</div>';
    const reasons = a.reasons.length ? `<ul class="fbx-reasons">${a.reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul>` : '';
    return `<div class="fbx-analysis">
      <div class="fbx-grid">
        <div class="fbx-cell"><span class="fbx-k">المشاعر الأساسية</span><span class="fbx-v">${SENTIMENTS[a.sentiment].icon} ${esc(a.sentimentLabel)}</span></div>
        <div class="fbx-cell"><span class="fbx-k">المشاعر الدقيقة</span><span class="fbx-v">${esc(a.emotionLabel)}</span></div>
        <div class="fbx-cell"><span class="fbx-k">النية</span><span class="fbx-v">${esc(a.intentLabel)}</span></div>
        <div class="fbx-cell"><span class="fbx-k">المجال</span><span class="fbx-v">${esc(a.domainLabel)}</span></div>
        <div class="fbx-cell"><span class="fbx-k">النبرة</span><span class="fbx-v">${esc(a.tone)}</span></div>
        <div class="fbx-cell"><span class="fbx-k">السخرية</span><span class="fbx-v">${a.sarcasm ? 'نعم' : 'لا'}</span></div>
      </div>

      <div class="fbx-sev-row">
        <span class="fbx-k">شدة المخالفة</span>
        <div class="fbx-meter"><div class="fbx-meter-fill ${a.severityLevel}" style="width:${a.severity * 10}%"></div></div>
        <span class="fbx-sev-num ${a.severityLevel}">${a.severity}/10 · ${esc(a.severityName)}</span>
      </div>

      <div class="fbx-block">
        <span class="fbx-k">المعنى الضمني</span>
        <p class="fbx-text">${esc(a.implicit)}</p>
      </div>

      <div class="fbx-block">
        <span class="fbx-k">رفع العلم (السياسات والقوانين)</span>
        ${flagsHtml}
      </div>

      <div class="fbx-block">
        <span class="fbx-k">تحليل المصدر</span>
        <p class="fbx-text">👤 ${esc(a.source.account)} · ${esc(a.source.type)} · <strong>${esc(a.source.credibility)}</strong> (تفاعل: ${a.source.engagement})</p>
        <p class="fbx-note">${esc(a.source.note)}</p>
      </div>

      <div class="fbx-block fbx-rec ${a.severityLevel}">
        <span class="fbx-k">${a.actionIcon} التوصية الإجرائية — ${esc(a.actionLabel)}</span>
        <p class="fbx-text">${esc(a.recommendation)}</p>
      </div>

      ${reasons ? `<div class="fbx-block"><span class="fbx-k">مبررات التصنيف</span>${reasons}</div>` : ''}
    </div>`;
  }

  /* ============================================================
   * 6) حقن التنسيقات
   * ============================================================ */
  function injectStyles() {
    if (document.getElementById('fbx-analyzer-styles')) return;
    const css = `
    .fbx-badges { display:flex; flex-wrap:wrap; gap:7px; margin:10px 0 2px; }
    .fbx-badge { display:inline-flex; align-items:center; gap:4px; font-size:.72rem; font-weight:800;
      padding:4px 11px; border-radius:999px; line-height:1.4; border:1px solid transparent; white-space:nowrap; }
    .fbx-soft { background:var(--sage-soft,#e6ecdd); color:var(--text,#22372e); border-color:var(--border,#dcdcc6); }
    .fbx-pos { background:#dff2e3; color:#1c6b39; border-color:#a9dcb6; }
    .fbx-neg { background:#fbe0da; color:#a3341f; border-color:#f0b3a6; }
    .fbx-neu { background:#e9ecef; color:#4c5560; border-color:#d3d8de; }
    .fbx-flag { background:#fff0d6; color:#9a5b00; border-color:#f2cf8a; }
    .fbx-badge.sev-min { background:#e5f2e8; color:#2f7a49; border-color:#b7ddc2; }
    .fbx-badge.sev-low { background:#eaf1d8; color:#5f7020; border-color:#cad9a3; }
    .fbx-badge.sev-mid { background:#fff2cf; color:#8a6100; border-color:#f0d68a; }
    .fbx-badge.sev-high { background:#fbe0d3; color:#a1471d; border-color:#f0b596; }
    .fbx-badge.sev-crit { background:#f7d3d3; color:#8f1f1f; border-color:#e8a6a6; }

    .fbx-toggle { border:none; background:none; cursor:pointer; font-family:inherit; font-weight:900;
      font-size:.8rem; color:var(--green-700,#23553f); padding:8px 0 2px; display:inline-flex; align-items:center; gap:6px; }
    [data-theme="dark"] .fbx-toggle { color:var(--sage,#8fae70); }

    .fbx-analysis { margin-top:12px; border-top:1px dashed var(--border,#dcdcc6); padding-top:14px;
      animation:fbxFade .3s ease; }
    @keyframes fbxFade { from{opacity:0;transform:translateY(-4px);} to{opacity:1;transform:none;} }
    .fbx-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px; }
    .fbx-cell { background:var(--surface-2,#f0eddd); border:1px solid var(--border,#dcdcc6);
      border-radius:12px; padding:9px 12px; display:flex; flex-direction:column; gap:2px; }
    .fbx-k { font-size:.7rem; font-weight:800; color:var(--text-2,#6d7c6e); }
    .fbx-v { font-size:.85rem; font-weight:900; color:var(--text,#22372e); }
    .fbx-sev-row { display:flex; align-items:center; gap:12px; margin-top:14px; flex-wrap:wrap; }
    .fbx-meter { flex:1 1 160px; height:9px; border-radius:99px; background:var(--surface-2,#f0eddd);
      overflow:hidden; min-width:140px; }
    .fbx-meter-fill { height:100%; border-radius:99px; transition:width .5s ease; }
    .fbx-meter-fill.sev-min, .fbx-meter-fill.sev-low { background:linear-gradient(90deg,#8fae70,#5f8348); }
    .fbx-meter-fill.sev-mid { background:linear-gradient(90deg,#e8c060,#d99a2b); }
    .fbx-meter-fill.sev-high { background:linear-gradient(90deg,#e08a5a,#c65b32); }
    .fbx-meter-fill.sev-crit { background:linear-gradient(90deg,#d64c4c,#8f1f1f); }
    .fbx-sev-num { font-weight:900; font-size:.85rem; }
    .fbx-sev-num.sev-mid { color:#8a6100; } .fbx-sev-num.sev-high { color:#a1471d; }
    .fbx-sev-num.sev-crit { color:#8f1f1f; } .fbx-sev-num.sev-min,.fbx-sev-num.sev-low { color:#2f7a49; }
    [data-theme="dark"] .fbx-sev-num.sev-min,[data-theme="dark"] .fbx-sev-num.sev-low { color:#8fae70; }

    .fbx-block { margin-top:14px; }
    .fbx-text { font-size:.85rem; line-height:1.85; color:var(--text,#22372e); margin-top:5px; }
    .fbx-note { font-size:.74rem; color:var(--text-2,#6d7c6e); margin-top:4px; font-style:italic; }
    .fbx-flags { list-style:none; margin:6px 0 0; padding:0; display:flex; flex-direction:column; gap:6px; }
    .fbx-flags li { background:#fbe0da; color:#a3341f; border:1px solid #f0b3a6; border-radius:10px;
      padding:7px 12px; font-size:.8rem; font-weight:700; }
    [data-theme="dark"] .fbx-flags li { background:#3a1f19; color:#f0b3a6; border-color:#5a2f24; }
    .fbx-noflag { margin-top:6px; font-size:.82rem; font-weight:800; color:#2f7a49; }
    [data-theme="dark"] .fbx-noflag { color:#8fae70; }
    .fbx-reasons { margin:6px 0 0; padding-inline-start:20px; font-size:.8rem; line-height:1.9; color:var(--text-2,#6d7c6e); }
    .fbx-rec { border-radius:14px; padding:12px 14px; border:1px solid var(--border,#dcdcc6); background:var(--surface-2,#f0eddd); }
    .fbx-rec.sev-high { background:#fbe6dd; border-color:#f0b596; }
    .fbx-rec.sev-crit { background:#f7d9d9; border-color:#e8a6a6; }
    [data-theme="dark"] .fbx-rec.sev-high { background:#3a241c; border-color:#5a382a; }
    [data-theme="dark"] .fbx-rec.sev-crit { background:#3d1f1f; border-color:#5e2c2c; }
    `;
    const style = document.createElement('style');
    style.id = 'fbx-analyzer-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  /* ============================================================
   * 7) إحصاءات مجمّعة لعدد من المنشورات المحللة
   * ============================================================ */
  function aggregate(analyses) {
    const out = {
      total: analyses.length,
      positive: 0, negative: 0, neutral: 0,
      flagged: 0,
      actions: { MONITOR: 0, FLAG: 0, REMOVE: 0, ESCALATE: 0 },
      severitySum: 0,
      byDomain: {}
    };
    for (const a of analyses) {
      if (!a) continue;
      if (a.sentiment === 'POSITIVE') out.positive++;
      else if (a.sentiment === 'NEGATIVE') out.negative++;
      else out.neutral++;
      if (a.flagged) out.flagged++;
      if (out.actions[a.action] != null) out.actions[a.action]++;
      out.severitySum += a.severity || 0;
      out.byDomain[a.domainLabel] = (out.byDomain[a.domainLabel] || 0) + 1;
    }
    out.avgSeverity = out.total ? (out.severitySum / out.total).toFixed(1) : '0';
    return out;
  }

  global.FBXAnalyzer = {
    analyze, badges, panel, injectStyles, aggregate,
    SENTIMENTS, EMOTIONS, INTENTS, DOMAINS, severityInfo, normalize
  };

})(typeof window !== 'undefined' ? window : this);
