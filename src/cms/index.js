import { WordPressAdapter } from './wordpress.js';

const adapters = {
  wordpress: WordPressAdapter
};

/**
 * Detect the CMS used in the current directory
 */
export async function detectCMS() {
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
export function getSupportedCMS() {
  return Object.keys(adapters);
}

/**
 * Get adapter for a specific CMS
 */
export function getAdapter(cmsName) {
  const Adapter = adapters[cmsName];
  if (!Adapter) {
    throw new Error(`Unknown CMS: ${cmsName}`);
  }
  return new Adapter();
}
