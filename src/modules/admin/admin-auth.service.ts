import * as bcrypt from 'bcryptjs';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { AdminUser } from './admin-user.entity';

/** bcrypt cost; matches the public API password hashing. */
const PASSWORD_HASH_ROUNDS = 12;

// Constant hash used to equalise response times when the email is unknown.
const DUMMY_HASH = bcrypt.hashSync('timing-equalizer', PASSWORD_HASH_ROUNDS);

/**
 * Admin login credential handling — the only place that touches the
 * admin_user table, so the admin routes stay pure HTTP wiring.
 */
@Injectable()
export class AdminAuthService {
  private readonly repo: Repository<AdminUser>;

  // The token is declared explicitly instead of relying on reflected
  // paramtypes so the DI graph survives the esbuild-based dev runner.
  constructor(@Inject(DataSource) ds: DataSource) {
    this.repo = ds.getRepository(AdminUser);
  }

  /** Verifies credentials; returns the admin on success, null otherwise. */
  async verifyCredentials(email: string, password: string): Promise<AdminUser | null> {
    const normalized = email.trim().toLowerCase();
    const user = await this.repo.findOneBy({ email: normalized });
    // Comparing against a dummy hash keeps the response time flat for unknown emails.
    const passwordOk = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    return user && passwordOk ? user : null;
  }

  /** Idempotent bootstrap used by the seed script; true when a user was created. */
  async ensureAdminUser(email: string, password: string): Promise<boolean> {
    const normalized = email.trim().toLowerCase();
    const existing = await this.repo.findOneBy({ email: normalized });
    if (existing) return false;

    await this.repo.save(
      this.repo.create({
        email: normalized,
        passwordHash: await bcrypt.hash(password, PASSWORD_HASH_ROUNDS),
      }),
    );
    return true;
  }
}
