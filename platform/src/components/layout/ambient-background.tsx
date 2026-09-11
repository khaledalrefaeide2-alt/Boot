/**
 * الخلفية الحيّة — ثلاث هالات لونية تنجرف ببطء خلف الواجهة كلها.
 *
 * مكوّن خادمي بلا حالة ولا مستمعين ولا JavaScript على الإطلاق: الحركة كلها
 * في CSS، فلا تُضاف بايت واحدة إلى حزمة العميل ولا يتأخر ظهورها إلى ما بعد
 * الترطيب. وأنماطها وقيودها موثّقة عند `.aurora-layer` في globals.css.
 *
 * المواضع بالمئة لا بالبكسل، فتتبع الهالات حجم الشاشة بدل أن تنزوي في ركن
 * على شاشة عريضة أو تطغى على الشاشة الضيّقة.
 */
export function AmbientBackground() {
  return (
    <div className="aurora-layer no-print" aria-hidden>
      <div className="aurora-blob aurora-a start-[-10%] top-[-15%] h-[55vmax] w-[55vmax] bg-primary" />
      <div className="aurora-blob aurora-b end-[-15%] top-[20%] h-[45vmax] w-[45vmax] bg-accent" />
      <div className="aurora-blob aurora-c bottom-[-20%] start-[25%] h-[50vmax] w-[50vmax] bg-primary" />
    </div>
  );
}
