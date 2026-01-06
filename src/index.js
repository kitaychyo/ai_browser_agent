require('dotenv').config();
const Agent = require('./agent');
const prompt = require('prompt-sync')({ sigint: true });

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.MODEL || 'gpt-4o-mini';
  const headless = (process.env.HEADLESS || 'true') === 'true';

  if (!apiKey) {
    console.error('Please set OPENAI_API_KEY in .env');
    process.exit(1);
  }

  const agent = new Agent({ apiKey, model, headless });
  await agent.start();

  const args = process.argv.slice(2);
  let goal = null;

  goal = prompt('Describe the task for the browser agent: ');


  try {
    await agent.run(goal, 40);
  } catch (e) {
    console.error('Error during run:', e);
  }

  await agent.stop();
}

main();
