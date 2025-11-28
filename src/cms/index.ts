import { WordPressAdapter } from './wordpress.js';
import type { CMSAdapter, CMSType } from '../types/index.js';

type AdapterConstructor = new (basePath?: string) => CMSAdapter;

const adapters: Record<string, AdapterConstructor> = {
  wordpress: WordPressAdapter,
};

/**
 * Detect the CMS used in the current directory
 */
export async function detectCMS(): Promise<{ name: string; adapter: CMSAdapter } | null> {
  for (const [name, Adapter] of Object.entries(adapters)) {
    const adapter = new Adapter();
    if (await adapter.detect()) {
      return { name, adapter };
    }
  }
  return null;
}

/**
 * Get list of supported CMS
 */
export function getSupportedCMS(): string[] {
  return Object.keys(adapters);
}

/**
 * Get adapter for a specific CMS
 */
export function getAdapter(cmsName: CMSType | string): CMSAdapter {
  const Adapter = adapters[cmsName];
  if (!Adapter) {
    throw new Error(`Unknown CMS: ${cmsName}`);
  }
  return new Adapter();
}
