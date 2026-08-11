"""Seed the DEMONSTRATION dataset.

    python -m seed.demo_data          # create if empty
    python -m seed.demo_data --reset  # drop and recreate

Everything created here is flagged ``is_demo=True`` and is labelled as
demonstration data on every surface that renders it. Phone numbers use the
reserved ``555`` prefix so they cannot collide with a real service. Names are
fictional ("Coastal Region", "National Weather Service") and no real government
body is impersonated.

Scenario: *Heavy Rain and Flood Emergency*.
"""

from __future__ import annotations

import argparse
import sys
from datetime import timedelta

from app.ai import ingest as ingest_service
from app.db import Base, engine, session_scope
from app.models import Crisis, OfficialSource, User, utcnow
from app.security.rbac import Permission
from app.services import (
    alerts as alert_service,
    crisis as crisis_service,
    directory as directory_service,
    faqs as faq_service,
    guidance as guidance_service,
    rumors as rumor_service,
    settings_store,
    updates as update_service,
    users as user_service,
)
from app.services.context import Actor

SYSTEM = Actor.system()

#: Printed at the end. These are demonstration credentials for a local instance
#: only; the README says so, and production seeding uses ``--reset`` never.
DEMO_USERS = [
    ("System Administrator", "admin@demo.local", "system_admin", "DemoAdmin!2026"),
    ("Content Editor", "editor@demo.local", "content_editor", "DemoEditor!2026"),
    ("Rumor Reviewer", "reviewer@demo.local", "rumor_reviewer", "DemoReview!2026"),
    ("Operations Supervisor", "ops@demo.local", "ops_supervisor", "DemoOpsLead!2026"),
    ("AI Administrator", "ai@demo.local", "ai_admin", "DemoAiAdmin!2026"),
    ("Read-only Viewer", "viewer@demo.local", "viewer", "DemoViewer!2026"),
]

SOURCES = [
    ("National Weather Service", "weather-service", 5,
     "الجهة الرسمية الوحيدة المخوّلة بإصدار التحذيرات الجوية والتنبؤات."),
    ("Civil Defense Directorate", "civil-defense", 5,
     "الجهة المسؤولة عن عمليات الإنقاذ والإخلاء وإدارة مراكز الإيواء."),
    ("Ministry of Interior", "ministry-interior", 5,
     "تصدر قرارات الأمن العام وحظر التجول وتنظيم الحركة."),
    ("Ministry of Education", "ministry-education", 5,
     "الجهة الوحيدة المخوّلة بإعلان تعليق الدراسة أو استئنافها."),
    ("Ministry of Health", "ministry-health", 5,
     "تصدر الإرشادات الصحية وبيانات جاهزية المستشفيات."),
    ("National Water Authority", "water-authority", 4,
     "مسؤولة عن شبكات المياه وإعلانات صلاحية مياه الشرب."),
    ("National Electricity Company", "electricity-company", 4,
     "مسؤولة عن شبكة الكهرباء وجداول انقطاع التيار."),
    ("Roads and Transport Authority", "roads-authority", 4,
     "تصدر حالة الطرق وإغلاقاتها والمسارات البديلة."),
    ("Coastal Region Municipality", "coastal-municipality", 4,
     "الجهة المحلية المسؤولة عن تصريف مياه الأمطار والخدمات البلدية."),
    ("Northern Region Municipality", "northern-municipality", 4,
     "الجهة المحلية للمنطقة الشمالية."),
    ("National Emergency Operations Center", "emergency-center", 5,
     "مركز التنسيق الوطني بين الجهات أثناء الحالات الطارئة."),
    ("Government Communication Office", "gov-communication", 4,
     "الناطق الرسمي باسم الحكومة."),
    ("Meteorological Research Institute", "met-institute", 3,
     "مؤسسة بحثية تنشر تحليلات علمية، وليست جهة تحذير رسمية."),
    ("National Red Crescent", "red-crescent", 4,
     "منظمة إغاثة معتمدة تدير مراكز الإيواء والمساعدات."),
    ("Public Transport Company", "public-transport", 3,
     "مشغّل النقل العام، ينشر تعديلات الرحلات."),
    ("Coastal Region Health Directorate", "coastal-health", 4,
     "المديرية الصحية المحلية."),
    ("National Telecommunications Authority", "telecom-authority", 3,
     "تنظم الاتصالات وتنشر حالة الشبكات."),
    ("Agricultural Extension Service", "agriculture-service", 3,
     "إرشادات حماية المحاصيل والثروة الحيوانية."),
    ("National Social Support Fund", "social-support", 4,
     "يدير المساعدات المالية والعينية للمتضررين."),
    ("Coastal Region Police Command", "coastal-police", 4,
     "القيادة الأمنية المحلية."),
]

SERVICES = [
    ("General Emergency Line", "555 0911", "general_emergency", "24/7", 1),
    ("Civil Defense Directorate", "555 0998", "civil_defense", "24/7", 2),
    ("Ambulance Service", "555 0997", "ambulance", "24/7", 3),
    ("Coastal Region Police Command", "555 0999", "police", "24/7", 4),
    ("National Electricity Company", "555 0121", "electricity", "24/7", 10),
    ("National Water Authority", "555 0122", "water", "06:00 – 22:00", 11),
    ("Coastal Region Municipality", "555 0140", "municipality", "07:00 – 20:00", 12),
    ("Government Call Center", "555 0100", "government_call_center", "24/7", 13),
    ("Coastal General Hospital", "555 0301", "hospital", "24/7", 20),
    ("Northern District Hospital", "555 0302", "hospital", "24/7", 21),
    ("Al-Salam School Shelter", "555 0401", "shelter", "24/7 during the emergency", 30),
    ("Coastal Sports Hall Shelter", "555 0402", "shelter", "24/7 during the emergency", 31),
]

UPDATES = [
    ("تعليق الدراسة في المنطقة الساحلية والشمالية غداً",
     "أعلنت وزارة التربية والتعليم تعليق الدراسة في جميع مدارس المنطقة الساحلية "
     "والمنطقة الشمالية ليوم غد، وذلك بناءً على التحذير الجوي الصادر عن هيئة "
     "الأرصاد الوطنية.\n\n"
     "يشمل القرار المدارس الحكومية والخاصة ورياض الأطفال. أما الجامعات فتواصل "
     "الدراسة عن بُعد.\n\n"
     "سيصدر قرار منفصل بشأن يوم بعد الغد بحسب تطورات الحالة الجوية.",
     "education", "critical", "ministry-education", 1),
    ("إغلاق الطريق الساحلي بين الكيلو 12 والكيلو 27",
     "أعلنت هيئة الطرق والنقل إغلاق الطريق الساحلي بين الكيلو 12 والكيلو 27 في "
     "الاتجاهين بسبب تجمعات المياه.\n\n"
     "المسار البديل: الطريق الدائري الشرقي عبر المخرج رقم 4. يتوقع ازدحام إضافي "
     "على المسار البديل.\n\n"
     "بقية الطرق الرئيسية مفتوحة حتى الآن، ويجري تقييم الوضع كل ساعتين.",
     "transport", "important", "roads-authority", 3),
    ("تحذير من أمطار غزيرة خلال الـ 24 ساعة القادمة",
     "تحذر هيئة الأرصاد الوطنية من هطول أمطار غزيرة إلى غزيرة جداً على المنطقة "
     "الساحلية والمنطقة الشمالية خلال الـ 24 ساعة القادمة.\n\n"
     "الكميات المتوقعة تتراوح بين 40 و 90 ملم، مع احتمال جريان السيول في الأودية "
     "والمناطق المنخفضة.\n\n"
     "يُنصح بتجنب الأودية ومجاري السيول وعدم عبور الطرق المغمورة بالمياه.",
     "health_safety", "critical", "weather-service", 2),
    ("مياه الشرب صالحة للاستخدام في جميع المناطق",
     "تؤكد هيئة المياه الوطنية أن مياه الشرب المزوّدة عبر الشبكة العامة صالحة "
     "للاستخدام في جميع المناطق، بما فيها المنطقة الساحلية.\n\n"
     "تجري الهيئة فحوصات دورية كل ست ساعات، ولم تُسجَّل أي نتيجة خارج الحدود "
     "المسموح بها.\n\n"
     "في حال حدوث أي تغيّر سيصدر إعلان رسمي فوري عبر هذه القناة.",
     "public_services", "important", "water-authority", 5),
    ("فتح أربعة مراكز إيواء في المنطقة الساحلية",
     "أعلنت مديرية الدفاع المدني فتح أربعة مراكز إيواء مجهزة في المنطقة الساحلية "
     "لاستقبال المتضررين من الأمطار.\n\n"
     "المراكز مجهزة بالفرش والوجبات والرعاية الصحية الأولية، وتعمل على مدار "
     "الساعة طوال فترة الحالة الطارئة.\n\n"
     "للاستفسار عن أقرب مركز يرجى الاتصال بخط الطوارئ العام.",
     "public_services", "important", "civil-defense", 6),
    ("انقطاع مؤقت للتيار الكهربائي في ثلاثة أحياء",
     "تعلن الشركة الوطنية للكهرباء عن انقطاع مؤقت للتيار في أحياء الميناء "
     "والنخيل والواحة، نتيجة إجراءات سلامة وقائية في محطات التحويل المتأثرة "
     "بتجمعات المياه.\n\n"
     "فرق الصيانة تعمل في الموقع، والمدة المتوقعة للإصلاح تتراوح بين أربع وست "
     "ساعات.\n\n"
     "يرجى عدم الاقتراب من أي كابل أو عمود كهربائي ساقط والإبلاغ عنه فوراً.",
     "public_services", "normal", "electricity-company", 8),
]

FAQS = [
    ("هل المدارس مغلقة غداً؟",
     "نعم. أعلنت وزارة التربية والتعليم تعليق الدراسة في المنطقة الساحلية "
     "والمنطقة الشمالية ليوم غد، ويشمل القرار المدارس الحكومية والخاصة ورياض "
     "الأطفال. الجامعات تواصل الدراسة عن بُعد.", "education"),
    ("متى تستأنف الدراسة؟",
     "لم يصدر قرار بشأن يوم بعد الغد حتى الآن. سيصدر إعلان منفصل من وزارة "
     "التربية والتعليم بحسب تطورات الحالة الجوية، وسينشر في صفحة التحديثات "
     "الرسمية فور صدوره.", "education"),
    ("ما هي الطرق المغلقة حالياً؟",
     "الطريق الساحلي مغلق بين الكيلو 12 والكيلو 27 في الاتجاهين. المسار البديل "
     "هو الطريق الدائري الشرقي عبر المخرج رقم 4. بقية الطرق الرئيسية مفتوحة، "
     "ويعاد تقييم الوضع كل ساعتين.", "roads"),
    ("هل مياه الشرب آمنة؟",
     "نعم. تؤكد هيئة المياه الوطنية أن مياه الشبكة العامة صالحة للاستخدام في "
     "جميع المناطق. تُجرى فحوصات كل ست ساعات، وسيصدر إعلان رسمي فوري في حال "
     "حدوث أي تغيّر.", "public_services"),
    ("أين أقرب مركز إيواء؟",
     "فُتحت أربعة مراكز إيواء في المنطقة الساحلية تعمل على مدار الساعة. لمعرفة "
     "أقرب مركز إليك اتصل بخط الطوارئ العام، أو راجع صفحة أرقام الطوارئ "
     "والمساعدة.", "assistance"),
    ("لماذا انقطع التيار الكهربائي عن حيّنا؟",
     "الانقطاع في أحياء الميناء والنخيل والواحة إجراء سلامة وقائي في محطات "
     "التحويل المتأثرة بتجمعات المياه. المدة المتوقعة للإصلاح من أربع إلى ست "
     "ساعات.", "public_services"),
    ("ماذا أفعل إذا رأيت كابل كهرباء ساقطاً؟",
     "لا تقترب منه ولا تلمسه ولا تحاول تحريكه، وأبعد الأطفال عن المنطقة، ثم "
     "اتصل فوراً بالشركة الوطنية للكهرباء أو بخط الطوارئ العام.", "health"),
    ("هل المستشفيات تعمل بشكل طبيعي؟",
     "المستشفيات تعمل على مدار الساعة وأقسام الطوارئ مفتوحة. قد تشهد بعض "
     "الأقسام ضغطاً أعلى من المعتاد. للحالات غير الطارئة يُفضّل تأجيل المراجعة.",
     "health"),
    ("كيف أتحقق من صحة خبر متداول؟",
     "أرسل الادعاء عبر صفحة التحقق من الشائعات. يراجعه مختص مقابل المصادر "
     "الرسمية، ولا تُنشر أي نتيجة قبل اعتماد بشري. يمكنك أيضاً تصفح نتائج "
     "التحقق المنشورة.", "general"),
    ("كيف أحصل على مساعدة إذا تضرر منزلي؟",
     "اتصل بخط الطوارئ العام لتقييم الحالة، وسجّل بلاغاً عبر صفحة الإبلاغ عن "
     "مشكلة. المساعدات المالية والعينية يديرها الصندوق الوطني للدعم "
     "الاجتماعي.", "assistance"),
]

#: Claims that a reviewer has already settled (these become public), followed
#: by claims still in the queue (these stay invisible to citizens — which is
#: the point of seeding them).
REVIEWED_RUMORS = [
    ("تم فتح السدود وستغرق المدينة خلال ساعات", "whatsapp", "false",
     "لم يصدر عن أي جهة رسمية قرار بفتح السدود. مستويات السدود ضمن الحدود "
     "الآمنة وتخضع للمراقبة المستمرة، ولا يوجد أي خطر غمر للمدينة.",
     "الادعاء لا يستند إلى أي مصدر رسمي، وقد نُفي من مركز عمليات الطوارئ الوطني."),
    ("مياه الشرب ملوثة ويمنع استخدامها", "facebook", "false",
     "مياه الشبكة العامة صالحة للاستخدام. تجري هيئة المياه الوطنية فحوصات كل "
     "ست ساعات ولم تُسجَّل أي نتيجة خارج الحدود المسموح بها.",
     "يتعارض الادعاء مع البيان الرسمي الصادر عن هيئة المياه الوطنية."),
    ("الدراسة معلقة لمدة أسبوع كامل", "whatsapp", "misleading",
     "القرار الصادر يعلّق الدراسة ليوم واحد فقط. لم يصدر أي قرار بشأن الأيام "
     "التالية، وسيصدر إعلان منفصل بحسب تطورات الحالة الجوية.",
     "الادعاء يوسّع قراراً حقيقياً ليوم واحد إلى أسبوع دون أي سند رسمي."),
    ("جميع الطرق المؤدية إلى المدينة مغلقة", "twitter", "misleading",
     "المغلق حالياً هو الطريق الساحلي بين الكيلو 12 والكيلو 27 فقط. بقية الطرق "
     "الرئيسية مفتوحة، والمسار البديل هو الطريق الدائري الشرقي.",
     "الادعاء يعمّم إغلاقاً محدوداً على كامل شبكة الطرق."),
    ("مراكز الإيواء ممتلئة ولا تستقبل أحداً", "whatsapp", "false",
     "مراكز الإيواء الأربعة تستقبل المتضررين وتعمل على مدار الساعة. للاستفسار "
     "عن أقرب مركز اتصل بخط الطوارئ العام.",
     "نفت مديرية الدفاع المدني الادعاء وأكدت توفر الطاقة الاستيعابية."),
    ("انقطاع الكهرباء سيستمر ثلاثة أيام", "facebook", "misleading",
     "المدة المتوقعة للإصلاح من أربع إلى ست ساعات بحسب الشركة الوطنية "
     "للكهرباء، والانقطاع يشمل ثلاثة أحياء فقط.",
     "الادعاء يبالغ في المدة ولا يستند إلى أي بيان رسمي."),
    ("تحذير رسمي بإخلاء المنطقة الساحلية بالكامل", "whatsapp", "false",
     "لم يصدر أي قرار بإخلاء المنطقة الساحلية. أي قرار إخلاء يصدر حصراً عن "
     "مديرية الدفاع المدني ويُعلن عبر القنوات الرسمية.",
     "أخطر الادعاءات المتداولة، ونفاه الدفاع المدني صراحةً."),
]

PENDING_RUMORS = [
    ("المستشفى الساحلي توقف عن استقبال الحالات", "facebook"),
    ("هناك نقص حاد في الأدوية في الصيدليات", "whatsapp"),
    ("الحكومة ستوزع مساعدات مالية غداً لكل الأسر", "twitter"),
]

GUIDANCE = [
    ("before", "general", "do", "جهّز حقيبة طوارئ",
     "ماء وأدوية أساسية ومصباح يدوي وبطاريات ونسخ من الوثائق المهمة في كيس مقاوم للماء."),
    ("before", "general", "do", "احفظ أرقام الطوارئ",
     "دوّن الأرقام الرسمية على ورقة لا تعتمد على شحن الهاتف، واحفظها في مكان يعرفه أفراد الأسرة."),
    ("before", "general", "dont", "لا تترك الأغراض في الأماكن المنخفضة",
     "انقل الوثائق والأجهزة الكهربائية إلى مستوى مرتفع داخل المنزل."),
    ("before", "elderly", "do", "رتّب من يطمئن عليك",
     "اتفق مع جار أو قريب على الاتصال بك مرتين يومياً، واتفقا على خطة بديلة إذا انقطع الاتصال."),
    ("before", "disabilities", "do", "جهّز خطة تنقل واضحة",
     "حدّد مسبقاً من سيساعدك على المغادرة، وجهّز الأجهزة المساعدة وبطارية احتياطية لها."),
    ("during", "general", "dont", "لا تعبر الطرق المغمورة",
     "عشرون سنتيمتراً من المياه الجارية تكفي لجرف شخص بالغ، ونصف متر يكفي لجرف سيارة. توقف وعُد من حيث أتيت."),
    ("during", "general", "do", "ابقَ في مكان آمن ومرتفع",
     "إذا كنت في مبنى آمن فالبقاء فيه أفضل من التنقل، ما لم تصدر تعليمات إخلاء رسمية."),
    ("during", "general", "dont", "لا تلمس الكابلات الكهربائية",
     "ابتعد عن أي كابل أو عمود ساقط وأبلغ عنه فوراً. المياه توصل الكهرباء لمسافة بعيدة."),
    ("during", "general", "do", "تحقق قبل أن تشارك",
     "قبل إعادة إرسال أي خبر، تأكد من مصدره الرسمي. نشر معلومة خاطئة أثناء الطوارئ يعرقل عمل الفرق."),
    ("during", "children", "do", "اشرح للأطفال ما يحدث ببساطة",
     "استخدم كلمات قصيرة وواضحة، وأخبرهم بما ستفعلونه معاً. الروتين المألوف يقلل الخوف."),
    ("during", "elderly", "do", "حافظ على الدفء والأدوية",
     "تأكد من توفر الأدوية اليومية لمدة أسبوع على الأقل، ومن أن الغرفة دافئة وجافة."),
    ("during", "disabilities", "do", "اطلب المساعدة مبكراً",
     "لا تنتظر تفاقم الوضع. اتصل بخط الطوارئ العام واذكر احتياجك التفصيلي بوضوح."),
    ("during", "vulnerable", "do", "تواصل مع مركز الإيواء الأقرب",
     "مراكز الإيواء توفر مبيتاً ووجبات ورعاية صحية أولية مجاناً."),
    ("after", "general", "dont", "لا تعد إلى منزلك قبل التصريح",
     "انتظر إعلان الجهات الرسمية بأن المنطقة آمنة، وتحقق من سلامة التمديدات قبل تشغيل الكهرباء."),
    ("after", "general", "do", "وثّق الأضرار",
     "التقط صوراً للأضرار قبل أي إصلاح، وسجّل بلاغاً لدى الجهة المختصة."),
    ("after", "general", "do", "احذر من المياه الراكدة",
     "قد تكون ملوثة أو تخفي حفراً أو كابلات. تجنبها ونظّف ما دخل منها إلى المنزل بمطهر."),
]

KNOWLEDGE = [
    ("بيان تعليق الدراسة", "ministry-education", "education",
     "تعلن وزارة التربية والتعليم تعليق الدراسة في جميع مدارس المنطقة الساحلية "
     "والمنطقة الشمالية ليوم غد.\n\n"
     "يشمل القرار المدارس الحكومية والخاصة ورياض الأطفال. الجامعات تواصل "
     "الدراسة عن بُعد.\n\n"
     "لم يصدر حتى الآن أي قرار بشأن يوم بعد الغد، وسيصدر إعلان منفصل بحسب "
     "تطورات الحالة الجوية. لا صحة لأي معلومة عن تعليق الدراسة لأسبوع كامل."),
    ("حالة الطرق والمسارات البديلة", "roads-authority", "roads",
     "الطريق الساحلي مغلق بين الكيلو 12 والكيلو 27 في الاتجاهين بسبب تجمعات "
     "المياه.\n\n"
     "المسار البديل المعتمد هو الطريق الدائري الشرقي عبر المخرج رقم 4.\n\n"
     "جميع الطرق الرئيسية الأخرى مفتوحة. يعاد تقييم حالة الطرق كل ساعتين وتُنشر "
     "التحديثات فور صدورها."),
    ("بيان صلاحية مياه الشرب", "water-authority", "water",
     "مياه الشرب المزوّدة عبر الشبكة العامة صالحة للاستخدام في جميع المناطق.\n\n"
     "تُجرى فحوصات المطابقة كل ست ساعات في المختبرات المعتمدة، ولم تُسجَّل أي "
     "نتيجة خارج الحدود المسموح بها منذ بداية الحالة الطارئة.\n\n"
     "في حال رصد أي تغيّر سيصدر إعلان رسمي فوري. لا صحة لأي ادعاء بتلوث "
     "مياه الشبكة."),
    ("مراكز الإيواء المتاحة", "civil-defense", "shelter",
     "فُتحت أربعة مراكز إيواء مجهزة في المنطقة الساحلية لاستقبال المتضررين.\n\n"
     "المراكز مجهزة بالفرش والوجبات والرعاية الصحية الأولية وتعمل على مدار "
     "الساعة طوال فترة الحالة الطارئة، وجميعها تعمل ضمن طاقتها الاستيعابية "
     "وتستقبل حالات جديدة.\n\n"
     "للاستفسار عن أقرب مركز يُرجى الاتصال بخط الطوارئ العام."),
    ("التحذير الجوي", "weather-service", "weather",
     "تحذير من هطول أمطار غزيرة إلى غزيرة جداً على المنطقة الساحلية والمنطقة "
     "الشمالية خلال الـ 24 ساعة القادمة.\n\n"
     "الكميات المتوقعة بين 40 و 90 ملم، مع احتمال جريان السيول في الأودية "
     "والمناطق المنخفضة.\n\n"
     "التوصيات: تجنب الأودية ومجاري السيول، وعدم عبور الطرق المغمورة بالمياه، "
     "والابتعاد عن الكابلات الكهربائية الساقطة."),
    ("حالة السدود ومستويات المياه", "emergency-center", "dams",
     "مستويات جميع السدود ضمن الحدود التشغيلية الآمنة وتخضع لمراقبة مستمرة على "
     "مدار الساعة.\n\n"
     "لم يصدر ولن يصدر أي قرار بفتح السدود دون إعلان رسمي مسبق عبر القنوات "
     "المعتمدة.\n\n"
     "لا صحة للادعاءات المتداولة عن فتح السدود أو خطر غمر المدينة."),
    ("حالة شبكة الكهرباء", "electricity-company", "electricity",
     "انقطاع مؤقت للتيار في أحياء الميناء والنخيل والواحة نتيجة إجراءات سلامة "
     "وقائية في محطات التحويل المتأثرة بتجمعات المياه.\n\n"
     "المدة المتوقعة للإصلاح تتراوح بين أربع وست ساعات. فرق الصيانة تعمل في "
     "الموقع.\n\n"
     "بقية الأحياء تعمل بشكل طبيعي. يُرجى عدم الاقتراب من أي كابل ساقط "
     "والإبلاغ عنه فوراً."),
    ("جاهزية المستشفيات", "ministry-health", "health",
     "جميع المستشفيات تعمل على مدار الساعة وأقسام الطوارئ مفتوحة وتستقبل "
     "الحالات.\n\n"
     "قد تشهد بعض الأقسام ضغطاً أعلى من المعتاد. للحالات غير الطارئة يُفضّل "
     "تأجيل المراجعة لتخفيف الضغط.\n\n"
     "مخزون الأدوية الأساسية متوفر، ولا يوجد نقص مسجّل."),
]


def seed(reset: bool = False) -> None:
    if reset:
        print("Dropping all tables…")
        Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    with session_scope() as db:
        if db.query(Crisis).count() > 0 and not reset:
            print("Database already contains data. Use --reset to rebuild.")
            return

        # --- Accounts. The first admin is created directly because creating a
        # user requires users.manage, which no actor holds before one exists.
        admin = _bootstrap_admin(db)
        admin_actor = Actor.from_user(admin)

        for name, email, role, password in DEMO_USERS[1:]:
            user_service.create_user(
                db, admin_actor, name=name, email=email, password=password,
                role=role, is_demo=True,
            )
        print(f"✓ {len(DEMO_USERS)} demo accounts")

        # --- Crisis
        crisis = crisis_service.create(
            db, admin_actor,
            code="DEMO-FLOOD-2026",
            type="Heavy rain and flooding",
            title="حالة طوارئ: أمطار غزيرة وسيول",
            severity="high",
            status="ongoing",
            description=(
                "أمطار غزيرة على المنطقة الساحلية والمنطقة الشمالية مع احتمال "
                "جريان السيول. الجهات الرسمية تتابع الوضع وتصدر التحديثات "
                "أولاً بأول."
            ),
            make_active=True,
            is_demo=True,
        )
        print("✓ crisis")

        # --- Sources
        sources: dict[str, OfficialSource] = {}
        for name, slug, trust, why in SOURCES:
            sources[slug] = directory_service.create_source(
                db, admin_actor, name=name, slug=slug, organization=name,
                url=f"https://example.gov.demo/{slug}", trust_level=trust,
                why_trusted=why, is_demo=True,
            )
        print(f"✓ {len(SOURCES)} official sources")

        # --- Services
        for organization, phone, service_type, hours, order in SERVICES:
            directory_service.create_service(
                db, admin_actor, organization=organization, phone=phone,
                service_type=service_type, hours=hours, sort_order=order,
                location="Coastal Region" if "Coastal" in organization else None,
                is_demo=True,
            )
        print(f"✓ {len(SERVICES)} assistance services")

        # --- Official updates (published, staggered over the last day)
        now = utcnow()
        for title, content, category, importance, slug, hours_ago in UPDATES:
            update = update_service.create(
                db, admin_actor, title=title, content=content, category=category,
                importance=importance, source_id=sources[slug].id,
                source_url=sources[slug].url, crisis_id=crisis.id, is_demo=True,
            )
            update_service.publish(db, admin_actor, update.id)
            update.published_at = now - timedelta(hours=hours_ago)
        db.commit()
        print(f"✓ {len(UPDATES)} published updates")

        # --- FAQs
        for question, answer, category in FAQS:
            faq_service.create(
                db, admin_actor, question=question, answer=answer,
                category=category, publish=True, is_demo=True,
            )
        print(f"✓ {len(FAQS)} FAQs")

        # --- Guidance
        for order, (phase, audience, kind, title, body) in enumerate(GUIDANCE):
            guidance_service.create(
                db, admin_actor, phase=phase, audience=audience, kind=kind,
                title=title, body=body, sort_order=order * 10, is_demo=True,
            )
        print(f"✓ {len(GUIDANCE)} guidance items")

        # --- Knowledge base (indexed for retrieval)
        for title, slug, topic, body in KNOWLEDGE:
            ingest_service.add_document(
                db, admin_actor, title=title, raw_text=body,
                source_id=sources[slug].id, doc_type="text", topic=topic,
                crisis_id=crisis.id, trust_level=sources[slug].trust_level,
                published_at=now - timedelta(hours=4), is_demo=True,
            )
        print(f"✓ {len(KNOWLEDGE)} knowledge sources indexed")

        # --- Rumors: reviewed and published…
        anon = Actor.anonymous()
        for claim, platform, status, correction, explanation in REVIEWED_RUMORS:
            rumor, _ = rumor_service.submit(
                db, anon, claim=claim, source_platform=platform,
                crisis_id=crisis.id,
            )
            rumor.is_demo = True
            rumor.report_count = 3 + (hash(claim) % 12)
            rumor.spread_score = min(1.0, rumor.report_count / 20.0)
            rumor.risk_score = 0.7 if status == "false" else 0.4
            db.commit()

            rumor_service.review(
                db, admin_actor, rumor.id, status=status, correction=correction,
                explanation=explanation, evidence_url=sources["emergency-center"].url,
            )
            rumor_service.publish(db, admin_actor, rumor.id)

        # …and unreviewed, which must stay invisible to citizens.
        for claim, platform in PENDING_RUMORS:
            rumor, _ = rumor_service.submit(
                db, anon, claim=claim, source_platform=platform, crisis_id=crisis.id
            )
            rumor.is_demo = True
            db.commit()
        print(
            f"✓ {len(REVIEWED_RUMORS)} published verifications, "
            f"{len(PENDING_RUMORS)} awaiting review (not public)"
        )

        # --- One awareness alert
        alert_service.create(
            db, admin_actor, type="important",
            message=(
                "تحديثات الحالة الجوية تصدر كل ساعتين. تابع صفحة التحديثات "
                "الرسمية للاطلاع على آخر المستجدات."
            ),
        )

        settings_store.set_emergency_mode(
            db, admin_actor, enabled=False, headline="", hide_nonessential=False
        )
        print("✓ alert and default settings")

    _print_credentials()


def _bootstrap_admin(db) -> User:
    """Create the first administrator.

    Chicken-and-egg: ``create_user`` requires ``users.manage``, which only an
    existing admin holds. The bootstrap is explicit here — and audited — rather
    than hidden behind a permission bypass in the service layer.
    """
    from app.security.passwords import hash_password
    from app.services import audit

    name, email, role, password = DEMO_USERS[0]
    admin = User(
        name=name, email=email, password_hash=hash_password(password),
        role=role, status="active", is_demo=True,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    audit.record(
        db, SYSTEM, audit.Action.USER_CREATE, object_type="user",
        object_id=admin.id,
        new_value={"email": admin.email, "role": admin.role, "bootstrap": True},
    )
    assert Permission.USERS_MANAGE  # documents why this bootstrap is needed
    return admin


def _print_credentials() -> None:
    print("\n" + "=" * 68)
    print("DEMONSTRATION DATA seeded. These credentials are for this local")
    print("instance only and must never be used in a real deployment.")
    print("=" * 68)
    for name, email, role, password in DEMO_USERS:
        print(f"  {role:18} {email:24} {password}")
    print("=" * 68)
    print("Dashboard: http://127.0.0.1:8000/dash/login\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed demonstration data.")
    parser.add_argument("--reset", action="store_true", help="drop and recreate all tables")
    args = parser.parse_args()
    try:
        seed(reset=args.reset)
    except Exception as exc:  # noqa: BLE001
        print(f"Seeding failed: {exc}", file=sys.stderr)
        raise
