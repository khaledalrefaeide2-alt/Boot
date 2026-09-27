-- البحث في الويب للمساعد الذكي.
INSERT INTO "settings" ("key", "value", "category", "label", "description", "updatedAt")
VALUES (
  'assistant.webSearch',
  'true'::jsonb,
  'assistant',
  'البحث في الويب',
  'يمنح المساعد أداة بحث مدمجة فيجلب ما لا يملكه: خبرٌ وقع اليوم، أو سياق حدث خارج المنصة، أو مرجع تُبنى عليه توصية. وأرقام هذه المنصة تبقى من قاعدتها وحدها ولا يُستشار فيها الويب أبداً. والبحث يُكلّف فوق كلفة الرسالة.',
  NOW()
) ON CONFLICT ("key") DO NOTHING;
