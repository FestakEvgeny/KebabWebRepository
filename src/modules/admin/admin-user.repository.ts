import { AdminUser } from './admin-user.entity';

/** Data for a new admin panel user row. */
export interface NewAdminUser {
  email: string;
  passwordHash: string;
}

/**
 * Port for the admin_user persistence layer. Implemented by
 * AdminUserRepositoryImpl over the TypeORM repository; consumers inject this
 * interface via the ADMIN_USER_REPOSITORY token, never the implementation.
 */
export interface IAdminUserRepository {
  findByEmail(email: string): Promise<AdminUser | null>;
  add(data: NewAdminUser): Promise<AdminUser>;
}

/** DI token for the admin-user repository port. */
export const ADMIN_USER_REPOSITORY = 'ADMIN_USER_REPOSITORY';
