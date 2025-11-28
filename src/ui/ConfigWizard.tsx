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
  ENV_TYPE: 'env_type',
  SSH_HOST: 'ssh_host',
  SSH_PORT: 'ssh_port',
  SSH_USER: 'ssh_user',
  SSH_AUTH_TYPE: 'ssh_auth_type',
  SSH_PASSWORD: 'ssh_password',
  SSH_KEY_PATH: 'ssh_key_path',
  REMOTE_PATH: 'remote_path',
  LOCAL_PATH: 'local_path',
  DB_HOST: 'db_host',
  DB_NAME: 'db_name',
  DB_USER: 'db_user',
  DB_PASSWORD: 'db_password',
  ADD_ANOTHER: 'add_another',
  CONFIRM: 'confirm',
};

const CMS_OPTIONS: SelectItem<CMSType>[] = [
  { label: 'WordPress', value: 'wordpress' },
  { label: 'Custom / Other', value: 'custom' },
];

const ENV_TYPE_OPTIONS: SelectItem<EnvironmentType>[] = [
  { label: 'Production', value: 'production' },
  { label: 'Staging / Test', value: 'test' },
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
  name: '',
  type: 'test',
  ssh: {
    host: '',
    port: '22',
    user: '',
    authType: 'key',
    password: '',
    keyPath: '~/.ssh/id_rsa',
  },
  remotePath: '',
  database: {
    host: 'localhost',
    name: '',
    user: '',
    password: '',
  },
});

/**
 * Convert an existing EnvironmentConfig to WizardEnvironmentState for editing
 */
const envConfigToState = (type: EnvironmentType, env: EnvironmentConfig): WizardEnvironmentState => ({
  name: '',
  type,
  ssh: {
    host: env.ssh?.host || '',
    port: String(env.ssh?.port || 22),
    user: env.ssh?.user || '',
    authType: env.ssh?.password ? 'password' : 'key',
    password: env.ssh?.password || '',
    keyPath: env.ssh?.keyPath || '~/.ssh/id_rsa',
  },
  remotePath: env.remotePath || '',
  database: {
    host: env.database?.host || 'localhost',
    name: env.database?.name || '',
    user: env.database?.user || '',
    password: env.database?.password || '',
  },
});

export const ConfigWizard: FC<ConfigWizardProps> = ({ existingConfig, onComplete, onCancel }) => {
  const { exit } = useApp();
  const isEditMode = !!existingConfig?.name;
  
  // Determine initial step based on whether we have existing config
  const getInitialStep = (): WizardStep => {
    if (isEditMode) {
      return STEPS.ENV_TYPE; // Skip to environment selection when editing
    }
    return STEPS.CMS_SELECT;
  };

  const [step, setStep] = useState<WizardStep>(getInitialStep());
  const [stepHistory, setStepHistory] = useState<WizardStep[]>([]);
  const [config, setConfig] = useState<SiteConfig>(existingConfig || createDefaultConfig());
  const [currentEnv, setCurrentEnv] = useState<WizardEnvironmentState>(createInitialEnvState());
  const [inputValue, setInputValue] = useState('');
  const [isEditing, setIsEditing] = useState(false); // Track if we're editing an existing env

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
    // Also support left arrow to go back
    if (key.leftArrow && canGoBack) {
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
    const existingEnv = config.environments[envType];
    
    if (existingEnv) {
      // Load existing environment data for editing
      const envState = envConfigToState(envType, existingEnv);
      setCurrentEnv(envState);
      setIsEditing(true);
    } else {
      // New environment
      setCurrentEnv((prev) => ({ ...createInitialEnvState(), type: envType }));
      setIsEditing(false);
    }

    // Skip SSH configuration for local environments
    if (envType === 'local') {
      const path = existingEnv?.remotePath || process.cwd();
      setInputValue(path);
      goToStep(STEPS.LOCAL_PATH);
    } else {
      const host = existingEnv?.ssh?.host || '';
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
      setStep(STEPS.ENV_TYPE);
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
        setInputValue(currentEnv.remotePath);
        goToStep(STEPS.REMOTE_PATH);
        break;

      case STEPS.SSH_KEY_PATH:
        setCurrentEnv((prev) => ({
          ...prev,
          ssh: { ...prev.ssh, keyPath: value || '~/.ssh/id_rsa' },
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
        const finalEnv = {
          ...currentEnv,
          database: { ...currentEnv.database, password: value },
        };
        // Build environment config - SSH is optional for local environments
        const envConfig: any = {
          remotePath: finalEnv.remotePath,
          database: finalEnv.database,
        };
        // Only add SSH config for non-local environments
        if (finalEnv.type !== 'local') {
          envConfig.ssh = {
            host: finalEnv.ssh.host,
            port: parseInt(finalEnv.ssh.port, 10),
            user: finalEnv.ssh.user,
            ...(finalEnv.ssh.authType === 'password'
              ? { password: finalEnv.ssh.password }
              : { keyPath: finalEnv.ssh.keyPath }),
          };
        }
        setConfig((prev) => ({
          ...prev,
          environments: {
            ...prev.environments,
            [currentEnv.type]: envConfig,
          },
        }));
        goToStep(STEPS.ADD_ANOTHER);
        break;
    }
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
  const getEnvTypeOptions = (): SelectItem<EnvironmentType>[] => {
    return ENV_TYPE_OPTIONS.map((opt) => {
      const exists = !!config.environments[opt.value];
      return {
        label: exists ? `${opt.label} ✓` : `${opt.label} (new)`,
        value: opt.value,
      };
    });
  };

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

      case STEPS.ENV_TYPE:
        return (
          <Box flexDirection="column">
            <Text bold color="cyan">
              Select environment to {isEditMode ? 'add or edit' : 'configure'}:
            </Text>
            <Text dimColor>(✓ = existing, will be edited)</Text>
            <Text> </Text>
            <SelectInput items={getEnvTypeOptions()} onSelect={handleEnvTypeSelect} />
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

      case STEPS.ADD_ANOTHER:
        return (
          <Box flexDirection="column">
            <Text color="green">✓ Environment "{currentEnv.type}" {isEditing ? 'updated' : 'added'}!</Text>
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
