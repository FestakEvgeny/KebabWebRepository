import { User } from './user.entity';

/** Data for a new app user row; the email is already normalized by the caller. */
export interface NewUser {
  email: string;
  passwordHash: string;
}

/**
 * Port for the user_table persistence layer. Implemented by
 * UserRepositoryImpl over the TypeORM repository; consumers inject this
 * interface via the USER_REPOSITORY token, never the implementation.
 */
export interface IUserRepository {
  findByEmail(email: string): Promise<User | null>;
  add(data: NewUser): Promise<User>;
}

/** DI token for the user repository port. */
export const USER_REPOSITORY = 'USER_REPOSITORY';
