import React, { type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';

type TextInputProps = InputHTMLAttributes<HTMLInputElement> & {
  rightSlot?: ReactNode;
};

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

const inputStyle: React.CSSProperties = {
  background: 'var(--canvas)',
  border: '1px solid var(--hairline)',
  color: 'var(--ink)',
  borderRadius: 8,
  padding: '0.7rem 0.875rem',
  fontSize: 14,
  lineHeight: 1.5,
  width: '100%',
  outline: 'none',
  minHeight: 40,
};

export const TextInput = React.memo(function TextInput({ rightSlot, style, className = '', ...props }: TextInputProps) {
  if (rightSlot) {
    return (
      <div className="relative">
        <input className={className} style={{ ...inputStyle, paddingRight: 40, ...style }} {...props} />
        <div className="absolute right-2 top-1/2 -translate-y-1/2">{rightSlot}</div>
      </div>
    );
  }
  return <input className={className} style={{ ...inputStyle, ...style }} {...props} />;
});

export const TextArea = React.memo(function TextArea({ style, className = '', ...props }: TextAreaProps) {
  return <textarea className={className} style={{ ...inputStyle, minHeight: 96, resize: 'vertical', ...style }} {...props} />;
});
