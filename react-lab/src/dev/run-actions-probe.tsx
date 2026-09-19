import { installJsdom } from './jsdom-env';

const env = installJsdom('https://react-lab.test/');

void (async () => {
  const { run } = await import('./actions-probe');
  await run(env.host);
})();
