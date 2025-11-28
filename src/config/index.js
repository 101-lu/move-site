import fs from 'fs/promises';
import path from 'path';
import React from 'react';
import { render } from 'ink';
import { ConfigWizard } from '../ui/ConfigWizard.js';

const CONFIG_FILENAME = '.move-site-config.json';

/**
 * Get the path to the config file in the current directory
 */
export function getConfigPath() {
  return path.join(process.cwd(), CONFIG_FILENAME);
}

/**
 * Check if a config file exists
 */
export async function configExists() {
  try {
    await fs.access(getConfigPath());
    return true;
  } catch {
    return false;
  }
}

/**
 * Load the configuration from file
 */
export async function loadConfig() {
  try {
    const configPath = getConfigPath();
    const content = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    return null;
  }
}

/**
 * Save configuration to file
 */
export async function saveConfig(config) {
  const configPath = getConfigPath();
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
  return configPath;
}

/**
 * Create a default config structure
 */
export function createDefaultConfig() {
  return {
    version: '1.0',
    cms: 'wordpress',
    environments: {},
    options: {
      excludePatterns: [
        '.git',
        '.gitignore',
        'node_modules',
        '.DS_Store',
        '*.log',
        '.move-site-config.json'
      ]
    }
  };
}

/**
 * Run the interactive config wizard
 */
export async function runConfigWizard(force = false) {
  if (!force && await configExists()) {
    const existingConfig = await loadConfig();
    console.log('Configuration file already exists.');
    console.log('Use --force to overwrite or edit the file directly.');
    return existingConfig;
  }
  
  return new Promise((resolve) => {
    const { unmount, waitUntilExit } = render(
      React.createElement(ConfigWizard, {
        onComplete: async (config) => {
          const savedPath = await saveConfig(config);
          unmount();
          console.log(`\nConfiguration saved to: ${savedPath}`);
          resolve(config);
        },
        onCancel: () => {
          unmount();
          console.log('\nConfiguration cancelled.');
          resolve(null);
        }
      })
    );
  });
}
