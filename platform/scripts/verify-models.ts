/**
 * فحص التوافق مع نموذج الاستدلال — بلا مفتاح وبلا شبكة.
 *
 * النموذج الجديد (gpt-6.1-sol) يرفض ما كان يُرسَل للقديم: الحرارة،
 * و`max_tokens`، والأدوات في Chat Completions. والرفض لا يظهر إلا على
 * الخادم الحيّ، على أوّل منشور، بعد النشر — فيُفحص هنا قبله.
 *
 * والطريقة: خادمٌ محلّي يتقمّص OpenAI ويطبّق قواعد الرفض نفسها، والمكتبة
 * تُوجَّه إليه بـ`OPENAI_BASE_URL`. ثمّ تُستدعى مسارات المنصّة الحقيقية —
 * التصنيف من النصّ ومن الصورة، والتقاط التوجيهات، والمساعد بأنماطه،
 * واختبار الاتصال — ويُقرأ ما وصل إلى الخادم فعلاً، لا ما يُظنّ أنّه أُرسل.
 *
 * ويجري كلّ ذلك مرّتين: بالنموذج الجديد، ثمّ بالقديم — والقديم يجب أن
 * يتلقّى ما كان يتلقّاه حرفاً بحرف.
 *
 *   npm run verify:models
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import OpenAI from 'openai';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

const checks: { name: string; ok: boolean; detail?: string }[] = [];
function check(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
}

// ══════════════ خادمٌ يتقمّص OpenAI ══════════════

interface Recorded {
  path: string;
  body: Record<string, unknown>;
}
const recorded: Recorded[] = [];

const SOL_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];

/** هل يعامله الخادم المزيّف نموذجَ استدلال؟ — مكتوبٌ هنا مستقلاً عن الشيفرة المفحوصة */
const mockIsReasoning = (model: string) => model.startsWith('gpt-6');

function reject(res: ServerResponse, status: number, param: string | null, message: string) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: { message, type: 'invalid_request_error', param, code: 'unsupported' } }));
}

/** قواعد الرفض — ما يرفضه نموذج الاستدلال، وما يرفضه القديم */
function validate(path: string, body: Record<string, unknown>, res: ServerResponse): boolean {
  const model = String(body.model ?? '');
  if (model === 'missing-model') {
    reject(res, 404, null, 'The model does not exist');
    return false;
  }
  if (model === 'gpt-6.1-sol-reject') {
    reject(res, 400, 'reasoning_effort', 'Unsupported value');
    return false;
  }
  if (model === 'gpt-6.1-sol-weird') {
    reject(res, 400, '<img src=x onerror=alert(1)>', 'Unsupported value');
    return false;
  }

  if (mockIsReasoning(model)) {
    for (const key of ['temperature', 'top_p', 'logprobs', 'max_tokens']) {
      if (key in body) {
        reject(res, 400, key, `Unsupported parameter: '${key}' is not supported with this model.`);
        return false;
      }
    }
    if (path.endsWith('/chat/completions')) {
      if ('tools' in body) {
        reject(res, 400, 'tools', 'Function tools are only supported in the Responses API for this model.');
        return false;
      }
      if (!SOL_EFFORTS.includes(String(body.reasoning_effort))) {
        reject(res, 400, 'reasoning_effort', 'Unsupported value');
        return false;
      }
    } else {
      const effort = (body.reasoning as { effort?: string } | undefined)?.effort;
      if (!SOL_EFFORTS.includes(String(effort))) {
        reject(res, 400, 'reasoning.effort', 'Unsupported value');
        return false;
      }
    }
  } else {
    if ('reasoning_effort' in body || 'reasoning' in body) {
      reject(res, 400, 'reasoning_effort', 'Unrecognized request argument');
      return false;
    }
  }
  return true;
}

/** نتيجة تصنيفٍ صالحة للمخطّط الصارم */
const ANALYSIS = {
  sentiment: 'NEGATIVE',
  target: 'البلدية',
  subject: 'انقطاع المياه',
  rationale: 'شكوى صريحة من انقطاع الخدمة',
  evidence: null,
  isMixed: false,
  isRelayedCriticism: false,
  reviewReason: null,
  confidence: 0.9,
  themes: ['الخدمات'],
  entities: [],
  riskFlags: [],
  riskSeverity: 'NONE',
  authorStance: 'OPPOSED',
  labels: [],
  severityLevel: 1,
  rumorStatus: 'NONE',
  rumorConfidence: null,
  hateTargetGroup: null,
  isSarcasm: false,
  isQuoted: false,
  isConstructive: true,
  isDestructive: false,
  coordinatedSuspected: false,
};

function sse(res: ServerResponse, events: { event?: string; data: unknown }[]) {
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  for (const item of events) {
    if (item.event) res.write(`event: ${item.event}\n`);
    res.write(`data: ${typeof item.data === 'string' ? item.data : JSON.stringify(item.data)}\n\n`);
  }
  res.end();
}

function chatContent(body: Record<string, unknown>): string {
  const format = body.response_format as { json_schema?: { name?: string } } | undefined;
  if (format?.json_schema?.name === 'post_analysis') return JSON.stringify(ANALYSIS);
  if (format?.json_schema?.name === 'captured_guidance') {
    return JSON.stringify({
      instructions: [{ scope: 'STANCE', instruction: 'اعتبر الشكوى من انقطاع المياه موقفاً معارضاً' }],
    });
  }
  return 'جاهز';
}

function handleChat(body: Record<string, unknown>, res: ServerResponse) {
  const model = String(body.model);
  const content = chatContent(body);
  if (body.stream) {
    const chunk = (delta: Record<string, unknown>, finish: string | null) => ({
      id: 'chatcmpl-1',
      object: 'chat.completion.chunk',
      created: 0,
      model,
      choices: [{ index: 0, delta, finish_reason: finish }],
    });
    sse(res, [
      { data: chunk({ role: 'assistant', content: 'جا' }, null) },
      { data: chunk({ content: 'هز' }, null) },
      { data: chunk({}, 'stop') },
      { data: '[DONE]' },
    ]);
    return;
  }
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(
    JSON.stringify({
      id: 'chatcmpl-1',
      object: 'chat.completion',
      created: 0,
      model,
      choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }),
  );
}

function responseObject(model: string, output: unknown[]) {
  return {
    id: 'resp_1',
    object: 'response',
    created_at: 0,
    status: 'completed',
    model,
    output,
    usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
  };
}

const textMessage = (text: string) => ({
  type: 'message',
  id: 'msg_1',
  role: 'assistant',
  status: 'completed',
  content: [{ type: 'output_text', text, annotations: [] }],
});

function handleResponses(body: Record<string, unknown>, res: ServerResponse) {
  const model = String(body.model);
  const input = Array.isArray(body.input) ? (body.input as { type?: string }[]) : [];
  const tools = Array.isArray(body.tools) ? (body.tools as { type?: string }[]) : [];
  const answered = input.some((item) => item.type === 'function_call_output');
  const wantsTool = tools.some((tool) => tool.type === 'function') && !answered;

  if (!body.stream) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(responseObject(model, [textMessage('جاهز')])));
    return;
  }

  if (wantsTool) {
    // الدورة الأولى: تفكيرٌ ثمّ نداء أداة — والتفكير يجب أن يُعاد في الدورة التالية
    const output = [
      { type: 'reasoning', id: 'rs_1', summary: [] },
      { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'get_stats', arguments: '{}', status: 'completed' },
    ];
    sse(res, [
      { event: 'response.completed', data: { type: 'response.completed', response: responseObject(model, output) } },
    ]);
    return;
  }

  sse(res, [
    { event: 'response.web_search_call.in_progress', data: { type: 'response.web_search_call.in_progress', item_id: 'ws_1', output_index: 0 } },
    { event: 'response.output_text.delta', data: { type: 'response.output_text.delta', item_id: 'msg_1', output_index: 0, content_index: 0, delta: 'جا' } },
    { event: 'response.output_text.delta', data: { type: 'response.output_text.delta', item_id: 'msg_1', output_index: 0, content_index: 0, delta: 'هز' } },
    { event: 'response.completed', data: { type: 'response.completed', response: responseObject(model, [textMessage('جاهز')]) } },
  ]);
}

function handleEmbeddings(body: Record<string, unknown>, res: ServerResponse) {
  const inputs = Array.isArray(body.input) ? body.input : [body.input];
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(
    JSON.stringify({
      object: 'list',
      model: body.model,
      data: inputs.map((_, index) => ({ object: 'embedding', index, embedding: [0.6, 0.8, 0] })),
      usage: { prompt_tokens: 1, total_tokens: 1 },
    }),
  );
}

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  const parts: Buffer[] = [];
  req.on('data', (part: Buffer) => parts.push(part));
  req.on('end', () => {
    const path = (req.url ?? '').split('?')[0] ?? '';
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(Buffer.concat(parts).toString('utf8') || '{}') as Record<string, unknown>;
    } catch {
      body = {};
    }
    recorded.push({ path, body });

    if (path.endsWith('/embeddings')) return handleEmbeddings(body, res);
    if (!validate(path, body, res)) return;
    if (path.endsWith('/chat/completions')) return handleChat(body, res);
    if (path.endsWith('/responses')) return handleResponses(body, res);
    res.writeHead(404).end();
  });
});

// ══════════════ التشغيل ══════════════

async function main() {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  /*
   * البيئة تُضبط قبل أيّ استيراد للوحدات المفحوصة.
   *
   * العميل يقرأ عنوان الخادم عند إنشائه، ووحدة القاعدة تتحقّق من متغيّراتها
   * عند استيرادها. وعنوان القاعدة هنا وهميّ لا يُتّصل به: لا مسار مفحوص
   * يلمس القاعدة.
   */
  process.env.OPENAI_BASE_URL = `http://127.0.0.1:${port}/v1`;
  process.env.OPENAI_API_KEY = 'sk-verify-not-a-real-key';
  process.env.DATABASE_URL ??= 'postgresql://verify:verify@127.0.0.1:1/verify';
  process.env.SESSION_SECRET ??= randomBytes(32).toString('hex');
  process.env.NO_PROXY = [process.env.NO_PROXY, '127.0.0.1'].filter(Boolean).join(',');
  process.env.no_proxy = process.env.NO_PROXY;
  delete process.env.OPENAI_CHAT_MODEL;
  delete process.env.OPENAI_ANALYSIS_EFFORT;
  delete process.env.OPENAI_ASSISTANT_EFFORT;

  const params = await import('../src/lib/assistant/model-params');
  const { getAssistantConfig, AssistantConfigError, DEFAULT_CHAT_MODEL } = await import(
    '../src/lib/assistant/config'
  );
  const assistant = await import('../src/lib/assistant/openai');
  const { analyzePostText, analyzePostImage } = await import('../src/lib/analysis/ai-analyzer');
  const { extractGuidance } = await import('../src/lib/analysis/capture');

  // ══════════════ تعرّف نموذج الاستدلال ══════════════

  const reasoning: [string, boolean][] = [
    ['gpt-6.1-sol', true],
    ['  GPT-6.1-Sol ', true],
    ['gpt-6-luna', true],
    ['gpt-5', true],
    ['gpt-5-mini', true],
    ['gpt-5.2', true],
    ['o3', true],
    ['o4-mini', true],
    ['ft:gpt-6.1-sol:org:custom:1', true],
    ['gpt-4o-mini', false],
    ['gpt-4o', false],
    ['gpt-4.1-mini', false],
    ['gpt-5-chat-latest', false],
    ['chatgpt-4o-latest', false],
    ['ft:gpt-4o-mini:org:custom:1', false],
  ];
  for (const [model, expected] of reasoning) {
    check(`«${model.trim()}» ${expected ? 'نموذج استدلال' : 'نموذج محادثة'}`, params.isReasoningModel(model) === expected);
  }

  // ══════════════ بناء المعاملات ══════════════

  const solChat = params.chatCompletionParams({ model: 'gpt-6.1-sol', effort: 'high', temperature: 0, maxOutputTokens: 1400 });
  check('Sol/Chat: لا حرارة', !('temperature' in solChat));
  check('Sol/Chat: لا max_tokens', !('max_tokens' in solChat));
  check('Sol/Chat: عمق التفكير يُرسَل', solChat.reasoning_effort === 'high');
  check(
    'Sol/Chat: السقف يتّسع للتفكير فوق النصّ',
    (solChat.max_completion_tokens ?? 0) > 1400 + 10_000,
    String(solChat.max_completion_tokens),
  );
  const solChatNoCap = params.chatCompletionParams({ model: 'gpt-6.1-sol', effort: 'low', temperature: 0 });
  check('Sol/Chat بلا سقف مطلوب: سقفٌ للهروب مع ذلك', (solChatNoCap.max_completion_tokens ?? 0) >= 4_000);

  const oldChat = params.chatCompletionParams({ model: 'gpt-4o-mini', effort: 'max', temperature: 0.2, maxOutputTokens: 1400 });
  check('القديم/Chat: الحرارة والسقف كما كانا', oldChat.temperature === 0.2 && oldChat.max_tokens === 1400);
  check('القديم/Chat: لا عمق ولا سقفَ استدلال', !('reasoning_effort' in oldChat) && !('max_completion_tokens' in oldChat));
  const oldChatNoCap = params.chatCompletionParams({ model: 'gpt-4o-mini', effort: 'low', temperature: 0 });
  check('القديم/Chat: لا سقف حيث لم يكن سقف', !('max_tokens' in oldChatNoCap) && oldChatNoCap.temperature === 0);

  const solResp = params.responsesParams({ model: 'gpt-6.1-sol', effort: 'medium', temperature: 0.2, maxOutputTokens: 1800 });
  check('Sol/Responses: لا حرارة، والعمق في reasoning', !('temperature' in solResp) && solResp.reasoning?.effort === 'medium');
  check('Sol/Responses: السقف يتّسع للتفكير', (solResp.max_output_tokens ?? 0) > 1800 + 10_000);
  const oldResp = params.responsesParams({ model: 'gpt-4o-mini', effort: 'medium', temperature: 0.2, maxOutputTokens: 1800 });
  check('القديم/Responses كما كان', oldResp.temperature === 0.2 && oldResp.max_output_tokens === 1800 && !('reasoning' in oldResp));

  check('المهلة: القديم يبقى على مهلته', params.requestTimeoutMs('gpt-4o-mini', 'max', 40_000) === 40_000);
  check('المهلة: الاستدلال يطول بالعمق', params.requestTimeoutMs('gpt-6.1-sol', 'medium', 40_000) > 40_000);
  check(
    'المهلة: لا تتجاوز خمس دقائق (مهلة صمت الجولة عشرون)',
    params.REASONING_EFFORTS.every((effort) => params.requestTimeoutMs('gpt-6.1-sol', effort, 40_000) <= 300_000),
  );
  check(
    'المهلة تتصاعد مع العمق ولا تتناقص',
    params.REASONING_EFFORTS.every(
      (effort, index, all) =>
        index === 0 ||
        params.requestTimeoutMs('gpt-6.1-sol', effort, 0) >=
          params.requestTimeoutMs('gpt-6.1-sol', all[index - 1]!, 0),
    ),
  );
  check('none وminimal غير مقبولين (Sol يرفضهما)', !(params.REASONING_EFFORTS as readonly string[]).includes('none') && !(params.REASONING_EFFORTS as readonly string[]).includes('minimal'));

  // ══════════════ الإعداد ══════════════

  const defaults = getAssistantConfig();
  check('النموذج الافتراضي gpt-6.1-sol', defaults.chatModel === 'gpt-6.1-sol' && DEFAULT_CHAT_MODEL === 'gpt-6.1-sol');
  check('عمق التصنيف الافتراضي medium', defaults.analysisEffort === 'medium');
  check('عمق المساعد الافتراضي low', defaults.assistantEffort === 'low');
  check('نموذج المتّجهات لم يتغيّر', defaults.embedModel === 'text-embedding-3-small');

  process.env.OPENAI_ANALYSIS_EFFORT = '  HIGH ';
  check('العمق يُقبل بأيّ حالة أحرف ومسافات', getAssistantConfig().analysisEffort === 'high');
  process.env.OPENAI_ANALYSIS_EFFORT = '';
  check('العمق الفارغ يعني الافتراضي', getAssistantConfig().analysisEffort === 'medium');
  process.env.OPENAI_ANALYSIS_EFFORT = 'meduim';
  let effortError: unknown = null;
  try {
    getAssistantConfig();
  } catch (error) {
    effortError = error;
  }
  check(
    'العمق المكتوب خطأً يُوقف بخطأٍ يسمّي المتغيّر',
    effortError instanceof AssistantConfigError &&
      effortError.message.includes('OPENAI_ANALYSIS_EFFORT') &&
      effortError.message.includes('medium'),
    effortError instanceof Error ? effortError.message : String(effortError),
  );
  process.env.OPENAI_ANALYSIS_EFFORT = 'minimal';
  check('minimal مرفوض في الإعداد قبل أن يرفضه المزوّد', (() => {
    try {
      getAssistantConfig();
      return false;
    } catch (error) {
      return error instanceof AssistantConfigError;
    }
  })());
  delete process.env.OPENAI_ANALYSIS_EFFORT;

  // ══════════════ ضابطٌ سلبيّ: الخادم المزيّف صارمٌ فعلاً ══════════════

  /*
   * لو قبل الخادم كلّ شيء لنجح كلّ ما بعده بلا معنى. فيُرسَل إليه الطلب
   * بالشكل القديم — حرارةٌ و`max_tokens` إلى Sol — ويجب أن يُرفض.
   */
  const raw = new OpenAI({ apiKey: 'sk-verify', baseURL: process.env.OPENAI_BASE_URL, maxRetries: 0 });
  const legacyShape = await raw.chat.completions
    .create({ model: 'gpt-6.1-sol', messages: [{ role: 'user', content: 'x' }], temperature: 0, max_tokens: 1400 })
    .then(() => 'accepted')
    .catch((error: unknown) => (error instanceof OpenAI.APIError ? `${error.status}:${String(error.param)}` : 'other'));
  check('ضابط: الشكل القديم إلى Sol يُرفض بـ400', legacyShape === '400:temperature', legacyShape);
  const toolsInChat = await raw.chat.completions
    .create({
      model: 'gpt-6.1-sol',
      messages: [{ role: 'user', content: 'x' }],
      reasoning_effort: 'low',
      tools: [{ type: 'function', function: { name: 'f', parameters: { type: 'object', properties: {} } } }],
    })
    .then(() => 'accepted')
    .catch((error: unknown) => (error instanceof OpenAI.APIError ? `${error.status}:${String(error.param)}` : 'other'));
  check('ضابط: الأدوات في Chat Completions إلى Sol تُرفض', toolsInChat === '400:tools', toolsInChat);

  // ══════════════ المسارات الحقيقية — مرّتين ══════════════

  const messages = [
    { role: 'system' as const, content: 'أنت مساعد.' },
    { role: 'user' as const, content: 'ما الجديد؟' },
  ];
  const image = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

  async function exercise(label: string) {
    const failures: string[] = [];
    const attempt = async (name: string, run: () => Promise<unknown>) => {
      try {
        await run();
      } catch (error) {
        failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    };
    const drain = async (iterable: AsyncIterable<unknown>) => {
      const out: unknown[] = [];
      for await (const item of iterable) out.push(item);
      return out;
    };

    recorded.length = 0;
    let agentEvents: unknown[] = [];
    await attempt('analyzePostText', () => analyzePostText('انقطعت المياه عن الحيّ منذ ثلاثة أيام ولا أحد يجيب'));
    await attempt('analyzePostImage', () => analyzePostImage(image, ''));
    await attempt('extractGuidance', () => extractGuidance('اعتبر دائماً الشكوى من انقطاع المياه موقفاً معارضاً'));
    await attempt('generateAssistantResponse', () => assistant.generateAssistantResponse(messages));
    await attempt('generateAssistantResponse(low)', () => assistant.generateAssistantResponse(messages, { effort: 'low' }));
    await attempt('streamAssistantResponse', () => drain(assistant.streamAssistantResponse(messages)));
    await attempt('generateWithWebSearch', () => assistant.generateWithWebSearch(messages));
    await attempt('streamWithWebSearch', () => drain(assistant.streamWithWebSearch(messages)));
    await attempt('runAssistantAgent', async () => {
      agentEvents = await drain(
        assistant.runAssistantAgent(messages, {
          webSearch: false,
          tools: [{ type: 'function', name: 'get_stats', parameters: { type: 'object', properties: {} } }],
          runTool: async () => ({ total: 3 }),
        }),
      );
    });
    await attempt('pingOpenAI', () => assistant.pingOpenAI());

    check(`${label}: كلّ المسارات قُبلت عند المزوّد`, failures.length === 0, failures.join(' | '));
    check(
      `${label}: الوكيل نفّذ الأداة ثمّ أجاب`,
      agentEvents.some((event) => (event as { kind?: string }).kind === 'delta'),
    );
    return [...recorded];
  }

  // — النموذج الجديد، بعمقٍ مختلف لكلّ مهمّة ليُعرف مصدر كلّ قيمة —
  process.env.OPENAI_CHAT_MODEL = 'gpt-6.1-sol';
  process.env.OPENAI_ANALYSIS_EFFORT = 'high';
  process.env.OPENAI_ASSISTANT_EFFORT = 'medium';
  const sol = await exercise('Sol');

  const solChats = sol.filter((r) => r.path.endsWith('/chat/completions'));
  const solResponses = sol.filter((r) => r.path.endsWith('/responses'));
  const analysisCalls = solChats.filter(
    (r) => (r.body.response_format as { json_schema?: { name?: string } } | undefined)?.json_schema?.name === 'post_analysis',
  );
  const captureCalls = solChats.filter(
    (r) => (r.body.response_format as { json_schema?: { name?: string } } | undefined)?.json_schema?.name === 'captured_guidance',
  );

  check('Sol: لا حرارة في أيّ طلب', sol.every((r) => !('temperature' in r.body)));
  check('Sol: لا max_tokens في أيّ طلب', sol.every((r) => !('max_tokens' in r.body)));
  check('Sol: التصنيف (نصّ وصورة) طلبان', analysisCalls.length === 2, String(analysisCalls.length));
  check('Sol: التصنيف بعمق OPENAI_ANALYSIS_EFFORT', analysisCalls.every((r) => r.body.reasoning_effort === 'high'));
  check('Sol: التصنيف بسقفٍ يتّسع للتفكير', analysisCalls.every((r) => Number(r.body.max_completion_tokens) > 20_000));
  check('Sol: التصنيف بمفتاح ذاكرةٍ مشترك', analysisCalls.every((r) => r.body.prompt_cache_key === 'post-analysis'));
  check(
    'Sol: التصنيف بمخطّطٍ صارم كما كان',
    analysisCalls.every((r) => (r.body.response_format as { json_schema?: { strict?: boolean } }).json_schema?.strict === true),
  );
  check('Sol: التقاط التوجيهات بأدنى عمق', captureCalls.length === 1 && captureCalls[0]!.body.reasoning_effort === 'low');
  const plainChats = solChats.filter((r) => !r.body.response_format);
  check(
    'Sol: المساعد بعمق OPENAI_ASSISTANT_EFFORT، والتوسيع بأدنى عمق',
    plainChats.some((r) => r.body.reasoning_effort === 'medium') && plainChats.some((r) => r.body.reasoning_effort === 'low'),
    plainChats.map((r) => String(r.body.reasoning_effort)).join(','),
  );
  check('Sol: لا أدوات في Chat Completions', solChats.every((r) => !('tools' in r.body)));
  check(
    'Sol: Responses بعمقٍ في reasoning وسقفٍ متّسع',
    solResponses.length > 0 &&
      solResponses.every(
        (r) => typeof (r.body.reasoning as { effort?: string } | undefined)?.effort === 'string' && Number(r.body.max_output_tokens) > 1_000,
      ),
  );
  const secondRound = solResponses.find(
    (r) => Array.isArray(r.body.input) && (r.body.input as { type?: string }[]).some((i) => i.type === 'function_call_output'),
  );
  check(
    'Sol: الوكيل يُعيد عنصر التفكير مع نتيجة الأداة',
    Boolean(secondRound) && (secondRound!.body.input as { type?: string }[]).some((i) => i.type === 'reasoning'),
  );
  const pingChat = solChats.find((r) => (r.body.messages as { content?: string }[] | undefined)?.[0]?.content === 'رد بكلمة: جاهز');
  check('Sol: اختبار الاتصال بعمق التصنيف', pingChat?.body.reasoning_effort === 'high');
  const pingResponses = solResponses.find((r) => r.body.input === 'رد بكلمة: جاهز');
  check(
    'Sol: اختبار الاتصال يختبر Responses بعمق المساعد',
    (pingResponses?.body.reasoning as { effort?: string } | undefined)?.effort === 'medium',
  );

  // — النموذج القديم: ما كان يُرسَل حرفاً بحرف —
  process.env.OPENAI_CHAT_MODEL = 'gpt-4o-mini';
  const old = await exercise('القديم');
  const oldChats = old.filter((r) => r.path.endsWith('/chat/completions'));
  const oldResponses = old.filter((r) => r.path.endsWith('/responses'));
  const oldAnalysis = oldChats.filter((r) => r.body.prompt_cache_key === 'post-analysis');

  check('القديم: لا عمق تفكير في أيّ طلب', old.every((r) => !('reasoning_effort' in r.body) && !('reasoning' in r.body)));
  check('القديم: لا max_completion_tokens', old.every((r) => !('max_completion_tokens' in r.body)));
  check(
    'القديم: التصنيف بحرارة صفر وبلا سقف كما كان',
    oldAnalysis.length === 2 && oldAnalysis.every((r) => r.body.temperature === 0 && !('max_tokens' in r.body)),
  );
  check(
    'القديم: المساعد بحرارة 0.2 وسقف 1400',
    oldChats
      .filter((r) => !r.body.response_format && (r.body.messages as { content?: string }[])[0]?.content !== 'رد بكلمة: جاهز')
      .every((r) => r.body.temperature === 0.2 && r.body.max_tokens === 1400),
  );
  check(
    'القديم: Responses بحرارة 0.2 وسقفيها (1800 / 2400)',
    oldResponses
      .filter((r) => r.body.input !== 'رد بكلمة: جاهز')
      .every((r) => r.body.temperature === 0.2 && [1800, 2400].includes(Number(r.body.max_output_tokens))),
  );

  // ══════════════ الأخطاء تُسمّى ولا تُسرَّب ══════════════

  const pingAs = async (model: string) => {
    process.env.OPENAI_CHAT_MODEL = model;
    try {
      await assistant.pingOpenAI();
      return null;
    } catch (error) {
      return error as InstanceType<typeof assistant.AssistantError>;
    }
  };
  const rejected = await pingAs('gpt-6.1-sol-reject');
  check(
    'معاملٌ مرفوض يُسمّى في الرسالة',
    rejected?.code === 'bad_param' && rejected.message.includes('reasoning_effort'),
    rejected?.message,
  );
  const weird = await pingAs('gpt-6.1-sol-weird');
  check(
    'اسم معاملٍ غريب لا يُمرَّر إلى المستخدم',
    weird?.code === 'api' && !weird.message.includes('<img'),
    weird?.message,
  );
  const missing = await pingAs('missing-model');
  check(
    'النموذج غير المتاح: رسالةٌ لا تقترح نموذجاً بعينه',
    missing?.code === 'model_not_found' && !missing.message.includes('gpt-4o-mini'),
    missing?.message,
  );

  // ══════════════ فحصٌ ساكن ══════════════

  /*
   * كلّ استدعاءٍ للنموذج في الشيفرة يبني معاملاته من الوحدة ويمرّر مهلة.
   *
   * ما أُرسل في المسارات أعلاه يُفحص بالتشغيل؛ وهذا يحرس ما لم يُكتب بعد:
   * استدعاءٌ جديد يكتب `temperature` بيده يكسر Sol، ولا مسار مفحوصاً يمرّ
   * به هنا. فيُقرأ كلّ استدعاء في `src` نصّاً.
   */
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(join(root, dir))) {
      const path = `${dir}/${entry}`;
      if (statSync(join(root, path)).isDirectory()) walk(path);
      else if (/\.(ts|tsx)$/.test(entry)) files.push(path);
    }
  };
  walk('src');

  const callSites: { file: string; text: string }[] = [];
  for (const file of files) {
    const code = stripComments(read(file));
    const pattern = /\.(chat\.completions|responses)\.create\(/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(code))) {
      let depth = 0;
      let end = match.index + match[0].length - 1;
      for (; end < code.length; end += 1) {
        if (code[end] === '(') depth += 1;
        else if (code[end] === ')') {
          depth -= 1;
          if (depth === 0) break;
        }
      }
      callSites.push({ file, text: code.slice(match.index, end + 1) });
    }
  }
  check('الفحص الساكن وجد استدعاءات النموذج', callSites.length >= 9, String(callSites.length));
  for (const site of callSites) {
    const outside = site.text.replace(/(chatCompletionParams|responsesParams)\(\{[\s\S]*?\}\)/g, '');
    const literal = /\b(temperature|max_tokens|max_completion_tokens|max_output_tokens|reasoning_effort|reasoning)\s*:/.exec(outside);
    check(
      `${site.file}: المعاملات من الوحدة لا مكتوبةٌ باليد`,
      /\b(chatCompletionParams|responsesParams|analysisParams)\(/.test(site.text) && !literal,
      literal?.[0],
    );
    check(`${site.file}: مهلةٌ تُمرَّر مع الطلب`, /timeout|Timeout\(/.test(site.text));
  }

  const modelParams = read('src/lib/assistant/model-params.ts');
  check('وحدة المعاملات بلا أسرار ولا بيئة', !/process\.env/.test(stripComments(modelParams)));

  for (const file of ['docker-compose.prod.yml', 'docker-compose.yml']) {
    const compose = read(file);
    const models = (compose.match(/^\s+OPENAI_CHAT_MODEL:/gm) ?? []).length;
    check(
      `${file}: متغيّرا العمق يصلان إلى كلّ خدمةٍ تحمل النموذج`,
      models > 0 &&
        (compose.match(/OPENAI_ANALYSIS_EFFORT: \$\{OPENAI_ANALYSIS_EFFORT:-medium\}/g) ?? []).length === models &&
        (compose.match(/OPENAI_ASSISTANT_EFFORT: \$\{OPENAI_ASSISTANT_EFFORT:-low\}/g) ?? []).length === models,
    );
    check(`${file}: النموذج الافتراضي gpt-6.1-sol`, !compose.includes('OPENAI_CHAT_MODEL:-gpt-4o-mini'));
  }
  const prodExample = read('.env.production.example');
  check(
    '.env.production.example يشرح متغيّرَي العمق',
    /^OPENAI_ANALYSIS_EFFORT="medium"$/m.test(prodExample) && /^OPENAI_ASSISTANT_EFFORT="low"$/m.test(prodExample),
  );
  check(
    'لا متغيّر NEXT_PUBLIC_ للنموذج أو المفتاح',
    ![prodExample, read('.env.example')].some((text) => /NEXT_PUBLIC_[A-Z_]*(OPENAI|EFFORT)/.test(text)),
  );
  check(
    'التوسيع يطلب أدنى عمق',
    /generateAssistantResponse\([\s\S]*?\{\s*effort:\s*'low'\s*\}/.test(stripComments(read('src/lib/search/expand.ts'))),
  );
  const run = stripComments(read('src/lib/analysis/run.ts'));
  check('جولة التحليل تنبض بالوقت لا بالعدد وحده', /Date\.now\(\)\s*-\s*lastFlushAt\s*>=\s*FLUSH_INTERVAL_MS/.test(run));

  server.close();

  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) {
    console.log(`${c.ok ? '✓' : '✗'} ${c.name}${!c.ok && c.detail ? `  ← ${c.detail}` : ''}`);
  }
  console.log(`\n${checks.length - failed.length}/${checks.length} فحصاً ناجحاً`);
  if (failed.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  server.close();
  process.exit(1);
});
