'use strict';

/*
 * FBXAnalyzer — محرّك تصنيف المحتوى وفق إطار الثقة والأمان لـ«الدولة السورية الجديدة»
 * -----------------------------------------------------------------------------------
 * يطبّق إطار تحليل صارم مستمد من:
 *   - قانون الجرائم المعلوماتية السوري رقم 20 لعام 2022 (نص المواد الكامل مضمّن أدناه
 *     كاستناد قانوني دقيق بمواده، لا وصف عام).
 *   - مدونة السلوك المهني والأخلاقي لقطاع الإعلام في سورية.
 *   - معايير منصتي ميتا وإكس لخطاب الكراهية والتحريض.
 *
 * لكل منشور يُصدر: تصنيف نهائي (إيجابي/سلبي/حيادي) ← مستوى خطورة/أهمية (منخفض/متوسط/
 * عالي) ← تحليل سياقي ← استناد قانوني وأخلاقي دقيق ← إجراء موصى به (إبقاء/حذف فوري/
 * تحويل للمراجعة البشرية) — بأسلوب تفكير تسلسلي (Chain of Thought) كما يفعل مراقب بشري
 * متمرس، وليس مجرد بحث عن كلمات مسيئة.
 *
 * يعمل بالكامل محلياً في المتصفح — لا تُرسل أي بيانات إلى الخارج.
 */

(function (global) {

  /* ============================================================
   * 1) تطبيع النص العربي
   * ============================================================ */
  function normalize(str) {
    return String(str || '')
      .replace(/[ً-ْٰـ]/g, '')
      .replace(/[إأآا]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ؤ/g, 'و')
      .replace(/ئ/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/\s+/g, ' ')
      .toLowerCase();
  }
  const countHits = (norm, words) => words.reduce((n, w) => n + (norm.includes(normalize(w)) ? 1 : 0), 0);
  const anyHit = (norm, words) => words.some(w => norm.includes(normalize(w)));

  /* ============================================================
   * 2) فئات القسم السلبي — مطابقة تماماً لتصنيفات المهمة
   *    كل فئة: تسمية، مستوى الخطورة الافتراضي، الاستناد القانوني/الأخلاقي
   *    الدقيق (بأرقام مواد قانون الجرائم المعلوماتية رقم 20/2022)، والإجراء.
   * ============================================================ */
  const NEG = {
    STATE_UNCONSTITUTIONAL: {
      label: 'أمن الدولة والاقتصاد — الدعوة لتغيير الدستور بطرق غير مشروعة / إثارة عصيان مسلح',
      severity: 'HIGH', action: 'DELETE',
      legal: 'يخالف المادة 27 من قانون الجرائم المعلوماتية رقم 20 لعام 2022 («الجرائم الواقعة على الدستور»: إثارة أفعال تهدف لتغيير الدستور بطرق غير مشروعة، أو سلخ جزء من الأرض السورية عن سيادة الدولة، أو إثارة عصيان مسلح ضد السلطات القائمة، أو قلب نظام الحكم) — عقوبتها الاعتقال المؤقت من 7 إلى 15 سنة.',
      words: ['اسقطوا الحكم بالقوه', 'عصيان مسلح', 'احملوا السلاح ضد', 'انفصال المنطقه عن سوريا', 'استقلال المنطقه',
              'سلخ الارض عن الدوله', 'تغيير الدستور بالقوه', 'قلب نظام الحكم', 'الانقلاب على الدوله', 'اسقاط الدستور',
              'تفكيك الدوله السوريه', 'اقتحموا القصر الجمهوري']
    },
    STATE_PRESTIGE: {
      label: 'أمن الدولة والاقتصاد — النيل من هيبة الدولة والمساس بالوحدة الوطنية',
      severity: 'HIGH', action: 'DELETE',
      legal: 'يخالف المادة 28 من قانون الجرائم المعلوماتية رقم 20/2022 («النيل من هيبة الدولة»: نشر أخبار كاذبة على الشبكة من شأنها النيل من هيبة الدولة أو المساس بالوحدة الوطنية) — عقوبتها السجن المؤقت من 3 إلى 5 سنوات.',
      words: ['الدوله فاشله بالكامل', 'حكومه عميله', 'الدوله الجديده مؤامره', 'خبر كاذب عن الحكومه', 'اشاعه ضد الدوله',
              'الدوله تكذب على الشعب', 'تفكيك الوحده الوطنيه', 'تقسيم سوريا حتمي', 'الدوله لا شرعيه لها اطلاقا']
    },
    ECONOMIC_STABILITY: {
      label: 'أمن الدولة والاقتصاد — زعزعة الثقة بالعملة الوطنية أو أسعار الصرف',
      severity: 'HIGH', action: 'DELETE',
      legal: 'يخالف المادة 29 من قانون الجرائم المعلوماتية رقم 20/2022 («النيل من مكانة الدولة المالية»: إحداث التدني أو عدم الاستقرار أو زعزعة الثقة في أوراق النقد الوطنية أو أسعار صرفها) — عقوبتها السجن المؤقت من 4 إلى 15 سنة.',
      words: ['انهيار الليره القادم', 'اسحبوا اموالكم من المصارف', 'الليره ستنهار كليا', 'قاطعوا الليره السوريه',
              'حولوا اموالكم للدولار فورا', 'الليره لا قيمه لها', 'افلاس الدوله وشيك', 'اسحبوا ودائعكم فورا']
    },
    HATE_SPEECH: {
      label: 'خطاب الكراهية والتمييز — تحريض على العنف أو الإقصاء أو التنميط السلبي بناءً على الدين/القومية/العرق/اللغة/الجنس',
      severity: 'HIGH', action: 'DELETE',
      legal: 'يخالف معايير خطاب الكراهية في سياسات ميتا وإكس (حظر التحريض على العنف والتمييز)، ومدونة السلوك المهني والأخلاقي لقطاع الإعلام في سورية (حظر التحريض والتمييز الطائفي والعرقي)، وقد يشكّل ظرفاً مشدداً وفق المادة 33 من قانون الجرائم المعلوماتية إذا اقترن بجريمة أخرى منصوص عليها.',
      words: ['نصيري', 'مجوس', 'رافضه', 'خونه الطائفه', 'حثاله المجتمع', 'تطهير طائفي', 'اباده عرقيه',
              'العلويون خونه', 'السنه ارهابيون', 'الاكراد انفصاليون', 'الشيعه اعداء', 'اطردوهم من البلد',
              'لا مكان لهم بيننا', 'عرق نجس', 'حثاله', 'جرذان', 'صراصير', 'كفار', 'مرتدون', 'اقتلوهم جميعا',
              'اذبحوهم', 'صفوهم جسديا', 'دم بدم', 'موت لهم']
    },
    DEFAMATION_INSULT: {
      label: 'القدح والتشهير — الذم والقدح والتحقير الإلكتروني',
      severity: 'MEDIUM', action: 'REVIEW',
      legal: 'يخالف المادة 24 من قانون الجرائم المعلوماتية رقم 20/2022 («الذم الإلكتروني») والمادة 25 («القدح أو التحقير الإلكتروني») — وتُشدَّد العقوبة إذا اقتُرف الذم أو القدح بحق مكلَّف بعمل عام أثناء ممارسته لعمله أو بسببه.',
      words: ['يا حقير', 'يا قذر', 'يا كلب', 'يا حمار', 'يا تافه', 'يا خنزير', 'وسخ', 'يا جبان', 'يا فاشل',
              'عديم الاخلاق', 'يا منحط', 'يا نذل', 'كاذب ومحتال', 'لص وفاسد بلا دليل', 'عميل مأجور بلا دليل']
    },
    PRIVACY_VIOLATION: {
      label: 'انتهاك الخصوصية — نشر معلومات أو صور أو تسجيلات خاصة دون رضا صاحبها',
      severity: 'MEDIUM', action: 'REVIEW',
      legal: 'يخالف المادة 21 من قانون الجرائم المعلوماتية رقم 20/2022 («انتهاك الخصوصية»: نشر معلومات تتعلق بالخصوصية دون رضا صاحبها حتى لو كانت صحيحة) والمادة 23 («التسجيل غير المشروع»).',
      words: ['هذا رقم هاتفه', 'عنوانه هو', 'صور خاصه له', 'سربوا محادثاته الخاصه', 'نشروا صوره الشخصيه دون اذنه',
              'هويته الحقيقيه هي', 'مكان سكنه بالتفصيل']
    },
    RELIGIOUS_INSULT: {
      label: 'الإساءة للرموز الدينية — الإساءة للأديان والمقدسات والشعائر الدينية',
      severity: 'HIGH', action: 'DELETE',
      legal: 'يخالف المادة 31 من قانون الجرائم المعلوماتية رقم 20/2022 («الإساءة إلى الأديان والمقدسات والشعائر الدينية أو الحض على الكراهية أو التحريض على العنف») — عقوبتها الحبس من سنة إلى 3 سنوات.',
      words: ['اهانه الدين', 'اهانه المقدسات', 'السخريه من الشعائر الدينيه', 'الاستهزاء بالقران', 'الاستهزاء بالانجيل',
              'تدنيس المقدسات', 'الاساءه للنبي', 'الاستهزاء بالصلاه', 'الاستهزاء بالصيام']
    },
    VULNERABLE_EXPLOITATION: {
      label: 'استغلال الفئات الهشة — انتهاك كرامة الأطفال أو النساء أو ذوي الإعاقة أو الفقراء',
      severity: 'HIGH', action: 'DELETE',
      legal: 'يخالف المادة 26 من قانون الجرائم المعلوماتية رقم 20/2022 («جرائم المساس بالحشمة أو الحياء») مع التشديد الوارد فيها ووفق المادة 33/ب إذا وقع الجرم على قاصر، إضافة لمخالفة مدونة السلوك المهني والأخلاقي لقطاع الإعلام (حظر استغلال الفئات الهشة لإثارة العاطفة).',
      words: ['استغلال طفل', 'استغلال قاصر', 'صور اطفال بدون موافقه لاثاره التعاطف', 'استجداء عاطفي بصور اطفال جياع',
              'استغلال معاناة الاطفال اعلاميا', 'استغلال امراه لاثاره الجدل', 'السخريه من ذوي الاعاقه',
              'استغلال الفقراء لاثاره الشفقه اعلاميا']
    },
    DRUGS_PROMOTION: {
      label: 'الجرائم الرقمية والآداب العامة — الترويج للمخدرات والمؤثرات العقلية',
      severity: 'HIGH', action: 'DELETE',
      legal: 'يخالف المادة 30 من قانون الجرائم المعلوماتية رقم 20/2022 («جرائم المخدرات والمؤثرات العقلية»: إنشاء موقع أو نشر محتوى رقمي بقصد الاتجار بالمخدرات أو الترويج لها) — عقوبتها السجن المؤبد.',
      words: ['بيع الكبتاغون', 'تهريب المخدرات', 'الترويج للحشيش', 'شراء حبوب الكبتاغون', 'توصيل مخدرات للمنزل']
    },
    INDECENT_CONTENT: {
      label: 'الجرائم الرقمية والآداب العامة — محتوى منافٍ للحشمة أو الحياء العام',
      severity: 'HIGH', action: 'DELETE',
      legal: 'يخالف المادة 26 من قانون الجرائم المعلوماتية رقم 20/2022 («جرائم المساس بالحشمة أو الحياء»: نشر أو التهديد بنشر صور أو محادثات أو تسجيلات منافية للحشمة).',
      words: ['محتوى اباحي', 'صور فاضحه', 'تهديد بنشر صور خاصه', 'ابتزاز جنسي', 'فيديو منافي للحشمه']
    },
    MISINFORMATION: {
      label: 'مخالفة مدونة السلوك الإعلامي — أخبار كاذبة أو شائعات غير موثّقة',
      severity: 'MEDIUM', action: 'REVIEW',
      legal: 'يخالف مدونة السلوك المهني والأخلاقي لقطاع الإعلام في سورية (الدقة والموضوعية، التحقق من المصادر، عدم نشر الشائعات) — وإذا استهدف النيل من هيبة الدولة يرتقي للمادة 28 من قانون الجرائم المعلوماتية.',
      words: ['مصدر خاص لم يذكر', 'مصادر مجهوله', 'تسريب خطير غير مؤكد', 'فيديو مفبرك', 'خبر عاجل جدا بلا مصدر',
              'حصري ولن تصدقوا', 'يقال ان بلا تاكيد', 'الحقيقه المخفيه', 'كذبه كبرى', 'خدعوكم جميعا']
    }
  };

  /* ============================================================
   * 3) فئات القسم الإيجابي
   * ============================================================ */
  const POS = {
    CIVIL_PEACE: {
      label: 'تعزيز السلم الأهلي — دعم التعايش والتسامح والعدالة الانتقالية ونبذ العنف والانتقام',
      importance: 'HIGH',
      legal: 'يتوافق مع مبادئ العدالة الانتقالية والسلم الأهلي، ومع مدونة السلوك المهني والأخلاقي لقطاع الإعلام في سورية التي تدعو لتعزيز الوحدة الوطنية ونبذ خطاب الانتقام.',
      words: ['التعايش السلمي', 'التسامح الوطني', 'العداله الانتقاليه', 'نبذ العنف والانتقام', 'المصالحه الوطنيه',
              'السلم الاهلي', 'التماسك الاجتماعي', 'الوحده الوطنيه', 'معا نبني سوريا', 'وحده الصف الوطني']
    },
    HUMAN_RIGHTS: {
      label: 'دعم حقوق الإنسان والتنوع — إبراز التنوع الثقافي وتمكين الفئات الهشة',
      importance: 'HIGH',
      legal: 'يتوافق مع مدونة السلوك المهني والأخلاقي لقطاع الإعلام (دعم التنوع الثقافي كسند وطني، ودعم حقوق النساء والأطفال وذوي الإعاقة وتمكينهم مجتمعياً).',
      words: ['التنوع الثقافي سند وطني', 'حقوق المراه', 'تمكين النساء', 'حقوق ذوي الاعاقه', 'حقوق الطفل',
              'دعم الفئات الهشه', 'كرامه الانسان', 'المساواه بين المكونات']
    },
    ANTI_MISINFORMATION: {
      label: 'مكافحة التضليل — نشر حقائق موثقة تدحض الشائعات وتفصل الخبر عن الرأي',
      importance: 'MEDIUM',
      legal: 'يتوافق مع مدونة السلوك المهني والأخلاقي لقطاع الإعلام في سورية (الدقة والموضوعية، التحقق من المصادر، الفصل بين الخبر والرأي، مكافحة الشائعات).',
      words: ['تصحيح معلومه خاطئه', 'هذا الخبر غير صحيح والدليل', 'وفق مصادر موثقه رسميا', 'نفت الجهه الرسميه هذه الشائعه',
              'التحقق من الخبر اظهر', 'هذه شائعه لا اساس لها']
    },
    DIGITAL_AWARENESS: {
      label: 'الوعي المجتمعي والتقني — التوعية بالاستخدام الآمن للإنترنت والتحذير من الجرائم الإلكترونية',
      importance: 'MEDIUM',
      legal: 'يتوافق مع مدونة السلوك المهني والأخلاقي لقطاع الإعلام (نشر الوعي الرقمي)، ويدعم أهداف قانون الجرائم المعلوماتية رقم 20/2022 في حماية المستخدمين.',
      words: ['التوعيه بالامان الرقمي', 'احذروا الاحتيال الالكتروني', 'لا تشاركوا بياناتكم الشخصيه', 'حمايه الاطفال على الانترنت',
              'التصيد الالكتروني احذروا منه', 'كيف تحمي حسابك من الاختراق']
    },
    STATE_BUILDING: {
      label: 'دعم بناء الدولة — تعزيز مؤسسات الدولة وإعادة الإعمار والاستثمار',
      importance: 'MEDIUM',
      legal: 'يتوافق مع توجهات بناء الدولة السورية الجديدة وتعزيز مؤسساتها (سيادة القانون، مكافحة الفساد، إعادة الإعمار).',
      words: ['بناء الدوله', 'مؤسسات الدوله', 'اعاده الاعمار', 'التعافي الاقتصادي', 'الاستثمار في سوريا',
              'سياده القانون', 'استقلال القضاء', 'مكافحه الفساد', 'دوله المؤسسات', 'الاصلاح الاداري']
    }
  };

  /* ============================================================
   * 4) مؤشرات الحالات الخاصة (Edge Cases)
   * ============================================================ */
  // نقل/توثيق انتهاك بقصد الإدانة والتحذير، وليس الترويج
  const CONDEMNATION_MARKERS = [
    'ندين', 'نستنكر', 'هذا خطاب كراهيه مرفوض', 'هذا التحريض مرفوض', 'للتحذير من', 'بهدف التحذير',
    'شاهدوا هذا الخطاب المرفوض', 'هذا مثال على خطاب الكراهيه الذي يجب رفضه', 'ادين بشده', 'استنكر بشده',
    'هذا نموذج لما يجب محاربته', 'يجب فضح هذا الخطاب', 'تحذير من هذا المحتوى المسيء'
  ];
  // إشارة لشخصية عامة/مسؤول (لتمييز النقد المشروع عن القدح الشخصي)
  const PUBLIC_FIGURE_MARKERS = [
    'الوزير', 'الرئيس', 'المحافظ', 'النائب', 'المسؤول', 'الحكومه', 'المدير العام', 'رئيس البلديه', 'القرار الحكومي'
  ];
  // افتراء/اختلاق اتهام بلا دليل (يحوّل النقد المشروع إلى قدح وتشهير)
  const FABRICATION_MARKERS = [
    'بلا دليل', 'دون اي دليل', 'اكيد سارق ولا يوجد اثبات', 'اكيد فاسد بلا برهان', 'متأكد انه خائن بدون دليل'
  ];
  // سخرية تستهدف أعراض الناس أو مآسي الضحايا (سلبي) مقابل سخرية سياسية عامة (حيادي)
  const VICTIM_MOCKERY_MARKERS = [
    'يستاهلون الموت ضحكت', 'مصيبتهم مضحكه', 'السخريه من ضحايا', 'نكته عن جثث', 'مضحك انهم ماتوا',
    'السخريه من عرض فلان', 'السخريه من شرف'
  ];
  const GENERAL_SATIRE_MARKERS = ['ما شاء الله عليكم', 'برافو عليكم', 'يا سلام', 'كالعاده', '🙄', '😏', '🤡'];

  // علامات الاستفهام: كلمات قصيرة عالية التواتر (كم، هل...) تُفحص كتوكِن مستقل لتفادي
  // مطابقتها كجزء من كلمة أخرى (مثل "عليكم")، بخلاف العبارات الأطول فتُفحص كسلسلة فرعية.
  const QUESTION_WORD_TOKENS = ['هل', 'متي', 'اين', 'كيف', 'لماذا', 'كم', 'ماذا'];
  const QUESTION_PHRASES = ['؟', 'ما هو', 'ما هي', 'من هو'];
  function isQuestionText(norm) {
    if (QUESTION_PHRASES.some(m => norm.includes(normalize(m)))) return true;
    const tokens = norm.split(' ');
    return QUESTION_WORD_TOKENS.some(w => tokens.includes(normalize(w)));
  }
  const STATS_MARKERS = ['%', 'بالمئه', 'احصائ', 'بلغ عدد', 'نسبه', 'ارتفع بنسبه', 'انخفض بنسبه', 'وفق تقرير',
                          'مؤشر', 'اجمالي', 'معدل'];
  const CONSTRUCTIVE_CRITICISM_MARKERS = ['نقترح', 'نطالب باصلاح', 'من الافضل', 'يجب تحسين', 'ملاحظه بناءه',
                                           'ندعو الي معالجه', 'حل مقترح', 'باحترام نقول'];

  /* ============================================================
   * 5) تسميات العرض
   * ============================================================ */
  const CLASS_LABEL = { POSITIVE: 'إيجابي', NEGATIVE: 'سلبي', NEUTRAL: 'حيادي' };
  const CLASS_ICON = { POSITIVE: '🟢', NEGATIVE: '🔴', NEUTRAL: '⚪' };
  const LEVEL_LABEL = { HIGH: 'عالي', MEDIUM: 'متوسط', LOW: 'منخفض' };
  const LEVEL_CLASS = { HIGH: 'lv-high', MEDIUM: 'lv-mid', LOW: 'lv-low' };
  const ACTION_LABEL = {
    KEEP: 'الإبقاء على المنشور',
    DELETE: 'الحذف الفوري',
    REVIEW: 'تحويله للمراجعة البشرية'
  };
  const ACTION_ICON = { KEEP: '✅', DELETE: '⛔', REVIEW: '🔍' };

  /* ============================================================
   * 6) التحليل الأساسي (Chain of Thought)
   * ============================================================ */
  function analyze(post) {
    const rawText = (post && (post.text || post.message)) || '';
    const norm = normalize(rawText);

    const isQuestion = isQuestionText(norm);
    const isStats = STATS_MARKERS.some(m => norm.includes(normalize(m)));
    const isConstructive = CONSTRUCTIVE_CRITICISM_MARKERS.some(m => norm.includes(normalize(m)));
    const mentionsPublicFigure = anyHit(norm, PUBLIC_FIGURE_MARKERS);
    const hasFabrication = anyHit(norm, FABRICATION_MARKERS);
    const isCondemnation = anyHit(norm, CONDEMNATION_MARKERS);
    const mocksVictims = anyHit(norm, VICTIM_MOCKERY_MARKERS);
    const generalSatire = anyHit(norm, GENERAL_SATIRE_MARKERS);

    // --- كشف الفئات السلبية ---
    const negMatches = [];
    for (const [id, cat] of Object.entries(NEG)) {
      const hits = countHits(norm, cat.words);
      if (hits > 0) negMatches.push({ id, cat, hits });
    }
    // --- كشف الفئات الإيجابية ---
    const posMatches = [];
    for (const [id, cat] of Object.entries(POS)) {
      const hits = countHits(norm, cat.words);
      if (hits > 0) posMatches.push({ id, cat, hits });
    }

    let classification, level, subCategory, legalBasis, contextualAnalysis, action, exceptionApplied = false;

    if (negMatches.length) {
      negMatches.sort((a, b) => (sevRank(b.cat.severity) - sevRank(a.cat.severity)) || (b.hits - a.hits));
      const top = negMatches[0].cat;
      const topId = negMatches[0].id;

      // حالة خاصة 1: نقل/توثيق الانتهاك بقصد الإدانة والتحذير → إيجابي أو حيادي، وليس سلبي
      if (isCondemnation) {
        exceptionApplied = true;
        classification = 'POSITIVE';
        level = 'MEDIUM';
        subCategory = POS.DIGITAL_AWARENESS.label;
        legalBasis = POS.DIGITAL_AWARENESS.legal;
        action = 'KEEP';
        contextualAnalysis = `المنشور ينقل مضمون «${top.label}» لكنه يتضمن عبارات إدانة واستنكار صريحة؛ النية هنا التحذير والتوثيق النقدي وليس الترويج للانتهاك، وفق استثناء «نقل الانتهاك للتوثيق».`;
      }
      // حالة خاصة 2: سخرية سياسية عامة دون استهداف ضحايا → حيادي، وليس سلبي
      else if (topId === 'DEFAMATION_INSULT' && !mentionsPublicFigure && generalSatire && !mocksVictims) {
        classification = 'NEUTRAL';
        level = 'LOW';
        subCategory = 'رأي شخصي ساخر عام دون إساءة شخصية مباشرة';
        legalBasis = 'مسموح دستورياً ووفق مدونة السلوك الإعلامي (حرية الرأي والسخرية العامة)، ما دام لا يرقى لمستوى القدح أو الذم الشخصي المنصوص عليه في المادتين 24 و25 من قانون الجرائم المعلوماتية.';
        action = 'KEEP';
        contextualAnalysis = 'أسلوب المنشور ساخر لكنه عام ولا يستهدف شخصاً بعينه بإساءة مباشرة أو يستهزئ بمأساة ضحايا، فيبقى ضمن حدود التعبير المشروع.';
      }
      else {
        classification = 'NEGATIVE';
        level = top.severity;
        subCategory = top.label;
        legalBasis = top.legal;
        action = top.action;

        // تشديد: قدح/ذم بحق شخصية عامة، أو افتراء بلا دليل
        if (topId === 'DEFAMATION_INSULT') {
          if (mentionsPublicFigure) {
            level = 'HIGH'; action = 'DELETE';
            contextualAnalysis = 'يوجّه المنشور قدحاً أو ذماً صريحاً بحق شخصية/جهة عامة، والمادتان 24 و25 من قانون الجرائم المعلوماتية تشدّدان العقوبة إذا وقع الجرم بحق مكلَّف بعمل عام أثناء ممارسته لعمله أو بسببه.';
          } else if (hasFabrication) {
            level = 'HIGH'; action = 'DELETE';
            contextualAnalysis = 'ينتقل المنشور من النقد المشروع إلى اختلاق اتهام دون أي دليل (افتراء وتجنٍّ)، وهو ما يخرجه فوراً من دائرة الرأي المشروع إلى القدح والذم المعاقب عليهما.';
          } else if (mocksVictims) {
            contextualAnalysis = 'يتضمن المنشور سخرية تستهدف كرامة أفراد أو تستهزئ بمعاناتهم، وهو ما يرقى إلى القدح والتحقير الإلكتروني.';
          } else {
            contextualAnalysis = 'يتضمن المنشور ألفاظ قدح أو ذم مباشرة تجاه أفراد، بصرف النظر عن صفتهم.';
          }
        } else {
          contextualAnalysis = `يتضمن المنشور مؤشرات واضحة على «${top.label}»، وهو ما يستوجب التصنيف السلبي وفق الإطار القانوني والأخلاقي الناظم للفضاء الرقمي السوري.`;
        }

        if (negMatches.length > 1) {
          contextualAnalysis += ` كما ظهرت مؤشرات إضافية على: ${negMatches.slice(1, 3).map(m => m.cat.label).join('، ')}.`;
        }
      }
    } else if (posMatches.length) {
      posMatches.sort((a, b) => (impRank(b.cat.importance) - impRank(a.cat.importance)) || (b.hits - a.hits));
      const top = posMatches[0].cat;
      classification = 'POSITIVE';
      level = top.importance;
      subCategory = top.label;
      legalBasis = top.legal;
      action = 'KEEP';
      contextualAnalysis = `يساهم المنشور في «${top.label}»، وهو محتوى بنّاء يعزز القيم الوطنية والمجتمعية المنشودة.`;
    } else {
      classification = 'NEUTRAL';
      if (isQuestion) {
        subCategory = 'استفسار عام'; contextualAnalysis = 'المنشور استفهامي بحت، لا يحمل موقفاً أو حكماً.';
        level = 'LOW';
      } else if (isStats) {
        subCategory = 'خبر إحصائي/تقرير مجرد'; contextualAnalysis = 'المنشور ينقل بيانات أو أرقاماً بصياغة موضوعية دون توجيه أو تسييس.';
        level = 'MEDIUM';
      } else if (isConstructive && mentionsPublicFigure) {
        subCategory = 'رأي شخصي سلمي — نقد بنّاء ومشروع لسياسة أو شخصية عامة'; contextualAnalysis = 'المنشور ينتقد سياسة أو أداءً عاماً بأسلوب بنّاء خالٍ من القدح أو الذم أو الاتهامات غير الموثقة، وهو نقد مشروع ومسموح به.';
        level = 'LOW';
      } else {
        subCategory = 'محتوى ترفيهي/شخصي أو خبر مجرد'; contextualAnalysis = 'لا يحمل المنشور مضموناً ضاراً ولا قيمة بنّاءة استثنائية؛ هو تحديث يومي أو محتوى عام لا يستدعي أي إجراء.';
        level = 'LOW';
      }
      legalBasis = mentionsPublicFigure
        ? 'مسموح دستورياً ووفق مدونة السلوك الإعلامي (حرية الرأي والنقد المشروع للشخصيات العامة المكلَّفة بعمل عام)، ما دام خالياً من القدح والذم والاتهامات غير الموثقة.'
        : 'لا يخالف أي بند من قانون الجرائم المعلوماتية أو مدونة السلوك الإعلامي؛ محتوى عام لا يستدعي أي إجراء تقييدي.';
      action = 'KEEP';
    }

    const source = analyzeSource(post);
    const summary = `${CLASS_LABEL[classification]} · ${LEVEL_LABEL[level]} الخطورة/الأهمية · ${subCategory}`;

    return {
      classification, classificationLabel: CLASS_LABEL[classification], classificationIcon: CLASS_ICON[classification],
      level, levelLabel: LEVEL_LABEL[level], levelClass: LEVEL_CLASS[level],
      subCategory, legalBasis, contextualAnalysis,
      action, actionLabel: ACTION_LABEL[action], actionIcon: ACTION_ICON[action],
      exceptionApplied,
      flagged: classification === 'NEGATIVE',
      source, summary,
      analyzedAt: Date.now()
    };
  }

  function sevRank(s) { return s === 'HIGH' ? 3 : s === 'MEDIUM' ? 2 : 1; }
  function impRank(s) { return s === 'HIGH' ? 3 : s === 'MEDIUM' ? 2 : 1; }

  function analyzeSource(post) {
    const author = (post && post.author) || 'مصدر غير معروف';
    const eng = (Number(post && post.likes) || 0) + (Number(post && post.comments) || 0) + (Number(post && post.shares) || 0);
    let credibility;
    if (eng >= 5000) credibility = 'حساب واسع الانتشار — تأثيره مرتفع';
    else if (eng >= 500) credibility = 'حساب متوسط التأثير';
    else if (eng > 0) credibility = 'حساب محدود التفاعل';
    else credibility = 'تفاعل غير معروف/منخفض';
    const type = /news|media|official|gov|رسمي|اخبار|قناه|وكاله/i.test(author) ? 'صفحة إعلامية/رسمية (مرجّح)' : 'صفحة/حساب عام';
    return { account: author, type, credibility, engagement: eng };
  }

  /* ============================================================
   * 7) دوال العرض (HTML)
   * ============================================================ */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function badges(a) {
    if (!a) return '';
    return `<div class="fbx-badges">
      <span class="fbx-badge fbx-badge-main fbx-${a.classification.toLowerCase()}">${a.classificationIcon} ${esc(a.classificationLabel)}</span>
      <span class="fbx-badge ${a.levelClass}">${esc(a.levelLabel)} الخطورة</span>
      <span class="fbx-badge fbx-soft">${esc(a.subCategory.split(' — ')[0])}</span>
      ${a.action !== 'KEEP' ? `<span class="fbx-badge fbx-flag">${a.actionIcon} ${esc(a.actionLabel)}</span>` : ''}
      ${a.exceptionApplied ? `<span class="fbx-badge fbx-exc">⚖️ استثناء توثيق/إدانة</span>` : ''}
    </div>`;
  }

  // اللوحة الكاملة — مسار تسلسلي بصري (Chain of Thought) بشكل خط زمني مرقَّم
  function panel(a) {
    if (!a) return '';
    const steps = [
      { icon: '📌', k: 'التصنيف النهائي', dot: `fbx-${a.classification.toLowerCase()}`,
        v: `<span class="fbx-step-v fbx-${a.classification.toLowerCase()}">${a.classificationIcon} ${esc(a.classificationLabel)}</span>` },
      { icon: '⚖️', k: 'مستوى الخطورة/الأهمية', dot: a.levelClass,
        v: `<span class="fbx-step-v ${a.levelClass}">${esc(a.levelLabel)}</span>` },
      { icon: '🧭', k: 'التحليل السياقي (لماذا؟)', dot: 'fbx-info',
        v: `<p class="fbx-text">${esc(a.contextualAnalysis)}</p>` },
      { icon: '📖', k: 'الاستناد القانوني والأخلاقي', dot: 'fbx-info',
        v: `<p class="fbx-text">${esc(a.legalBasis)}</p>` },
      { icon: a.actionIcon, k: 'الإجراء الموصى به', dot: a.levelClass,
        v: `<div class="fbx-rec-box ${a.levelClass}"><strong>${esc(a.actionLabel)}</strong></div>` }
    ];
    const stepsHtml = steps.map((s, i) => `
      <div class="fbx-step">
        <div class="fbx-step-line">
          <div class="fbx-step-dot ${s.dot}">${s.icon}</div>
          ${i < steps.length - 1 ? '<div class="fbx-step-connector"></div>' : ''}
        </div>
        <div class="fbx-step-body">
          <div class="fbx-step-k">${s.k}</div>
          ${s.v}
        </div>
      </div>`).join('');
    return `<div class="fbx-analysis">
      ${stepsHtml}
      <div class="fbx-source-row">
        <span>👤 ${esc(a.source.account)}</span><span>·</span><span>${esc(a.source.type)}</span><span>·</span>
        <span>${esc(a.source.credibility)}</span><span>·</span><span>تفاعل: ${a.source.engagement}</span>
      </div>
    </div>`;
  }

  /* ============================================================
   * 8) حقن التنسيقات
   * ============================================================ */
  function injectStyles() {
    if (document.getElementById('fbx-analyzer-styles')) return;
    const css = `
    .fbx-badges { display:flex; flex-wrap:wrap; gap:6px; margin:10px 0 0; }
    .fbx-badge { display:inline-flex; align-items:center; gap:4px; font-size:.67rem; font-weight:800;
      padding:4px 10px; border-radius:999px; line-height:1.3; border:1px solid transparent; white-space:nowrap;
      transition:transform .15s ease, box-shadow .15s ease; }
    .fbx-badge:hover { transform:translateY(-1px); box-shadow:0 3px 8px rgba(0,0,0,.1); }
    .fbx-badge-main { font-size:.7rem; padding:4.5px 12px; }
    .fbx-soft { background:var(--surface-2,#eef1ea); color:var(--text,#1c2a22); border-color:var(--border,#dfe4d8); }
    .fbx-positive { background:#e1f2e5; color:#1c6b39; border-color:#aedcb9; }
    .fbx-negative { background:#fbe2de; color:#a3341f; border-color:#f0b6aa; }
    .fbx-neutral { background:#e9ecea; color:#4c5550; border-color:#d3d8d4; }
    .fbx-flag { background:linear-gradient(155deg,#ffe1ab,#f2cf8a); color:#7a4c00; border-color:#e0b662; }
    .fbx-exc { background:#e2ecfb; color:#215a9c; border-color:#b7d2f0; }
    .fbx-badge.lv-low { background:#e5f2e8; color:#2f7a49; border-color:#b7ddc2; }
    .fbx-badge.lv-mid { background:#fff2cf; color:#8a6100; border-color:#f0d68a; }
    .fbx-badge.lv-high { background:#fbe0d3; color:#a1471d; border-color:#f0b596; }
    [data-theme="dark"] .fbx-soft { background:var(--surface-2,#182620); color:var(--text,#e6ece6); border-color:var(--border,#23342b); }
    [data-theme="dark"] .fbx-positive { background:#173425; color:#7fcf9c; border-color:#28543a; }
    [data-theme="dark"] .fbx-negative { background:#3a2019; color:#e8917c; border-color:#5a3327; }
    [data-theme="dark"] .fbx-neutral { background:#232b27; color:#adb7b0; border-color:#374039; }
    [data-theme="dark"] .fbx-flag { background:linear-gradient(155deg,#4a3a17,#3a2d10); color:#e9c479; border-color:#5c481f; }
    [data-theme="dark"] .fbx-exc { background:#182838; color:#8bb4e8; border-color:#294564; }
    [data-theme="dark"] .fbx-badge.lv-low { background:#173425; color:#7fcf9c; border-color:#28543a; }
    [data-theme="dark"] .fbx-badge.lv-mid { background:#3a3117; color:#e9c479; border-color:#5c4d1f; }
    [data-theme="dark"] .fbx-badge.lv-high { background:#3a2019; color:#e8917c; border-color:#5a3327; }

    .fbx-toggle { border:none; background:none; cursor:pointer; font-family:inherit; font-weight:800;
      font-size:.72rem; color:var(--green-700,#205f45); padding:8px 0 0; display:inline-flex; align-items:center; gap:5px; }
    [data-theme="dark"] .fbx-toggle { color:var(--sage,#8aab6c); }

    .fbx-analysis { margin-top:11px; padding-top:13px; border-top:1px dashed var(--border,#dfe4d8);
      animation:fbxFade .3s ease; }
    @keyframes fbxFade { from{opacity:0;transform:translateY(-4px);} to{opacity:1;transform:none;} }

    /* ---- خط زمني للتحليل التسلسلي (Chain of Thought) ---- */
    .fbx-step { display:flex; gap:12px; padding-bottom:14px; }
    .fbx-step:last-of-type { padding-bottom:0; }
    .fbx-step-line { display:flex; flex-direction:column; align-items:center; flex:none; }
    .fbx-step-dot {
      width:27px; height:27px; border-radius:50%; flex:none;
      display:grid; place-items:center; font-size:12px;
      background:var(--surface-2,#eef1ea); border:1.5px solid var(--border,#dfe4d8); color:var(--text-2,#667167);
      box-shadow:0 0 0 3px var(--surface,#fff);
    }
    .fbx-step-connector { width:2px; flex:1; min-height:8px; margin:3px 0; background:var(--border,#dfe4d8); }
    .fbx-step-body { flex:1; min-width:0; padding-top:2px; }
    .fbx-step-k { font-size:.71rem; font-weight:800; color:var(--text-2,#667167); margin-bottom:3px; }
    .fbx-step-v { display:inline-block; font-size:.85rem; font-weight:900; padding:2px 11px; border-radius:999px; }
    .fbx-step-v.fbx-positive, .fbx-step-dot.fbx-positive { background:#e1f2e5; color:#1c6b39; border-color:#aedcb9; }
    .fbx-step-v.fbx-negative, .fbx-step-dot.fbx-negative { background:#fbe2de; color:#a3341f; border-color:#f0b6aa; }
    .fbx-step-v.fbx-neutral, .fbx-step-dot.fbx-neutral   { background:#e9ecea; color:#4c5550; border-color:#d3d8d4; }
    .fbx-step-v.lv-low, .fbx-step-dot.lv-low  { background:#e5f2e8; color:#2f7a49; border-color:#b7ddc2; }
    .fbx-step-v.lv-mid, .fbx-step-dot.lv-mid  { background:#fff2cf; color:#8a6100; border-color:#f0d68a; }
    .fbx-step-v.lv-high, .fbx-step-dot.lv-high { background:#fbe0d3; color:#a1471d; border-color:#f0b596; }
    [data-theme="dark"] .fbx-step-v.fbx-positive, [data-theme="dark"] .fbx-step-dot.fbx-positive { background:#173425; color:#7fcf9c; border-color:#28543a; }
    [data-theme="dark"] .fbx-step-v.fbx-negative, [data-theme="dark"] .fbx-step-dot.fbx-negative { background:#3a2019; color:#e8917c; border-color:#5a3327; }
    [data-theme="dark"] .fbx-step-v.fbx-neutral,  [data-theme="dark"] .fbx-step-dot.fbx-neutral  { background:#232b27; color:#adb7b0; border-color:#374039; }
    [data-theme="dark"] .fbx-step-v.lv-low,  [data-theme="dark"] .fbx-step-dot.lv-low  { background:#173425; color:#7fcf9c; border-color:#28543a; }
    [data-theme="dark"] .fbx-step-v.lv-mid,  [data-theme="dark"] .fbx-step-dot.lv-mid  { background:#3a3117; color:#e9c479; border-color:#5c4d1f; }
    [data-theme="dark"] .fbx-step-v.lv-high, [data-theme="dark"] .fbx-step-dot.lv-high { background:#3a2019; color:#e8917c; border-color:#5a3327; }

    .fbx-text { font-size:.78rem; line-height:1.7; color:var(--text,#1c2a22); }
    .fbx-rec-box { border-radius:10px; padding:10px 13px; border:1px solid var(--border,#dfe4d8); background:var(--surface-2,#eef1ea); font-size:.84rem; }
    .fbx-rec-box.lv-high { background:#fbe8e0; border-color:#f0b596; }
    .fbx-rec-box.lv-mid { background:#fff6e2; border-color:#f0d68a; }
    .fbx-rec-box.lv-low { background:#e9f5ec; border-color:#b7ddc2; }
    [data-theme="dark"] .fbx-rec-box { background:var(--surface-2,#182620); border-color:var(--border,#23342b); }
    [data-theme="dark"] .fbx-rec-box.lv-high { background:#332019; border-color:#523527; }
    [data-theme="dark"] .fbx-rec-box.lv-mid { background:#332c19; border-color:#524a27; }
    [data-theme="dark"] .fbx-rec-box.lv-low { background:#182b20; border-color:#28543a; }

    .fbx-source-row { display:flex; flex-wrap:wrap; gap:6px; align-items:center;
      font-size:.74rem; color:var(--text-2,#667167); margin-top:2px; padding-top:12px; border-top:1px solid var(--border,#dfe4d8); }
    `;
    const style = document.createElement('style');
    style.id = 'fbx-analyzer-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  /* ============================================================
   * 9) إحصاءات مجمّعة
   * ============================================================ */
  function aggregate(analyses) {
    const out = {
      total: analyses.length,
      positive: 0, negative: 0, neutral: 0,
      high: 0, medium: 0, low: 0,
      flagged: 0, needsDelete: 0, needsReview: 0
    };
    for (const a of analyses) {
      if (!a) continue;
      if (a.classification === 'POSITIVE') out.positive++;
      else if (a.classification === 'NEGATIVE') out.negative++;
      else out.neutral++;
      if (a.level === 'HIGH') out.high++;
      else if (a.level === 'MEDIUM') out.medium++;
      else out.low++;
      if (a.flagged) out.flagged++;
      if (a.action === 'DELETE') out.needsDelete++;
      if (a.action === 'REVIEW') out.needsReview++;
    }
    return out;
  }

  global.FBXAnalyzer = { analyze, badges, panel, injectStyles, aggregate, normalize };

})(typeof window !== 'undefined' ? window : this);
