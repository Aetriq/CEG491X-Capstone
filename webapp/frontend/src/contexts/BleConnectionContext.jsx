import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { useDialog } from './DialogContext';

const BleConnectionContext = createContext(null);

const SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
const CHAR_CMD_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';
const CHAR_DATA_UUID = '829a287c-03c4-4c22-9442-70b9687c703b';
const CHAR_UPLOAD_UUID = 'ce2e1b12-5883-4903-8120-001004b3410f';

export function BleConnectionProvider({ children }) {
  const { showAlert, showConfirm } = useDialog();

  const deviceRef = useRef(null);
  const cmdCharRef = useRef(null);
  const dataCharRef = useRef(null);
  const uploadCharRef = useRef(null);
  const isConnectedRef = useRef(false);
  const dataHandlerRef = useRef(null);

  const [connectionStatus, setConnectionStatus] = useState('Disconnected (Bluetooth)');
  const [deviceName, setDeviceName] = useState('Not Connected');
  const [isBleSupported, setIsBleSupported] = useState(true);
  const [bleSupportMessage, setBleSupportMessage] = useState('Web Bluetooth is available.');
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const hasBluetoothApi = typeof navigator !== 'undefined' && !!navigator.bluetooth;
    const secureContext = typeof window !== 'undefined' && !!window.isSecureContext;
    const supported = hasBluetoothApi && secureContext;
    setIsBleSupported(supported);
    if (!supported) {
      if (!hasBluetoothApi) {
        setBleSupportMessage(
          'This browser does not support Web Bluetooth (common on Firefox/Safari). Use Chrome or Edge.'
        );
      } else {
        setBleSupportMessage(
          'Web Bluetooth needs a secure context. Open this app on HTTPS or localhost.'
        );
      }
      setConnectionStatus('Unavailable in this browser');
    } else {
      setBleSupportMessage('Web Bluetooth is available in this browser.');
    }
  }, []);

  const stableNotify = useCallback((event) => {
    dataHandlerRef.current?.(event);
  }, []);

  const sendCommand = useCallback(async (cmd) => {
    if (!isConnectedRef.current || !cmdCharRef.current) return;
    const enc = new TextEncoder();
    await cmdCharRef.current.writeValue(enc.encode(cmd));
  }, []);

  const handleGattDisconnected = useCallback(() => {
    const dc = dataCharRef.current;
    if (dc) {
      try {
        dc.removeEventListener('characteristicvaluechanged', stableNotify);
      } catch {
        // ignore
      }
    }
    isConnectedRef.current = false;
    cmdCharRef.current = null;
    dataCharRef.current = null;
    uploadCharRef.current = null;
    deviceRef.current = null;
    setIsConnected(false);
    setConnectionStatus(
      typeof navigator !== 'undefined' && navigator.bluetooth && window.isSecureContext
        ? 'Disconnected (Bluetooth)'
        : 'Unavailable in this browser'
    );
    setDeviceName('Not Connected');
  }, [stableNotify]);

  const connect = useCallback(async () => {
    const hasBluetoothApi = typeof navigator !== 'undefined' && !!navigator.bluetooth;
    const secureContext = typeof window !== 'undefined' && !!window.isSecureContext;
    const bleSupportedInBrowser = hasBluetoothApi && secureContext;

    if (!bleSupportedInBrowser) {
      await showAlert(
        hasBluetoothApi
          ? 'Bluetooth needs HTTPS or localhost in this browser.\n\nPlease reopen this site over a secure origin.'
          : 'Web Bluetooth is not supported in this browser.\n\nPlease use Chrome or Edge.',
        'Bluetooth unavailable'
      );
      return;
    }

    const proceed = await showConfirm(
      'Ready to scan for nearby EchoLog BLE devices?\n\nAfter you confirm, the browser Bluetooth picker will open.',
      {
        title: 'Connect Bluetooth Device',
        confirmText: 'Scan Devices',
        cancelText: 'Cancel'
      }
    );
    if (!proceed) return;

    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [SERVICE_UUID] }]
      });
      device.addEventListener('gattserverdisconnected', handleGattDisconnected);

      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(SERVICE_UUID);
      const cmdChar = await service.getCharacteristic(CHAR_CMD_UUID);
      const dataChar = await service.getCharacteristic(CHAR_DATA_UUID);
      const uploadChar = await service.getCharacteristic(CHAR_UPLOAD_UUID);

      await dataChar.startNotifications();
      dataChar.addEventListener('characteristicvaluechanged', stableNotify);

      deviceRef.current = device;
      cmdCharRef.current = cmdChar;
      dataCharRef.current = dataChar;
      uploadCharRef.current = uploadChar;
      isConnectedRef.current = true;
      setIsConnected(true);
      setConnectionStatus('Connected (Bluetooth)');
      setDeviceName(device?.name || 'Device');

      await sendCommand('ls');
    } catch (error) {
      console.error(error);
      if (error?.name === 'NotFoundError') {
        // user cancelled or no device — quiet
      } else {
        await showAlert(error?.message || String(error), 'Bluetooth');
      }
    }
  }, [handleGattDisconnected, sendCommand, showAlert, showConfirm, stableNotify]);

  const disconnect = useCallback(() => {
    const d = deviceRef.current;
    if (d && d.gatt && d.gatt.connected) {
      d.gatt.disconnect();
    }
  }, []);

  const setDataHandler = useCallback((fn) => {
    dataHandlerRef.current = fn;
  }, []);

  const getUploadCharacteristic = useCallback(() => uploadCharRef.current, []);

  const value = useMemo(
    () => ({
      connectionStatus,
      deviceName,
      isBleSupported,
      bleSupportMessage,
      isConnected,
      connect,
      disconnect,
      sendCommand,
      setDataHandler,
      getUploadCharacteristic
    }),
    [
      bleSupportMessage,
      connect,
      connectionStatus,
      deviceName,
      disconnect,
      getUploadCharacteristic,
      isBleSupported,
      isConnected,
      sendCommand,
      setDataHandler
    ]
  );

  return <BleConnectionContext.Provider value={value}>{children}</BleConnectionContext.Provider>;
}

export function useBle() {
  const ctx = useContext(BleConnectionContext);
  if (!ctx) {
    throw new Error('useBle must be used within BleConnectionProvider');
  }
  return ctx;
}
