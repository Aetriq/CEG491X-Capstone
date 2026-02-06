// frontend/src/hooks/useBluetooth.ts
// UPDATED: Moved import to top to fix ESLint import/first error
import { useState, useCallback, useEffect, useRef } from 'react';

// UPDATED: Added Web Bluetooth API type declarations to fix TypeScript errors
// These types are not included in the standard TypeScript DOM lib, so we declare them here

// Web Bluetooth API Type Declarations
declare global {
  interface BluetoothRemoteGATTServer {
    connected: boolean;
    connect(): Promise<BluetoothRemoteGATTServer>;
    disconnect(): void;
    getPrimaryService(service: BluetoothServiceUUID): Promise<BluetoothRemoteGATTService>;
  }

  interface BluetoothRemoteGATTService {
    uuid: string;
    getCharacteristic(characteristic: BluetoothCharacteristicUUID): Promise<BluetoothRemoteGATTCharacteristic>;
  }

  interface BluetoothRemoteGATTCharacteristic {
    uuid: string;
    value?: DataView;
    writeValue(value: BufferSource): Promise<void>;
    startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
    addEventListener(type: 'characteristicvaluechanged', listener: (event: Event) => void): void;
  }

  interface BluetoothDevice {
    id: string;
    name?: string;
    gatt?: BluetoothRemoteGATTServer;
    addEventListener(type: 'gattserverdisconnected', listener: () => void): void;
  }

  interface Navigator {
    bluetooth: {
      requestDevice(options?: RequestDeviceOptions): Promise<BluetoothDevice>;
    };
  }

  interface RequestDeviceOptions {
    filters?: BluetoothLEScanFilter[];
    optionalServices?: BluetoothServiceUUID[];
  }

  interface BluetoothLEScanFilter {
    services?: BluetoothServiceUUID[];
  }

  type BluetoothServiceUUID = string | number;
  type BluetoothCharacteristicUUID = string | number;
}

// UPDATED: Added 'uploading' and 'downloading' to FileTransferProgress status type

// Bluetooth UUIDs for EchoLog device
const ECHOLOG_SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
const COMMAND_CHARACTERISTIC_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';
const DATA_CHARACTERISTIC_UUID = '829a287c-03c4-4c22-9442-70b9687c703b';
const UPLOAD_CHARACTERISTIC_UUID = 'ce2e1b12-5883-4903-8120-001004b3410f';

interface BluetoothDevice {
  id: string;
  name: string;
  gatt?: BluetoothRemoteGATTServer;
}

// UPDATED: Added 'uploading' and 'downloading' to status type
interface FileTransferProgress {
  isTransferring: boolean;
  progress: number;
  totalBytes: number;
  transferredBytes: number;
  speed: number;
  filename?: string;
  status: 'idle' | 'connecting' | 'transferring' | 'uploading' | 'downloading' | 'completed' | 'error';
}

interface UseBluetoothReturn {
  device: BluetoothDevice | null;
  isConnected: boolean;
  isScanning: boolean;
  error: string | null;
  fileTransferProgress: FileTransferProgress;
  isBluetoothSupported: boolean;
  availableDevices: BluetoothDevice[];
  scanForDevices: () => Promise<BluetoothDevice[]>;
  connectToDevice: (deviceId: string) => Promise<boolean>;
  disconnectDevice: () => Promise<void>;
  sendCommand: (command: string) => Promise<string>;
  uploadFile: (file: File) => Promise<{ success: boolean; bytesTransferred: number }>;
  downloadFile: (filename: string) => Promise<Blob>;
  listFiles: () => Promise<string[]>;
  getDeviceInfo: () => Promise<any>;
}

export const useBluetooth = (): UseBluetoothReturn => {
  const [device, setDevice] = useState<BluetoothDevice | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableDevices, setAvailableDevices] = useState<BluetoothDevice[]>([]);
  const [fileTransferProgress, setFileTransferProgress] = useState<FileTransferProgress>({
    isTransferring: false,
    progress: 0,
    totalBytes: 0,
    transferredBytes: 0,
    speed: 0,
    status: 'idle'
  });

  // Refs for Bluetooth characteristics
  const commandCharacteristicRef = useRef<BluetoothRemoteGATTCharacteristic | null>(null);
  const dataCharacteristicRef = useRef<BluetoothRemoteGATTCharacteristic | null>(null);
  const uploadCharacteristicRef = useRef<BluetoothRemoteGATTCharacteristic | null>(null);
  const serviceRef = useRef<BluetoothRemoteGATTService | null>(null);
  const serverRef = useRef<BluetoothRemoteGATTServer | null>(null);

  // Check if Web Bluetooth is supported
  const isBluetoothSupported = typeof navigator !== 'undefined' && 'bluetooth' in navigator;

  // Scan for available Bluetooth devices
  const scanForDevices = useCallback(async (): Promise<BluetoothDevice[]> => {
    if (!isBluetoothSupported) {
      setError('Web Bluetooth is not supported in your browser. Please use Chrome, Edge, or Opera.');
      return [];
    }

    setIsScanning(true);
    setError(null);

    try {
      // Request Bluetooth device with EchoLog service
      const bluetoothDevice = await navigator.bluetooth.requestDevice({
        filters: [{ services: [ECHOLOG_SERVICE_UUID] }],
        optionalServices: [ECHOLOG_SERVICE_UUID]
      });

      const newDevice: BluetoothDevice = {
        id: bluetoothDevice.id,
        name: bluetoothDevice.name || 'Unknown Device'
      };

      // Update available devices
      setAvailableDevices(prev => {
        const exists = prev.some(d => d.id === newDevice.id);
        return exists ? prev : [...prev, newDevice];
      });

      return [newDevice];
    } catch (err: any) {
      if (err.name === 'NotFoundError') {
        setError('No Bluetooth devices found with EchoLog service.');
      } else if (err.name === 'SecurityError') {
        setError('Bluetooth permission denied. Please allow Bluetooth access.');
      } else if (err.name === 'NotAllowedError') {
        setError('Bluetooth access was cancelled.');
      } else {
        setError(`Bluetooth scan failed: ${err.message}`);
      }
      return [];
    } finally {
      setIsScanning(false);
    }
  }, [isBluetoothSupported]);

  // Connect to a specific device
  const connectToDevice = useCallback(async (deviceId: string): Promise<boolean> => {
    if (!isBluetoothSupported) {
      setError('Web Bluetooth not supported');
      return false;
    }

    setFileTransferProgress(prev => ({ ...prev, status: 'connecting' }));
    setError(null);

    try {
      // Find the device by ID
      const deviceToConnect = availableDevices.find(d => d.id === deviceId);
      if (!deviceToConnect) {
        setError('Device not found');
        return false;
      }

      // Request the device again to get the BluetoothDevice object
      const bluetoothDevice = await navigator.bluetooth.requestDevice({
        filters: [{ services: [ECHOLOG_SERVICE_UUID] }],
        optionalServices: [ECHOLOG_SERVICE_UUID]
      });

      // Connect to GATT Server
      const server = await bluetoothDevice.gatt?.connect();
      if (!server) {
        throw new Error('Failed to connect to GATT server');
      }

      serverRef.current = server;

      // Get the EchoLog service
      const service = await server.getPrimaryService(ECHOLOG_SERVICE_UUID);
      serviceRef.current = service;

      // Get characteristics
      commandCharacteristicRef.current = await service.getCharacteristic(COMMAND_CHARACTERISTIC_UUID);
      dataCharacteristicRef.current = await service.getCharacteristic(DATA_CHARACTERISTIC_UUID);
      uploadCharacteristicRef.current = await service.getCharacteristic(UPLOAD_CHARACTERISTIC_UUID);

      // Start notifications for data characteristic
      await dataCharacteristicRef.current.startNotifications();
      
      // Set up event listener for incoming data
      dataCharacteristicRef.current.addEventListener('characteristicvaluechanged', handleIncomingData);

      // Update device state
      const connectedDevice: BluetoothDevice = {
        id: bluetoothDevice.id,
        name: bluetoothDevice.name || 'EchoLog Device',
        gatt: server
      };

      setDevice(connectedDevice);
      setIsConnected(true);
      setFileTransferProgress(prev => ({ ...prev, status: 'idle' }));

      // Set up disconnect handler
      bluetoothDevice.addEventListener('gattserverdisconnected', handleDisconnect);

      return true;
    } catch (err: any) {
      setError(`Connection failed: ${err.message}`);
      setFileTransferProgress(prev => ({ ...prev, status: 'error' }));
      return false;
    }
  }, [isBluetoothSupported, availableDevices]);

  // Handle incoming data from device
  const handleIncomingData = useCallback((event: Event) => {
    // UPDATED: Fixed TypeScript casting error by using 'unknown' intermediate type
    const characteristic = event.target as unknown as BluetoothRemoteGATTCharacteristic;
    const value = characteristic.value;
    
    if (value) {
      const decoder = new TextDecoder();
      const data = decoder.decode(value);
      
      console.log('Received data:', data);
      
      // Process different types of incoming data
      if (data.startsWith('FILE:')) {
        // File data received
        const parts = data.split(':');
        if (parts.length >= 3) {
          const filename = parts[1];
          const size = parseInt(parts[2]);
          
          setFileTransferProgress(prev => ({
            ...prev,
            filename,
            totalBytes: size
          }));
        }
      } else if (data.startsWith('PROGRESS:')) {
        // Progress update
        const progress = parseInt(data.split(':')[1]);
        setFileTransferProgress(prev => ({
          ...prev,
          progress,
          transferredBytes: Math.floor((progress / 100) * prev.totalBytes)
        }));
      }
    }
  }, []);

  // Handle disconnection
  const handleDisconnect = useCallback(() => {
    setIsConnected(false);
    setDevice(null);
    setError('Device disconnected');
    
    // Clean up characteristics
    commandCharacteristicRef.current = null;
    dataCharacteristicRef.current = null;
    uploadCharacteristicRef.current = null;
    serviceRef.current = null;
    serverRef.current = null;
    
    setFileTransferProgress({
      isTransferring: false,
      progress: 0,
      totalBytes: 0,
      transferredBytes: 0,
      speed: 0,
      status: 'idle'
    });
  }, []);

  // Disconnect from device
  const disconnectDevice = useCallback(async () => {
    if (device?.gatt?.connected) {
      device.gatt.disconnect();
    }
    handleDisconnect();
  }, [device, handleDisconnect]);

  // Send command to device
  const sendCommand = useCallback(async (command: string): Promise<string> => {
    if (!isConnected || !commandCharacteristicRef.current) {
      throw new Error('Not connected to device');
    }

    try {
      const encoder = new TextEncoder();
      const commandData = encoder.encode(command);
      await commandCharacteristicRef.current.writeValue(commandData);
      
      return `Command "${command}" sent successfully`;
    } catch (err: any) {
      throw new Error(`Failed to send command: ${err.message}`);
    }
  }, [isConnected]);

  // Upload file to device
  const uploadFile = useCallback(async (file: File): Promise<{ success: boolean; bytesTransferred: number }> => {
    if (!isConnected || !uploadCharacteristicRef.current) {
      throw new Error('Not connected to device');
    }

    // UPDATED: Set status to 'uploading' instead of 'transferring'
    setFileTransferProgress({
      isTransferring: true,
      progress: 0,
      totalBytes: file.size,
      transferredBytes: 0,
      speed: 0,
      filename: file.name,
      status: 'uploading'
    });

    const startTime = Date.now();
    const chunkSize = 512; // Bytes per chunk
    const fileBuffer = await file.arrayBuffer();
    const totalBytes = fileBuffer.byteLength;
    let offset = 0;

    try {
      // Send start upload command
      await sendCommand(`UPLOAD:${file.name}:${totalBytes}`);

      // Upload file in chunks
      while (offset < totalBytes) {
        const end = Math.min(offset + chunkSize, totalBytes);
        const chunk = new Uint8Array(fileBuffer.slice(offset, end));
        
        await uploadCharacteristicRef.current!.writeValue(chunk);
        offset += chunk.length;

        // Calculate progress
        const elapsed = (Date.now() - startTime) / 1000;
        const speed = offset / elapsed;
        const progress = (offset / totalBytes) * 100;

        setFileTransferProgress(prev => ({
          ...prev,
          progress,
          transferredBytes: offset,
          speed
        }));

        // Small delay to prevent overwhelming the device
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Send end upload command
      await sendCommand('UPLOAD_COMPLETE');

      setFileTransferProgress(prev => ({
        ...prev,
        isTransferring: false,
        status: 'completed'
      }));

      return { success: true, bytesTransferred: offset };
    } catch (err: any) {
      setFileTransferProgress(prev => ({
        ...prev,
        isTransferring: false,
        status: 'error'
      }));
      throw new Error(`Upload failed: ${err.message}`);
    }
  }, [isConnected, sendCommand]);

  // Download file from device
  const downloadFile = useCallback(async (filename: string): Promise<Blob> => {
    if (!isConnected) {
      throw new Error('Not connected to device');
    }

    // UPDATED: Set status to 'downloading' instead of 'transferring'
    setFileTransferProgress({
      isTransferring: true,
      progress: 0,
      totalBytes: 0,
      transferredBytes: 0,
      speed: 0,
      filename,
      status: 'downloading'
    });

    try {
      // Request file download
      await sendCommand(`DOWNLOAD:${filename}`);

      // Wait for file data (in real implementation, you'd collect data chunks)
      // For now, simulate download
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Simulate progress
      for (let i = 0; i <= 100; i += 10) {
        setFileTransferProgress(prev => ({
          ...prev,
          progress: i,
          totalBytes: 1024 * 1024, // 1MB
          transferredBytes: Math.floor((i / 100) * 1024 * 1024)
        }));
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      setFileTransferProgress(prev => ({
        ...prev,
        isTransferring: false,
        status: 'completed'
      }));

      // Return mock file
      return new Blob([`Mock download of ${filename}`], { type: 'application/octet-stream' });
    } catch (err: any) {
      setFileTransferProgress(prev => ({
        ...prev,
        isTransferring: false,
        status: 'error'
      }));
      throw new Error(`Download failed: ${err.message}`);
    }
  }, [isConnected, sendCommand]);

  // List files on device
  const listFiles = useCallback(async (): Promise<string[]> => {
    if (!isConnected) {
      throw new Error('Not connected to device');
    }

    try {
      await sendCommand('LIST_FILES');
      
      // In real implementation, you'd parse the response
      // For now, return mock files
      return [
        'recording_2024_01_15_08_30.wav',
        'recording_2024_01_15_09_45.wav',
        'recording_2024_01_15_11_20.wav',
        'recording_2024_01_15_14_15.wav',
        'recording_2024_01_15_16_40.wav'
      ];
    } catch (err: any) {
      throw new Error(`Failed to list files: ${err.message}`);
    }
  }, [isConnected, sendCommand]);

  // Get device information
  const getDeviceInfo = useCallback(async (): Promise<any> => {
    if (!isConnected) {
      throw new Error('Not connected to device');
    }

    try {
      await sendCommand('DEVICE_INFO');
      
      // Return mock device info
      return {
        id: 'ECHLG-01',
        name: 'EchoLog Device v2.0',
        firmware: 'v1.2.4',
        battery: 87,
        storage: {
          total: 16 * 1024 * 1024 * 1024, // 16GB
          used: 2.1 * 1024 * 1024 * 1024, // 2.1GB
          free: 13.9 * 1024 * 1024 * 1024 // 13.9GB
        },
        connection: 'Bluetooth',
        signalStrength: -45 // dBm
      };
    } catch (err: any) {
      throw new Error(`Failed to get device info: ${err.message}`);
    }
  }, [isConnected, sendCommand]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (device?.gatt?.connected) {
        disconnectDevice();
      }
    };
  }, [device, disconnectDevice]);

  return {
    device,
    isConnected,
    isScanning,
    error,
    fileTransferProgress,
    isBluetoothSupported,
    availableDevices,
    scanForDevices,
    connectToDevice,
    disconnectDevice,
    sendCommand,
    uploadFile,
    downloadFile,
    listFiles,
    getDeviceInfo
  };
};