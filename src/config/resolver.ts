import React from 'react';
import { render } from 'ink';
import SelectInput from 'ink-select-input';
import { Text, Box } from 'ink';
import type { SiteConfig, EnvironmentConfig } from '../types/index.js';

interface EnvironmentMatch {
  domain: string;
  config: EnvironmentConfig;
  matchType: 'exact' | 'type' | 'fuzzy';
}

/**
 * Resolve an environment identifier to a domain
 * Supports:
 * - Exact domain match: "example.com"
 * - Environment type: "production", "test", "development", "local"
 * - Fuzzy match: "exam" matches "example.com"
 * 
 * Returns the matched domain or shows interactive selector if multiple matches found
 */
export async function resolveEnvironment(
  identifier: string,
  config: SiteConfig
): Promise<string | null> {
  const environments = config.environments;
  const domains = Object.keys(environments);

  if (domains.length === 0) {
    console.error('❌ No environments configured. Run: move-site config');
    return null;
  }

  // Step 1: Try exact domain match
  if (environments[identifier]) {
    return identifier;
  }

  const matches: EnvironmentMatch[] = [];
  const lowerIdentifier = identifier.toLowerCase();

  // Step 2: Try environment type match
  for (const domain of domains) {
    const env = environments[domain];
    if (env.type && env.type.toLowerCase() === lowerIdentifier) {
      matches.push({ domain, config: env, matchType: 'type' });
    }
  }

  // Step 3: Try fuzzy match (partial domain match)
  if (matches.length === 0) {
    for (const domain of domains) {
      const lowerDomain = domain.toLowerCase();
      if (lowerDomain.includes(lowerIdentifier)) {
        matches.push({ domain, config: environments[domain], matchType: 'fuzzy' });
      }
    }
  }

  // No matches found
  if (matches.length === 0) {
    console.error(`❌ Environment "${identifier}" not found.`);
    console.error(`\nAvailable environments:`);
    for (const domain of domains) {
      const env = environments[domain];
      console.error(`   • ${domain} (${env.type})`);
    }
    return null;
  }

  // Single match - use it
  if (matches.length === 1) {
    const match = matches[0];
    if (match.matchType !== 'exact') {
      console.log(`✓ Using ${match.domain} (${match.config.type})\n`);
    }
    return match.domain;
  }

  // Multiple matches - show interactive selector
  return await showEnvironmentSelector(identifier, matches, config);
}

/**
 * Show interactive selector for multiple environment matches
 */
async function showEnvironmentSelector(
  identifier: string,
  matches: EnvironmentMatch[],
  config: SiteConfig
): Promise<string | null> {
  console.log(`\nFound ${matches.length} environments matching "${identifier}" for ${config.name}:`);
  
  return new Promise<string | null>((resolve) => {
    const items = matches.map((match) => ({
      label: `${match.domain} (${match.config.type})`,
      value: match.domain,
    }));

    const { unmount } = render(
      React.createElement(
        Box,
        { flexDirection: 'column' },
        React.createElement(Text, { bold: true, color: 'cyan' }, 'Choose which one to use:'),
        React.createElement(SelectInput, {
          items,
          onSelect: (item) => {
            unmount();
            console.log(`✓ Using ${item.value}\n`);
            resolve(item.value as string);
          },
        })
      )
    );
  });
}

/**
 * Resolve environment and exit if not found
 */
export async function resolveEnvironmentOrExit(
  identifier: string,
  config: SiteConfig
): Promise<string> {
  const domain = await resolveEnvironment(identifier, config);
  if (!domain) {
    process.exit(1);
  }
  return domain;
}
