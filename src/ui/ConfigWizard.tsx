import { useState, FC, useEffect } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import { createDefaultConfig } from '../config/index.js';
import type {
  SiteConfig,
  ConfigWizardProps,
  WizardStep,
  WizardEnvironmentState,
  SelectItem,
  CMSType,
  EnvironmentType,
  EnvironmentConfig,
} from '../types/index.js';

const STEPS: Record<string, WizardStep> = {
  CMS_SELECT: 'cms_select',
  SITE_NAME: 'site_name',
  ENV_DOMAIN: 'env_domain',
  ENV_TYPE: 'env_type',
  SSH_HOST: 'ssh_host',
  SSH_PORT: 'ssh_port',
  SSH_USER: 'ssh_user',
  SSH_AUTH_TYPE: 'ssh_auth_type',
  SSH_PASSWORD: 'ssh_password',
  SSH_KEY_PATH: 'ssh_key_path',
  SSH_FILES_OWNER: 'ssh_files_owner',
  SSH_FILES_GROUP: 'ssh_files_group',
  REMOTE_PATH: 'remote_path',
  LOCAL_PATH: 'local_path',
  DB_HOST: 'db_host',
  DB_NAME: 'db_name',
  DB_USER: 'db_user',
  DB_PASSWORD: 'db_password',
  DB_TABLE_PREFIX: 'db_table_prefix',
  ADD_ANOTHER: 'add_another',
  CONFIRM: 'confirm',
};

const CMS_OPTIONS: SelectItem<CMSType>[] = [
  { label: 'WordPress', value: 'wordpress' },
  { label: 'Custom / Other', value: 'custom' },
];

const ENV_TYPE_OPTIONS: SelectItem<EnvironmentType>[] = [
  { label: 'Production', value: 'production' },
  { label: 'Test', value: 'test' },
  { label: 'Development', value: 'development' },
  { label: 'Local', value: 'local' },
];

const AUTH_TYPE_OPTIONS: SelectItem<'key' | 'password'>[] = [
  { label: 'SSH Key (recommended)', value: 'key' },
  { label: 'Password', value: 'password' },
];

const YES_NO_OPTIONS: SelectItem<boolean>[] = [
  { label: 'Yes', value: true },
  { label: 'No', value: false },
];

const createInitialEnvState = (): WizardEnvironmentState => ({
  domain: '',
  url: '',
  type: 'test',
  ssh: {
    host: '',
    port: '22',
    user: '',
    authType: 'key',
    password: '',
    keyPath: '~/.ssh/id_rsa',
    filesOwner: '',
    filesGroup: '',
  },
  remotePath: '',
  database: {
    host: 'localhost',
    name: '',
    user: '',
    password: '',
    tablePrefix: 'wp_',
  },
});

/**
 * Convert an existing EnvironmentConfig to WizardEnvironmentState for editing
 */
const envConfigToState = (domain: string, env: EnvironmentConfig): WizardEnvironmentState => ({
  domain,
  url: env.url || `https://${domain}`,
  type: env.type || 'test',
  ssh: {
    host: env.ssh?.host || '',
    port: String(env.ssh?.port || 22),
    user: env.ssh?.user || '',
    authType: env.ssh?.password ? 'password' : 'key',
    password: env.ssh?.password || '',
    keyPath: env.ssh?.keyPath || '~/.ssh/id_rsa',
    filesOwner: env.ssh?.filesOwner || '',
    filesGroup: env.ssh?.filesGroup || '',
  },
  remotePath: env.remotePath || '',
  database: {
    host: env.database?.host || 'localhost',
    name: env.database?.name || '',
    user: env.database?.user || '',
    password: env.database?.password || '',
    tablePrefix: env.database?.tablePrefix || 'wp_',
  },
});

export const ConfigWizard: FC<ConfigWizardProps> = ({ existingConfig, onComplete, onCancel }) => {
  const { exit } = useApp();
  const isEditMode = !!existingConfig?.name;
  
  // Determine initial step based on whether we have existing config
  const getInitialStep = (): WizardStep => {
    if (isEditMode) {
      return STEPS.ENV_DOMAIN; // Skip to environment domain when editing
    }
    return STEPS.CMS_SELECT;
  };

  const [step, setStep] = useState<WizardStep>(getInitialStep());
  const [stepHistory, setStepHistory] = useState<WizardStep[]>([]);
  const [config, setConfig] = useState<SiteConfig>(existingConfig || createDefaultConfig());
  const [currentEnv, setCurrentEnv] = useState<WizardEnvironmentState>(createInitialEnvState());
  const [inputValue, setInputValue] = useState('');
  const [isEditing, setIsEditing] = useState(false); // Track if we're editing an existing env

  // Helper to get existing table prefix from any configured environment
  const getExistingTablePrefix = (): string => {
    const envs = Object.values(config.environments);
    for (const env of envs) {
      if (env?.database?.tablePrefix) {
        return env.database.tablePrefix;
      }
    }
    return 'wp_'; // Default WordPress prefix
  };

  // Helper to get existing files owner from any configured environment
  const getExistingFilesOwner = (): string => {
    const envs = Object.values(config.environments);
    for (const env of envs) {
      if (env?.ssh?.filesOwner) {
        return env.ssh.filesOwner;
      }
    }
    return ''; // No default
  };

  // Helper to get existing files group from any configured environment
  const getExistingFilesGroup = (): string => {
    const envs = Object.values(config.environments);
    for (const env of envs) {
      if (env?.ssh?.filesGroup) {
        return env.ssh.filesGroup;
      }
    }
    return ''; // No default
  };

  // Navigate to a new step, saving current to history
  const goToStep = (newStep: WizardStep) => {
    setStepHistory((prev) => [...prev, step]);
    setStep(newStep);
  };

  // Go back to previous step
  const goBack = () => {
    if (stepHistory.length > 0) {
      const previousStep = stepHistory[stepHistory.length - 1];
      setStepHistory((prev) => prev.slice(0, -1));
      setStep(previousStep);
      // Restore input value based on the step we're going back to
      restoreInputValue(previousStep);
    }
  };

  // Restore the input value when going back
  const restoreInputValue = (targetStep: WizardStep) => {
    switch (targetStep) {
      case STEPS.SITE_NAME:
        setInputValue(config.name);
        break;
      case STEPS.ENV_DOMAIN:
        setInputValue(currentEnv.domain);
        break;
      case STEPS.SSH_HOST:
        setInputValue(currentEnv.ssh.host);
        break;
      case STEPS.LOCAL_PATH:
        setInputValue(currentEnv.remotePath || process.cwd());
        break;
      case STEPS.SSH_PORT:
        setInputValue(currentEnv.ssh.port);
        break;
      case STEPS.SSH_USER:
        setInputValue(currentEnv.ssh.user);
        break;
      case STEPS.SSH_PASSWORD:
        setInputValue(currentEnv.ssh.password);
        break;
      case STEPS.SSH_KEY_PATH:
        setInputValue(currentEnv.ssh.keyPath);
        break;
      case STEPS.SSH_FILES_OWNER:
        setInputValue(currentEnv.ssh.filesOwner);
        break;
      case STEPS.SSH_FILES_GROUP:
        setInputValue(currentEnv.ssh.filesGroup);
        break;
      case STEPS.REMOTE_PATH:
        setInputValue(currentEnv.remotePath);
        break;
      case STEPS.DB_HOST:
        setInputValue(currentEnv.database.host);
        break;
      case STEPS.DB_NAME:
        setInputValue(currentEnv.database.name);
        break;
      case STEPS.DB_USER:
        setInputValue(currentEnv.database.user);
        break;
      case STEPS.DB_PASSWORD:
        setInputValue(currentEnv.database.password);
        break;
      case STEPS.DB_TABLE_PREFIX:
        setInputValue(currentEnv.database.tablePrefix);
        break;
      default:
        setInputValue('');
    }
  };

  const canGoBack = stepHistory.length > 0;

  useInput((input, key) => {
    if (key.escape) {
      if (canGoBack) {
        goBack();
      } else {
        onCancel();
      }
    }
    // Also support left arrow to go back, but only if input is empty
    // This allows normal text editing when there's content in the input
    if (key.leftArrow && canGoBack && inputValue === '') {
      goBack();
    }
  });

  const handleCMSSelect = (item: SelectItem<CMSType>) => {
    setConfig((prev) => ({ ...prev, cms: item.value }));
    setInputValue('');
    goToStep(STEPS.SITE_NAME);
  };

  const handleEnvTypeSelect = (item: SelectItem<EnvironmentType>) => {
    const envType = item.value;
    
    setCurrentEnv((prev) => ({ ...prev, type: envType }));

    // Skip SSH configuration for local environments
    if (envType === 'local') {
      const path = currentEnv.remotePath || process.cwd();
      setInputValue(path);
      goToStep(STEPS.LOCAL_PATH);
    } else {
      const host = currentEnv.ssh?.host || '';
      setInputValue(host);
      goToStep(STEPS.SSH_HOST);
    }
  };

  const handleAuthTypeSelect = (item: SelectItem<'key' | 'password'>) => {
    setCurrentEnv((prev) => ({
      ...prev,
      ssh: { ...prev.ssh, authType: item.value },
    }));
    if (item.value === 'password') {
      setInputValue(currentEnv.ssh.password);
      goToStep(STEPS.SSH_PASSWORD);
    } else {
      setInputValue(currentEnv.ssh.keyPath || '~/.ssh/id_rsa');
      goToStep(STEPS.SSH_KEY_PATH);
    }
  };

  const handleAddAnotherSelect = (item: SelectItem<boolean>) => {
    if (item.value) {
      setCurrentEnv(createInitialEnvState());
      setInputValue('');
      setIsEditing(false);
      // Reset history for new environment
      setStepHistory([]);
      setStep(STEPS.ENV_DOMAIN);
    } else {
      goToStep(STEPS.CONFIRM);
    }
  };

  const handleConfirmSelect = (item: SelectItem<boolean>) => {
    if (item.value) {
      onComplete(config);
    } else {
      onCancel();
    }
  };

  const handleTextSubmit = (value: string) => {
    switch (step) {
      case STEPS.SITE_NAME:
        setConfig((prev) => ({ ...prev, name: value }));
        setInputValue('');
        goToStep(STEPS.ENV_DOMAIN);
        break;

      case STEPS.ENV_DOMAIN:
        // Strip protocol if user accidentally included it
        const domain = value.replace(/^https?:\/\//, '').replace(/\/$/, '');
        const url = `https://${domain}`;
        
        // Check if this domain already exists
        const existingEnv = config.environments[domain];
        if (existingEnv) {
          // Load existing environment data for editing
          const envState = envConfigToState(domain, existingEnv);
          setCurrentEnv(envState);
          setIsEditing(true);
        } else {
          // New environment with this domain
          setCurrentEnv((prev) => ({ ...createInitialEnvState(), domain, url }));
          setIsEditing(false);
        }
        setInputValue('');
        goToStep(STEPS.ENV_TYPE);
        break;

      case STEPS.SSH_HOST:
        setCurrentEnv((prev) => ({
          ...prev,
          ssh: { ...prev.ssh, host: value },
        }));
        setInputValue(currentEnv.ssh.port || '22');
        goToStep(STEPS.SSH_PORT);
        break;

      case STEPS.SSH_PORT:
        setCurrentEnv((prev) => ({
          ...prev,
          ssh: { ...prev.ssh, port: value || '22' },
        }));
        setInputValue(currentEnv.ssh.user);
        goToStep(STEPS.SSH_USER);
        break;

      case STEPS.SSH_USER:
        setCurrentEnv((prev) => ({
          ...prev,
          ssh: { ...prev.ssh, user: value },
        }));
        goToStep(STEPS.SSH_AUTH_TYPE);
        break;

      case STEPS.SSH_PASSWORD:
        setCurrentEnv((prev) => ({
          ...prev,
          ssh: { ...prev.ssh, password: value },
        }));
        // Get existing files owner or empty string
        setInputValue(currentEnv.ssh.filesOwner || getExistingFilesOwner());
        goToStep(STEPS.SSH_FILES_OWNER);
        break;

      case STEPS.SSH_KEY_PATH:
        setCurrentEnv((prev) => ({
          ...prev,
          ssh: { ...prev.ssh, keyPath: value || '~/.ssh/id_rsa' },
        }));
        // Get existing files owner or empty string
        setInputValue(currentEnv.ssh.filesOwner || getExistingFilesOwner());
        goToStep(STEPS.SSH_FILES_OWNER);
        break;

      case STEPS.SSH_FILES_OWNER:
        setCurrentEnv((prev) => ({
          ...prev,
          ssh: { ...prev.ssh, filesOwner: value },
        }));
        // If owner is set, ask for group (default to same as owner)
        if (value) {
          setInputValue(currentEnv.ssh.filesGroup || getExistingFilesGroup() || value);
          goToStep(STEPS.SSH_FILES_GROUP);
        } else {
          // No owner, skip group too
          setInputValue(currentEnv.remotePath);
          goToStep(STEPS.REMOTE_PATH);
        }
        break;

      case STEPS.SSH_FILES_GROUP:
        setCurrentEnv((prev) => ({
          ...prev,
          ssh: { ...prev.ssh, filesGroup: value },
        }));
        setInputValue(currentEnv.remotePath);
        goToStep(STEPS.REMOTE_PATH);
        break;

      case STEPS.REMOTE_PATH:
        setCurrentEnv((prev) => ({ ...prev, remotePath: value }));
        setInputValue(currentEnv.database.host || 'localhost');
        goToStep(STEPS.DB_HOST);
        break;

      case STEPS.LOCAL_PATH:
        setCurrentEnv((prev) => ({ ...prev, remotePath: value || process.cwd() }));
        setInputValue(currentEnv.database.host || 'localhost');
        goToStep(STEPS.DB_HOST);
        break;

      case STEPS.DB_HOST:
        setCurrentEnv((prev) => ({
          ...prev,
          database: { ...prev.database, host: value || 'localhost' },
        }));
        setInputValue(currentEnv.database.name);
        goToStep(STEPS.DB_NAME);
        break;

      case STEPS.DB_NAME:
        setCurrentEnv((prev) => ({
          ...prev,
          database: { ...prev.database, name: value },
        }));
        setInputValue(currentEnv.database.user);
        goToStep(STEPS.DB_USER);
        break;

      case STEPS.DB_USER:
        setCurrentEnv((prev) => ({
          ...prev,
          database: { ...prev.database, user: value },
        }));
        setInputValue(currentEnv.database.password);
        goToStep(STEPS.DB_PASSWORD);
        break;

      case STEPS.DB_PASSWORD:
        setCurrentEnv((prev) => ({
          ...prev,
          database: { ...prev.database, password: value },
        }));
        // For WordPress, ask for table prefix
        if (config.cms === 'wordpress') {
          // Use existing value, or get from other envs, or default to 'wp_'
          const prefix = currentEnv.database.tablePrefix || getExistingTablePrefix();
          setInputValue(prefix);
          goToStep(STEPS.DB_TABLE_PREFIX);
        } else {
          // For non-WordPress, skip table prefix and save
          saveEnvironment(currentEnv);
          goToStep(STEPS.ADD_ANOTHER);
        }
        break;

      case STEPS.DB_TABLE_PREFIX:
        const finalEnvWithPrefix = {
          ...currentEnv,
          database: { ...currentEnv.database, tablePrefix: value || 'wp_' },
        };
        saveEnvironment(finalEnvWithPrefix);
        goToStep(STEPS.ADD_ANOTHER);
        break;
    }
  };

  // Helper function to save the current environment to config
  const saveEnvironment = (envState: WizardEnvironmentState) => {
    // Build environment config - SSH is optional for local environments
    const envConfig: any = {
      type: envState.type,
      url: envState.url,
      remotePath: envState.remotePath,
      database: {
        host: envState.database.host,
        name: envState.database.name,
        user: envState.database.user,
        password: envState.database.password,
        ...(envState.database.tablePrefix ? { tablePrefix: envState.database.tablePrefix } : {}),
      },
    };
    // Only add SSH config for non-local environments
    if (envState.type !== 'local') {
      envConfig.ssh = {
        host: envState.ssh.host,
        port: parseInt(envState.ssh.port, 10),
        user: envState.ssh.user,
        ...(envState.ssh.authType === 'password'
          ? { password: envState.ssh.password }
          : { keyPath: envState.ssh.keyPath }),
        ...(envState.ssh.filesOwner ? { filesOwner: envState.ssh.filesOwner } : {}),
        ...(envState.ssh.filesGroup ? { filesGroup: envState.ssh.filesGroup } : {}),
      };
    }
    // Save by domain
    setConfig((prev) => ({
      ...prev,
      environments: {
        ...prev.environments,
        [envState.domain]: envConfig,
      },
    }));
  };

  const renderTextInput = (label: string, placeholder: string = '') => (
    <Box flexDirection="column">
      <Text bold color="cyan">
        {label}
      </Text>
      <Box>
        <Text color="green">❯ </Text>
        <TextInput value={inputValue} onChange={setInputValue} onSubmit={handleTextSubmit} placeholder={placeholder} />
      </Box>
    </Box>
  );

  const renderPasswordInput = (label: string) => (
    <Box flexDirection="column">
      <Text bold color="cyan">
        {label}
      </Text>
      <Box>
        <Text color="green">❯ </Text>
        <TextInput value={inputValue} onChange={setInputValue} onSubmit={handleTextSubmit} mask="*" />
      </Box>
    </Box>
  );

  // Build environment type options with indicators for existing envs
  const renderStep = () => {
    switch (step) {
      case STEPS.CMS_SELECT:
        return (
          <Box flexDirection="column">
            <Text bold color="cyan">
              Select your CMS:
            </Text>
            <SelectInput items={CMS_OPTIONS} onSelect={handleCMSSelect} />
          </Box>
        );

      case STEPS.SITE_NAME:
        return renderTextInput('Site name:');

      case STEPS.ENV_DOMAIN:
        return (
          <Box flexDirection="column">
            {renderTextInput('Environment domain (e.g., example.com or mysite.local):')}
            <Text dimColor>Enter domain without protocol. Used as environment key and for database URL replacement.</Text>
          </Box>
        );

      case STEPS.ENV_TYPE:
        return (
          <Box flexDirection="column">
            <Text bold color="cyan">
              Select environment type for "{currentEnv.domain}":
            </Text>
            <SelectInput items={ENV_TYPE_OPTIONS} onSelect={handleEnvTypeSelect} />
          </Box>
        );

      case STEPS.SSH_HOST:
        return renderTextInput('SSH Host (e.g., example.com or 192.168.1.100):');

      case STEPS.SSH_PORT:
        return renderTextInput('SSH Port:', '22');

      case STEPS.SSH_USER:
        return renderTextInput('SSH Username:');

      case STEPS.SSH_AUTH_TYPE:
        return (
          <Box flexDirection="column">
            <Text bold color="cyan">
              Authentication method:
            </Text>
            <SelectInput 
              items={AUTH_TYPE_OPTIONS} 
              onSelect={handleAuthTypeSelect}
              initialIndex={currentEnv.ssh.authType === 'password' ? 1 : 0}
            />
          </Box>
        );

      case STEPS.SSH_PASSWORD:
        return renderPasswordInput('SSH Password:');

      case STEPS.SSH_KEY_PATH:
        return renderTextInput('Path to SSH key:', '~/.ssh/id_rsa');

      case STEPS.SSH_FILES_OWNER:
        return (
          <Box flexDirection="column">
            {renderTextInput('Files owner username (leave empty to keep SSH user):', currentEnv.ssh.user)}
            <Text dimColor>Used to chown uploaded files to a different user (e.g., www-data for PHP)</Text>
          </Box>
        );

      case STEPS.SSH_FILES_GROUP:
        return (
          <Box flexDirection="column">
            {renderTextInput('Files owner group:', currentEnv.ssh.filesOwner)}
            <Text dimColor>Group for chown (e.g., www-data). Defaults to the owner username if left empty.</Text>
          </Box>
        );

      case STEPS.REMOTE_PATH:
        return renderTextInput('Remote path to website (e.g., /var/www/html):');

      case STEPS.LOCAL_PATH:
        return renderTextInput('Local path to website:', process.cwd());

      case STEPS.DB_HOST:
        return renderTextInput('Database host:', 'localhost');

      case STEPS.DB_NAME:
        return renderTextInput('Database name:');

      case STEPS.DB_USER:
        return renderTextInput('Database username:');

      case STEPS.DB_PASSWORD:
        return renderPasswordInput('Database password:');

      case STEPS.DB_TABLE_PREFIX:
        return (
          <Box flexDirection="column">
            {renderTextInput('WordPress table prefix:', 'wp_')}
            <Text dimColor>The prefix used for database tables (found in wp-config.php as $table_prefix)</Text>
          </Box>
        );

      case STEPS.ADD_ANOTHER:
        return (
          <Box flexDirection="column">
            <Text color="green">✓ Environment "{currentEnv.domain}" ({currentEnv.type}) {isEditing ? 'updated' : 'added'}!</Text>
            <Text> </Text>
            <Text bold color="cyan">
              Add or edit another environment?
            </Text>
            <SelectInput items={YES_NO_OPTIONS} onSelect={handleAddAnotherSelect} />
          </Box>
        );

      case STEPS.CONFIRM:
        return (
          <Box flexDirection="column">
            <Text bold color="cyan">
              Configuration Summary:
            </Text>
            <Text>Site: {config.name}</Text>
            <Text>CMS: {config.cms}</Text>
            <Text>Environments: {Object.keys(config.environments).join(', ') || 'none'}</Text>
            <Text> </Text>
            <Text bold color="cyan">
              Save this configuration?
            </Text>
            <SelectInput items={YES_NO_OPTIONS} onSelect={handleConfirmSelect} />
          </Box>
        );

      default:
        return <Text>Unknown step</Text>;
    }
  };

  // Header shows different info in edit mode
  const renderHeader = () => {
    if (isEditMode) {
      return (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="cyan">
            🎁 Site Move - Edit Configuration
          </Text>
          <Text>Site: <Text color="green">{config.name}</Text> ({config.cms})</Text>
        </Box>
      );
    }
    return (
      <Box marginBottom={1}>
        <Text bold color="cyan">
          🎁 Site Move - Configuration Wizard
        </Text>
      </Box>
    );
  };

  return (
    <Box flexDirection="column" padding={1}>
      {renderHeader()}
      <Text dimColor>{canGoBack ? 'Press ESC or ← to go back' : 'Press ESC to cancel'}</Text>
      <Text> </Text>
      {renderStep()}
    </Box>
  );
};
