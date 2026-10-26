import { createDockerRenderer } from './sandbox';
import { createBrowserRenderer } from './tools';
import type { Framework, Renderer } from './types';

export async function createRenderer(framework: Framework, env: NodeJS.ProcessEnv = process.env): Promise<Renderer> {
  return env.SANDBOX === 'docker' ? createDockerRenderer(framework, env) : createBrowserRenderer(framework);
}
