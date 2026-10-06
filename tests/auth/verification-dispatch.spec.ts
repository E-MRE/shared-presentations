import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from 'firebase/auth';
const transport = vi.hoisted(() => ({ create: vi.fn(), verify: vi.fn(), profile: vi.fn(), write: vi.fn() }));
vi.mock('firebase/auth', async importOriginal => ({ ...await importOriginal<typeof import('firebase/auth')>(), createUserWithEmailAndPassword: transport.create, sendEmailVerification: transport.verify, updateProfile: transport.profile }));
vi.mock('firebase/firestore', async importOriginal => ({ ...await importOriginal<typeof import('firebase/firestore')>(), setDoc: transport.write }));
import { FirebaseAuthService } from '../../src/auth/service';
describe('Verification dispatch is independent from account creation', () => {
  const user = { uid: 'created', email: 'test@example.invalid', emailVerified: false, providerData: [{ providerId: 'password' }] } as User;
  beforeEach(() => { vi.resetAllMocks(); transport.create.mockResolvedValue({ user }); transport.verify.mockResolvedValue(undefined); transport.profile.mockResolvedValue(undefined); transport.write.mockResolvedValue(undefined); });
  it('reports a dispatch failure while retaining the newly created unverified account', async () => {
    transport.verify.mockRejectedValue({ code: 'auth/too-many-requests' });
    const result = await new FirebaseAuthService().signUpWithEmail({ email: user.email!, password: 'test-only', displayName: 'Test' });
    expect(result.ok).toBe(true);
    if (result.ok) { expect(result.value.uid).toBe('created'); expect(result.value.isMember).toBe(false); expect(result.value.verificationDispatch?.sent).toBe(false); expect(result.value.verificationDispatch?.message).toContain('gönderilemedi'); }
    expect(transport.create).toHaveBeenCalledTimes(1);
  });
  it('reports an accepted dispatch without promising inbox delivery', async () => {
    const result = await new FirebaseAuthService().signUpWithEmail({ email: user.email!, password: 'test-only', displayName: 'Test' });
    expect(result.ok && result.value.verificationDispatch?.sent).toBe(true);
    expect(result.ok && result.value.verificationDispatch?.message).toContain('isteği kabul edildi');
  });
  it('preserves resend failures and supports retry using the same account', async () => {
    const service = new FirebaseAuthService();
    transport.verify.mockRejectedValueOnce({ code: 'auth/network-request-failed' });
    expect((await service.sendVerificationEmail(user)).ok).toBe(false);
    expect((await service.sendVerificationEmail(user)).ok).toBe(true);
    expect(transport.verify).toHaveBeenCalledTimes(2);
  });
});
