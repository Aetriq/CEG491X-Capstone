import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

const DialogContext = createContext(null);

export function DialogProvider({ children }) {
  const [dialog, setDialog] = useState(null);

  const closeDialog = useCallback((result = false) => {
    if (dialog?.resolve) {
      dialog.resolve(result);
    }
    setDialog(null);
  }, [dialog]);

  const openDialog = useCallback((config) => {
    return new Promise((resolve) => {
      setDialog({
        title: config.title || 'Notice',
        message: config.message || '',
        variant: config.variant || 'alert',
        confirmText: config.confirmText || 'OK',
        cancelText: config.cancelText || 'Cancel',
        resolve
      });
    });
  }, []);

  const showAlert = useCallback((message, title = 'Notice') => {
    return openDialog({
      title,
      message,
      variant: 'alert',
      confirmText: 'OK'
    });
  }, [openDialog]);

  const showConfirm = useCallback((message, options = {}) => {
    return openDialog({
      title: options.title || 'Please confirm',
      message,
      variant: 'confirm',
      confirmText: options.confirmText || 'Confirm',
      cancelText: options.cancelText || 'Cancel'
    });
  }, [openDialog]);

  const value = useMemo(() => ({ showAlert, showConfirm }), [showAlert, showConfirm]);

  return (
    <DialogContext.Provider value={value}>
      {children}
      {dialog && (
        <div className="app-dialog-overlay" role="dialog" aria-modal="true">
          <div className="app-dialog">
            <h3 className="app-dialog-title">{dialog.title}</h3>
            <div className="app-dialog-message">{dialog.message}</div>
            <div className="app-dialog-actions">
              {dialog.variant === 'confirm' && (
                <button
                  type="button"
                  className="app-dialog-btn app-dialog-btn-cancel"
                  onClick={() => closeDialog(false)}
                >
                  {dialog.cancelText}
                </button>
              )}
              <button
                type="button"
                className="app-dialog-btn app-dialog-btn-confirm"
                onClick={() => closeDialog(true)}
              >
                {dialog.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}

export function useDialog() {
  const ctx = useContext(DialogContext);
  if (!ctx) {
    throw new Error('useDialog must be used within DialogProvider');
  }
  return ctx;
}
