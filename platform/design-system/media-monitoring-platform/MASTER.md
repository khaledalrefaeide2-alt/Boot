# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** Media Monitoring Platform
**Generated:** 2026-09-06 20:40:05
**Category:** Smart Home/IoT Dashboard
**Design Dials:** Variance 6/10 (Balanced / Modern) | Motion 5/10 (Standard) | Density 8/10 (Dense / Dashboard)

---

## Global Rules

### Color Palette

| Role | Hex | CSS Variable |
|------|-----|--------------|
| Primary | `#1E293B` | `--color-primary` |
| On Primary | `#FFFFFF` | `--color-on-primary` |
| Secondary | `#334155` | `--color-secondary` |
| On Secondary | `#FFFFFF` | `--color-on-secondary` |
| Accent/CTA | `#22C55E` | `--color-accent` |
| On Accent/CTA | `#0F172A` | `--color-on-accent` |
| Background | `#0F172A` | `--color-background` |
| Foreground | `#F8FAFC` | `--color-foreground` |
| Card | `#1B2336` | `--color-card` |
| Card Foreground | `#F8FAFC` | `--color-card-foreground` |
| Muted | `#272F42` | `--color-muted` |
| Muted Foreground | `#94A3B8` | `--color-muted-foreground` |
| Border | `#475569` | `--color-border` |
| Destructive | `#EF4444` | `--color-destructive` |
| On Destructive | `#000000` | `--color-on-destructive` |
| Ring | `#FFFFFF` | `--color-ring` |

**Color Notes:** Dark tech + status green

### Typography

- **Heading Font:** Fira Code
- **Body Font:** Fira Sans
- **Mood:** dashboard, data, analytics, code, technical, precise
- **Google Fonts:** [Fira Code + Fira Sans](https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600;700&family=Fira+Sans:wght@300;400;500;600;700&display=swap)

**CSS Import:**
```css
@import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600;700&family=Fira+Sans:wght@300;400;500;600;700&display=swap');
```

### Spacing Variables

*Density: 8/10 — Dense / Dashboard*

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | `2px` / `0.125rem` | Tight gaps |
| `--space-sm` | `4px` / `0.25rem` | Icon gaps, inline spacing |
| `--space-md` | `8px` / `0.5rem` | Standard padding |
| `--space-lg` | `12px` / `0.75rem` | Section padding |
| `--space-xl` | `16px` / `1rem` | Large gaps |
| `--space-2xl` | `24px` / `1.5rem` | Section margins |
| `--space-3xl` | `32px` / `2rem` | Hero padding |

### Shadow Depths

| Level | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | Subtle lift |
| `--shadow-md` | `0 4px 6px rgba(0,0,0,0.1)` | Cards, buttons |
| `--shadow-lg` | `0 10px 15px rgba(0,0,0,0.1)` | Modals, dropdowns |
| `--shadow-xl` | `0 20px 25px rgba(0,0,0,0.15)` | Hero images, featured cards |

---

## Component Specs

### Buttons

```css
/* Primary Button */
.btn-primary {
  background: #22C55E;
  color: white;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}

.btn-primary:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

/* Secondary Button */
.btn-secondary {
  background: transparent;
  color: #1E293B;
  border: 2px solid #1E293B;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}
```

### Cards

```css
.card {
  background: #0F172A;
  border-radius: 12px;
  padding: 24px;
  box-shadow: var(--shadow-md);
  transition: all 200ms ease;
  cursor: pointer;
}

.card:hover {
  box-shadow: var(--shadow-lg);
  transform: translateY(-2px);
}
```

### Inputs

```css
.input {
  padding: 12px 16px;
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  font-size: 16px;
  transition: border-color 200ms ease;
}

.input:focus {
  border-color: #1E293B;
  outline: none;
  box-shadow: 0 0 0 3px #1E293B20;
}
```

### Modals

```css
.modal-overlay {
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

.modal {
  background: white;
  border-radius: 16px;
  padding: 32px;
  box-shadow: var(--shadow-xl);
  max-width: 500px;
  width: 90%;
}
```

---

## Style Guidelines

**Style:** Glassmorphism

**Keywords:** Frosted glass, transparent, blurred background, layered, vibrant background, light source, depth, multi-layer

**Best For:** Modern SaaS, financial dashboards, high-end corporate, lifestyle apps, modal overlays, navigation

**Key Effects:** Backdrop blur (10-20px), subtle border (1px solid rgba white 0.2), light reflection, Z-depth

### Page Pattern

**Pattern Name:** Real-Time / Operations Landing

- **Conversion Strategy:** Offer a demo or sandbox and show trust signals. Label telemetry as live only when backed by a current source, with update time and stale state. Provide pause/hide or update-frequency controls for tickers and previews, stop offscreen/hidden work, support keyboard controls, and render a static final snapshot under reduced motion.
- **CTA Placement:** Primary CTA in nav + After metrics
- **Section Order:** Hero (product + live preview or status) > Key metrics/indicators > How it works > CTA (Start trial / Contact)

---

## Motion

**Stagger List** (Standard) — Trigger: load or scroll | Duration: 300-450ms | Easing: `back.out(1.4)`

```js
gsap.from('.grid-item', { opacity: 0, scale: 0.92, y: 16, duration: 0.4, stagger: { each: 0.06, from: 'start', grid: 'auto' }, ease: 'back.out(1.4)' });
```

**Framework notes:** grid: 'auto' lets GSAP infer rows/columns from a CSS grid layout for a natural wave stagger; Use matchMedia('(prefers-reduced-motion: reduce)') to skip non-essential motion and render the final state immediately

- ✅ Combine with from: 'center' for a bento-grid layout to draw the eye inward first
- ❌ Don't use back.out on dense data tables; the overshoot reads as sloppy on informational UI
- ⚡ Group DOM writes; avoid interleaving layout reads (getBoundingClientRect) between staggered tweens

---

## Anti-Patterns (Do NOT Use)

- ❌ Slow updates
- ❌ No automation

### Additional Forbidden Patterns

- ❌ **Emojis as icons** — Use SVG icons (Heroicons, Lucide, Simple Icons)
- ❌ **Missing cursor:pointer** — All clickable elements must have cursor:pointer
- ❌ **Layout-shifting hovers** — Avoid scale transforms that shift layout
- ❌ **Low contrast text** — Maintain 4.5:1 minimum contrast ratio
- ❌ **Instant state changes** — Always use transitions (150-300ms)
- ❌ **Invisible focus states** — Focus states must be visible for a11y

---

## Pre-Delivery Checklist

Before delivering any UI code, verify:

- [ ] No emojis used as icons (use SVG instead)
- [ ] All icons from consistent icon set (Heroicons/Lucide)
- [ ] `cursor-pointer` on all clickable elements
- [ ] Hover states with smooth transitions (150-300ms)
- [ ] Light mode: text contrast 4.5:1 minimum
- [ ] Focus states visible for keyboard navigation
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive: 375px, 768px, 1024px, 1440px
- [ ] No content hidden behind fixed navbars
- [ ] No horizontal scroll on mobile

---

## ما نُفِّذ فعلياً في هذا المشروع

> كل ما فوق هذا الخط مخرجات المهارة كما ولّدتها. وما تحته سجلّ التنفيذ:
> أين طابقنا التوصية وأين خالفناها ولماذا. عند التعارض، هذا القسم هو
> الصحيح لأنه يصف الكود القائم — وجدول `Shadow Depths` أعلاه بقيمه العامة
> لم يُستعمل.

### مصفوفة الارتفاع (`src/app/globals.css`)

مستوى واحد لكل ارتفاع حقيقي، والقيم مشتقّة من لون الهوية `#0f1b2d` لا من
أسود عام. الصنف المستعمل في المكوّنات `shadow-elev-N`.

| المستوى | فاتح | داكن | أين يُستعمل |
|---|---|---|---|
| `--elev-0` | `none` | `none` | مسطّح داخل حاوية (شريط فلاتر مدمج) |
| `--elev-1` | `0 1px 2px #0f1b2d0f` | `0 1px 2px #0006` | بطاقة، زر، لوحة رسم، شريط فلاتر مستقل |
| `--elev-2` | `0 1px 3px #0f1b2d14, 0 4px 12px #0f1b2d0d` | `0 1px 3px #00000073, 0 4px 14px #00000059` | بطاقات شاشة الدخول الزجاجية |
| `--elev-3` | `0 8px 28px #0f1b2d1f` | `0 10px 34px #0000008c` | قائمة منسدلة، إشعار، تلميح رسم |
| `--elev-4` | `0 24px 56px #0f1b2d33` | `0 24px 60px #0000009e` | نافذة، درج الجوال، معرض الصور |

قاعدتان لازمتان:

1. **قيم الداكن مُعادة الاشتقاق لا معكوسة.** ظلّ بشفافية 10% فوق أرضية
   `#0a1120` لا يُرى أصلاً، فالفصل بين السطوح في الوضع الداكن كان معدوماً
   عملياً قبل هذا التوحيد.
2. **مفتاح السمة هو صنف `.dark`** لأن `next-themes` هنا مضبوط على
   `attribute="class"`. الربط بـ `data-theme` أو `prefers-color-scheme`
   يجعل عتمة الظل تتبع نظام التشغيل لا اختيار المستخدم في الموقع.

### شبكة الأمان

سلّم ظلال Tailwind كله (`--shadow-2xs … --shadow-2xl`) مربوط بالمصفوفة في
`@theme`، ومستويات الارتفاع مضافة إلى مجموعة `shadow` في `tailwind-merge`
داخل `cn`. الأثر: من يكتب `shadow-lg` لاحقاً دون علمٍ بالمصفوفة يقع على
مستوى منها، ومن يمرّر ظلاً مخالفاً لمكوّن يحسم التعارض لصالح ما مرّره لا
لصالح ترتيب القواعد في الملف.

### مخالفتان مقصودتان لمخرجات المهارة

| التوصية | ما نُفِّذ | السبب |
|---|---|---|
| Fira Code / Fira Sans عبر Google Fonts | دور الخط الأحادي بمكدّس محلي، و Cairo مستضاف ذاتياً | المنصة قد تعمل على شبكة معزولة: طلب خط خارجي يُفقد الهوية عند الانقطاع ويُسرّب طلباً من جهاز كل موظف |
| شفافية الزجاج 15% | 72% | المواصفة تفترض خلفية زاهية خلف الزجاج؛ عند 15% نزل تباين النص تحت 4.5:1 وهو شرط المهارة نفسها |
| WebGL (Three.js / R3F / Spline) | لا محرّك رسوميات إطلاقاً | المهارة نفسها رشّحت Glassmorphism بوسم `drivers:none`، والعمق يتحقق بـ CSS خالص |

### نطاق التطبيق

العمق (زجاج + ميل) على **شاشة الدخول وحدها**. مصفوفة الارتفاع وحدها هي
التي عمّت بقية الشاشات. شاشات التشغيل كثافتها وظيفتها، والزجاج والميل فيها
يزاحمان الجداول والأرقام.


---

## إعادة التصميم الشاملة — سجلّ التنفيذ

> الاستعلام: `"government media monitoring analytics dashboard" --design-system
> --variance 4 --motion 3 --density 8`. ما يلي هو ما طُبِّق فعلاً، ومصدر كل
> قرار: رقم من المهارة، أو قياس أُجري على الكود.

### اللوحة اللونية

المصدر: نتيجتان من `--domain color` — «Analytics Dashboard» للفاتح
و«Financial Dashboard» للداكن. لم تُنقل القيم كما هي: كل لون نصّي حُسب
تباينه قبل كتابته، وما رسب رُفع حتى يعبر.

| الرمز | فاتح | داكن | ملاحظة |
|---|---|---|---|
| `--background` | `#f8fafc` | `#020617` | من المهارة حرفياً |
| `--surface` | `#ffffff` | `#0e1223` | |
| `--foreground` | `#0f172a` | `#e8eef7` | انظر المخالفات |
| `--heading` | `#1e3a8a` | `#bfd6f5` | رمز جديد |
| `--primary` | `#1e40af` | `#7cb2f7` | من المهارة |
| `--accent` | `#b45309` | `#e79b3d` | رُفع من `#D97706` (3.19:1) |
| `--success` | `#166534` | `#4ade80` | رُفع من `#15803d` (4.46 على الناعم) |
| `--warning` | `#854d0e` | `#fbbf24` | رُفع من `#a16207` (4.47) |
| `--danger` | `#b91c1c` | `#f87171` | رُفع من `#dc2626` (4.23) |

### السلّم الطباعي

المهارة رشّحت Fira Code / Fira Sans عبر Google Fonts — مرفوض للسبب نفسه
(شبكة معزولة). لكن توصيتها البنيوية طُبِّقت: «سلّم معياري ثابت» و«لا نص
تحت 12px». وكانت الواجهة تحمل **146 موضعاً بمقاس 12px** وعشرة مواضع
بمقاسات حرّة تنزل إلى **10px**.

السلّم الجديد مضبوط للعربية: كل درجة أكبر ببكسل أو اثنين من نظيرتها
اللاتينية، لأن الحرف العربي يحمل نقاطاً واتصالاً وتشكيلاً لا يحملها
اللاتيني في المقاس نفسه. أصغر مقاس 12px بلا استثناء.

### الجداول

| التغيير | السبب |
|---|---|
| تخطيط الصفوف بلونين | جدول الحسابات 11 عموداً وجدول المقارنة 12؛ الفاصل الأفقي وحده لا يمسك السطر عبر عرض الشاشة |
| حدّ الترويسة مضاعف | خط واحد تعرف منه العين أين ينتهي اسم العمود |
| لون التحويم من الأساسي لا من الرمادي | لولاه لأشبه الصفُّ المحوَّم صفاً مخطّطاً عادياً |

**لم يُنفَّذ: ترويسة لاصقة.** حاوية التمرير الأفقي تصير حاوية تمرير في
المحورين، فتفقد `sticky` مرجعها من الصفحة. تنفيذها يتطلّب ارتفاعاً أقصى
للجدول وتمريراً رأسياً داخله — وهو تغيير في سلوك التصفّح لا في مظهره،
والجداول هنا مقسّمة إلى صفحات أصلاً فالفائدة محدودة.

### الرسوم

اللوحة القديمة كانت تسقط في فحصين:

1. ثلاث سلاسل تحت 3:1 على الأبيض (أدناها **2.17**) — أي خطوط لا تكاد تُرى.
2. سلسلتان تتطابقان عملياً عند عمى الأخضر (**ΔE = 2.0**).

اللوحة الجديدة مُشتقّة ببحث آلي على قيدين: تباين ≥3.5:1 مع أرضية البطاقة،
وΔE ≥20 بين كل زوج في الرؤية الطبيعية وبعد محاكاة عمى الأخضر وعمى الأحمر.

| | أدنى تباين | ΔE طبيعي | ΔE عمى أخضر | ΔE عمى أحمر |
|---|---|---|---|---|
| فاتح | 4.23 | 24.8 | 24.3 | 20.4 |
| داكن | 4.04 | 46.0 | 32.3 | 37.7 |

ومع ذلك: **ستّ سلاسل لا تُميَّز باللون وحده**، ولا لوحة تحقق ذلك. فطُبِّقت
توصية المهارة نفسها في `--domain chart`: «استعمل خطوطاً متصلة ومتقطّعة
ومنقّطة مع تسميات مباشرة؛ لا تميّز السلاسل بالتدرّج اللوني وحده». كل سلسلة
تحمل نمط خط خاصاً، والدليل يعرض الخط بنمطه لا مربّعاً ملوّناً.

### مخالفات موثّقة

| التوصية | ما نُفِّذ | السبب |
|---|---|---|
| `Foreground: #1E3A8A` (أزرق للنص كله) | أزرق للعناوين، وأردوازي `#0f172a` للنص | نص عربي كثيف مصبوغ بالأزرق أقلّ وضوحاً في الجداول؛ التسلسل يبقى بالأزرق حيث ينفع |
| نص داكن `#F8FAFC` ناصع | `#e8eef7` | الناصع على شبه الأسود يُحدث هالة حول الحرف العربي بنقاطه |
| `Accent: #D97706` | `#b45309` | 3.19:1 — دون الحدّ الذي تشترطه المهارة نفسها |
| `Border: #DBEAFE` | `#d7e2f0` / `#b9c9de` | 1.22:1 لا يفصل صفاً عن صف |
| الأخضر `#22C55E` لوناً مميّزاً في الداكن | الكهرماني في السمتين | الأخضر محجوز لمشاعر المنشور؛ استعماله للتمييز يخلط دلالتين |
| حركة كشف عند التمرير (300-400ms) | لا شيء | تأخير ظهور البيانات في شاشة تشغيل عيب لا ميزة |
| نمط «Real-Time / Operations Landing» | القسم التسويقي منه متروك | المنصة ليست صفحة هبوط؛ أُخذ منها ترتيب المؤشرات فقط |

### القياس

- **421 تركيبة نص/خلفية** مقيسة في المتصفح على 13 شاشة × سمتين، على
  الخلفيات المركّبة فعلياً لا المفترضة. أضيقها 4.78 في الفاتح و5.09 في
  الداكن — كلها فوق 4.5:1.
- لا تمرير أفقي على 390px في ثلاث شاشات.
- الطباعة تقلب السمة الداكنة إلى أبيض وأسود.
- حصر بيانات المستخدمين: 15/15 بعد التغيير.
