import { installJsdom } from './jsdom-env';

const env = installJsdom('https://react-lab.test/');

void (async () => {
  const { run } = await import('./react19-probe');
  await run(env.host);
})();
