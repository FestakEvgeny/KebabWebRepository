import * as bcrypt from 'bcryptjs';
import { Inject, Injectable } from '@nestjs/common';
import { AdminUser } from './admin-user.entity';
import { IAdminUserRepository, ADMIN_USER_REPOSITORY } from './admin-user.repository';

/** bcrypt cost; matches the public API password hashing. */
const PASSWORD_HASH_ROUNDS = 12;

// Constant hash used to equalise response times when the email is unknown.
const DUMMY_HASH = bcrypt.hashSync('timing-equalizer', PASSWORD_HASH_ROUNDS);

/**
 * Admin login credential handling — the only place that touches the
 * admin_user data (through IAdminUserRepository), so the admin routes stay
 * pure HTTP wiring.
 */
@Injectable()
export class AdminAuthService {
  // The token is declared explicitly instead of relying on reflected
  // paramtypes so the DI graph survives the esbuild-based dev runner.
  constructor(@Inject(ADMIN_USER_REPOSITORY) private readonly users: IAdminUserRepository) {}

  /** Verifies credentials; returns the admin on success, null otherwise. */
  async verifyCredentials(email: string, password: string): Promise<AdminUser | null> {
    const normalized = email.trim().toLowerCase();
    const user = await this.users.findByEmail(normalized);
    // Comparing against a dummy hash keeps the response time flat for unknown emails.
    const passwordOk = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    return user && passwordOk ? user : null;
  }

  /** Idempotent bootstrap used by the seed script; true when a user was created. */
  async ensureAdminUser(email: string, password: string): Promise<boolean> {
    const normalized = email.trim().toLowerCase();
    if (await this.users.findByEmail(normalized)) return false;

    await this.users.add({
      email: normalized,
      passwordHash: await bcrypt.hash(password, PASSWORD_HASH_ROUNDS),
    });
    return true;
  }
}
