import React from 'react';

interface ErrorBoundaryProps {
  fallback?: React.ReactNode;
  onReset?: () => void;
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error.message, info.componentStack);
  }

  handleReset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="min-h-[300px] flex items-center justify-center p-6">
          <div
            className="max-w-sm rounded-lg p-6 text-center space-y-3"
            style={{
              background: 'var(--canvas)',
              border: '1px solid var(--hairline)',
            }}
          >
            <div className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
              页面出错了
            </div>
            <p className="text-sm" style={{ color: 'var(--steel)' }}>
              {this.state.error.message || '未知错误'}
            </p>
            {this.props.onReset && (
              <button
                type="button"
                onClick={this.handleReset}
                className="rounded-full px-4 py-2 text-sm font-medium transition"
                style={{
                  background: 'var(--primary)',
                  color: 'var(--on-primary)',
                }}
              >
                重试
              </button>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
