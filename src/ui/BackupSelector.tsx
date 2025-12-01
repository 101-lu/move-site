import React, { useState, FC } from 'react';
import { Box, Text, useApp, useInput } from 'ink';

export interface BackupFile {
  name: string;
  size: string;
  fullPath: string;
}

export interface BackupSelectorProps {
  backups: BackupFile[];
  onSelect: (selected: BackupFile[]) => void;
  onCancel: () => void;
  action: 'delete' | 'download';
}

/**
 * Interactive backup selector component
 * Allows multi-select with space, confirm with enter
 */
export const BackupSelector: FC<BackupSelectorProps> = ({ backups, onSelect, onCancel, action }) => {
  const { exit } = useApp();
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [cursorIndex, setCursorIndex] = useState(0);

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }

    if (key.upArrow) {
      setCursorIndex((prev) => (prev > 0 ? prev - 1 : backups.length - 1));
      return;
    }

    if (key.downArrow) {
      setCursorIndex((prev) => (prev < backups.length - 1 ? prev + 1 : 0));
      return;
    }

    // Space to toggle selection
    if (input === ' ') {
      setSelectedIndices((prev) => {
        const newSet = new Set(prev);
        if (newSet.has(cursorIndex)) {
          newSet.delete(cursorIndex);
        } else {
          newSet.add(cursorIndex);
        }
        return newSet;
      });
      return;
    }

    // 'a' to select/deselect all
    if (input === 'a') {
      setSelectedIndices((prev) => {
        if (prev.size === backups.length) {
          return new Set();
        }
        return new Set(backups.map((_, i) => i));
      });
      return;
    }

    // Enter to confirm
    if (key.return) {
      if (selectedIndices.size === 0) {
        onCancel();
      } else {
        const selected = Array.from(selectedIndices).map((i) => backups[i]);
        onSelect(selected);
      }
      return;
    }
  });

  const actionVerb = action === 'delete' ? 'delete' : 'download';
  const actionColor = action === 'delete' ? 'red' : 'green';

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          📦 Select backups to {actionVerb}:
        </Text>
      </Box>
      
      <Text dimColor>
        ↑/↓ Navigate • Space: Toggle • A: Select all • Enter: Confirm • ESC: Cancel
      </Text>
      <Text> </Text>

      {backups.map((backup, index) => {
        const isSelected = selectedIndices.has(index);
        const isCursor = index === cursorIndex;
        
        return (
          <Box key={backup.name}>
            <Text color={isCursor ? 'cyan' : undefined}>
              {isCursor ? '❯ ' : '  '}
            </Text>
            <Text color={isSelected ? actionColor : 'gray'}>
              {isSelected ? '◉' : '○'}
            </Text>
            <Text> </Text>
            <Text color={isSelected ? actionColor : undefined} bold={isSelected}>
              {backup.name}
            </Text>
            <Text dimColor> ({backup.size})</Text>
          </Box>
        );
      })}

      <Text> </Text>
      <Text dimColor>
        {selectedIndices.size} of {backups.length} selected
      </Text>
    </Box>
  );
};
