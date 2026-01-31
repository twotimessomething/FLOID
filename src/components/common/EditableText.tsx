import { useState, useRef, useEffect, useCallback } from 'react';

interface EditableTextProps {
  readonly value: string;
  readonly onSave: (newValue: string) => void;
  readonly className?: string;
  readonly inputClassName?: string;
}

export function EditableText({
  value,
  onSave,
  className = '',
  inputClassName = '',
}: EditableTextProps): JSX.Element {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    setEditValue(value);
  }, [value]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsEditing(true);
  }, []);

  const handleSave = useCallback(() => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== value) {
      onSave(trimmed);
    } else {
      setEditValue(value);
    }
    setIsEditing(false);
  }, [editValue, value, onSave]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSave();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setEditValue(value);
        setIsEditing(false);
      }
    },
    [handleSave, value]
  );

  const handleBlur = useCallback(() => {
    handleSave();
  }, [handleSave]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setEditValue(e.target.value);
  }, []);

  // Stop all mouse events when editing to prevent parent drag handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={editValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        onMouseDown={handleMouseDown}
        onClick={handleClick}
        className={`bg-white/90 rounded px-1 text-xs outline-none focus:ring-1 focus:ring-blue-400 ${inputClassName}`}
      />
    );
  }

  return (
    <span
      onDoubleClick={handleDoubleClick}
      onMouseDown={handleMouseDown}
      className={`cursor-text ${className}`}
      title="Double-click to edit"
    >
      {value}
    </span>
  );
}
