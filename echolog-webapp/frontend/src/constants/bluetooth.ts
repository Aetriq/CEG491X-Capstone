// echolog-webapp/frontend/src/constants/bluetooth.ts
// Bluetooth UUIDs for EchoLog device
export const ECHOLOG_SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
export const COMMAND_CHARACTERISTIC_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';
export const DATA_CHARACTERISTIC_UUID = '829a287c-03c4-4c22-9442-70b9687c703b';
export const UPLOAD_CHARACTERISTIC_UUID = 'ce2e1b12-5883-4903-8120-001004b3410f';

// Types
export interface BluetoothDevice {
  id: string;
  name: string;
  gatt?: BluetoothRemoteGATTServer;
}

export interface FileTransferProgress {
  isTransferring: boolean;
  progress: number;
  totalBytes: number;
  transferredBytes: number;
  speed: number;
  filename?: string;
  status: 'idle' | 'connecting' | 'transferring' | 'uploading' | 'downloading' | 'completed' | 'error';
}