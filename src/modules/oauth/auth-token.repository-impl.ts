import { Inject, Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { AuthToken } from './auth-token.entity';
import { IAuthTokenRepository, NewAuthToken } from './auth-token.repository';

/**
 * TypeORM-backed implementation of the auth-token repository port. It is the
 * only place in the oauth module that touches the TypeORM repository for
 * auth_table; the service depends on IAuthTokenRepository instead.
 */
@Injectable()
export class AuthTokenRepositoryImpl implements IAuthTokenRepository {
  private readonly repo: Repository<AuthToken>;

  // The token is declared explicitly instead of relying on reflected
  // paramtypes so the DI graph survives the esbuild-based dev runner.
  constructor(@Inject(DataSource) ds: DataSource) {
    this.repo = ds.getRepository(AuthToken);
  }

  async findByAccessToken(accessToken: string): Promise<AuthToken | null> {
    return this.repo.findOneBy({ accessToken });
  }

  async findByRefreshToken(refreshToken: string): Promise<AuthToken | null> {
    return this.repo.findOneBy({ refreshToken });
  }

  async add(data: NewAuthToken): Promise<AuthToken> {
    return this.repo.save(this.repo.create(data));
  }

  async save(record: AuthToken): Promise<AuthToken> {
    return this.repo.save(record);
  }

  async deleteById(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  async deleteByAccessToken(accessToken: string): Promise<boolean> {
    const result = await this.repo.delete({ accessToken });
    return (result.affected ?? 0) > 0;
  }
}
