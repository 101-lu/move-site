import React, { FC } from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import type { UploadProgressProps, StatusMessageProps, FileListProps } from '../types/index.js';

export const UploadProgress: FC<UploadProgressProps> = ({ files, currentFile, progress, status }) => {
  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="magenta">
          📤 Uploading Files
        </Text>
      </Box>

      <Box marginBottom={1}>
        <Text>
          Progress: {progress.completed}/{progress.total} files
        </Text>
      </Box>

      {status === 'uploading' && (
        <Box>
          <Text color="green">
            <Spinner type="dots" />
          </Text>
          <Text> Uploading: {currentFile}</Text>
        </Box>
      )}

      {status === 'complete' && (
        <Box>
          <Text color="green">✓ Upload complete!</Text>
        </Box>
      )}

      {status === 'error' && (
        <Box>
          <Text color="red">✗ Error during upload</Text>
        </Box>
      )}
    </Box>
  );
};

const iconMap = {
  info: { icon: 'ℹ', color: 'blue' as const },
  success: { icon: '✓', color: 'green' as const },
  warning: { icon: '⚠', color: 'yellow' as const },
  error: { icon: '✗', color: 'red' as const },
};

export const StatusMessage: FC<StatusMessageProps> = ({ type, message }) => {
  const { icon, color } = iconMap[type] || iconMap.info;

  return (
    <Box>
      <Text color={color}>{icon} </Text>
      <Text>{message}</Text>
    </Box>
  );
};

export const FileList: FC<FileListProps> = ({ files, title }) => {
  return (
    <Box flexDirection="column">
      <Text bold color="cyan">
        {title}
      </Text>
      {files.map((file, index) => (
        <Text key={index} dimColor>
          {' '}
          • {file}
        </Text>
      ))}
    </Box>
  );
};
