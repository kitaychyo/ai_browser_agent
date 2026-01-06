const BrowserController = require('./browserController');
const OpenAI = require('openai');

class Agent {
  constructor({ apiKey, model = 'gpt-4o-mini', headless = true } = {}) {
    this.apiKey = apiKey;
    this.model = model;
    this.browser = new BrowserController({ headless });
    this.openai = new OpenAI({ apiKey: this.apiKey });
    this.step = 0;
  }

  async start() {
    await this.browser.launch();
  }

  async stop() {
    await this.browser.close();
  }

  async askLLM(snapshot, goal, history = []) {
    // Сформировать промпт с описанием текущей страницы и цели, запросить одно действие через схему функций
    const system = `You are an autonomous browser agent. You receive a page snapshot (url, title, list of visible elements). Return one JSON action from the function schema. Do not assume selectors exist; you may provide a CSS selector or a human-readable target text. Keep action reasons concise.`;

    const user = `Goal: ${goal}\nPage snapshot:\nURL: ${snapshot.url}\nTitle: ${snapshot.title}\nElements (first ${Math.min(snapshot.elements.length, 20)} shown):\n${snapshot.elements.slice(0, 20).map((e, i) => `${i+1}. <${e.tag}> text="${e.text.replace(/\n/g,' ')}" id=${e.id || '-'} classes=${e.classes || '-'} href=${e.href||'-'}`).join('\n')}`;

    // Используем chat completion от OpenAI с поддержкой функций (function-calling)
    const functions = [
      {
        name: 'choose_action',
        description: 'Select one browser action to perform',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['click','type','navigate','screenshot','wait','back','done'] },
            target: { type: 'string', description: 'CSS selector or visible text to locate element (prefer CSS selector if possible)' },
            input: { type: 'string', description: 'Text to type into field' },
            url: { type: 'string', description: 'URL to navigate to' },
            reason: { type: 'string' }
          },
          required: ['action']
        }
      }
    ];

    const res = await this.openai.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      functions,
      function_call: { name: 'choose_action' },
      max_tokens: 350
    });

    const message = res.choices[0].message;
    if (message?.function_call) {
      try {
        const args = JSON.parse(message.function_call.arguments);
        return args;
      } catch (e) {
        return { action: 'wait', reason: 'parse_error' };
      }
    }
    return { action: 'wait', reason: 'no_function' };
  }

  async run(goal, maxSteps = 30) {
    this.step = 0;
    while (this.step < maxSteps) {
      this.step += 1;
      const snapshot = await this.browser.getSnapshot();
      const action = await this.askLLM(snapshot, goal);

      console.log(`STEP ${this.step}:`, action);

      if (!action || !action.action) break;

      if (action.action === 'done') {
        console.log('Agent reports done.');
        break;
      }

      if (action.action === 'navigate' && action.url) {
        const r = await this.browser.goto(action.url);
        console.log('navigated to', r.url);
      } else if (action.action === 'click') {
        const ok = await this.browser.click(action.target || '');
        console.log('clicked ->', ok);
      } else if (action.action === 'type') {
        const ok = await this.browser.type(action.target || '', action.input || '');
        console.log('typed ->', ok);
      } else if (action.action === 'screenshot') {
        const p = await this.browser.screenshot(`step-${this.step}.png`);
        console.log('screenshot saved', p);
      } else if (action.action === 'back') {
        const r = await this.browser.back();
        console.log('back ->', r);
      } else if (action.action === 'wait') {
        await new Promise((res) => setTimeout(res, 1500));
      }

      // небольшая пауза, чтобы страница успела обновиться
      await new Promise((r) => setTimeout(r, 100));
    }
    console.log('Run finished. Steps:', this.step);
  }
}

module.exports = Agent;
