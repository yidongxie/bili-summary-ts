import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';

type TextInputProps = InputHTMLAttributes<HTMLInputElement> & {
  rightSlot?: ReactNode;
};

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.70)',
  border: '1px solid rgba(14,165,233,0.18)',
  color: '#0d2d45',
  borderRadius: '0.625rem',
  padding: '0.55rem 0.75rem',
  fontSize: 13,
  width: '100%',
  outline: 'none',
  minHeight: 42,
};

export function TextInput({ rightSlot, style, className = '', ...props }: TextInputProps) {
  if (rightSlot) {
    return (
      <div className="relative">
        <input className={className} style={{ ...inputStyle, paddingRight: 40, ...style }} {...props} />
        <div className="absolute right-2 top-1/2 -translate-y-1/2">{rightSlot}</div>
      </div>
    );
  }
  return <input className={className} style={{ ...inputStyle, ...style }} {...props} />;
}

export function TextArea({ style, className = '', ...props }: TextAreaProps) {
  return <textarea className={className} style={{ ...inputStyle, minHeight: 96, resize: 'vertical', ...style }} {...props} />;
}
