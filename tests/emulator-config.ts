export const PROJECT_ID = 'demo-shared-presentations';
export const hasEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const host = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host)) {
  throw new Error('Firestore tests must use a loopback emulator endpoint.');
}
export const [emuHost, port] = host.split(':');
export const emuPort = Number(port);
