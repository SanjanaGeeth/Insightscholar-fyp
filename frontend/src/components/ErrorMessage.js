import React from 'react';

function ErrorMessage({ message, onDismiss }) {
  return (
    <div className="animate-slide-up bg-white border border-red-200 rounded-2xl p-4 shadow-card flex items-start gap-3">
      <div className="flex-shrink-0 w-8 h-8 rounded-xl bg-red-50 flex items-center justify-center">
        <svg className="w-4 h-4 text-accent-coral" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      </div>
      <div className="flex-1">
        <h3 className="text-sm font-semibold text-surface-800">Something went wrong</h3>
        <p className="text-sm text-surface-600 mt-0.5">{message}</p>
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="flex-shrink-0 p-1.5 rounded-lg text-surface-400 hover:text-surface-600 hover:bg-surface-100 transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

export default ErrorMessage;
