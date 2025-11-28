import React, { useState, FC } from 'react';
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
} from '../types/index.js';

const STEPS: Record<string, WizardStep> = {
  CMS_SELECT: 'cms_select',
  ENV_NAME: 'env_name',
  ENV_TYPE: 'env_type',
  SSH_HOST: 'ssh_host',
  SSH_PORT: 'ssh_port',
  SSH_USER: 'ssh_user',
  SSH_AUTH_TYPE: 'ssh_auth_type',
  SSH_PASSWORD: 'ssh_password',
  SSH_KEY_PATH: 'ssh_key_path',
  REMOTE_PATH: 'remote_path',
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
  { label: 'Staging / Test', value: 'staging' },
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
  type: 'staging',
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

export const ConfigWizard: FC<ConfigWizardProps> = ({ onComplete, onCancel }) => {
  const { exit } = useApp();
  const [step, setStep] = useState<WizardStep>(STEPS.CMS_SELECT);
  const [config, setConfig] = useState<SiteConfig>(createDefaultConfig());
  const [currentEnv, setCurrentEnv] = useState<WizardEnvironmentState>(createInitialEnvState());
  const [inputValue, setInputValue] = useState('');

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
    }
  });

  const handleCMSSelect = (item: SelectItem<CMSType>) => {
    setConfig((prev) => ({ ...prev, cms: item.value }));
    setStep(STEPS.ENV_NAME);
  };

  const handleEnvTypeSelect = (item: SelectItem<EnvironmentType>) => {
    setCurrentEnv((prev) => ({ ...prev, type: item.value }));
    setStep(STEPS.SSH_HOST);
  };

  const handleAuthTypeSelect = (item: SelectItem<'key' | 'password'>) => {
    setCurrentEnv((prev) => ({
      ...prev,
      ssh: { ...prev.ssh, authType: item.value },
    }));
    if (item.value === 'password') {
      setStep(STEPS.SSH_PASSWORD);
    } else {
      setInputValue(currentEnv.ssh.keyPath);
      setStep(STEPS.SSH_KEY_PATH);
    }
  };

  const handleAddAnotherSelect = (item: SelectItem<boolean>) => {
    if (item.value) {
      setCurrentEnv(createInitialEnvState());
      setInputValue('');
      setStep(STEPS.ENV_NAME);
    } else {
      setStep(STEPS.CONFIRM);
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
      case STEPS.ENV_NAME:
        setCurrentEnv((prev) => ({ ...prev, name: value }));
        setInputValue('');
        setStep(STEPS.ENV_TYPE);
        break;

      case STEPS.SSH_HOST:
        setCurrentEnv((prev) => ({
          ...prev,
          ssh: { ...prev.ssh, host: value },
        }));
        setInputValue(currentEnv.ssh.port);
        setStep(STEPS.SSH_PORT);
        break;

      case STEPS.SSH_PORT:
        setCurrentEnv((prev) => ({
          ...prev,
          ssh: { ...prev.ssh, port: value || '22' },
        }));
        setInputValue('');
        setStep(STEPS.SSH_USER);
        break;

      case STEPS.SSH_USER:
        setCurrentEnv((prev) => ({
          ...prev,
          ssh: { ...prev.ssh, user: value },
        }));
        setStep(STEPS.SSH_AUTH_TYPE);
        break;

      case STEPS.SSH_PASSWORD:
        setCurrentEnv((prev) => ({
          ...prev,
          ssh: { ...prev.ssh, password: value },
        }));
        setInputValue('');
        setStep(STEPS.REMOTE_PATH);
        break;

      case STEPS.SSH_KEY_PATH:
        setCurrentEnv((prev) => ({
          ...prev,
          ssh: { ...prev.ssh, keyPath: value || '~/.ssh/id_rsa' },
        }));
        setInputValue('');
        setStep(STEPS.REMOTE_PATH);
        break;

      case STEPS.REMOTE_PATH:
        setCurrentEnv((prev) => ({ ...prev, remotePath: value }));
        setInputValue('localhost');
        setStep(STEPS.DB_HOST);
        break;

      case STEPS.DB_HOST:
        setCurrentEnv((prev) => ({
          ...prev,
          database: { ...prev.database, host: value || 'localhost' },
        }));
        setInputValue('');
        setStep(STEPS.DB_NAME);
        break;

      case STEPS.DB_NAME:
        setCurrentEnv((prev) => ({
          ...prev,
          database: { ...prev.database, name: value },
        }));
        setInputValue('');
        setStep(STEPS.DB_USER);
        break;

      case STEPS.DB_USER:
        setCurrentEnv((prev) => ({
          ...prev,
          database: { ...prev.database, user: value },
        }));
        setInputValue('');
        setStep(STEPS.DB_PASSWORD);
        break;

      case STEPS.DB_PASSWORD:
        const finalEnv = {
          ...currentEnv,
          database: { ...currentEnv.database, password: value },
        };
        setConfig((prev) => ({
          ...prev,
          environments: {
            ...prev.environments,
            [currentEnv.name]: {
              type: finalEnv.type,
              ssh: {
                host: finalEnv.ssh.host,
                port: parseInt(finalEnv.ssh.port, 10),
                user: finalEnv.ssh.user,
                ...(finalEnv.ssh.authType === 'password'
                  ? { password: finalEnv.ssh.password }
                  : { keyPath: finalEnv.ssh.keyPath }),
              },
              remotePath: finalEnv.remotePath,
              database: finalEnv.database,
            },
          },
        }));
        setStep(STEPS.ADD_ANOTHER);
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

      case STEPS.ENV_NAME:
        return renderTextInput('Environment name (e.g., production, staging, test):');

      case STEPS.ENV_TYPE:
        return (
          <Box flexDirection="column">
            <Text bold color="cyan">
              Environment type for "{currentEnv.name}":
            </Text>
            <SelectInput items={ENV_TYPE_OPTIONS} onSelect={handleEnvTypeSelect} />
          </Box>
        );

      case STEPS.SSH_HOST:
        return renderTextInput('SSH Host (e.g., example.com or 192.168.1.100):');

      case STEPS.SSH_PORT:
        return renderTextInput('SSH Port (default: 22):', '22');

      case STEPS.SSH_USER:
        return renderTextInput('SSH Username:');

      case STEPS.SSH_AUTH_TYPE:
        return (
          <Box flexDirection="column">
            <Text bold color="cyan">
              Authentication method:
            </Text>
            <SelectInput items={AUTH_TYPE_OPTIONS} onSelect={handleAuthTypeSelect} />
          </Box>
        );

      case STEPS.SSH_PASSWORD:
        return renderPasswordInput('SSH Password:');

      case STEPS.SSH_KEY_PATH:
        return renderTextInput('Path to SSH key (default: ~/.ssh/id_rsa):', '~/.ssh/id_rsa');

      case STEPS.REMOTE_PATH:
        return renderTextInput('Remote path to website (e.g., /var/www/html):');

      case STEPS.DB_HOST:
        return renderTextInput('Database host (default: localhost):', 'localhost');

      case STEPS.DB_NAME:
        return renderTextInput('Database name:');

      case STEPS.DB_USER:
        return renderTextInput('Database username:');

      case STEPS.DB_PASSWORD:
        return renderPasswordInput('Database password:');

      case STEPS.ADD_ANOTHER:
        return (
          <Box flexDirection="column">
            <Text color="green">✓ Environment "{currentEnv.name}" added!</Text>
            <Text> </Text>
            <Text bold color="cyan">
              Add another environment?
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
            <Text>CMS: {config.cms}</Text>
            <Text>Environments: {Object.keys(config.environments).join(', ')}</Text>
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

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="magenta">
          🚀 Site Move - Configuration Wizard
        </Text>
      </Box>
      <Text dimColor>Press ESC to cancel</Text>
      <Text> </Text>
      {renderStep()}
    </Box>
  );
};
