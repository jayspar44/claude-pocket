import { createContext, useContext } from 'react';
import { useInstance } from './InstanceContext';

const RelayContext = createContext(null);

export function RelayProvider({ children }) {
  // Delegate everything to InstanceContext
  // This maintains backward compatibility with existing components
  const instance = useInstance();

  // Map instance methods to relay-compatible API
  const value = {
    // Connection state
    connectionState: instance.connectionState,
    ptyStatus: instance.ptyStatus,
    error: instance.error,
    ptyError: instance.ptyError,
    detectedOptions: instance.detectedOptions,
    isConnected: instance.isConnected,
    isReconnecting: instance.isReconnecting,
    activeInstance: instance.activeInstance,
    activeInstanceId: instance.activeInstanceId,

    // Connection actions
    connect: instance.connect,
    disconnect: instance.disconnect,
    send: instance.send,
    sendInput: instance.sendInput,
    sendResize: instance.sendResize,
    sendInterrupt: instance.sendInterrupt,
    restartPty: instance.restartPty,
    requestReplay: instance.requestReplay,
    submitInput: instance.submitInput,
    clearDetectedOptions: instance.clearDetectedOptions,
    addMessageListener: instance.addMessageListener,

    // Instance-specific actions (for proper multi-instance routing)
    addInstanceMessageListener: instance.addInstanceMessageListener,
    sendToInstance: instance.sendToInstance,

    // URL management (for backward compatibility)
    getRelayUrl: instance.getRelayUrl,
    setRelayUrl: instance.setRelayUrl,
  };

  return (
    <RelayContext.Provider value={value}>
      {children}
    </RelayContext.Provider>
  );
}

export function useRelay() {
  const context = useContext(RelayContext);
  if (!context) {
    throw new Error('useRelay must be used within a RelayProvider');
  }
  return context;
}

export default RelayContext;
