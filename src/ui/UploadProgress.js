import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';

const { createElement: h } = React;

export function UploadProgress({ files, currentFile, progress, status }) {
  return h(Box, { flexDirection: 'column', padding: 1 },
    h(Box, { marginBottom: 1 },
      h(Text, { bold: true, color: 'magenta' }, '📤 Uploading Files')
    ),
    
    h(Box, { marginBottom: 1 },
      h(Text, null, `Progress: ${progress.completed}/${progress.total} files`)
    ),
    
    status === 'uploading' && h(Box, null,
      h(Text, { color: 'green' },
        h(Spinner, { type: 'dots' })
      ),
      h(Text, null, ` Uploading: ${currentFile}`)
    ),
    
    status === 'complete' && h(Box, null,
      h(Text, { color: 'green' }, '✓ Upload complete!')
    ),
    
    status === 'error' && h(Box, null,
      h(Text, { color: 'red' }, '✗ Error during upload')
    )
  );
}

export function StatusMessage({ type, message }) {
  const icons = {
    info: { icon: 'ℹ', color: 'blue' },
    success: { icon: '✓', color: 'green' },
    warning: { icon: '⚠', color: 'yellow' },
    error: { icon: '✗', color: 'red' }
  };
  
  const { icon, color } = icons[type] || icons.info;
  
  return h(Box, null,
    h(Text, { color }, `${icon} `),
    h(Text, null, message)
  );
}

export function FileList({ files, title }) {
  return h(Box, { flexDirection: 'column' },
    h(Text, { bold: true, color: 'cyan' }, title),
    ...files.map((file, index) =>
      h(Text, { key: index, dimColor: true }, `  • ${file}`)
    )
  );
}
