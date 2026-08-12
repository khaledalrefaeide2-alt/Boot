import { Link } from 'react-router-dom';
import { Compass, Gauge } from 'lucide-react';

export default function NotFoundPage() {
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-teal-50 text-teal-600">
        <Compass className="h-8 w-8" aria-hidden />
      </div>
      <h1 className="mt-5 text-2xl font-extrabold text-slate-900">الصفحة غير موجودة</h1>
      <p className="mt-2 text-sm leading-7 text-slate-500">
        الرابط الذي فتحته غير صحيح أو تم تغييره. يمكنك العودة إلى مقياس لغة السلام والبدء من هناك.
      </p>
      <Link to="/meter" className="btn-primary mt-6 inline-flex">
        <Gauge className="h-4 w-4" aria-hidden />
        الذهاب إلى مقياس السلام
      </Link>
    </div>
  );
}
