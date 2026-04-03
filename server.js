const express = require('express');
const OpenAI = require('openai');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const buildSystemPrompt = () => `
Sen ${process.env.OPERATOR_NAME || 'Aria'} - professional AI ovoz operatorsisan.
Kompaniya: ${process.env.COMPANY_NAME || 'Kompaniya'}
Lavozim: ${process.env.OPERATOR_ROLE || 'Mijozlarga xizmat ko\'rsatuvchi mutaxassis'}

ASOSIY QOIDALAR:
- Malakali inson operator kabi tabiiy, iliq va professional gapirasан
- Javoblarni QISQA va SUHBATLI qil (ovoz uchun max 2-3 gap)
- Agar to\'g\'ridan to\'g\'ri so\'ralmasa, AI ekanligingni aytma
- Tabiiy nutq ishla: "Albatta!", "Yaxshi savol!", "Yordam beraman"
- Ro\'yxat yoki nuqtalar ishlatma - oddiy gaplar bilan so\'yla
- Mijoz qaysi tilda gapirsa - o\'sha tilda javob ber (O\'zbek, Rus yoki Ingliz)

Kompaniya haqida:
${process.env.COMPANY_INFO || 'Biz sifatli xizmat ko\'rsatamiz.'}
`.trim();

const activeCalls = new Map();
const callLogs = [];

// VAPI Custom LLM Endpoint - OpenAI Compatible
app.post('/chat/completions', async (req, res) => {
  try {
    const { messages, stream, temperature, max_tokens } = req.body;
    const systemMessage = { role: 'system', content: buildSystemPrompt() };
    const fullMessages = messages[0]?.role === 'system' ? messages : [systemMessage, ...messages];

    const params = {
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages: fullMessages,
      temperature: temperature || 0.7,
      max_tokens: max_tokens || 200,
    };

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      const s = await openai.chat.completions.create({ ...params, stream: true });
      for await (const chunk of s) {
        if (res.destroyed) break;
        res.write('data: ' + JSON.stringify(chunk) + '\n\n');
      }
      res.write('data: [DONE]\n\n');
      res.end();
    } else {
      const response = await openai.chat.completions.create(params);
      res.json(response);
    }
  } catch (e) {
    console.error('[LLM Error]', e.message);
    res.status(500).json({ error: { message: e.message } });
  }
});

// VAPI Webhook
app.post('/webhook', (req, res) => {
  const { type, call } = req.body;
  console.log('[Webhook]', type, call?.id);
  if (type === 'call-started' && call) {
    activeCalls.set(call.id, { id: call.id, startTime: new Date().toISOString(), callerNumber: call.customer?.number || 'Unknown', status: 'active' });
  } else if (type === 'call-ended' && call) {
    const c = activeCalls.get(call.id);
    if (c) {
      c.status = 'ended';
      c.endTime = new Date().toISOString();
      c.duration = Math.round((Date.now() - new Date(c.startTime)) / 1000);
      c.endReason = call.endedReason || 'ended';
      callLogs.push({ ...c });
      activeCalls.delete(call.id);
    }
  }
  res.json({ success: true });
});

// Stats API
app.get('/api/stats', (req, res) => {
  res.json({
    totalCalls: callLogs.length,
    activeCalls: activeCalls.size,
    avgDuration: callLogs.length > 0 ? Math.round(callLogs.reduce((s, c) => s + (c.duration || 0), 0) / callLogs.length) : 0,
    operatorName: process.env.OPERATOR_NAME || 'Aria',
    companyName: process.env.COMPANY_NAME || 'Kompaniya',
    model: process.env.OPENAI_MODEL || 'gpt-4o',
    uptime: Math.round(process.uptime()),
  });
});

app.get('/api/calls', (req, res) => {
  res.json({ active: Array.from(activeCalls.values()), history: callLogs.slice(-50).reverse() });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log('AI Operator running on port', PORT));
