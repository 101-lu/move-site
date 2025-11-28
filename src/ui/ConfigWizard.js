import React, { useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import { createDefaultConfig } from '../config/index.js';

const { createElement: h } = React;

const STEPS = {
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
  CONFIRM: 'confirm'
};

const CMS_OPTIONS = [
  { label: 'WordPress', value: 'wordpress' },
  { label: 'Custom / Other', value: 'custom' }
];

const ENV_TYPE_OPTIONS = [
  { label: 'Production', value: 'production' },
  { label: 'Staging / Test', value: 'staging' },
  { label: 'Development', value: 'development' },
  { label: 'Local', value: 'local' }
];

const AUTH_TYPE_OPTIONS = [
  { label: 'SSH Key (recommended)', value: 'key' },
  { label: 'Password', value: 'password' }
];

const YES_NO_OPTIONS = [
  { label: 'Yes', value: true },
  { label: 'No', value: false }
];

export function ConfigWizard({ onComplete, onCancel }) {
  const { exit } = useApp();
  const [step, setStep] = useState(STEPS.CMS_SELECT);
  const [config, setConfig] = useState(createDefaultConfig());
  const [currentEnv, setCurrentEnv] = useState({
    name: '',
    type: 'staging',
    ssh: {
      host: '',
      port: '22',
      user: '',
      authType: 'key',
      password: '',
      keyPath: '~/.ssh/id_rsa'
    },
    remotePath: '',
    database: {
      host: 'localhost',
      name: '',
      user: '',
      password: ''
    }
  });
  const [inputValue, setInputValue] = useState('');

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
    }
  });

  const handleCMSSelect = (item) => {
    setConfig(prev => ({ ...prev, cms: item.value }));
    setStep(STEPS.ENV_NAME);
  };

  const handleEnvTypeSelect = (item) => {
    setCurrentEnv(prev => ({ ...prev, type: item.value }));
    setStep(STEPS.SSH_HOST);
  };

  const handleAuthTypeSelect = (item) => {
    setCurrentEnv(prev => ({
      ...prev,
      ssh: { ...prev.ssh, authType: item.value }
    }));
    if (item.value === 'password') {
      setStep(STEPS.SSH_PASSWORD);
    } else {
      setInputValue(currentEnv.ssh.keyPath);
      setStep(STEPS.SSH_KEY_PATH);
    }
  };

  const handleAddAnotherSelect = (item) => {
    if (item.value) {
      // Reset for new environment
      setCurrentEnv({
        name: '',
        type: 'staging',
        ssh: {
          host: '',
          port: '22',
          user: '',
          authType: 'key',
          password: '',
          keyPath: '~/.ssh/id_rsa'
        },
        remotePath: '',
        database: {
          host: 'localhost',
          name: '',
          user: '',
          password: ''
        }
      });
      setInputValue('');
      setStep(STEPS.ENV_NAME);
    } else {
      setStep(STEPS.CONFIRM);
    }
  };

  const handleConfirmSelect = (item) => {
    if (item.value) {
      onComplete(config);
    } else {
      onCancel();
    }
  };

  const handleTextSubmit = (value) => {
    switch (step) {
      case STEPS.ENV_NAME:
        setCurrentEnv(prev => ({ ...prev, name: value }));
        setInputValue('');
        setStep(STEPS.ENV_TYPE);
        break;
      
      case STEPS.SSH_HOST:
        setCurrentEnv(prev => ({
          ...prev,
          ssh: { ...prev.ssh, host: value }
        }));
        setInputValue(currentEnv.ssh.port);
        setStep(STEPS.SSH_PORT);
        break;
      
      case STEPS.SSH_PORT:
        setCurrentEnv(prev => ({
          ...prev,
          ssh: { ...prev.ssh, port: value || '22' }
        }));
        setInputValue('');
        setStep(STEPS.SSH_USER);
        break;
      
      case STEPS.SSH_USER:
        setCurrentEnv(prev => ({
          ...prev,
          ssh: { ...prev.ssh, user: value }
        }));
        setStep(STEPS.SSH_AUTH_TYPE);
        break;
      
      case STEPS.SSH_PASSWORD:
        setCurrentEnv(prev => ({
          ...prev,
          ssh: { ...prev.ssh, password: value }
        }));
        setInputValue('');
        setStep(STEPS.REMOTE_PATH);
        break;
      
      case STEPS.SSH_KEY_PATH:
        setCurrentEnv(prev => ({
          ...prev,
          ssh: { ...prev.ssh, keyPath: value || '~/.ssh/id_rsa' }
        }));
        setInputValue('');
        setStep(STEPS.REMOTE_PATH);
        break;
      
      case STEPS.REMOTE_PATH:
        setCurrentEnv(prev => ({ ...prev, remotePath: value }));
        setInputValue('localhost');
        setStep(STEPS.DB_HOST);
        break;
      
      case STEPS.DB_HOST:
        setCurrentEnv(prev => ({
          ...prev,
          database: { ...prev.database, host: value || 'localhost' }
        }));
        setInputValue('');
        setStep(STEPS.DB_NAME);
        break;
      
      case STEPS.DB_NAME:
        setCurrentEnv(prev => ({
          ...prev,
          database: { ...prev.database, name: value }
        }));
        setInputValue('');
        setStep(STEPS.DB_USER);
        break;
      
      case STEPS.DB_USER:
        setCurrentEnv(prev => ({
          ...prev,
          database: { ...prev.database, user: value }
        }));
        setInputValue('');
        setStep(STEPS.DB_PASSWORD);
        break;
      
      case STEPS.DB_PASSWORD:
        const finalEnv = {
          ...currentEnv,
          database: { ...currentEnv.database, password: value }
        };
        // Save environment to config
        setConfig(prev => ({
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
                  : { keyPath: finalEnv.ssh.keyPath }
                )
              },
              remotePath: finalEnv.remotePath,
              database: finalEnv.database
            }
          }
        }));
        setStep(STEPS.ADD_ANOTHER);
        break;
    }
  };

  const renderTextInput = (label, placeholder = '') => {
    return h(Box, { flexDirection: 'column' },
      h(Text, { bold: true, color: 'cyan' }, label),
      h(Box, null,
        h(Text, { color: 'green' }, '❯ '),
        h(TextInput, {
          value: inputValue,
          onChange: setInputValue,
          onSubmit: handleTextSubmit,
          placeholder: placeholder
        })
      )
    );
  };

  const renderPasswordInput = (label) => {
    return h(Box, { flexDirection: 'column' },
      h(Text, { bold: true, color: 'cyan' }, label),
      h(Box, null,
        h(Text, { color: 'green' }, '❯ '),
        h(TextInput, {
          value: inputValue,
          onChange: setInputValue,
          onSubmit: handleTextSubmit,
          mask: '*'
        })
      )
    );
  };

  const renderStep = () => {
    switch (step) {
      case STEPS.CMS_SELECT:
        return h(Box, { flexDirection: 'column' },
          h(Text, { bold: true, color: 'cyan' }, 'Select your CMS:'),
          h(SelectInput, { items: CMS_OPTIONS, onSelect: handleCMSSelect })
        );
      
      case STEPS.ENV_NAME:
        return renderTextInput('Environment name (e.g., production, staging, test):');
      
      case STEPS.ENV_TYPE:
        return h(Box, { flexDirection: 'column' },
          h(Text, { bold: true, color: 'cyan' }, `Environment type for "${currentEnv.name}":`),
          h(SelectInput, { items: ENV_TYPE_OPTIONS, onSelect: handleEnvTypeSelect })
        );
      
      case STEPS.SSH_HOST:
        return renderTextInput('SSH Host (e.g., example.com or 192.168.1.100):');
      
      case STEPS.SSH_PORT:
        return renderTextInput('SSH Port (default: 22):', '22');
      
      case STEPS.SSH_USER:
        return renderTextInput('SSH Username:');
      
      case STEPS.SSH_AUTH_TYPE:
        return h(Box, { flexDirection: 'column' },
          h(Text, { bold: true, color: 'cyan' }, 'Authentication method:'),
          h(SelectInput, { items: AUTH_TYPE_OPTIONS, onSelect: handleAuthTypeSelect })
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
        return h(Box, { flexDirection: 'column' },
          h(Text, { color: 'green' }, `✓ Environment "${currentEnv.name}" added!`),
          h(Text, null, ' '),
          h(Text, { bold: true, color: 'cyan' }, 'Add another environment?'),
          h(SelectInput, { items: YES_NO_OPTIONS, onSelect: handleAddAnotherSelect })
        );
      
      case STEPS.CONFIRM:
        return h(Box, { flexDirection: 'column' },
          h(Text, { bold: true, color: 'cyan' }, 'Configuration Summary:'),
          h(Text, null, `CMS: ${config.cms}`),
          h(Text, null, `Environments: ${Object.keys(config.environments).join(', ')}`),
          h(Text, null, ' '),
          h(Text, { bold: true, color: 'cyan' }, 'Save this configuration?'),
          h(SelectInput, { items: YES_NO_OPTIONS, onSelect: handleConfirmSelect })
        );
      
      default:
        return h(Text, null, 'Unknown step');
    }
  };

  return h(Box, { flexDirection: 'column', padding: 1 },
    h(Box, { marginBottom: 1 },
      h(Text, { bold: true, color: 'magenta' }, '🚀 Site Move - Configuration Wizard')
    ),
    h(Text, { dimColor: true }, 'Press ESC to cancel'),
    h(Text, null, ' '),
    renderStep()
  );
}
