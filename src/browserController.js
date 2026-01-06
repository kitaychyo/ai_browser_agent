const playwright = require('playwright');

class BrowserController {
  constructor(options = {}) {
    this.headless = options.headless ?? true;
    this.browser = null;
    this.page = null;
    this.history = [];
  }

  async launch() {
    this.browser = await playwright.chromium.launch({ headless: this.headless });
    const context = await this.browser.newContext();
    this.page = await context.newPage();
  }

  async close() {
    if (this.browser) await this.browser.close();
  }

  async goto(url) {
    const prev = this.page.url ? this.page.url() : null;
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    this.history.push(prev);
    return { url: this.page.url(), title: await this.page.title() };
  }

  async back() {
    if (this.history.length === 0) return null;
    const url = this.history.pop();
    if (!url) return null;
    await this.page.goto(url);
    return { url: this.page.url(), title: await this.page.title() };
  }

  async screenshot(path = 'screenshot.png') {
    await this.page.screenshot({ path, fullPage: true });
    return path;
  }

  async type(selectorOrText, text) {
    // Если первый аргумент выглядит как селектор — пробуем его; иначе ищем поле ввода по метке/placeholder/тексту
    try {
      await this.page.fill(selectorOrText, text, { timeout: 3000 });
      return true;
    } catch (e) {
      // запасной вариант: найти input по placeholder или ближайшей метке
      const success = await this.page.evaluate(({ text }) => {
        const inputs = Array.from(document.querySelectorAll('input,textarea'));
        for (const el of inputs) {
          if ((el.placeholder || '').toLowerCase().includes(text.toLowerCase())) {
            el.value = '';
            el.focus();
            el.value = text;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            return true;
          }
        }
        return false;
      }, { text });
      return success;
    }
  }

  async click(selectorOrText) {
    // Сначала попытаться кликнуть по прямому селектору
    try {
      await this.page.click(selectorOrText, { timeout: 3000 });
      return true;
    } catch (e) {
      // Если не получилось — попытаться найти элемент по видимому тексту
      const found = await this.page.evaluateHandle((q) => {
        const text = q.toLowerCase();
        const nodes = Array.from(document.querySelectorAll('a,button,input[type=button],input[type=submit],div'));
        for (const n of nodes) {
          if ((n.innerText || '').toLowerCase().includes(text) || (n.value || '').toLowerCase().includes(text)) return n;
        }
        return null;
      }, selectorOrText);
      if (found) {
        try {
          await found.asElement().click();
          return true;
        } catch (e) {
          return false;
        }
      }
      return false;
    }
  }

  async getSnapshot(limit = 80) {
    // Извлечь метаданные страницы и список видимых интерактивных элементов
    const snapshot = await this.page.evaluate((limit) => {
      const out = { url: location.href, title: document.title, elements: [] };
      const nodes = Array.from(document.querySelectorAll('a,button,input,textarea,select,img'));
      for (const n of nodes.slice(0, limit)) {
        const rect = n.getBoundingClientRect ? n.getBoundingClientRect() : { width: 0, height: 0 };
        out.elements.push({
          tag: n.tagName,
          text: (n.innerText || n.alt || n.value || '').slice(0, 200),
          id: n.id || null,
          classes: n.className || null,
          name: n.getAttribute ? n.getAttribute('name') : null,
          role: n.getAttribute ? n.getAttribute('role') : null,
          href: n.href || null,
          disabled: n.disabled || false,
          visible: rect.width > 0 && rect.height > 0,
        });
      }
      return out;
    }, limit);
    return snapshot;
  }
}

module.exports = BrowserController;
